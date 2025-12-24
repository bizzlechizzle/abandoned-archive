/**
 * Config commands
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { homedir } from 'os';

const CONFIG_PATH = resolve(homedir(), '.abandoned-archive', 'config.json');

interface Config {
  database?: string;
  archivePath?: string;
  thumbsPath?: string;
  previewsPath?: string;
  darktablePath?: string;
  exiftoolPath?: string;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  [key: string]: unknown;
}

export function registerConfigCommands(program: Command): void {
  const config = program
    .command('config')
    .description('Manage configuration');

  // Show config
  config
    .command('show')
    .description('Show current configuration')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const cfg = loadConfig();

        if (options.json || program.opts().json) {
          console.log(JSON.stringify(cfg, null, 2));
          return;
        }

        console.log(chalk.bold.cyan('\nConfiguration\n'));
        console.log(chalk.gray('─'.repeat(40)));
        console.log(`Config file: ${CONFIG_PATH}`);
        console.log();

        if (Object.keys(cfg).length === 0) {
          console.log(chalk.yellow('No configuration set'));
          return;
        }

        for (const [key, value] of Object.entries(cfg)) {
          console.log(`${chalk.bold(key)}: ${value}`);
        }
      } catch (error) {
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Get config value
  config
    .command('get <key>')
    .description('Get a configuration value')
    .action(async (key) => {
      try {
        const cfg = loadConfig();
        const value = cfg[key];

        if (value === undefined) {
          console.log(chalk.yellow(`Config key not set: ${key}`));
          process.exit(1);
        }

        console.log(value);
      } catch (error) {
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Set config value
  config
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action(async (key, value) => {
      const spinner = ora('Saving configuration...').start();

      try {
        const cfg = loadConfig();

        // Type coercion for known keys
        let parsedValue: unknown = value;
        if (value === 'true') parsedValue = true;
        else if (value === 'false') parsedValue = false;
        else if (!isNaN(Number(value))) parsedValue = Number(value);

        cfg[key] = parsedValue;
        saveConfig(cfg);

        spinner.succeed(`Set ${key} = ${parsedValue}`);
      } catch (error) {
        spinner.fail('Failed to save configuration');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Unset config value
  config
    .command('unset <key>')
    .description('Remove a configuration value')
    .action(async (key) => {
      const spinner = ora('Saving configuration...').start();

      try {
        const cfg = loadConfig();

        if (cfg[key] === undefined) {
          spinner.warn(`Config key not set: ${key}`);
          return;
        }

        delete cfg[key];
        saveConfig(cfg);

        spinner.succeed(`Removed ${key}`);
      } catch (error) {
        spinner.fail('Failed to save configuration');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // List available config keys
  config
    .command('keys')
    .description('List available configuration keys')
    .action(() => {
      console.log(chalk.bold.cyan('\nAvailable Configuration Keys\n'));
      console.log(chalk.gray('─'.repeat(50)));

      const keys = [
        { key: 'database', description: 'Path to SQLite database file' },
        { key: 'archivePath', description: 'Path to media archive directory' },
        { key: 'thumbsPath', description: 'Path to thumbnail directory' },
        { key: 'previewsPath', description: 'Path to preview images directory' },
        { key: 'darktablePath', description: 'Path to darktable-cli executable' },
        { key: 'exiftoolPath', description: 'Path to exiftool executable' },
        { key: 'logLevel', description: 'Log level (debug, info, warn, error)' },
      ];

      for (const { key, description } of keys) {
        console.log(`${chalk.bold(key.padEnd(20))} ${chalk.gray(description)}`);
      }
    });

  // Initialize config with defaults
  config
    .command('init')
    .description('Initialize configuration with defaults')
    .option('-f, --force', 'Overwrite existing config')
    .action(async (options) => {
      if (existsSync(CONFIG_PATH) && !options.force) {
        console.error(chalk.red(`Config already exists: ${CONFIG_PATH}`));
        console.error(chalk.yellow('Use --force to overwrite'));
        process.exit(1);
      }

      const spinner = ora('Initializing configuration...').start();

      try {
        const defaultConfig: Config = {
          database: resolve(homedir(), '.abandoned-archive', 'archive.db'),
          archivePath: resolve(homedir(), '.abandoned-archive', 'archive'),
          thumbsPath: resolve(homedir(), '.abandoned-archive', 'thumbs'),
          previewsPath: resolve(homedir(), '.abandoned-archive', 'previews'),
          logLevel: 'info',
        };

        saveConfig(defaultConfig);

        spinner.succeed(`Configuration initialized: ${CONFIG_PATH}`);

        console.log(chalk.gray('\nDefault values:'));
        for (const [key, value] of Object.entries(defaultConfig)) {
          console.log(`  ${key}: ${value}`);
        }
      } catch (error) {
        spinner.fail('Failed to initialize configuration');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Edit config in editor
  config
    .command('edit')
    .description('Open config file in editor')
    .action(() => {
      const editor = process.env.EDITOR || 'vi';

      if (!existsSync(CONFIG_PATH)) {
        console.log(chalk.yellow('No config file exists. Run "aa config init" first.'));
        process.exit(1);
      }

      console.log(`Opening ${CONFIG_PATH} in ${editor}...`);
      const { execSync } = require('child_process');
      execSync(`${editor} "${CONFIG_PATH}"`, { stdio: 'inherit' });
    });

  // Validate config
  config
    .command('validate')
    .description('Validate configuration')
    .action(async () => {
      const spinner = ora('Validating configuration...').start();

      try {
        const cfg = loadConfig();
        const issues: string[] = [];

        // Check paths
        if (cfg.database && !existsSync(dirname(cfg.database))) {
          issues.push(`Database directory does not exist: ${dirname(cfg.database)}`);
        }
        if (cfg.archivePath && !existsSync(cfg.archivePath)) {
          issues.push(`Archive path does not exist: ${cfg.archivePath}`);
        }
        if (cfg.darktablePath && !existsSync(cfg.darktablePath)) {
          issues.push(`Darktable not found: ${cfg.darktablePath}`);
        }
        if (cfg.exiftoolPath && !existsSync(cfg.exiftoolPath)) {
          issues.push(`Exiftool not found: ${cfg.exiftoolPath}`);
        }

        // Check log level
        if (cfg.logLevel && !['debug', 'info', 'warn', 'error'].includes(cfg.logLevel)) {
          issues.push(`Invalid log level: ${cfg.logLevel}`);
        }

        if (issues.length > 0) {
          spinner.warn('Configuration has issues');
          for (const issue of issues) {
            console.log(chalk.yellow(`  ⚠ ${issue}`));
          }
        } else {
          spinner.succeed('Configuration is valid');
        }
      } catch (error) {
        spinner.fail('Validation failed');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
}

/**
 * Load configuration from file
 */
function loadConfig(): Config {
  if (!existsSync(CONFIG_PATH)) {
    return {};
  }

  const content = readFileSync(CONFIG_PATH, 'utf-8');
  return JSON.parse(content);
}

/**
 * Save configuration to file
 */
function saveConfig(config: Config): void {
  const dir = dirname(CONFIG_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}
