/**
 * Location commands
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { getDatabase } from '../database.js';
import { LocationService } from '@aa/services';

export function registerLocationCommands(program: Command): void {
  const location = program
    .command('location')
    .description('Manage abandoned locations');

  // List locations
  location
    .command('list')
    .description('List all locations')
    .option('--type <type>', 'Filter by type')
    .option('--status <status>', 'Filter by status')
    .option('--state <state>', 'Filter by state')
    .option('-s, --search <term>', 'Search by name')
    .option('-l, --limit <n>', 'Limit results', '50')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const spinner = ora('Loading locations...').start();

      try {
        const db = await getDatabase(program.opts().database);
        const service = new LocationService(db);

        const locations = await service.findAll({
          type: options.type,
          status: options.status,
          state: options.state,
          search: options.search,
          limit: parseInt(options.limit, 10),
        });

        spinner.stop();

        if (options.json || program.opts().json) {
          console.log(JSON.stringify(locations, null, 2));
          return;
        }

        if (locations.length === 0) {
          console.log(chalk.yellow('No locations found'));
          return;
        }

        const table = new Table({
          head: ['ID', 'Name', 'Type', 'Status', 'State', 'Images'].map((h) =>
            chalk.cyan(h),
          ),
          style: { head: [], border: [] },
        });

        for (const loc of locations) {
          table.push([
            loc.id.slice(0, 8) + '...',
            loc.name.slice(0, 40) + (loc.name.length > 40 ? '...' : ''),
            loc.type || '-',
            loc.status,
            loc.state || '-',
            loc.imageCount.toString(),
          ]);
        }

        console.log(table.toString());
        console.log(chalk.gray(`\nShowing ${locations.length} locations`));
      } catch (error) {
        spinner.fail('Failed to load locations');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Show location details
  location
    .command('show <id>')
    .description('Show location details')
    .option('--json', 'Output as JSON')
    .action(async (id, options) => {
      const spinner = ora('Loading location...').start();

      try {
        const db = await getDatabase(program.opts().database);
        const service = new LocationService(db);

        const loc = await service.findById(id);

        spinner.stop();

        if (!loc) {
          console.log(chalk.red(`Location not found: ${id}`));
          process.exit(1);
        }

        if (options.json || program.opts().json) {
          console.log(JSON.stringify(loc, null, 2));
          return;
        }

        console.log(chalk.bold.cyan(`\n${loc.name}\n`));
        console.log(chalk.gray('─'.repeat(50)));
        console.log(`${chalk.bold('ID:')}          ${loc.id}`);
        console.log(`${chalk.bold('Type:')}        ${loc.type || '-'}`);
        console.log(`${chalk.bold('Status:')}      ${loc.status}`);

        if (loc.latitude && loc.longitude) {
          console.log(`${chalk.bold('GPS:')}         ${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}`);
        }

        if (loc.address) {
          console.log(`${chalk.bold('Address:')}     ${loc.address}`);
        }

        if (loc.city || loc.state) {
          console.log(`${chalk.bold('Location:')}    ${[loc.city, loc.state].filter(Boolean).join(', ')}`);
        }

        if (loc.description) {
          console.log(`\n${chalk.bold('Description:')}`);
          console.log(loc.description);
        }

        console.log(`\n${chalk.bold('Media:')}`);
        console.log(`  Images:     ${loc.imageCount}`);
        console.log(`  Videos:     ${loc.videoCount}`);
        console.log(`  Documents:  ${loc.documentCount}`);

        console.log(`\n${chalk.bold('Dates:')}`);
        console.log(`  Created:    ${loc.createdAt.toLocaleString()}`);
        console.log(`  Updated:    ${loc.updatedAt.toLocaleString()}`);

        if (loc.builtYear) console.log(`  Built:      ${loc.builtYear}`);
        if (loc.abandonedYear) console.log(`  Abandoned:  ${loc.abandonedYear}`);
      } catch (error) {
        spinner.fail('Failed to load location');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Create location
  location
    .command('create')
    .description('Create a new location')
    .requiredOption('-n, --name <name>', 'Location name')
    .option('--type <type>', 'Location type')
    .option('--status <status>', 'Location status')
    .option('--lat <lat>', 'Latitude')
    .option('--lon <lon>', 'Longitude')
    .option('--address <address>', 'Street address')
    .option('--city <city>', 'City')
    .option('--state <state>', 'State')
    .option('--description <desc>', 'Description')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const spinner = ora('Creating location...').start();

      try {
        const db = await getDatabase(program.opts().database);
        const service = new LocationService(db);

        const loc = await service.create({
          name: options.name,
          type: options.type,
          status: options.status,
          latitude: options.lat ? parseFloat(options.lat) : undefined,
          longitude: options.lon ? parseFloat(options.lon) : undefined,
          address: options.address,
          city: options.city,
          state: options.state,
          description: options.description,
        });

        spinner.succeed('Location created');

        if (options.json || program.opts().json) {
          console.log(JSON.stringify(loc, null, 2));
        } else {
          console.log(`${chalk.green('Created:')} ${loc.name} (${loc.id})`);
        }
      } catch (error) {
        spinner.fail('Failed to create location');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Update location
  location
    .command('update <id>')
    .description('Update a location')
    .option('-n, --name <name>', 'Location name')
    .option('--type <type>', 'Location type')
    .option('--status <status>', 'Location status')
    .option('--lat <lat>', 'Latitude')
    .option('--lon <lon>', 'Longitude')
    .option('--address <address>', 'Street address')
    .option('--city <city>', 'City')
    .option('--state <state>', 'State')
    .option('--description <desc>', 'Description')
    .option('--json', 'Output as JSON')
    .action(async (id, options) => {
      const spinner = ora('Updating location...').start();

      try {
        const db = await getDatabase(program.opts().database);
        const service = new LocationService(db);

        const updates: Record<string, unknown> = {};
        if (options.name) updates.name = options.name;
        if (options.type) updates.type = options.type;
        if (options.status) updates.status = options.status;
        if (options.lat) updates.latitude = parseFloat(options.lat);
        if (options.lon) updates.longitude = parseFloat(options.lon);
        if (options.address) updates.address = options.address;
        if (options.city) updates.city = options.city;
        if (options.state) updates.state = options.state;
        if (options.description) updates.description = options.description;

        const loc = await service.update(id, updates);

        spinner.succeed('Location updated');

        if (options.json || program.opts().json) {
          console.log(JSON.stringify(loc, null, 2));
        } else {
          console.log(`${chalk.green('Updated:')} ${loc.name}`);
        }
      } catch (error) {
        spinner.fail('Failed to update location');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Delete location
  location
    .command('delete <id>')
    .description('Delete a location')
    .option('-f, --force', 'Skip confirmation')
    .action(async (id, options) => {
      try {
        const db = await getDatabase(program.opts().database);
        const service = new LocationService(db);

        const loc = await service.findById(id);
        if (!loc) {
          console.log(chalk.red(`Location not found: ${id}`));
          process.exit(1);
        }

        if (!options.force) {
          console.log(chalk.yellow(`About to delete: ${loc.name}`));
          console.log(chalk.yellow('Use --force to confirm'));
          process.exit(1);
        }

        const spinner = ora('Deleting location...').start();
        await service.delete(id);
        spinner.succeed(`Deleted: ${loc.name}`);
      } catch (error) {
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Find duplicates
  location
    .command('duplicates')
    .description('Find potential duplicate locations')
    .option('-t, --threshold <n>', 'Confidence threshold (0-1)', '0.8')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const spinner = ora('Finding duplicates...').start();

      try {
        const db = await getDatabase(program.opts().database);
        const service = new LocationService(db);

        const duplicates = await service.findDuplicates(
          parseFloat(options.threshold),
        );

        spinner.stop();

        if (options.json || program.opts().json) {
          console.log(JSON.stringify(duplicates, null, 2));
          return;
        }

        if (duplicates.length === 0) {
          console.log(chalk.green('No duplicates found'));
          return;
        }

        console.log(chalk.yellow(`\nFound ${duplicates.length} potential duplicates:\n`));

        for (const dup of duplicates) {
          console.log(chalk.bold(`${dup.location1.name} ↔ ${dup.location2.name}`));
          console.log(`  Confidence: ${(dup.confidence * 100).toFixed(0)}%`);
          console.log(`  Reasons: ${dup.reasons.join(', ')}`);
          console.log();
        }
      } catch (error) {
        spinner.fail('Failed to find duplicates');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Stats
  location
    .command('stats')
    .description('Show location statistics')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const spinner = ora('Loading statistics...').start();

      try {
        const db = await getDatabase(program.opts().database);
        const service = new LocationService(db);

        const stats = await service.getStats();

        spinner.stop();

        if (options.json || program.opts().json) {
          console.log(JSON.stringify(stats, null, 2));
          return;
        }

        console.log(chalk.bold.cyan('\nLocation Statistics\n'));
        console.log(chalk.gray('─'.repeat(40)));
        console.log(`Total locations:  ${stats.totalLocations}`);
        console.log(`With GPS:         ${stats.withGps}`);
        console.log(`With hero image:  ${stats.withHeroImage}`);
        console.log(`Total images:     ${stats.totalImages}`);
        console.log(`Total videos:     ${stats.totalVideos}`);
        console.log(`Total documents:  ${stats.totalDocuments}`);

        if (Object.keys(stats.byStatus).length > 0) {
          console.log(chalk.bold('\nBy Status:'));
          for (const [status, count] of Object.entries(stats.byStatus)) {
            console.log(`  ${status}: ${count}`);
          }
        }

        if (Object.keys(stats.byState).length > 0) {
          console.log(chalk.bold('\nTop States:'));
          const states = Object.entries(stats.byState).slice(0, 10);
          for (const [state, count] of states) {
            console.log(`  ${state}: ${count}`);
          }
        }
      } catch (error) {
        spinner.fail('Failed to load statistics');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
}
