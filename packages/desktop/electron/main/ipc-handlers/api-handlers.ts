/**
 * API-based IPC Handlers Index
 *
 * Registers all IPC handlers that use the dispatch hub API
 * instead of local SQLite database. This is the API-first
 * architecture where all data flows through the central hub.
 */

import { registerApiLocationHandlers, shutdownApiLocationHandlers } from './api-locations';
import { registerApiMediaHandlers, shutdownApiMediaHandlers } from './api-media';
import { registerApiMapHandlers, shutdownApiMapHandlers } from './api-maps';
import { registerApiDispatchHandlers, shutdownApiDispatchHandlers } from './api-dispatch';
import { getDispatchClient } from '@aa/services';

/**
 * Register all API-based IPC handlers.
 * These handlers use the dispatch hub for all data operations.
 */
export function registerApiIpcHandlers() {
  console.log('[API Handlers] Registering API-based IPC handlers');

  // Initialize dispatch client
  const client = getDispatchClient();

  // Set up event forwarding to renderer process
  client.on('connected', () => {
    console.log('[API Handlers] Connected to dispatch hub');
  });

  client.on('disconnected', (reason) => {
    console.log('[API Handlers] Disconnected from dispatch hub:', reason);
  });

  client.on('auth:required', () => {
    console.log('[API Handlers] Authentication required');
  });

  client.on('job:progress', (data) => {
    console.log('[API Handlers] Job progress:', data.jobId, data.progress);
  });

  client.on('job:updated', (data) => {
    console.log('[API Handlers] Job updated:', data.jobId, data.status);
  });

  client.on('error', (data) => {
    console.error('[API Handlers] Error:', data.type, data.error);
  });

  // Register handlers
  registerApiDispatchHandlers();
  registerApiLocationHandlers();
  registerApiMediaHandlers();
  registerApiMapHandlers();

  console.log('[API Handlers] All API-based IPC handlers registered');
}

/**
 * Shutdown all API-based IPC handlers and cleanup.
 */
export function shutdownApiIpcHandlers() {
  console.log('[API Handlers] Shutting down API-based IPC handlers');

  shutdownApiLocationHandlers();
  shutdownApiMediaHandlers();
  shutdownApiMapHandlers();
  shutdownApiDispatchHandlers();

  console.log('[API Handlers] All API-based IPC handlers shut down');
}

/**
 * Initialize the dispatch client and start the connection.
 * Should be called after handlers are registered.
 */
export async function initializeDispatchClient(): Promise<boolean> {
  try {
    const client = getDispatchClient();
    await client.initialize();
    return true;
  } catch (error) {
    console.error('[API Handlers] Failed to initialize dispatch client:', error);
    return false;
  }
}
