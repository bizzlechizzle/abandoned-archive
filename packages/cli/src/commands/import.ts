/**
 * Import commands
 *
 * Uses wake-n-blake for media hashing and metadata extraction.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { existsSync, readdirSync } from 'fs';
import { resolve, extname, basename } from 'path';
import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { getDatabase } from '../database';

// Supported media extensions
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.tiff', '.tif', '.raw', '.cr2', '.nef', '.arw', '.dng']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v']);
const DOCUMENT_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.txt', '.md']);

export function registerImportCommands(program: Command): void {
  const importCmd = program
    .command('import')
    .description('Import media files');

  // Import from directory
  importCmd
    .command('dir <path>')
    .description('Import media from a directory')
    .option('-l, --location <id>', 'Assign to location')
    .option('-r, --recursive', 'Scan subdirectories')
    .option('--dry-run', 'Show what would be imported without importing')
    .option('--skip-duplicates', 'Skip files that already exist in database')
    .option('--copy', 'Copy files to archive (default: reference only)')
    .option('--json', 'Output as JSON')
    .action(async (path, options) => {
      const sourcePath = resolve(path);

      if (!existsSync(sourcePath)) {
        console.error(chalk.red(`Path not found: ${sourcePath}`));
        process.exit(1);
      }

      const spinner = ora('Scanning directory...').start();

      try {
        // Find all media files
        const files = scanDirectory(sourcePath, options.recursive);

        spinner.text = `Found ${files.length} files`;

        if (files.length === 0) {
          spinner.warn('No media files found');
          return;
        }

        const db = await getDatabase(program.opts().database);

        // Verify location if provided
        let locationId: string | null = null;
        if (options.location) {
          const locStmt = db.prepare('SELECT locid FROM locs WHERE locid = ? OR locid LIKE ?');
          const locRow = locStmt.get(options.location, `${options.location}%`) as { locid: string } | undefined;
          if (!locRow) {
            spinner.fail(`Location not found: ${options.location}`);
            process.exit(1);
          }
          locationId = locRow.locid;
        }

        if (options.dryRun) {
          spinner.stop();
          console.log(chalk.cyan('\nDry run - would import:\n'));

          const preview = files.slice(0, 20);
          for (const file of preview) {
            const type = getMediaType(file);
            console.log(`  ${chalk.gray(type.padEnd(10))} ${basename(file)}`);
          }

          if (files.length > 20) {
            console.log(chalk.gray(`  ... and ${files.length - 20} more files`));
          }

          console.log(chalk.cyan(`\nTotal: ${files.length} files`));
          if (locationId) {
            console.log(chalk.cyan(`Would assign to: ${locationId}`));
          }
          return;
        }

        // Import files
        const results = {
          imported: 0,
          skipped: 0,
          failed: 0,
          errors: [] as string[],
        };

        // Prepared statements for each media type
        const insertImgStmt = db.prepare(`
          INSERT INTO imgs (imghash, imgnam, imgnamo, imgloc, imgloco, locid, status, imgadd)
          VALUES (?, ?, ?, ?, ?, ?, 'imported', ?)
        `);
        const insertVidStmt = db.prepare(`
          INSERT INTO vids (vidhash, vidnam, vidnamo, vidloc, vidloco, locid, status, vidadd)
          VALUES (?, ?, ?, ?, ?, ?, 'imported', ?)
        `);
        const insertDocStmt = db.prepare(`
          INSERT INTO docs (dochash, docnam, docnamo, docloc, docloco, locid, status, docadd)
          VALUES (?, ?, ?, ?, ?, ?, 'imported', ?)
        `);

        // Check for duplicates in all tables
        const existsImgStmt = db.prepare('SELECT imghash FROM imgs WHERE imghash = ?');
        const existsVidStmt = db.prepare('SELECT vidhash FROM vids WHERE vidhash = ?');
        const existsDocStmt = db.prepare('SELECT dochash FROM docs WHERE dochash = ?');

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          spinner.text = `Importing ${i + 1}/${files.length}: ${basename(file)}`;

          try {
            // Calculate hash
            const fileBuffer = await readFile(file);
            const hash = createHash('sha256').update(fileBuffer).digest('hex').slice(0, 32);
            const mediaType = getMediaType(file);

            // Check for duplicates based on media type
            if (options.skipDuplicates) {
              let existing: unknown;
              if (mediaType === 'image') existing = existsImgStmt.get(hash);
              else if (mediaType === 'video') existing = existsVidStmt.get(hash);
              else if (mediaType === 'document') existing = existsDocStmt.get(hash);

              if (existing) {
                results.skipped++;
                continue;
              }
            }

            const filename = basename(file);
            const now = new Date().toISOString();

            // Insert into appropriate table
            if (mediaType === 'image') {
              insertImgStmt.run(hash, filename, filename, file, file, locationId, now);
            } else if (mediaType === 'video') {
              insertVidStmt.run(hash, filename, filename, file, file, locationId, now);
            } else if (mediaType === 'document') {
              insertDocStmt.run(hash, filename, filename, file, file, locationId, now);
            } else {
              results.failed++;
              results.errors.push(`${filename}: Unknown media type`);
              continue;
            }

            results.imported++;
          } catch (error) {
            results.failed++;
            results.errors.push(`${basename(file)}: ${(error as Error).message}`);
          }
        }

        // Update location media counts
        if (locationId) {
          const countStmt = db.prepare('SELECT COUNT(*) as count FROM media WHERE locid = ? AND media_type = ?');
          const imgCount = (countStmt.get(locationId, 'image') as { count: number }).count;
          const vidCount = (countStmt.get(locationId, 'video') as { count: number }).count;
          const docCount = (countStmt.get(locationId, 'document') as { count: number }).count;

          const updateLocStmt = db.prepare('UPDATE locs SET imgct = ?, vidct = ?, docct = ?, updated_at = ? WHERE locid = ?');
          updateLocStmt.run(imgCount, vidCount, docCount, new Date().toISOString(), locationId);
        }

        spinner.succeed('Import complete');

        if (options.json || program.opts().json) {
          console.log(JSON.stringify(results, null, 2));
          return;
        }

        console.log(chalk.green(`\nImported: ${results.imported}`));
        if (results.skipped > 0) {
          console.log(chalk.yellow(`Skipped:  ${results.skipped}`));
        }
        if (results.failed > 0) {
          console.log(chalk.red(`Failed:   ${results.failed}`));
          for (const err of results.errors.slice(0, 5)) {
            console.log(chalk.red(`  ${err}`));
          }
          if (results.errors.length > 5) {
            console.log(chalk.red(`  ... and ${results.errors.length - 5} more errors`));
          }
        }
      } catch (error) {
        spinner.fail('Import failed');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Import single file
  importCmd
    .command('file <path>')
    .description('Import a single media file')
    .option('-l, --location <id>', 'Assign to location')
    .option('--json', 'Output as JSON')
    .action(async (path, options) => {
      const filePath = resolve(path);

      if (!existsSync(filePath)) {
        console.error(chalk.red(`File not found: ${filePath}`));
        process.exit(1);
      }

      const spinner = ora('Importing file...').start();

      try {
        const db = await getDatabase(program.opts().database);

        // Verify location if provided
        let locationId: string | null = null;
        if (options.location) {
          const locStmt = db.prepare('SELECT locid FROM locs WHERE locid = ? OR locid LIKE ?');
          const locRow = locStmt.get(options.location, `${options.location}%`) as { locid: string } | undefined;
          if (!locRow) {
            spinner.fail(`Location not found: ${options.location}`);
            process.exit(1);
          }
          locationId = locRow.locid;
        }

        // Calculate hash
        const fileBuffer = await readFile(filePath);
        const hash = createHash('sha256').update(fileBuffer).digest('hex').slice(0, 32);

        const mediaType = getMediaType(filePath);

        // Check if already exists based on media type
        let existing: unknown;
        if (mediaType === 'image') {
          existing = db.prepare('SELECT imghash FROM imgs WHERE imghash = ?').get(hash);
        } else if (mediaType === 'video') {
          existing = db.prepare('SELECT vidhash FROM vids WHERE vidhash = ?').get(hash);
        } else if (mediaType === 'document') {
          existing = db.prepare('SELECT dochash FROM docs WHERE dochash = ?').get(hash);
        }

        if (existing) {
          spinner.warn('File already exists in database');
          console.log(`Hash: ${hash}`);
          return;
        }

        const filename = basename(filePath);
        const now = new Date().toISOString();

        // Insert into appropriate table
        if (mediaType === 'image') {
          db.prepare(`
            INSERT INTO imgs (imghash, imgnam, imgnamo, imgloc, imgloco, locid, status, imgadd)
            VALUES (?, ?, ?, ?, ?, ?, 'imported', ?)
          `).run(hash, filename, filename, filePath, filePath, locationId, now);
        } else if (mediaType === 'video') {
          db.prepare(`
            INSERT INTO vids (vidhash, vidnam, vidnamo, vidloc, vidloco, locid, status, vidadd)
            VALUES (?, ?, ?, ?, ?, ?, 'imported', ?)
          `).run(hash, filename, filename, filePath, filePath, locationId, now);
        } else if (mediaType === 'document') {
          db.prepare(`
            INSERT INTO docs (dochash, docnam, docnamo, docloc, docloco, locid, status, docadd)
            VALUES (?, ?, ?, ?, ?, ?, 'imported', ?)
          `).run(hash, filename, filename, filePath, filePath, locationId, now);
        } else {
          spinner.fail(`Unknown media type for: ${filename}`);
          process.exit(1);
        }

        spinner.succeed('File imported');

        if (options.json || program.opts().json) {
          console.log(JSON.stringify({ hash, filename: basename(filePath), mediaType }, null, 2));
        } else {
          console.log(`${chalk.green('Hash:')} ${hash}`);
          console.log(`${chalk.green('Type:')} ${mediaType}`);
        }
      } catch (error) {
        spinner.fail('Import failed');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Show import jobs
  importCmd
    .command('jobs')
    .description('List import jobs')
    .option('--status <status>', 'Filter by status')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const spinner = ora('Loading jobs...').start();

      try {
        const db = await getDatabase(program.opts().database);

        let query = 'SELECT * FROM import_jobs';
        const params: unknown[] = [];

        if (options.status) {
          query += ' WHERE status = ?';
          params.push(options.status);
        }

        query += ' ORDER BY created_at DESC LIMIT 50';

        const stmt = db.prepare(query);
        const jobs = stmt.all(...params) as Record<string, unknown>[];

        spinner.stop();

        if (options.json || program.opts().json) {
          console.log(JSON.stringify(jobs, null, 2));
          return;
        }

        if (jobs.length === 0) {
          console.log(chalk.yellow('No import jobs found'));
          return;
        }

        for (const job of jobs) {
          const statusColor = job.status === 'completed' ? chalk.green
            : job.status === 'failed' ? chalk.red
            : chalk.yellow;

          console.log(chalk.bold(`\nJob ${(job.job_id as string).slice(0, 8)}...`));
          console.log(`  Status:     ${statusColor(job.status as string)}`);
          console.log(`  Source:     ${job.source_path}`);
          console.log(`  Progress:   ${((job.progress as number) * 100).toFixed(0)}%`);
          console.log(`  Files:      ${job.processed_files}/${job.total_files}`);
          if (job.error) {
            console.log(`  Error:      ${chalk.red(job.error)}`);
          }
        }
      } catch (error) {
        spinner.fail('Failed to load jobs');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
}

/**
 * Scan directory for media files
 */
function scanDirectory(dir: string, recursive: boolean): string[] {
  const files: string[] = [];
  const allExtensions = new Set([...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS, ...DOCUMENT_EXTENSIONS]);

  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);

    if (entry.isDirectory() && recursive) {
      files.push(...scanDirectory(fullPath, true));
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (allExtensions.has(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Get media type from file path
 */
function getMediaType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (DOCUMENT_EXTENSIONS.has(ext)) return 'document';
  return 'unknown';
}

