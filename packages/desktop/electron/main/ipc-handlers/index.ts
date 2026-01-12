/**
 * IPC Handlers - Main Entry Point
 * Registers all IPC handlers by delegating to modular handler files
 *
 * LILBITS Compliance: Each handler module is <300 lines
 *
 * Architecture: API-Only Mode
 * All data operations go through the Dispatch Hub's PostgreSQL database.
 * There is no local SQLite storage - the desktop app is a thin client.
 *
 * Modules:
 * - api-locations.ts: location:* handlers
 * - api-media.ts: media:* handlers
 * - api-maps.ts: maps:* handlers
 * - api-dispatch.ts: dispatch:* handlers
 * - stats-settings.ts: stats:* and settings:* handlers
 * - shell-dialog.ts: shell:* and dialog:* handlers
 * - research-browser.ts: research:* handlers (external browser)
 */

import { getBackendStatus } from '../../repositories/unified-repository-factory';
import { registerShellHandlers, registerDialogHandlers } from './shell-dialog';
import { registerResearchBrowserHandlers } from './research-browser';
import {
  initializeBrowserImageCapture,
  cleanupBrowserImageCapture,
} from '../../services/image-downloader/browser-image-capture';
import { registerDispatchHandlers, initializeDispatchClient, shutdownDispatchClient } from './dispatch';
// API-based handlers (all data operations go through Dispatch Hub)
import { registerApiIpcHandlers, shutdownApiIpcHandlers } from './api-handlers';

export function registerIpcHandlers() {
  const backendStatus = getBackendStatus();

  console.log(`[IPC] Backend mode: ${backendStatus.mode}`);
  console.log(`[IPC] Dispatch hub URL: ${backendStatus.hubUrl}`);
  console.log(`[IPC] Connected: ${backendStatus.connected}`);

  // Initialize Dispatch Hub connection FIRST
  // This ensures the dispatch client singleton is created with proper token storage
  // before any handlers try to use it
  registerDispatchHandlers();
  initializeDispatchClient();

  // ============================================
  // API MODE: All data operations via Dispatch Hub
  // ============================================
  console.log('[IPC] Registering API-based handlers (Dispatch Hub mode)');

  // Register API handlers (locations, media, maps, etc.)
  registerApiIpcHandlers();

  // Shell and dialog handlers (no data access, local operations only)
  registerShellHandlers();
  registerDialogHandlers();

  // Research browser (external Ungoogled Chromium)
  registerResearchBrowserHandlers();

  // Browser Image Capture (network monitoring, context menu)
  initializeBrowserImageCapture({
    filter: {
      minSize: 5000,
    },
  });

  console.log('[IPC] API-based handlers registered');
}

// Export job worker shutdown for app cleanup
export function shutdownJobWorker() {
  // No-op in API mode - job workers run on dispatch hub
}

// Export browser capture cleanup for app shutdown
export { cleanupBrowserImageCapture };

// Export extraction service shutdown for app cleanup
export function shutdownExtractionHandlers() {
  // No-op in API mode - extraction runs on dispatch hub workers
}

// Export monitoring window setter for alert notifications
export function setMonitoringMainWindow(_window: unknown) {
  // No-op in API mode - monitoring via dispatch hub
}

// Export Dispatch client shutdown for app cleanup
export { shutdownDispatchClient };

// Export API handlers shutdown for app cleanup
export { shutdownApiIpcHandlers };
