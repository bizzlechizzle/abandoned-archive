/**
 * CLI Bridge Service
 *
 * Provides integration between the desktop Electron app and the @aa/services package.
 * This enables progressive migration to CLI-first architecture while maintaining
 * backward compatibility with existing IPC handlers.
 *
 * Usage:
 * 1. Import the bridge in IPC handlers that need CLI services
 * 2. Use bridge methods that delegate to @aa/services
 * 3. Gradually migrate handlers to use the bridge
 *
 * @example
 * ```typescript
 * import { getCliBridge } from '../services/cli-bridge';
 *
 * ipcMain.handle('location:findAll', async (_event, filters) => {
 *   const bridge = getCliBridge();
 *   return bridge.locationService.findAll(filters);
 * });
 * ```
 */

import type { Database } from 'better-sqlite3';
import { LocationService } from '@aa/services/location';

let bridge: CliBridge | null = null;

/**
 * CLI Bridge provides access to @aa/services from Electron
 */
export class CliBridge {
  public readonly locationService: LocationService;

  constructor(db: Database) {
    this.locationService = new LocationService(db);
  }
}

/**
 * Initialize the CLI bridge with the application database
 * Call this during app initialization after database is ready
 */
export function initCliBridge(db: Database): CliBridge {
  bridge = new CliBridge(db);
  return bridge;
}

/**
 * Get the CLI bridge instance
 * @throws Error if bridge not initialized
 */
export function getCliBridge(): CliBridge {
  if (!bridge) {
    throw new Error(
      'CLI bridge not initialized. Call initCliBridge(db) during app startup.',
    );
  }
  return bridge;
}

/**
 * Check if bridge is available
 */
export function hasCliBridge(): boolean {
  return bridge !== null;
}
