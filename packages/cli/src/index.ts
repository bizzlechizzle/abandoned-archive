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
export { registerLocationCommands } from './commands/location';
export { registerMediaCommands } from './commands/media';
export { registerImportCommands } from './commands/import';
export { registerExportCommands } from './commands/export';
export { registerRefmapCommands } from './commands/refmap';
export { registerCollectionCommands } from './commands/collection';
export { registerTagCommands } from './commands/tag';
export { registerDbCommands } from './commands/db';
export { registerConfigCommands } from './commands/config';

// Re-export database utilities
export { getDatabase, initDatabase, closeDatabase } from './database';
