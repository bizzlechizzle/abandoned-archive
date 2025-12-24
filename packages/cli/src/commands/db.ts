/**
 * Database commands
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { existsSync, statSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { homedir } from 'os';
import { getDatabase, initDatabase, closeDatabase } from '../database';

const DEFAULT_DB_PATH = resolve(homedir(), '.abandoned-archive', 'archive.db');

export function registerDbCommands(program: Command): void {
  const db = program
    .command('db')
    .description('Database management');

  // Initialize database
  db
    .command('init')
    .description('Initialize a new database')
    .option('-p, --path <path>', 'Database path', DEFAULT_DB_PATH)
    .option('-f, --force', 'Overwrite existing database')
    .action(async (options) => {
      const dbPath = options.path;

      if (existsSync(dbPath) && !options.force) {
        console.error(chalk.red(`Database already exists: ${dbPath}`));
        console.error(chalk.yellow('Use --force to overwrite'));
        process.exit(1);
      }

      const spinner = ora('Initializing database...').start();

      try {
        // Create directory if needed
        const dir = dirname(dbPath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        await initDatabase(dbPath);
        closeDatabase();

        spinner.succeed(`Database initialized: ${dbPath}`);
      } catch (error) {
        spinner.fail('Failed to initialize database');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Show database info
  db
    .command('info')
    .description('Show database information')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const spinner = ora('Loading database info...').start();

      try {
        const dbPath = program.opts().database || process.env.AA_DATABASE || DEFAULT_DB_PATH;

        if (!existsSync(dbPath)) {
          spinner.fail(`Database not found: ${dbPath}`);
          process.exit(1);
        }

        const stats = statSync(dbPath);
        const database = await getDatabase(dbPath);

        // Get counts
        const locCount = (database.prepare('SELECT COUNT(*) as count FROM locs').get() as { count: number }).count;
        const mediaCount = (database.prepare('SELECT COUNT(*) as count FROM media').get() as { count: number }).count;
        const jobCount = (database.prepare('SELECT COUNT(*) as count FROM import_jobs').get() as { count: number }).count;

        // Get schema version
        const versionRow = database.prepare("SELECT value FROM config WHERE key = 'schema_version'").get() as { value: string } | undefined;
        const schemaVersion = versionRow?.value || 'unknown';

        spinner.stop();

        const info = {
          path: dbPath,
          size: stats.size,
          sizeFormatted: formatBytes(stats.size),
          schemaVersion,
          counts: {
            locations: locCount,
            media: mediaCount,
            importJobs: jobCount,
          },
          modified: stats.mtime.toISOString(),
        };

        if (options.json || program.opts().json) {
          console.log(JSON.stringify(info, null, 2));
          return;
        }

        console.log(chalk.bold.cyan('\nDatabase Information\n'));
        console.log(chalk.gray('─'.repeat(40)));
        console.log(`Path:           ${dbPath}`);
        console.log(`Size:           ${formatBytes(stats.size)}`);
        console.log(`Schema:         v${schemaVersion}`);
        console.log(`Modified:       ${stats.mtime.toLocaleString()}`);

        console.log(chalk.bold('\nCounts:'));
        console.log(`  Locations:    ${locCount}`);
        console.log(`  Media:        ${mediaCount}`);
        console.log(`  Import Jobs:  ${jobCount}`);
      } catch (error) {
        spinner.fail('Failed to load database info');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Run migrations
  db
    .command('migrate')
    .description('Run database migrations')
    .option('--dry-run', 'Show migrations without running')
    .action(async (options) => {
      const spinner = ora('Checking migrations...').start();

      try {
        const database = await getDatabase(program.opts().database);

        // Get current schema version
        const versionRow = database.prepare("SELECT value FROM config WHERE key = 'schema_version'").get() as { value: string } | undefined;
        const currentVersion = parseInt(versionRow?.value || '0', 10);

        spinner.text = `Current schema version: ${currentVersion}`;

        // Define migrations
        const migrations: Array<{ version: number; name: string; sql: string }> = [
          // Add migrations here as schema evolves
          // {
          //   version: 2,
          //   name: 'Add cultural_region to locs',
          //   sql: 'ALTER TABLE locs ADD COLUMN cultural_region TEXT',
          // },
        ];

        const pendingMigrations = migrations.filter((m) => m.version > currentVersion);

        if (pendingMigrations.length === 0) {
          spinner.succeed('Database is up to date');
          return;
        }

        if (options.dryRun) {
          spinner.stop();
          console.log(chalk.cyan('\nPending migrations:\n'));
          for (const m of pendingMigrations) {
            console.log(`  v${m.version}: ${m.name}`);
          }
          return;
        }

        // Run migrations
        for (const migration of pendingMigrations) {
          spinner.text = `Running migration v${migration.version}: ${migration.name}`;
          database.exec(migration.sql);
          database.prepare("UPDATE config SET value = ?, updated_at = ? WHERE key = 'schema_version'")
            .run(String(migration.version), new Date().toISOString());
        }

        spinner.succeed(`Applied ${pendingMigrations.length} migrations`);
      } catch (error) {
        spinner.fail('Migration failed');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Vacuum database
  db
    .command('vacuum')
    .description('Optimize database size')
    .action(async () => {
      const spinner = ora('Optimizing database...').start();

      try {
        const database = await getDatabase(program.opts().database);

        const beforeSize = statSync(program.opts().database || DEFAULT_DB_PATH).size;

        database.exec('VACUUM');

        const afterSize = statSync(program.opts().database || DEFAULT_DB_PATH).size;
        const saved = beforeSize - afterSize;

        spinner.succeed(`Database optimized (saved ${formatBytes(saved)})`);
      } catch (error) {
        spinner.fail('Optimization failed');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Optimize database for scale (100K-1M files)
  db
    .command('optimize')
    .description('Optimize database for large-scale usage (100K-1M files)')
    .option('-p, --profile <profile>', 'Optimization profile: balanced, performance, safety', 'balanced')
    .option('--cache <kb>', 'Cache size in KB', '65536')
    .option('--no-fts', 'Skip FTS5 index creation')
    .option('--json', 'Output stats as JSON')
    .action(async (options) => {
      const spinner = ora('Applying performance optimizations...').start();

      try {
        const database = await getDatabase(program.opts().database);
        const { optimizeDatabase } = await import('@aa/services');

        const profile = options.profile as 'balanced' | 'performance' | 'safety';
        const cacheSizeKb = parseInt(options.cache, 10);

        const stats = optimizeDatabase(database, {
          profile,
          cacheSizeKb,
          enableFts: options.fts !== false,
        });

        spinner.succeed('Database optimized for scale');

        if (options.json || program.opts().json) {
          console.log(JSON.stringify(stats, null, 2));
        } else {
          console.log(chalk.bold('\nDatabase Statistics:'));
          console.log(`  Locations:    ${stats.locs_count || 0}`);
          console.log(`  Images:       ${stats.imgs_count || 0}`);
          console.log(`  Videos:       ${stats.vids_count || 0}`);
          console.log(`  Documents:    ${stats.docs_count || 0}`);
          console.log(`  Maps:         ${stats.maps_count || 0}`);
          console.log(`  DB Size:      ${stats.db_size_mb || 0} MB`);
          console.log(chalk.bold('\nOptimizations Applied:'));
          console.log(`  Profile:      ${profile}`);
          console.log(`  Cache Size:   ${cacheSizeKb} KB`);
          console.log(`  WAL Mode:     enabled`);
          console.log(`  FTS5 Search:  ${options.fts !== false ? 'enabled' : 'disabled'}`);
        }
      } catch (error) {
        spinner.fail('Optimization failed');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Check database integrity
  db
    .command('check')
    .description('Check database integrity')
    .action(async () => {
      const spinner = ora('Checking database integrity...').start();

      try {
        const database = await getDatabase(program.opts().database);

        const result = database.pragma('integrity_check') as Array<{ integrity_check: string }>;

        if (result.length === 1 && result[0].integrity_check === 'ok') {
          spinner.succeed('Database integrity check passed');
        } else {
          spinner.fail('Database integrity check failed');
          for (const row of result) {
            console.error(chalk.red(`  ${row.integrity_check}`));
          }
          process.exit(1);
        }

        // Check foreign keys
        const fkResult = database.pragma('foreign_key_check') as unknown[];
        if (fkResult.length > 0) {
          console.log(chalk.yellow(`\nWarning: ${fkResult.length} foreign key violations found`));
        }
      } catch (error) {
        spinner.fail('Integrity check failed');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Execute raw SQL
  db
    .command('exec <sql>')
    .description('Execute raw SQL query')
    .option('--json', 'Output as JSON')
    .option('--force', 'Allow dangerous operations (DROP, TRUNCATE, etc.)')
    .action(async (sql, options) => {
      try {
        const database = await getDatabase(program.opts().database);

        // Block dangerous operations unless --force is used
        const DANGEROUS_PATTERNS = /\b(DROP|TRUNCATE|ALTER\s+TABLE|CREATE\s+TABLE|DELETE\s+FROM\s+(?!media|imgs|vids|docs|locs|slocs|collections|tags|refmaps|import_jobs|ref_waypoints|collection_items|tag_assignments|config)\w+)/i;

        const normalizedSql = sql.trim();
        const isSelect = normalizedSql.toLowerCase().startsWith('select');
        const isDangerous = DANGEROUS_PATTERNS.test(normalizedSql);

        if (isDangerous && !options.force) {
          console.error(chalk.red('Dangerous SQL operation detected.'));
          console.error(chalk.yellow('This command may cause data loss. Use --force to execute.'));
          console.error(chalk.gray(`Query: ${normalizedSql.slice(0, 100)}...`));
          process.exit(1);
        }

        if (isSelect) {
          const stmt = database.prepare(sql);
          const rows = stmt.all();

          if (options.json || program.opts().json) {
            console.log(JSON.stringify(rows, null, 2));
          } else {
            console.log(rows);
          }
        } else {
          const result = database.exec(sql);
          console.log(chalk.green('Query executed successfully'));
          console.log(result);
        }
      } catch (error) {
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Reset database (dangerous)
  db
    .command('reset')
    .description('Reset database (deletes all data)')
    .option('-f, --force', 'Skip confirmation')
    .action(async (options) => {
      if (!options.force) {
        console.log(chalk.red.bold('\n⚠️  WARNING: This will delete ALL data!\n'));
        console.log(chalk.yellow('Use --force to confirm'));
        process.exit(1);
      }

      const spinner = ora('Resetting database...').start();

      try {
        const database = await getDatabase(program.opts().database);

        // Drop all data (delete from actual tables, not views)
        database.exec('DELETE FROM tag_assignments');
        database.exec('DELETE FROM tags');
        database.exec('DELETE FROM collection_items');
        database.exec('DELETE FROM collections');
        database.exec('DELETE FROM ref_waypoints');
        database.exec('DELETE FROM refmaps');
        database.exec('DELETE FROM import_jobs');
        database.exec('DELETE FROM imgs');
        database.exec('DELETE FROM vids');
        database.exec('DELETE FROM docs');
        database.exec('DELETE FROM slocs');
        database.exec('DELETE FROM locs');

        // Vacuum to reclaim space
        database.exec('VACUUM');

        spinner.succeed('Database reset complete');
      } catch (error) {
        spinner.fail('Reset failed');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
