import { app, BrowserWindow, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDatabase, closeDatabase } from './database';
import { registerIpcHandlers } from './ipc-handlers';
import { getHealthMonitor } from '../services/health-monitor';
import { getRecoverySystem } from '../services/recovery-system';
import { getConfigService } from '../services/config-service';
import { getLogger } from '../services/logger-service';
import { initBrowserViewManager, destroyBrowserViewManager } from '../services/browser-view-manager';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development';

// Crash handlers - log errors before exiting
process.on('uncaughtException', (error: Error) => {
  try {
    getLogger().error('Main', 'Uncaught exception', error);
  } catch {
    // Logger might not be initialized yet
  }
  console.error('Uncaught exception:', error);

  dialog.showErrorBox(
    'Application Error',
    `An unexpected error occurred:\n\n${error.message}\n\nThe application will now exit.`
  );

  app.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  try {
    getLogger().error('Main', 'Unhandled promise rejection', error);
  } catch {
    // Logger might not be initialized yet
  }
  console.error('Unhandled rejection:', reason);

  dialog.showErrorBox(
    'Application Error',
    `An unexpected error occurred:\n\n${error.message}\n\nThe application will now exit.`
  );

  app.exit(1);
});

let mainWindow: BrowserWindow | null = null;

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
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
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
}

/**
 * Startup Orchestrator
 * Sequential initialization with proper error handling
 */
async function startupOrchestrator(): Promise<void> {
  const startTime = Date.now();
  const logger = getLogger();
  logger.info('Main', 'Starting application initialization');

  try {
    // Step 1: Load configuration
    logger.info('Main', 'Step 1/5: Loading configuration');
    const configService = getConfigService();
    await configService.load();
    logger.info('Main', 'Configuration loaded successfully');

    // Step 2: Initialize database
    logger.info('Main', 'Step 2/5: Initializing database');
    getDatabase();
    logger.info('Main', 'Database initialized successfully');

    // Step 3: Initialize health monitoring
    logger.info('Main', 'Step 3/5: Initializing health monitoring');
    const healthMonitor = getHealthMonitor();
    await healthMonitor.initialize();
    logger.info('Main', 'Health monitoring initialized successfully');

    // Step 4: Check database health and recover if needed
    logger.info('Main', 'Step 4/5: Checking database health');
    const recoverySystem = getRecoverySystem();
    const recoveryResult = await recoverySystem.checkAndRecover();

    if (recoveryResult) {
      logger.info('Main', 'Recovery performed', { action: recoveryResult.action });
      if (!recoveryResult.success) {
        logger.error('Main', 'Recovery failed, application may not function correctly');
        // Note: showRecoveryDialog doesn't exist, recovery is handled internally
      }
    } else {
      logger.info('Main', 'Database health check passed, no recovery needed');
    }

    // Step 5: Register IPC handlers
    logger.info('Main', 'Step 5/5: Registering IPC handlers');
    registerIpcHandlers();
    logger.info('Main', 'IPC handlers registered successfully');

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

  closeDatabase();
});
