/**
 * @aa/cli - Abandoned Archive Command Line Interface
 *
 * CLI-first interface for managing abandoned locations and media.
 *
 * Usage: aa <command> [options]
 *
 * Commands:
 *   location  - Manage abandoned locations
 *   media     - Manage media files
 *   import    - Import media files
 *   export    - Export data and media
 *   db        - Database management
 *   config    - Manage configuration
 */

// Re-export commands for programmatic usage
export { registerLocationCommands } from './commands/location.js';
export { registerMediaCommands } from './commands/media.js';
export { registerImportCommands } from './commands/import.js';
export { registerExportCommands } from './commands/export.js';
export { registerRefmapCommands } from './commands/refmap.js';
export { registerCollectionCommands } from './commands/collection.js';
export { registerTagCommands } from './commands/tag.js';
export { registerDbCommands } from './commands/db.js';
export { registerConfigCommands } from './commands/config.js';

// Re-export database utilities
export { getDatabase, initDatabase, closeDatabase } from './database.js';
