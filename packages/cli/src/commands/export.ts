/**
 * Export commands
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { writeFileSync, mkdirSync, existsSync, copyFileSync } from 'fs';
import { join, basename } from 'path';
import { getDatabase } from '../database.js';

export function registerExportCommands(program: Command): void {
  const exportCmd = program
    .command('export')
    .description('Export data and media');

  // Export locations to JSON/CSV
  exportCmd
    .command('locations')
    .description('Export locations')
    .option('-o, --output <path>', 'Output file path')
    .option('-f, --format <format>', 'Output format (json, csv, geojson)', 'json')
    .option('--state <state>', 'Filter by state')
    .option('--type <type>', 'Filter by type')
    .option('--with-gps', 'Only export locations with GPS')
    .action(async (options) => {
      const spinner = ora('Exporting locations...').start();

      try {
        const db = await getDatabase(program.opts().database);

        let query = 'SELECT * FROM locs WHERE 1=1';
        const params: unknown[] = [];

        if (options.state) {
          query += ' AND address_state = ?';
          params.push(options.state);
        }
        if (options.type) {
          query += ' AND type = ?';
          params.push(options.type);
        }
        if (options.withGps) {
          query += ' AND gps_lat IS NOT NULL AND gps_lng IS NOT NULL';
        }

        query += ' ORDER BY locnam';

        const stmt = db.prepare(query);
        const rows = stmt.all(...params) as Record<string, unknown>[];

        let output: string;
        let ext: string;

        switch (options.format) {
          case 'csv':
            output = locationsToCSV(rows);
            ext = '.csv';
            break;
          case 'geojson':
            output = locationsToGeoJSON(rows);
            ext = '.geojson';
            break;
          case 'json':
          default:
            output = JSON.stringify(rows, null, 2);
            ext = '.json';
        }

        const outputPath = options.output || `locations-export${ext}`;
        writeFileSync(outputPath, output);

        spinner.succeed(`Exported ${rows.length} locations to ${outputPath}`);
      } catch (error) {
        spinner.fail('Export failed');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Export media metadata
  exportCmd
    .command('media')
    .description('Export media metadata')
    .option('-o, --output <path>', 'Output file path')
    .option('-f, --format <format>', 'Output format (json, csv)', 'json')
    .option('-l, --location <id>', 'Filter by location')
    .option('-t, --type <type>', 'Filter by type')
    .action(async (options) => {
      const spinner = ora('Exporting media...').start();

      try {
        const db = await getDatabase(program.opts().database);

        let query = 'SELECT * FROM media WHERE 1=1';
        const params: unknown[] = [];

        if (options.location) {
          query += ' AND (locid = ? OR locid LIKE ?)';
          params.push(options.location, `${options.location}%`);
        }
        if (options.type) {
          query += ' AND media_type = ?';
          params.push(options.type);
        }

        query += ' ORDER BY created_at DESC';

        const stmt = db.prepare(query);
        const rows = stmt.all(...params) as Record<string, unknown>[];

        let output: string;
        let ext: string;

        switch (options.format) {
          case 'csv':
            output = mediaToCSV(rows);
            ext = '.csv';
            break;
          case 'json':
          default:
            output = JSON.stringify(rows, null, 2);
            ext = '.json';
        }

        const outputPath = options.output || `media-export${ext}`;
        writeFileSync(outputPath, output);

        spinner.succeed(`Exported ${rows.length} media records to ${outputPath}`);
      } catch (error) {
        spinner.fail('Export failed');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Export location with all media
  exportCmd
    .command('location <id>')
    .description('Export a location with all its media')
    .option('-o, --output <path>', 'Output directory')
    .option('--copy-files', 'Copy media files to output directory')
    .action(async (id, options) => {
      const spinner = ora('Exporting location...').start();

      try {
        const db = await getDatabase(program.opts().database);

        // Get location
        const locStmt = db.prepare('SELECT * FROM locs WHERE locid = ? OR locid LIKE ?');
        const location = locStmt.get(id, `${id}%`) as Record<string, unknown> | undefined;

        if (!location) {
          spinner.fail(`Location not found: ${id}`);
          process.exit(1);
        }

        // Get media
        const mediaStmt = db.prepare('SELECT * FROM media WHERE locid = ?');
        const media = mediaStmt.all(location.locid) as Record<string, unknown>[];

        // Create output directory
        const outputDir = options.output || `export-${(location.locid as string).slice(0, 8)}`;
        if (!existsSync(outputDir)) {
          mkdirSync(outputDir, { recursive: true });
        }

        // Write location.json
        const locationPath = join(outputDir, 'location.json');
        writeFileSync(locationPath, JSON.stringify(location, null, 2));

        // Write media.json
        const mediaPath = join(outputDir, 'media.json');
        writeFileSync(mediaPath, JSON.stringify(media, null, 2));

        // Copy media files if requested
        if (options.copyFiles) {
          const filesDir = join(outputDir, 'files');
          if (!existsSync(filesDir)) {
            mkdirSync(filesDir, { recursive: true });
          }

          let copied = 0;
          for (const m of media) {
            if (m.original_path && existsSync(m.original_path as string)) {
              const destPath = join(filesDir, basename(m.original_path as string));
              copyFileSync(m.original_path as string, destPath);
              copied++;
            }
          }
          spinner.succeed(`Exported location to ${outputDir} (${copied} files copied)`);
        } else {
          spinner.succeed(`Exported location to ${outputDir}`);
        }

        console.log(chalk.gray(`  Location: ${location.locnam}`));
        console.log(chalk.gray(`  Media: ${media.length} items`));
      } catch (error) {
        spinner.fail('Export failed');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Export to GPX for GPS apps
  exportCmd
    .command('gpx')
    .description('Export locations to GPX format')
    .option('-o, --output <path>', 'Output file path', 'locations.gpx')
    .option('--state <state>', 'Filter by state')
    .option('--type <type>', 'Filter by type')
    .action(async (options) => {
      const spinner = ora('Exporting to GPX...').start();

      try {
        const db = await getDatabase(program.opts().database);

        let query = 'SELECT * FROM locs WHERE gps_lat IS NOT NULL AND gps_lng IS NOT NULL';
        const params: unknown[] = [];

        if (options.state) {
          query += ' AND address_state = ?';
          params.push(options.state);
        }
        if (options.type) {
          query += ' AND type = ?';
          params.push(options.type);
        }

        query += ' ORDER BY locnam';

        const stmt = db.prepare(query);
        const rows = stmt.all(...params) as Record<string, unknown>[];

        const gpx = locationsToGPX(rows);
        writeFileSync(options.output, gpx);

        spinner.succeed(`Exported ${rows.length} locations to ${options.output}`);
      } catch (error) {
        spinner.fail('Export failed');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Export database backup
  exportCmd
    .command('backup')
    .description('Create database backup')
    .option('-o, --output <path>', 'Output file path')
    .action(async (options) => {
      const spinner = ora('Creating backup...').start();

      try {
        const db = await getDatabase(program.opts().database);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputPath = options.output || `archive-backup-${timestamp}.db`;

        await db.backup(outputPath);

        spinner.succeed(`Backup created: ${outputPath}`);
      } catch (error) {
        spinner.fail('Backup failed');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
}

/**
 * Convert locations to CSV
 */
function locationsToCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';

  const headers = ['locid', 'locnam', 'type', 'status', 'gps_lat', 'gps_lng', 'address_street', 'address_city', 'address_state', 'imgct'];
  const lines = [headers.join(',')];

  for (const row of rows) {
    const values = headers.map((h) => {
      const val = row[h];
      if (val === null || val === undefined) return '';
      if (typeof val === 'string' && val.includes(',')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return String(val);
    });
    lines.push(values.join(','));
  }

  return lines.join('\n');
}

/**
 * Convert locations to GeoJSON
 */
function locationsToGeoJSON(rows: Record<string, unknown>[]): string {
  const features = rows
    .filter((r) => r.gps_lat && r.gps_lng)
    .map((r) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [r.gps_lng, r.gps_lat],
      },
      properties: {
        id: r.locid,
        name: r.locnam,
        type: r.type,
        status: r.status,
        address: r.address_street,
        city: r.address_city,
        state: r.address_state,
        imageCount: r.imgct,
      },
    }));

  return JSON.stringify(
    {
      type: 'FeatureCollection',
      features,
    },
    null,
    2,
  );
}

/**
 * Convert locations to GPX
 */
function locationsToGPX(rows: Record<string, unknown>[]): string {
  const waypoints = rows.map((r) => {
    const name = escapeXml(r.locnam as string);
    const desc = r.description ? `<desc>${escapeXml(r.description as string)}</desc>` : '';
    const type = r.type ? `<type>${escapeXml(r.type as string)}</type>` : '';

    return `  <wpt lat="${r.gps_lat}" lon="${r.gps_lng}">
    <name>${name}</name>
    ${desc}
    ${type}
  </wpt>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Abandoned Archive CLI"
  xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Abandoned Archive Export</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
${waypoints.join('\n')}
</gpx>`;
}

/**
 * Convert media to CSV
 */
function mediaToCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';

  const headers = ['hash', 'filename', 'media_type', 'file_size', 'locid', 'capture_time', 'status'];
  const lines = [headers.join(',')];

  for (const row of rows) {
    const values = headers.map((h) => {
      const val = row[h];
      if (val === null || val === undefined) return '';
      if (typeof val === 'string' && val.includes(',')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return String(val);
    });
    lines.push(values.join(','));
  }

  return lines.join('\n');
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
