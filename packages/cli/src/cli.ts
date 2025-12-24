#!/usr/bin/env node
/**
 * Abandoned Archive CLI
 *
 * CLI-first interface for managing abandoned locations and media.
 */

import { Command } from 'commander';
import { version } from '../package.json' with { type: 'json' };
import { registerLocationCommands } from './commands/location';
import { registerMediaCommands } from './commands/media';
import { registerImportCommands } from './commands/import';
import { registerExportCommands } from './commands/export';
import { registerDbCommands } from './commands/db';
import { registerConfigCommands } from './commands/config';
import { registerRefmapCommands } from './commands/refmap';
import { registerCollectionCommands } from './commands/collection';
import { registerTagCommands } from './commands/tag';

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

// Parse and run
program.parse();
