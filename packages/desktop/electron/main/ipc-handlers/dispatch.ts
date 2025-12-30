/**
 * Dispatch IPC Handlers
 *
 * Handles communication between renderer and dispatch client service.
 * Uses @aa/services dispatch module with Electron-specific token storage.
 *
 * Auth Detection: On startup, checks if the dispatch hub allows unauthenticated
 * access (DISPATCH_AUTH_DISABLED=true on hub). If so, connects without requiring login.
 */

import { ipcMain, BrowserWindow, safeStorage, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import {
  getDispatchClient,
  destroyDispatchClient,
  type DispatchClient,
  type TokenStorage,
  type TokenPair,
  type JobSubmission,
  type DispatchStatus,
} from '@aa/services';

let initialized = false;
let hubAuthDisabled = false; // Auto-detected on first init

// Default hub URL - must match dispatch-client.ts default
const DEFAULT_HUB_URL = process.env.DISPATCH_HUB_URL || 'http://192.168.1.199:3000';

/**
 * Check if the dispatch hub allows unauthenticated access.
 * Makes an unauthenticated request to a protected endpoint.
 * If it succeeds, auth is disabled on the hub.
 */
async function checkHubAuthDisabled(): Promise<boolean> {
  // First check env var (for terminal launches or explicit config)
  if (process.env.DISPATCH_AUTH_DISABLED === 'true') {
    console.log('[Dispatch] Auth disabled via DISPATCH_AUTH_DISABLED env var');
    return true;
  }

  // Auto-detect by making unauthenticated request to protected endpoint
  try {
    const response = await fetch(`${DEFAULT_HUB_URL}/api/jobs?limit=1`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.ok) {
      console.log('[Dispatch] Hub auth is disabled - unauthenticated request succeeded');
      return true;
    } else if (response.status === 401) {
      console.log('[Dispatch] Hub requires authentication');
      return false;
    } else {
      // Other error - assume auth required
      console.log(`[Dispatch] Hub returned ${response.status} - assuming auth required`);
      return false;
    }
  } catch (error) {
    // Hub unreachable - will handle later during connection
    console.log('[Dispatch] Hub unreachable during auth check - assuming auth required');
    return false;
  }
}

// ============================================
// Electron Token Storage (uses safeStorage)
// ============================================

class ElectronTokenStorage implements TokenStorage {
  private tokenPath: string;

  constructor() {
    this.tokenPath = path.join(app.getPath('userData'), '.dispatch-tokens');
  }

  save(tokens: TokenPair): void {
    try {
      const data = JSON.stringify(tokens);
      const encrypted = safeStorage.encryptString(data);
      fs.writeFileSync(this.tokenPath, encrypted);
    } catch (error) {
      console.error('[ElectronTokenStorage] Failed to save tokens:', error);
    }
  }

  load(): TokenPair | null {
    try {
      if (fs.existsSync(this.tokenPath)) {
        const encrypted = fs.readFileSync(this.tokenPath);
        const decrypted = safeStorage.decryptString(encrypted);
        return JSON.parse(decrypted) as TokenPair;
      }
    } catch (error) {
      console.error('[ElectronTokenStorage] Failed to load tokens:', error);
      this.clear();
    }
    return null;
  }

  clear(): void {
    try {
      if (fs.existsSync(this.tokenPath)) {
        fs.unlinkSync(this.tokenPath);
      }
    } catch (error) {
      // Ignore
    }
  }
}

// ============================================
// Event Handler Registration (can be called multiple times for client recreation)
// ============================================

/**
 * Safely send an event to all active browser windows.
 * Handles destroyed windows gracefully to prevent crashes.
 */
function broadcastToWindows(channel: string, ...args: unknown[]): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    try {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, ...args);
      }
    } catch (error) {
      console.error(`[Dispatch] Failed to send ${channel}:`, error);
    }
  });
}

function registerDispatchEventHandlers(dispatchClient: DispatchClient): void {
  // Forward events to all renderer windows
  dispatchClient.on('job:progress', (data) => {
    broadcastToWindows('dispatch:job:progress', data);
  });

  dispatchClient.on('job:updated', (data) => {
    broadcastToWindows('dispatch:job:updated', data);

    // Emit asset-ready events for completed thumbnail/metadata jobs
    // This triggers UI refresh without polling
    if (data.status === 'completed') {
      const jobData = data.data as { options?: { hash?: string; mediaType?: string; locid?: string } } | undefined;
      const hash = jobData?.options?.hash;
      const mediaType = jobData?.options?.mediaType;
      const locid = jobData?.options?.locid;

      if (data.type === 'thumbnail' && hash) {
        console.log(`[Dispatch] Thumbnail ready for ${hash.slice(0, 12)}...`);
        broadcastToWindows('media:thumbnailReady', { hash, mediaType, locid });
      } else if (data.type === 'metadata' && hash) {
        console.log(`[Dispatch] Metadata ready for ${hash.slice(0, 12)}...`);
        broadcastToWindows('media:metadataReady', { hash, mediaType, locid });
      }

      // Emit location-level refresh for any completed job with locid
      if (locid) {
        broadcastToWindows('location:assetsUpdated', { locid });
      }
    }
  });

  dispatchClient.on('connected', () => {
    broadcastToWindows('dispatch:connection', true);
  });

  dispatchClient.on('disconnected', () => {
    broadcastToWindows('dispatch:connection', false);
  });

  dispatchClient.on('auth:required', () => {
    broadcastToWindows('dispatch:auth:required');
  });

  dispatchClient.on('job:queued', (data) => {
    broadcastToWindows('dispatch:job:queued', data);
  });

  dispatchClient.on('job:queueSynced', (data) => {
    broadcastToWindows('dispatch:job:queueSynced', data);
  });

  dispatchClient.on('job:queueFailed', (data) => {
    broadcastToWindows('dispatch:job:queueFailed', data);
  });

  // Handle errors to prevent ERR_UNHANDLED_ERROR
  dispatchClient.on('error', (data) => {
    console.error('[Dispatch] Error:', data.type, data.error);
    broadcastToWindows('dispatch:error', data);
  });
}

// ============================================
// Register Handlers
// ============================================

export function registerDispatchHandlers(): void {
  if (initialized) return;
  initialized = true;

  // Create dispatch client with Electron token storage
  // Note: authDisabled will be updated by initializeDispatchClient() after detection
  // Note: We use getDispatchClient() dynamically in handlers so they use the latest singleton
  const initialClient = getDispatchClient({
    dataDir: app.getPath('userData'),
    tokenStorage: new ElectronTokenStorage(),
    authDisabled: hubAuthDisabled,
  });

  // Register event handlers (forwarding to renderer windows)
  registerDispatchEventHandlers(initialClient);

  // ============================================
  // Authentication Handlers
  // ============================================

  ipcMain.handle('dispatch:login', async (_event, username: string, password: string) => {
    return getDispatchClient().login(username, password);
  });

  ipcMain.handle('dispatch:logout', async () => {
    return getDispatchClient().logout();
  });

  ipcMain.handle('dispatch:isAuthenticated', () => {
    return getDispatchClient().isAuthenticated();
  });

  // ============================================
  // Job Handlers
  // ============================================

  ipcMain.handle('dispatch:submitJob', async (_event, job: JobSubmission) => {
    return getDispatchClient().submitJob(job);
  });

  ipcMain.handle('dispatch:getJob', async (_event, jobId: string) => {
    return getDispatchClient().getJob(jobId);
  });

  ipcMain.handle('dispatch:cancelJob', async (_event, jobId: string) => {
    return getDispatchClient().cancelJob(jobId);
  });

  ipcMain.handle(
    'dispatch:listJobs',
    async (_event, filter?: { status?: string; limit?: number }) => {
      return getDispatchClient().listJobs(filter);
    }
  );

  // ============================================
  // Worker Handlers
  // ============================================

  ipcMain.handle('dispatch:listWorkers', async () => {
    return getDispatchClient().listWorkers();
  });

  // ============================================
  // Connection Handlers
  // ============================================

  ipcMain.handle('dispatch:isConnected', () => {
    return getDispatchClient().isConnected();
  });

  ipcMain.handle('dispatch:checkConnection', async () => {
    return getDispatchClient().checkConnection();
  });

  ipcMain.handle('dispatch:getStatus', (): DispatchStatus => {
    return getDispatchClient().getStatus();
  });

  ipcMain.handle('dispatch:getQueuedJobs', async () => {
    // Return jobs that are pending/queued
    return getDispatchClient().listJobs({ status: 'pending' });
  });

  // ============================================
  // Configuration Handlers
  // ============================================

  ipcMain.handle('dispatch:setHubUrl', (_event, url: string) => {
    getDispatchClient().setHubUrl(url);
  });

  ipcMain.handle('dispatch:getHubUrl', () => {
    return getDispatchClient().getHubUrl();
  });

  // ============================================
  // Lifecycle
  // ============================================

  ipcMain.handle('dispatch:initialize', async () => {
    return getDispatchClient().initialize();
  });

  console.log('[IPC] Dispatch handlers registered');
}

export async function initializeDispatchClient(): Promise<void> {
  // Auto-detect if hub has auth disabled BEFORE getting client
  hubAuthDisabled = await checkHubAuthDisabled();

  // If auth is disabled, we need to recreate the client with the correct setting
  // This handles the case where registerDispatchHandlers() was called first
  if (hubAuthDisabled) {
    // Destroy existing client created without authDisabled flag
    destroyDispatchClient();

    // Recreate with authDisabled=true
    const dispatchClient = getDispatchClient({
      dataDir: app.getPath('userData'),
      tokenStorage: new ElectronTokenStorage(),
      authDisabled: true,
    });

    // Re-register event handlers for the new client
    registerDispatchEventHandlers(dispatchClient);
  }

  // Now initialize (connect socket, etc.)
  const dispatchClient = getDispatchClient();
  try {
    await dispatchClient.initialize();
    console.log('[Dispatch] Client initialized successfully');
  } catch (error) {
    console.error('[Dispatch] Failed to initialize:', error);
  }
}

export function shutdownDispatchClient(): void {
  destroyDispatchClient();
}
