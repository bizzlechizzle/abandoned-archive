import { app, BrowserWindow, dialog, session, protocol, net } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { registerIpcHandlers, shutdownDispatchClient } from './ipc-handlers';
import { getHealthMonitor } from '../services/health-monitor';
import { getConfigService } from '../services/config-service';
import { getLogger } from '../services/logger-service';
import { initBrowserViewManager, destroyBrowserViewManager } from '../services/browser-view-manager';
import { startBookmarkAPIServer, stopBookmarkAPIServer } from '../services/bookmark-api-server';
import { startWebSocketServer, stopWebSocketServer } from '../services/websocket-server';
import { terminateDetachedBrowser } from '../services/detached-browser-service';
import { stopOllama } from '../services/ollama-lifecycle-service';
import { stopLiteLLM } from '../services/litellm-lifecycle-service';
import { getPreprocessingService } from '../services/extraction/preprocessing-service';
import { getUnifiedRepositories, getBackendStatus } from '../repositories/unified-repository-factory';
// Pipeline tools auto-update on startup
import { updateAllPipelineTools } from '../services/pipeline-tools-updater';

/**
 * OPT-045: GPU mitigation flags for macOS Leaflet/map rendering
 * Addresses Chromium Skia overlay mailbox errors that cause beachball freezes
 * These errors appear as:
 *   [ERROR:shared_image_manager.cc] ProduceOverlay: non-existent mailbox
 *   [ERROR:skia_output_device_buffer_queue.cc] Invalid mailbox
 *
 * Disabling problematic GPU features improves Atlas map rendering stability
 */
if (process.platform === 'darwin') {
  // Disable CanvasOopRasterization which can cause overlay issues with Leaflet
  app.commandLine.appendSwitch('disable-features', 'CanvasOopRasterization');
  // Use software rendering for 2D canvas (Leaflet relies on canvas)
  app.commandLine.appendSwitch('disable-accelerated-2d-canvas');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development';

// Register custom protocol for serving media files securely
// This allows the renderer to load local files without file:// restrictions
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true,
    },
  },
]);

// Crash handlers - log errors before exiting
// OPT-080: Enhanced error logging for structured clone debugging
process.on('uncaughtException', (error: Error) => {
  console.error('=== UNCAUGHT EXCEPTION ===');
  console.error('Message:', error.message);
  console.error('Name:', error.name);
  console.error('Stack:', error.stack);
  try {
    console.error('Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
  } catch (e) {
    console.error('Could not stringify error:', e);
  }

  try {
    getLogger().error('Main', 'Uncaught exception', error);
  } catch {
    // Logger might not be initialized yet
  }

  dialog.showErrorBox(
    'Application Error',
    `An unexpected error occurred:\n\n${error.message}\n\nThe application will now exit.`
  );

  app.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  console.error('=== UNHANDLED REJECTION ===');
  console.error('Reason:', reason);
  if (reason instanceof Error) {
    console.error('Message:', reason.message);
    console.error('Name:', reason.name);
    console.error('Stack:', reason.stack);
    try {
      console.error('Full error:', JSON.stringify(reason, Object.getOwnPropertyNames(reason), 2));
    } catch (e) {
      console.error('Could not stringify error:', e);
    }
  }

  const error = reason instanceof Error ? reason : new Error(String(reason));
  try {
    getLogger().error('Main', 'Unhandled promise rejection', error);
  } catch {
    // Logger might not be initialized yet
  }

  dialog.showErrorBox(
    'Application Error',
    `An unexpected error occurred:\n\n${error.message}\n\nThe application will now exit.`
  );

  app.exit(1);
});

let mainWindow: BrowserWindow | null = null;

/**
 * FIX 5.4: Send event to renderer process
 * Used for backup notifications and other main->renderer communication
 */
export function sendToRenderer(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

// Single instance lock - prevent multiple instances of the app
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  console.log('Another instance is already running. Exiting...');
  app.quit();
} else {
  // Handle second instance attempt - focus existing window
  app.on('second-instance', (_event, _commandLine, _workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'AU Archive',
    // macOS: Hide title bar, show traffic lights inline with content
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 12 },
    webPreferences: {
      // CRITICAL: Use .cjs extension for preload script
      // This ensures Node.js treats it as CommonJS regardless of "type": "module" in package.json
      preload: path.join(__dirname, '../preload/index.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      // Sandbox disabled to allow preload's webUtils.getPathForFile() to work with drag-drop files.
      // This is acceptable for a trusted desktop app that doesn't load external content.
      sandbox: false,
      webviewTag: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // SECURITY: Set Content Security Policy for production
  // Allows map tile providers (ESRI, OSM, OpenTopo, Carto) and Nominatim geocoding
  if (!isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; " +
            "script-src 'self'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: blob: https://server.arcgisonline.com https://*.tile.openstreetmap.org https://*.tile.opentopomap.org https://*.basemaps.cartocdn.com; " +
            "font-src 'self'; " +
            "connect-src 'self' https://server.arcgisonline.com https://*.tile.openstreetmap.org https://*.tile.opentopomap.org https://*.basemaps.cartocdn.com https://nominatim.openstreetmap.org; " +
            "frame-ancestors 'none';"
          ],
        },
      });
    });
  }

  // SECURITY: Handle permission requests - deny all by default except essential ones
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['clipboard-read', 'clipboard-sanitized-write'];
    const isAllowed = allowedPermissions.includes(permission);

    if (!isAllowed) {
      console.log(`Permission denied: ${permission}`);
    }

    callback(isAllowed);
  });

  // SECURITY: Block navigation to external URLs from main window
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const validOrigins = isDev
      ? ['http://localhost:5173', 'file://']
      : ['file://'];

    const isValid = validOrigins.some(origin => url.startsWith(origin));

    if (!isValid) {
      console.warn('Blocked navigation to:', url);
      event.preventDefault();
    }
  });

  // SECURITY: Block new window creation from main window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.warn('Blocked new window from main:', url);
    return { action: 'deny' };
  });
}

/**
 * Startup Orchestrator
 * Sequential initialization with proper error handling
 *
 * Architecture: API-Only Mode
 * All data operations go through the Dispatch Hub's PostgreSQL database.
 * There is no local SQLite storage - the desktop app is a thin client.
 */
async function startupOrchestrator(): Promise<void> {
  const startTime = Date.now();
  const logger = getLogger();
  logger.info('Main', 'Starting application initialization (API-Only mode)');

  try {
    // Step 1: Load configuration
    logger.info('Main', 'Step 1/4: Loading configuration');
    const configService = getConfigService();
    await configService.load();
    logger.info('Main', 'Configuration loaded successfully');

    // Step 1b: Update pipeline tools from GitHub (non-blocking)
    logger.info('Main', 'Step 1b: Updating pipeline tools');
    try {
      const toolsResult = await updateAllPipelineTools();
      if (toolsResult.success) {
        logger.info('Main', 'Pipeline tools updated successfully', {
          updated: toolsResult.results.filter((r) => r.action !== 'already-up-to-date').length,
          total: toolsResult.results.length,
          durationMs: toolsResult.totalDurationMs,
        });
      } else {
        const failed = toolsResult.results.filter((r) => !r.success);
        logger.warn('Main', 'Some pipeline tools failed to update', {
          failed: failed.map((r) => r.name),
          durationMs: toolsResult.totalDurationMs,
        });
      }
    } catch (toolsError) {
      // Non-fatal: log warning but continue startup
      logger.warn('Main', 'Pipeline tools update failed', {
        message: (toolsError as Error).message,
      });
    }

    // Step 2: Verify Dispatch Hub connection
    logger.info('Main', 'Step 2/4: Verifying Dispatch Hub connection');
    const backendStatus = getBackendStatus();
    logger.info('Main', 'Dispatch Hub status', {
      mode: backendStatus.mode,
      configured: backendStatus.configured,
      connected: backendStatus.connected,
      hubUrl: backendStatus.hubUrl,
    });

    if (!backendStatus.configured) {
      logger.warn('Main', 'Dispatch Hub not configured - some features may be unavailable');
    }

    // Step 3: Initialize health monitoring
    logger.info('Main', 'Step 3/4: Initializing health monitoring');
    const healthMonitor = getHealthMonitor();
    await healthMonitor.initialize();
    logger.info('Main', 'Health monitoring initialized successfully');

    // Step 4: Register IPC handlers
    logger.info('Main', 'Step 4/4: Registering IPC handlers');
    registerIpcHandlers();
    logger.info('Main', 'IPC handlers registered successfully');

    // Step 4b: Start Bookmark API Server for Research Browser extension
    // Uses API repositories from unified factory
    logger.info('Main', 'Starting Bookmark API Server');
    const repos = getUnifiedRepositories();
    try {
      await startBookmarkAPIServer(repos.websources, repos.locations, repos.sublocations);
      logger.info('Main', 'Bookmark API Server started successfully');
    } catch (error) {
      // Non-fatal: log warning but continue startup (research browser feature may not work)
      logger.warn('Main', 'Failed to start Bookmark API Server', { message: (error as Error).message, stack: (error as Error).stack });
    }

    // Step 4c: Start WebSocket Server for real-time extension updates
    logger.info('Main', 'Starting WebSocket Server');
    try {
      await startWebSocketServer();
      logger.info('Main', 'WebSocket Server started successfully');
    } catch (error) {
      // Non-fatal: extension will work without real-time updates
      logger.warn('Main', 'Failed to start WebSocket Server', { message: (error as Error).message, stack: (error as Error).stack });
    }

    const duration = Date.now() - startTime;
    logger.info('Main', 'Application initialization complete', { duration });
  } catch (error) {
    logger.error('Main', 'Fatal error during startup', error as Error);
    console.error('Fatal startup error:', error);

    await dialog.showErrorBox(
      'Startup Error',
      `Failed to initialize application:\n\n${(error as Error).message}\n\nThe application will now exit.`
    );

    app.exit(1);
  }
}

app.whenReady().then(async () => {
  // Register the media:// protocol handler
  // Converts media://path/to/file.jpg to actual file access
  // SECURITY: Validates paths are within allowed directories to prevent path traversal
  protocol.handle('media', async (request) => {
    try {
      // Extract file path from URL: media:///path/to/file -> /path/to/file
      const url = new URL(request.url);
      let filePath = decodeURIComponent(url.pathname);

      // On Windows, pathname starts with / before drive letter, e.g., /C:/...
      if (process.platform === 'win32' && filePath.startsWith('/')) {
        filePath = filePath.slice(1);
      }

      // SECURITY: Normalize path to prevent traversal attacks (../ sequences)
      const normalizedPath = path.normalize(filePath);

      // SECURITY: Get allowed directories from config service
      const configService = getConfigService();
      const config = configService.get();
      const archiveFolder = config.archiveFolder;

      // SECURITY: Define allowed base directories
      // - Archive folder (user-configured media storage)
      // - User data path (for thumbnails, previews, proxies in .previews/, .thumbnails/, .proxies/)
      const userDataPath = app.getPath('userData');
      const allowedPaths: string[] = [];

      if (archiveFolder) {
        allowedPaths.push(path.resolve(archiveFolder));
      }
      allowedPaths.push(path.resolve(userDataPath));

      // Also allow absolute paths within the app's temp directory
      const tempPath = app.getPath('temp');
      allowedPaths.push(path.resolve(tempPath));

      // SECURITY: Resolve to absolute path and check against allowed directories
      const absolutePath = path.resolve(normalizedPath);
      const isAllowed = allowedPaths.some(allowed => absolutePath.startsWith(allowed + path.sep) || absolutePath === allowed);

      if (!isAllowed) {
        console.error('[media protocol] SECURITY: Path traversal blocked:', normalizedPath);
        return new Response('Access denied', { status: 403 });
      }

      // SECURITY: Verify file exists before serving
      if (!fs.existsSync(absolutePath)) {
        console.error('[media protocol] File not found:', absolutePath);
        return new Response('File not found', { status: 404 });
      }

      // SECURITY: Resolve symlinks and re-check path
      const realPath = fs.realpathSync(absolutePath);
      const realPathAllowed = allowedPaths.some(allowed => realPath.startsWith(allowed + path.sep) || realPath === allowed);

      if (!realPathAllowed) {
        console.error('[media protocol] SECURITY: Symlink escape blocked:', realPath);
        return new Response('Access denied', { status: 403 });
      }

      // Use the validated real path for file operations
      filePath = realPath;

      const stats = fs.statSync(filePath);
      const fileSize = stats.size;

      // Check if this is a video file (for range request handling)
      const ext = filePath.toLowerCase().split('.').pop();
      const isVideo = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'].includes(ext || '');

      // Handle Range requests for videos (enables scrubbing)
      const rangeHeader = request.headers.get('range');
      if (isVideo && rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
        if (match) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
          const chunkSize = end - start + 1;

          // Create readable stream for the requested range
          const fsPromises = await import('fs/promises');
          const fileHandle = await fsPromises.open(filePath, 'r');
          const stream = fileHandle.createReadStream({ start, end, autoClose: true });

          // Convert Node stream to Web ReadableStream
          const webStream = new ReadableStream({
            start(controller) {
              stream.on('data', (chunk) => controller.enqueue(chunk));
              stream.on('end', () => controller.close());
              stream.on('error', (err) => controller.error(err));
            },
            cancel() {
              stream.destroy();
            }
          });

          return new Response(webStream, {
            status: 206,
            statusText: 'Partial Content',
            headers: {
              'Content-Range': `bytes ${start}-${end}/${fileSize}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': String(chunkSize),
              'Content-Type': ext === 'mp4' || ext === 'm4v' ? 'video/mp4' :
                              ext === 'mov' ? 'video/quicktime' :
                              ext === 'webm' ? 'video/webm' : 'video/mp4',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
            },
          });
        }
      }

      // For videos without range header, return with Accept-Ranges to enable scrubbing
      if (isVideo) {
        const fsPromises = await import('fs/promises');
        const fileHandle = await fsPromises.open(filePath, 'r');
        const stream = fileHandle.createReadStream({ autoClose: true });

        const webStream = new ReadableStream({
          start(controller) {
            stream.on('data', (chunk) => controller.enqueue(chunk));
            stream.on('end', () => controller.close());
            stream.on('error', (err) => controller.error(err));
          },
          cancel() {
            stream.destroy();
          }
        });

        return new Response(webStream, {
          status: 200,
          headers: {
            'Accept-Ranges': 'bytes',
            'Content-Length': String(fileSize),
            'Content-Type': ext === 'mp4' || ext === 'm4v' ? 'video/mp4' :
                            ext === 'mov' ? 'video/quicktime' :
                            ext === 'webm' ? 'video/webm' : 'video/mp4',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        });
      }

      // CRITICAL: No-cache headers required! See DECISION-021-protocol-caching.md
      // Electron's net.fetch caches file:// responses internally. Without these headers,
      // regenerated thumbnails appear stale even though files on disk are correct.
      // DO NOT REMOVE these headers - it will break thumbnail regeneration.
      const response = await net.fetch(`file://${filePath}`);

      // Clone response with cache-busting headers
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          ...Object.fromEntries(response.headers.entries()),
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      });
    } catch (error) {
      console.error('[media protocol] Error serving file:', error);
      return new Response('Internal error', { status: 500 });
    }
  });

  await startupOrchestrator();

  createWindow();

  // Initialize browser view manager for embedded web browser
  if (mainWindow) {
    initBrowserViewManager(mainWindow);
    getLogger().info('Main', 'Browser view manager initialized');
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      if (mainWindow) {
        initBrowserViewManager(mainWindow);
      }
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  // Close research browser (external Ungoogled Chromium - zero-detection mode)
  try {
    await terminateDetachedBrowser();
    console.log('Research browser closed successfully');
  } catch (error) {
    console.error('Failed to close research browser:', error);
  }

  // Stop Bookmark API Server
  try {
    await stopBookmarkAPIServer();
    console.log('Bookmark API Server stopped successfully');
  } catch (error) {
    console.error('Failed to stop Bookmark API Server:', error);
  }

  // Stop WebSocket Server
  try {
    await stopWebSocketServer();
    console.log('WebSocket Server stopped successfully');
  } catch (error) {
    console.error('Failed to stop WebSocket Server:', error);
  }

  // Destroy browser view manager
  try {
    destroyBrowserViewManager();
    console.log('Browser view manager destroyed successfully');
  } catch (error) {
    console.error('Failed to destroy browser view manager:', error);
  }

  // Shutdown health monitoring
  try {
    const healthMonitor = getHealthMonitor();
    await healthMonitor.shutdown();
    console.log('Health monitoring shut down successfully');
  } catch (error) {
    console.error('Failed to shutdown health monitoring:', error);
  }

  // OPT-125: Stop Ollama if we started it (seamless lifecycle management)
  try {
    stopOllama();
    console.log('Ollama stopped successfully');
  } catch (error) {
    console.error('Failed to stop Ollama:', error);
  }

  // Migration 86: Stop LiteLLM proxy if we started it
  try {
    await stopLiteLLM();
    console.log('LiteLLM proxy stopped successfully');
  } catch (error) {
    console.error('Failed to stop LiteLLM proxy:', error);
  }

  // Shutdown Dispatch client (disconnect from hub, close offline queue)
  try {
    shutdownDispatchClient();
    console.log('Dispatch client shut down successfully');
  } catch (error) {
    console.error('Failed to shutdown Dispatch client:', error);
  }

  // Stop spaCy preprocessing server if we started it
  try {
    const preprocessingService = getPreprocessingService();
    await preprocessingService.shutdown();
    console.log('spaCy preprocessing server stopped successfully');
  } catch (error) {
    console.error('Failed to stop spaCy preprocessing server:', error);
  }
});
