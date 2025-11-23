/**
 * IPC Handlers - Main Entry Point
 * Registers all IPC handlers by delegating to modular handler files
 *
 * LILBITS Compliance: Each handler module is <300 lines
 *
 * Modules:
 * - locations.ts: location:* handlers
 * - stats-settings.ts: stats:* and settings:* handlers
 * - shell-dialog.ts: shell:* and dialog:* handlers
 * - imports.ts: imports:* handlers
 * - media-import.ts: media selection, expansion, import handlers
 * - media-processing.ts: media viewing, thumbnails, cache handlers
 * - notes.ts: notes:* handlers
 * - projects.ts: projects:* handlers
 * - bookmarks.ts: bookmarks:* handlers
 * - users.ts: users:* handlers
 * - database.ts: database:* handlers
 * - health.ts: health:* handlers
 * - geocode.ts: geocode:* handlers
 */

import { getDatabase } from '../database';
import { registerLocationHandlers } from './locations';
import { registerStatsHandlers, registerSettingsHandlers } from './stats-settings';
import { registerShellHandlers, registerDialogHandlers } from './shell-dialog';
import { registerImportsHandlers } from './imports';
import { registerMediaImportHandlers } from './media-import';
import { registerMediaProcessingHandlers } from './media-processing';
import { registerNotesHandlers } from './notes';
import { registerProjectsHandlers } from './projects';
import { registerBookmarksHandlers } from './bookmarks';
import { registerUsersHandlers } from './users';
import { registerDatabaseHandlers } from './database';
import { registerHealthHandlers } from './health';
import { registerGeocodeHandlers } from './geocode';

export function registerIpcHandlers() {
  const db = getDatabase();

  // Location handlers (returns locationRepo for media handlers)
  const locationRepo = registerLocationHandlers(db);

  // Stats and settings
  registerStatsHandlers(db);
  registerSettingsHandlers(db);

  // Shell and dialog
  registerShellHandlers();
  registerDialogHandlers();

  // Imports (returns importRepo for media handlers)
  const importRepo = registerImportsHandlers(db);

  // Media import handlers (returns services for processing handlers)
  const { mediaRepo, exifToolService, ffmpegService } = registerMediaImportHandlers(db, locationRepo, importRepo);

  // Media processing handlers
  registerMediaProcessingHandlers(db, mediaRepo, exifToolService, ffmpegService);

  // Entity handlers
  registerNotesHandlers(db);
  registerProjectsHandlers(db);
  registerBookmarksHandlers(db);
  registerUsersHandlers(db);

  // Database operations
  registerDatabaseHandlers();

  // Health monitoring
  registerHealthHandlers();

  // Geocoding
  registerGeocodeHandlers(db);

  console.log('IPC handlers registered (modular)');
}
