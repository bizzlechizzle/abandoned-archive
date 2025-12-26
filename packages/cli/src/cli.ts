#!/usr/bin/env node
/**
 * Abandoned Archive CLI
 *
 * CLI-first interface for managing abandoned locations and media.
 */

import { Command } from 'commander';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');
const version = pkg.version;
import { registerLocationCommands } from './commands/location.js';
import { registerMediaCommands } from './commands/media.js';
import { registerImportCommands } from './commands/import.js';
import { registerExportCommands } from './commands/export.js';
import { registerDbCommands } from './commands/db.js';
import { registerConfigCommands } from './commands/config.js';
import { registerRefmapCommands } from './commands/refmap.js';
import { registerCollectionCommands } from './commands/collection.js';
import { registerTagCommands } from './commands/tag.js';
import { registerPipelineCommands } from './commands/pipeline.js';

const program = new Command();

program
  .name('aa')
  .description('Abandoned Archive - CLI for managing abandoned locations and media')
  .version(version)
  .option('-c, --config <path>', 'Path to config file')
  .option('-d, --database <path>', 'Path to database file')
  .option('-v, --verbose', 'Enable verbose output')
  .option('-q, --quiet', 'Suppress non-essential output')
  .option('--json', 'Output as JSON');

// Register all command groups
registerLocationCommands(program);
registerMediaCommands(program);
registerImportCommands(program);
registerExportCommands(program);
registerRefmapCommands(program);
registerCollectionCommands(program);
registerTagCommands(program);
registerDbCommands(program);
registerConfigCommands(program);
registerPipelineCommands(program);

// Parse and run
program.parse();
