/**
 * Reference map commands
 *
 * Manage GPS waypoints and tracks from external sources (GPX, KML, etc.)
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { existsSync, readFileSync } from 'fs';
import { resolve, extname, basename } from 'path';
import { createHash, randomBytes } from 'crypto';
import { getDatabase } from '../database.js';

export function registerRefmapCommands(program: Command): void {
  const refmap = program
    .command('refmap')
    .description('Manage reference maps and waypoints');

  // List refmaps
  refmap
    .command('list')
    .description('List all reference maps')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const spinner = ora('Loading reference maps...').start();

      try {
        const db = await getDatabase(program.opts().database);
        const stmt = db.prepare('SELECT * FROM refmaps ORDER BY created_at DESC');
        const rows = stmt.all() as Record<string, unknown>[];

        spinner.stop();

        if (options.json || program.opts().json) {
          console.log(JSON.stringify(rows, null, 2));
          return;
        }

        if (rows.length === 0) {
          console.log(chalk.yellow('No reference maps found'));
          return;
        }

        const table = new Table({
          head: ['ID', 'Name', 'Type', 'Waypoints', 'Tracks', 'Created'].map((h) =>
            chalk.cyan(h),
          ),
          style: { head: [], border: [] },
        });

        for (const row of rows) {
          table.push([
            (row.refmap_id as string).slice(0, 8) + '...',
            (row.name as string).slice(0, 30),
            (row.source_type as string) || '-',
            String(row.waypoint_count || 0),
            String(row.track_count || 0),
            new Date(row.created_at as string).toLocaleDateString(),
          ] as unknown as string[]);
        }

        console.log(table.toString());
        console.log(chalk.gray(`\nShowing ${rows.length} reference maps`));
      } catch (error) {
        spinner.fail('Failed to load reference maps');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Import GPX/KML file
  refmap
    .command('import <path>')
    .description('Import a GPX or KML file')
    .option('-n, --name <name>', 'Reference map name')
    .option('--json', 'Output as JSON')
    .action(async (path, options) => {
      const filePath = resolve(path);

      if (!existsSync(filePath)) {
        console.error(chalk.red(`File not found: ${filePath}`));
        process.exit(1);
      }

      const spinner = ora('Importing reference map...').start();

      try {
        const db = await getDatabase(program.opts().database);
        const ext = extname(filePath).toLowerCase();
        const content = readFileSync(filePath, 'utf-8');

        let waypoints: Array<{ name: string; lat: number; lon: number; ele?: number; desc?: string }> = [];
        let sourceType = 'unknown';

        if (ext === '.gpx') {
          waypoints = parseGPX(content);
          sourceType = 'gpx';
        } else if (ext === '.kml') {
          waypoints = parseKML(content);
          sourceType = 'kml';
        } else {
          spinner.fail(`Unsupported file type: ${ext}`);
          process.exit(1);
        }

        if (waypoints.length === 0) {
          spinner.warn('No waypoints found in file');
          return;
        }

        // Generate refmap ID
        const refmapId = createHash('sha256').update(randomBytes(32)).digest('hex').slice(0, 16);
        const name = options.name || basename(filePath, ext);
        const now = new Date().toISOString();

        // Calculate bounds
        const lats = waypoints.map((w) => w.lat);
        const lons = waypoints.map((w) => w.lon);
        const north = Math.max(...lats);
        const south = Math.min(...lats);
        const east = Math.max(...lons);
        const west = Math.min(...lons);

        // Insert refmap
        const insertRefmap = db.prepare(`
          INSERT INTO refmaps (
            refmap_id, name, description, source_path, source_type,
            north, south, east, west, waypoint_count, track_count,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
        `);

        insertRefmap.run(
          refmapId,
          name,
          null,
          filePath,
          sourceType,
          north,
          south,
          east,
          west,
          waypoints.length,
          now,
          now,
        );

        // Insert waypoints
        const insertWaypoint = db.prepare(`
          INSERT INTO ref_waypoints (
            waypoint_id, refmap_id, name, description, lat, lon, elevation, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const wp of waypoints) {
          const wpId = createHash('sha256').update(randomBytes(32)).digest('hex').slice(0, 16);
          insertWaypoint.run(
            wpId,
            refmapId,
            wp.name || null,
            wp.desc || null,
            wp.lat,
            wp.lon,
            wp.ele || null,
            now,
          );
        }

        spinner.succeed(`Imported ${waypoints.length} waypoints`);

        if (options.json || program.opts().json) {
          console.log(JSON.stringify({ refmapId, name, waypoints: waypoints.length }, null, 2));
        } else {
          console.log(`${chalk.green('Refmap ID:')} ${refmapId}`);
          console.log(`${chalk.green('Name:')} ${name}`);
          console.log(`${chalk.green('Bounds:')} ${south.toFixed(4)}°N to ${north.toFixed(4)}°N, ${west.toFixed(4)}°W to ${east.toFixed(4)}°W`);
        }
      } catch (error) {
        spinner.fail('Import failed');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Show refmap details
  refmap
    .command('show <id>')
    .description('Show reference map details')
    .option('--json', 'Output as JSON')
    .action(async (id, options) => {
      const spinner = ora('Loading reference map...').start();

      try {
        const db = await getDatabase(program.opts().database);

        const refmapStmt = db.prepare('SELECT * FROM refmaps WHERE refmap_id = ? OR refmap_id LIKE ?');
        const refmapRow = refmapStmt.get(id, `${id}%`) as Record<string, unknown> | undefined;

        if (!refmapRow) {
          spinner.fail(`Reference map not found: ${id}`);
          process.exit(1);
        }

        const waypointsStmt = db.prepare('SELECT * FROM ref_waypoints WHERE refmap_id = ?');
        const waypoints = waypointsStmt.all(refmapRow.refmap_id) as Record<string, unknown>[];

        spinner.stop();

        if (options.json || program.opts().json) {
          console.log(JSON.stringify({ ...refmapRow, waypoints }, null, 2));
          return;
        }

        console.log(chalk.bold.cyan(`\n${refmapRow.name}\n`));
        console.log(chalk.gray('─'.repeat(50)));
        console.log(`${chalk.bold('ID:')}          ${refmapRow.refmap_id}`);
        console.log(`${chalk.bold('Source:')}      ${refmapRow.source_type}`);
        console.log(`${chalk.bold('Waypoints:')}   ${refmapRow.waypoint_count}`);

        if (refmapRow.north && refmapRow.south) {
          console.log(`${chalk.bold('Bounds:')}      ${(refmapRow.south as number).toFixed(4)}° to ${(refmapRow.north as number).toFixed(4)}°N`);
          console.log(`              ${(refmapRow.west as number).toFixed(4)}° to ${(refmapRow.east as number).toFixed(4)}°W`);
        }

        if (waypoints.length > 0) {
          console.log(chalk.bold('\nWaypoints:'));
          const preview = waypoints.slice(0, 10);
          for (const wp of preview) {
            const name = wp.name || 'Unnamed';
            const coords = `${(wp.lat as number).toFixed(5)}, ${(wp.lon as number).toFixed(5)}`;
            const matched = wp.locid ? chalk.green('✓') : chalk.gray('○');
            console.log(`  ${matched} ${name.toString().slice(0, 30).padEnd(32)} ${coords}`);
          }
          if (waypoints.length > 10) {
            console.log(chalk.gray(`  ... and ${waypoints.length - 10} more waypoints`));
          }
        }
      } catch (error) {
        spinner.fail('Failed to load reference map');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Match waypoints to locations
  refmap
    .command('match <id>')
    .description('Match waypoints to nearby locations')
    .option('-d, --distance <meters>', 'Match distance in meters', '100')
    .option('--dry-run', 'Show matches without saving')
    .option('--json', 'Output as JSON')
    .action(async (id, options) => {
      const spinner = ora('Matching waypoints...').start();

      try {
        const db = await getDatabase(program.opts().database);
        const maxDistance = parseFloat(options.distance);

        // Get refmap
        const refmapStmt = db.prepare('SELECT refmap_id FROM refmaps WHERE refmap_id = ? OR refmap_id LIKE ?');
        const refmapRow = refmapStmt.get(id, `${id}%`) as { refmap_id: string } | undefined;

        if (!refmapRow) {
          spinner.fail(`Reference map not found: ${id}`);
          process.exit(1);
        }

        // Get waypoints
        const waypointsStmt = db.prepare('SELECT * FROM ref_waypoints WHERE refmap_id = ?');
        const waypoints = waypointsStmt.all(refmapRow.refmap_id) as Array<{
          waypoint_id: string;
          name: string;
          lat: number;
          lon: number;
        }>;

        // Get locations with GPS
        const locsStmt = db.prepare('SELECT locid, locnam, gps_lat, gps_lng FROM locs WHERE gps_lat IS NOT NULL AND gps_lng IS NOT NULL');
        const locations = locsStmt.all() as Array<{
          locid: string;
          locnam: string;
          gps_lat: number;
          gps_lng: number;
        }>;

        const matches: Array<{
          waypoint: string;
          location: string;
          locationName: string;
          distance: number;
        }> = [];

        // Find matches
        for (const wp of waypoints) {
          for (const loc of locations) {
            const distance = haversineDistance(wp.lat, wp.lon, loc.gps_lat, loc.gps_lng);
            if (distance <= maxDistance) {
              matches.push({
                waypoint: wp.waypoint_id,
                location: loc.locid,
                locationName: loc.locnam,
                distance: Math.round(distance),
              });
            }
          }
        }

        spinner.stop();

        if (options.json || program.opts().json) {
          console.log(JSON.stringify(matches, null, 2));
          return;
        }

        if (matches.length === 0) {
          console.log(chalk.yellow(`No matches found within ${maxDistance}m`));
          return;
        }

        console.log(chalk.cyan(`\nFound ${matches.length} matches:\n`));

        for (const match of matches) {
          console.log(`  ${chalk.green('✓')} ${match.locationName.slice(0, 40)} (${match.distance}m)`);
        }

        if (!options.dryRun) {
          const updateStmt = db.prepare(`
            UPDATE ref_waypoints SET locid = ?, match_confidence = ? WHERE waypoint_id = ?
          `);

          for (const match of matches) {
            const confidence = 1 - match.distance / maxDistance;
            updateStmt.run(match.location, confidence, match.waypoint);
          }

          console.log(chalk.green(`\nSaved ${matches.length} matches`));
        } else {
          console.log(chalk.yellow('\nDry run - no changes saved'));
        }
      } catch (error) {
        spinner.fail('Matching failed');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Delete refmap
  refmap
    .command('delete <id>')
    .description('Delete a reference map')
    .option('-f, --force', 'Skip confirmation')
    .action(async (id, options) => {
      try {
        const db = await getDatabase(program.opts().database);

        const stmt = db.prepare('SELECT * FROM refmaps WHERE refmap_id = ? OR refmap_id LIKE ?');
        const row = stmt.get(id, `${id}%`) as Record<string, unknown> | undefined;

        if (!row) {
          console.log(chalk.red(`Reference map not found: ${id}`));
          process.exit(1);
        }

        if (!options.force) {
          console.log(chalk.yellow(`About to delete: ${row.name}`));
          console.log(chalk.yellow(`This will also delete ${row.waypoint_count} waypoints`));
          console.log(chalk.yellow('Use --force to confirm'));
          process.exit(1);
        }

        const spinner = ora('Deleting reference map...').start();

        // Delete waypoints first (cascade should handle this, but be explicit)
        db.prepare('DELETE FROM ref_waypoints WHERE refmap_id = ?').run(row.refmap_id);
        db.prepare('DELETE FROM refmaps WHERE refmap_id = ?').run(row.refmap_id);

        spinner.succeed(`Deleted: ${row.name}`);
      } catch (error) {
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // List unmatched waypoints
  refmap
    .command('unmatched')
    .description('List waypoints not matched to locations')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const spinner = ora('Loading unmatched waypoints...').start();

      try {
        const db = await getDatabase(program.opts().database);

        const stmt = db.prepare(`
          SELECT w.*, r.name as refmap_name
          FROM ref_waypoints w
          JOIN refmaps r ON w.refmap_id = r.refmap_id
          WHERE w.locid IS NULL
          ORDER BY r.name, w.name
        `);
        const rows = stmt.all() as Record<string, unknown>[];

        spinner.stop();

        if (options.json || program.opts().json) {
          console.log(JSON.stringify(rows, null, 2));
          return;
        }

        if (rows.length === 0) {
          console.log(chalk.green('All waypoints are matched'));
          return;
        }

        console.log(chalk.yellow(`\n${rows.length} unmatched waypoints:\n`));

        const table = new Table({
          head: ['Refmap', 'Waypoint', 'Lat', 'Lon'].map((h) => chalk.cyan(h)),
          style: { head: [], border: [] },
        });

        for (const row of rows.slice(0, 50)) {
          table.push([
            (row.refmap_name as string).slice(0, 20),
            (row.name as string || 'Unnamed').slice(0, 25),
            (row.lat as number).toFixed(5),
            (row.lon as number).toFixed(5),
          ]);
        }

        console.log(table.toString());

        if (rows.length > 50) {
          console.log(chalk.gray(`\n... and ${rows.length - 50} more`));
        }
      } catch (error) {
        spinner.fail('Failed to load waypoints');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
}

/**
 * Parse GPX file and extract waypoints
 */
function parseGPX(content: string): Array<{ name: string; lat: number; lon: number; ele?: number; desc?: string }> {
  const waypoints: Array<{ name: string; lat: number; lon: number; ele?: number; desc?: string }> = [];

  // Simple regex-based parsing (could use xml2js for more robust parsing)
  const wptRegex = /<wpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/wpt>/gi;
  const nameRegex = /<name>([^<]*)<\/name>/i;
  const eleRegex = /<ele>([^<]*)<\/ele>/i;
  const descRegex = /<desc>([^<]*)<\/desc>/i;

  let match;
  while ((match = wptRegex.exec(content)) !== null) {
    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);
    const inner = match[3];

    const nameMatch = inner.match(nameRegex);
    const eleMatch = inner.match(eleRegex);
    const descMatch = inner.match(descRegex);

    waypoints.push({
      name: nameMatch ? nameMatch[1] : '',
      lat,
      lon,
      ele: eleMatch ? parseFloat(eleMatch[1]) : undefined,
      desc: descMatch ? descMatch[1] : undefined,
    });
  }

  return waypoints;
}

/**
 * Parse KML file and extract waypoints
 */
function parseKML(content: string): Array<{ name: string; lat: number; lon: number; ele?: number; desc?: string }> {
  const waypoints: Array<{ name: string; lat: number; lon: number; ele?: number; desc?: string }> = [];

  // Simple regex-based parsing
  const placemarkRegex = /<Placemark>([\s\S]*?)<\/Placemark>/gi;
  const nameRegex = /<name>([^<]*)<\/name>/i;
  const descRegex = /<description>([^<]*)<\/description>/i;
  const coordsRegex = /<coordinates>([^<]*)<\/coordinates>/i;

  let match;
  while ((match = placemarkRegex.exec(content)) !== null) {
    const inner = match[1];

    const nameMatch = inner.match(nameRegex);
    const descMatch = inner.match(descRegex);
    const coordsMatch = inner.match(coordsRegex);

    if (coordsMatch) {
      const coords = coordsMatch[1].trim().split(',');
      if (coords.length >= 2) {
        waypoints.push({
          name: nameMatch ? nameMatch[1] : '',
          lon: parseFloat(coords[0]),
          lat: parseFloat(coords[1]),
          ele: coords.length > 2 ? parseFloat(coords[2]) : undefined,
          desc: descMatch ? descMatch[1] : undefined,
        });
      }
    }
  }

  return waypoints;
}

/**
 * Calculate haversine distance between two points in meters
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
