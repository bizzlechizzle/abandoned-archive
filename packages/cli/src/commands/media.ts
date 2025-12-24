/**
 * Media commands
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { getDatabase } from '../database';

export function registerMediaCommands(program: Command): void {
  const media = program
    .command('media')
    .description('Manage media files');

  // List media
  media
    .command('list')
    .description('List media files')
    .option('-l, --location <id>', 'Filter by location')
    .option('-t, --type <type>', 'Filter by type (image, video, document)')
    .option('-s, --status <status>', 'Filter by status')
    .option('--limit <n>', 'Limit results', '50')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const spinner = ora('Loading media...').start();

      try {
        const db = await getDatabase(program.opts().database);

        let query = 'SELECT * FROM media WHERE 1=1';
        const params: unknown[] = [];

        if (options.location) {
          query += ' AND locid = ?';
          params.push(options.location);
        }
        if (options.type) {
          query += ' AND media_type = ?';
          params.push(options.type);
        }
        if (options.status) {
          query += ' AND status = ?';
          params.push(options.status);
        }

        query += ' ORDER BY created_at DESC LIMIT ?';
        params.push(parseInt(options.limit, 10));

        const stmt = db.prepare(query);
        const rows = stmt.all(...params) as Record<string, unknown>[];

        spinner.stop();

        if (options.json || program.opts().json) {
          console.log(JSON.stringify(rows, null, 2));
          return;
        }

        if (rows.length === 0) {
          console.log(chalk.yellow('No media found'));
          return;
        }

        const table = new Table({
          head: ['Hash', 'Filename', 'Type', 'Size', 'Status', 'Location'].map((h) =>
            chalk.cyan(h),
          ),
          style: { head: [], border: [] },
        });

        for (const row of rows) {
          const hash = (row.hash as string).slice(0, 12) + '...';
          const filename = (row.filename as string).slice(0, 30);
          const size = formatBytes(row.file_size as number);
          table.push([
            hash,
            filename,
            row.media_type as string,
            size,
            row.status as string,
            row.locid ? (row.locid as string).slice(0, 8) + '...' : '-',
          ]);
        }

        console.log(table.toString());
        console.log(chalk.gray(`\nShowing ${rows.length} media files`));
      } catch (error) {
        spinner.fail('Failed to load media');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Show media details
  media
    .command('show <hash>')
    .description('Show media details')
    .option('--json', 'Output as JSON')
    .action(async (hash, options) => {
      const spinner = ora('Loading media...').start();

      try {
        const db = await getDatabase(program.opts().database);
        const stmt = db.prepare('SELECT * FROM media WHERE hash = ? OR hash LIKE ?');
        const row = stmt.get(hash, `${hash}%`) as Record<string, unknown> | undefined;

        spinner.stop();

        if (!row) {
          console.log(chalk.red(`Media not found: ${hash}`));
          process.exit(1);
        }

        if (options.json || program.opts().json) {
          console.log(JSON.stringify(row, null, 2));
          return;
        }

        console.log(chalk.bold.cyan(`\n${row.filename}\n`));
        console.log(chalk.gray('─'.repeat(50)));
        console.log(`${chalk.bold('Hash:')}        ${row.hash}`);
        console.log(`${chalk.bold('Type:')}        ${row.media_type}`);
        console.log(`${chalk.bold('Size:')}        ${formatBytes(row.file_size as number)}`);
        console.log(`${chalk.bold('Status:')}      ${row.status}`);

        if (row.width && row.height) {
          console.log(`${chalk.bold('Dimensions:')} ${row.width}x${row.height}`);
        }

        if (row.locid) {
          console.log(`${chalk.bold('Location:')}   ${row.locid}`);
        }

        if (row.capture_time) {
          console.log(`${chalk.bold('Captured:')}   ${row.capture_time}`);
        }

        if (row.camera_make || row.camera_model) {
          console.log(`${chalk.bold('Camera:')}     ${[row.camera_make, row.camera_model].filter(Boolean).join(' ')}`);
        }

        if (row.exif_lat && row.exif_lon) {
          console.log(`${chalk.bold('EXIF GPS:')}   ${(row.exif_lat as number).toFixed(6)}, ${(row.exif_lon as number).toFixed(6)}`);
        }

        console.log(`\n${chalk.bold('Paths:')}`);
        if (row.original_path) console.log(`  Original:  ${row.original_path}`);
        if (row.archive_path) console.log(`  Archive:   ${row.archive_path}`);
        if (row.thumb_path) console.log(`  Thumbnail: ${row.thumb_path}`);

        if (row.ai_caption) {
          console.log(`\n${chalk.bold('AI Caption:')}`);
          console.log(`  ${row.ai_caption}`);
        }
      } catch (error) {
        spinner.fail('Failed to load media');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Assign media to location
  media
    .command('assign <hash> <locationId>')
    .description('Assign media to a location')
    .action(async (hash, locationId) => {
      const spinner = ora('Assigning media...').start();

      try {
        const db = await getDatabase(program.opts().database);

        // Verify media exists and get its type
        const mediaStmt = db.prepare('SELECT hash, media_type FROM media WHERE hash = ? OR hash LIKE ?');
        const mediaRow = mediaStmt.get(hash, `${hash}%`) as { hash: string; media_type: string } | undefined;
        if (!mediaRow) {
          spinner.fail(`Media not found: ${hash}`);
          process.exit(1);
        }

        // Verify location exists
        const locStmt = db.prepare('SELECT locid FROM locs WHERE locid = ? OR locid LIKE ?');
        const locRow = locStmt.get(locationId, `${locationId}%`) as { locid: string } | undefined;
        if (!locRow) {
          spinner.fail(`Location not found: ${locationId}`);
          process.exit(1);
        }

        // Update the correct underlying table based on media type
        if (mediaRow.media_type === 'image') {
          db.prepare('UPDATE imgs SET locid = ? WHERE imghash = ?').run(locRow.locid, mediaRow.hash);
        } else if (mediaRow.media_type === 'video') {
          db.prepare('UPDATE vids SET locid = ? WHERE vidhash = ?').run(locRow.locid, mediaRow.hash);
        } else if (mediaRow.media_type === 'document') {
          db.prepare('UPDATE docs SET locid = ? WHERE dochash = ?').run(locRow.locid, mediaRow.hash);
        }

        // Update location media count
        const countStmt = db.prepare('SELECT COUNT(*) as count FROM media WHERE locid = ? AND media_type = ?');
        const imgCount = (countStmt.get(locRow.locid, 'image') as { count: number }).count;
        const vidCount = (countStmt.get(locRow.locid, 'video') as { count: number }).count;
        const docCount = (countStmt.get(locRow.locid, 'document') as { count: number }).count;

        const updateLocStmt = db.prepare('UPDATE locs SET imgct = ?, vidct = ?, docct = ?, updated_at = ? WHERE locid = ?');
        updateLocStmt.run(imgCount, vidCount, docCount, new Date().toISOString(), locRow.locid);

        spinner.succeed(`Assigned media to location ${locRow.locid.slice(0, 8)}...`);
      } catch (error) {
        spinner.fail('Failed to assign media');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Unassign media from location
  media
    .command('unassign <hash>')
    .description('Remove media from its location')
    .action(async (hash) => {
      const spinner = ora('Unassigning media...').start();

      try {
        const db = await getDatabase(program.opts().database);

        // Get media, its type, and current location
        const mediaStmt = db.prepare('SELECT hash, media_type, locid FROM media WHERE hash = ? OR hash LIKE ?');
        const mediaRow = mediaStmt.get(hash, `${hash}%`) as { hash: string; media_type: string; locid: string | null } | undefined;
        if (!mediaRow) {
          spinner.fail(`Media not found: ${hash}`);
          process.exit(1);
        }

        const oldLocId = mediaRow.locid;

        // Update the correct underlying table based on media type
        if (mediaRow.media_type === 'image') {
          db.prepare('UPDATE imgs SET locid = NULL WHERE imghash = ?').run(mediaRow.hash);
        } else if (mediaRow.media_type === 'video') {
          db.prepare('UPDATE vids SET locid = NULL WHERE vidhash = ?').run(mediaRow.hash);
        } else if (mediaRow.media_type === 'document') {
          db.prepare('UPDATE docs SET locid = NULL WHERE dochash = ?').run(mediaRow.hash);
        }

        // Update old location counts if it had one
        if (oldLocId) {
          const countStmt = db.prepare('SELECT COUNT(*) as count FROM media WHERE locid = ? AND media_type = ?');
          const imgCount = (countStmt.get(oldLocId, 'image') as { count: number }).count;
          const vidCount = (countStmt.get(oldLocId, 'video') as { count: number }).count;
          const docCount = (countStmt.get(oldLocId, 'document') as { count: number }).count;

          const updateLocStmt = db.prepare('UPDATE locs SET imgct = ?, vidct = ?, docct = ?, updated_at = ? WHERE locid = ?');
          updateLocStmt.run(imgCount, vidCount, docCount, new Date().toISOString(), oldLocId);
        }

        spinner.succeed('Media unassigned from location');
      } catch (error) {
        spinner.fail('Failed to unassign media');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Delete media
  media
    .command('delete <hash>')
    .description('Delete media from database')
    .option('-f, --force', 'Skip confirmation')
    .option('--delete-files', 'Also delete physical files')
    .action(async (hash, options) => {
      try {
        const db = await getDatabase(program.opts().database);

        const stmt = db.prepare('SELECT * FROM media WHERE hash = ? OR hash LIKE ?');
        const row = stmt.get(hash, `${hash}%`) as Record<string, unknown> | undefined;

        if (!row) {
          console.log(chalk.red(`Media not found: ${hash}`));
          process.exit(1);
        }

        if (!options.force) {
          console.log(chalk.yellow(`About to delete: ${row.filename}`));
          if (options.deleteFiles) {
            console.log(chalk.yellow('This will also delete physical files!'));
          }
          console.log(chalk.yellow('Use --force to confirm'));
          process.exit(1);
        }

        const spinner = ora('Deleting media...').start();

        // Delete from the correct underlying table based on media type
        const mediaType = row.media_type as string;
        if (mediaType === 'image') {
          db.prepare('DELETE FROM imgs WHERE imghash = ?').run(row.hash);
        } else if (mediaType === 'video') {
          db.prepare('DELETE FROM vids WHERE vidhash = ?').run(row.hash);
        } else if (mediaType === 'document') {
          db.prepare('DELETE FROM docs WHERE dochash = ?').run(row.hash);
        }

        // Delete physical files if --delete-files
        if (options.deleteFiles) {
          const { unlinkSync, existsSync } = await import('fs');
          const filePath = row.file_path as string | null;
          const originalPath = row.original_path as string | null;

          if (filePath && existsSync(filePath)) {
            try {
              unlinkSync(filePath);
            } catch (e) {
              console.log(chalk.yellow(`Could not delete file: ${filePath}`));
            }
          }
          if (originalPath && originalPath !== filePath && existsSync(originalPath)) {
            try {
              unlinkSync(originalPath);
            } catch (e) {
              console.log(chalk.yellow(`Could not delete original: ${originalPath}`));
            }
          }
        }

        // Update location counts if assigned
        if (row.locid) {
          const countStmt = db.prepare('SELECT COUNT(*) as count FROM media WHERE locid = ? AND media_type = ?');
          const imgCount = (countStmt.get(row.locid, 'image') as { count: number }).count;
          const vidCount = (countStmt.get(row.locid, 'video') as { count: number }).count;
          const docCount = (countStmt.get(row.locid, 'document') as { count: number }).count;

          const updateLocStmt = db.prepare('UPDATE locs SET imgct = ?, vidct = ?, docct = ?, updated_at = ? WHERE locid = ?');
          updateLocStmt.run(imgCount, vidCount, docCount, new Date().toISOString(), row.locid);
        }

        spinner.succeed(`Deleted: ${row.filename}`);
      } catch (error) {
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Stats
  media
    .command('stats')
    .description('Show media statistics')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const spinner = ora('Loading statistics...').start();

      try {
        const db = await getDatabase(program.opts().database);

        const totalStmt = db.prepare('SELECT COUNT(*) as count FROM media');
        const total = (totalStmt.get() as { count: number }).count;

        const byTypeStmt = db.prepare('SELECT media_type, COUNT(*) as count FROM media GROUP BY media_type');
        const byType = byTypeStmt.all() as Array<{ media_type: string; count: number }>;

        const byStatusStmt = db.prepare('SELECT status, COUNT(*) as count FROM media GROUP BY status');
        const byStatus = byStatusStmt.all() as Array<{ status: string; count: number }>;

        const sizeStmt = db.prepare('SELECT SUM(file_size) as total FROM media');
        const totalSize = (sizeStmt.get() as { total: number }).total || 0;

        const unassignedStmt = db.prepare('SELECT COUNT(*) as count FROM media WHERE locid IS NULL');
        const unassigned = (unassignedStmt.get() as { count: number }).count;

        spinner.stop();

        const stats = {
          total,
          byType: Object.fromEntries(byType.map((r) => [r.media_type, r.count])),
          byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.count])),
          totalSize,
          unassigned,
        };

        if (options.json || program.opts().json) {
          console.log(JSON.stringify(stats, null, 2));
          return;
        }

        console.log(chalk.bold.cyan('\nMedia Statistics\n'));
        console.log(chalk.gray('─'.repeat(40)));
        console.log(`Total files:     ${total}`);
        console.log(`Total size:      ${formatBytes(totalSize)}`);
        console.log(`Unassigned:      ${unassigned}`);

        if (byType.length > 0) {
          console.log(chalk.bold('\nBy Type:'));
          for (const item of byType) {
            console.log(`  ${item.media_type}: ${item.count}`);
          }
        }

        if (byStatus.length > 0) {
          console.log(chalk.bold('\nBy Status:'));
          for (const item of byStatus) {
            console.log(`  ${item.status}: ${item.count}`);
          }
        }
      } catch (error) {
        spinner.fail('Failed to load statistics');
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
