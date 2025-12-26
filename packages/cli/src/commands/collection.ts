/**
 * Collection commands
 *
 * Manage collections of locations and media
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { createHash, randomBytes } from 'crypto';
import { getDatabase } from '../database.js';

export function registerCollectionCommands(program: Command): void {
  const collection = program
    .command('collection')
    .description('Manage collections');

  // List collections
  collection
    .command('list')
    .description('List all collections')
    .option('--type <type>', 'Filter by type (manual, smart, trip)')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const spinner = ora('Loading collections...').start();

      try {
        const db = await getDatabase(program.opts().database);

        let query = 'SELECT * FROM collections';
        const params: unknown[] = [];

        if (options.type) {
          query += ' WHERE collection_type = ?';
          params.push(options.type);
        }

        query += ' ORDER BY name';

        const stmt = db.prepare(query);
        const rows = stmt.all(...params) as Record<string, unknown>[];

        // Get item counts for each collection
        const countStmt = db.prepare('SELECT COUNT(*) as count FROM collection_items WHERE collection_id = ?');

        spinner.stop();

        if (options.json || program.opts().json) {
          const withCounts = rows.map((r) => ({
            ...r,
            itemCount: (countStmt.get(r.collection_id) as { count: number }).count,
          }));
          console.log(JSON.stringify(withCounts, null, 2));
          return;
        }

        if (rows.length === 0) {
          console.log(chalk.yellow('No collections found'));
          return;
        }

        const table = new Table({
          head: ['ID', 'Name', 'Type', 'Items', 'Created'].map((h) => chalk.cyan(h)),
          style: { head: [], border: [] },
        });

        for (const row of rows) {
          const itemCount = (countStmt.get(row.collection_id) as { count: number }).count;
          table.push([
            (row.collection_id as string).slice(0, 8) + '...',
            (row.name as string).slice(0, 30),
            (row.collection_type as string) || 'manual',
            String(itemCount),
            new Date(row.created_at as string).toLocaleDateString(),
          ] as unknown as string[]);
        }

        console.log(table.toString());
        console.log(chalk.gray(`\nShowing ${rows.length} collections`));
      } catch (error) {
        spinner.fail('Failed to load collections');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Create collection
  collection
    .command('create')
    .description('Create a new collection')
    .requiredOption('-n, --name <name>', 'Collection name')
    .option('-d, --description <desc>', 'Description')
    .option('-t, --type <type>', 'Collection type (manual, smart, trip)', 'manual')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const spinner = ora('Creating collection...').start();

      try {
        const db = await getDatabase(program.opts().database);

        const id = createHash('sha256').update(randomBytes(32)).digest('hex').slice(0, 16);
        const now = new Date().toISOString();

        const stmt = db.prepare(`
          INSERT INTO collections (collection_id, name, description, collection_type, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        stmt.run(id, options.name, options.description || null, options.type, now, now);

        spinner.succeed('Collection created');

        if (options.json || program.opts().json) {
          console.log(JSON.stringify({ id, name: options.name, type: options.type }, null, 2));
        } else {
          console.log(`${chalk.green('ID:')} ${id}`);
          console.log(`${chalk.green('Name:')} ${options.name}`);
        }
      } catch (error) {
        spinner.fail('Failed to create collection');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Show collection
  collection
    .command('show <id>')
    .description('Show collection details')
    .option('--json', 'Output as JSON')
    .action(async (id, options) => {
      const spinner = ora('Loading collection...').start();

      try {
        const db = await getDatabase(program.opts().database);

        const collStmt = db.prepare('SELECT * FROM collections WHERE collection_id = ? OR collection_id LIKE ?');
        const coll = collStmt.get(id, `${id}%`) as Record<string, unknown> | undefined;

        if (!coll) {
          spinner.fail(`Collection not found: ${id}`);
          process.exit(1);
        }

        // Get items
        const itemsStmt = db.prepare(`
          SELECT ci.*,
            CASE ci.item_type
              WHEN 'location' THEN (SELECT locnam FROM locs WHERE locid = ci.item_id)
              WHEN 'media' THEN (SELECT filename FROM media WHERE hash = ci.item_id)
            END as item_name
          FROM collection_items ci
          WHERE ci.collection_id = ?
          ORDER BY ci.sort_order
        `);
        const items = itemsStmt.all(coll.collection_id) as Record<string, unknown>[];

        spinner.stop();

        if (options.json || program.opts().json) {
          console.log(JSON.stringify({ ...coll, items }, null, 2));
          return;
        }

        console.log(chalk.bold.cyan(`\n${coll.name}\n`));
        console.log(chalk.gray('─'.repeat(50)));
        console.log(`${chalk.bold('ID:')}          ${coll.collection_id}`);
        console.log(`${chalk.bold('Type:')}        ${coll.collection_type || 'manual'}`);
        if (coll.description) {
          console.log(`${chalk.bold('Description:')} ${coll.description}`);
        }
        console.log(`${chalk.bold('Items:')}       ${items.length}`);

        if (items.length > 0) {
          console.log(chalk.bold('\nItems:'));
          for (const item of items.slice(0, 20)) {
            const icon = item.item_type === 'location' ? '📍' : '🖼️';
            console.log(`  ${icon} ${item.item_name || item.item_id}`);
          }
          if (items.length > 20) {
            console.log(chalk.gray(`  ... and ${items.length - 20} more items`));
          }
        }
      } catch (error) {
        spinner.fail('Failed to load collection');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Add item to collection
  collection
    .command('add <collectionId> <itemType> <itemId>')
    .description('Add item to collection (itemType: location or media)')
    .action(async (collectionId, itemType, itemId) => {
      const spinner = ora('Adding item...').start();

      try {
        const db = await getDatabase(program.opts().database);

        // Validate collection
        const collStmt = db.prepare('SELECT collection_id FROM collections WHERE collection_id = ? OR collection_id LIKE ?');
        const coll = collStmt.get(collectionId, `${collectionId}%`) as { collection_id: string } | undefined;

        if (!coll) {
          spinner.fail(`Collection not found: ${collectionId}`);
          process.exit(1);
        }

        // Validate item
        if (itemType === 'location') {
          const locStmt = db.prepare('SELECT locid FROM locs WHERE locid = ? OR locid LIKE ?');
          const loc = locStmt.get(itemId, `${itemId}%`) as { locid: string } | undefined;
          if (!loc) {
            spinner.fail(`Location not found: ${itemId}`);
            process.exit(1);
          }
          itemId = loc.locid;
        } else if (itemType === 'media') {
          const mediaStmt = db.prepare('SELECT hash FROM media WHERE hash = ? OR hash LIKE ?');
          const media = mediaStmt.get(itemId, `${itemId}%`) as { hash: string } | undefined;
          if (!media) {
            spinner.fail(`Media not found: ${itemId}`);
            process.exit(1);
          }
          itemId = media.hash;
        } else {
          spinner.fail(`Invalid item type: ${itemType}. Use 'location' or 'media'`);
          process.exit(1);
        }

        // Get next sort order
        const orderStmt = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM collection_items WHERE collection_id = ?');
        const nextOrder = (orderStmt.get(coll.collection_id) as { next: number }).next;

        // Insert
        const insertStmt = db.prepare(`
          INSERT OR IGNORE INTO collection_items (collection_id, item_type, item_id, sort_order, added_at)
          VALUES (?, ?, ?, ?, ?)
        `);

        const result = insertStmt.run(coll.collection_id, itemType, itemId, nextOrder, new Date().toISOString());

        if (result.changes === 0) {
          spinner.warn('Item already in collection');
        } else {
          spinner.succeed('Item added to collection');
        }
      } catch (error) {
        spinner.fail('Failed to add item');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Remove item from collection
  collection
    .command('remove <collectionId> <itemType> <itemId>')
    .description('Remove item from collection')
    .action(async (collectionId, itemType, itemId) => {
      const spinner = ora('Removing item...').start();

      try {
        const db = await getDatabase(program.opts().database);

        const collStmt = db.prepare('SELECT collection_id FROM collections WHERE collection_id = ? OR collection_id LIKE ?');
        const coll = collStmt.get(collectionId, `${collectionId}%`) as { collection_id: string } | undefined;

        if (!coll) {
          spinner.fail(`Collection not found: ${collectionId}`);
          process.exit(1);
        }

        const deleteStmt = db.prepare(`
          DELETE FROM collection_items
          WHERE collection_id = ? AND item_type = ? AND (item_id = ? OR item_id LIKE ?)
        `);

        const result = deleteStmt.run(coll.collection_id, itemType, itemId, `${itemId}%`);

        if (result.changes === 0) {
          spinner.warn('Item not found in collection');
        } else {
          spinner.succeed('Item removed from collection');
        }
      } catch (error) {
        spinner.fail('Failed to remove item');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Delete collection
  collection
    .command('delete <id>')
    .description('Delete a collection')
    .option('-f, --force', 'Skip confirmation')
    .action(async (id, options) => {
      try {
        const db = await getDatabase(program.opts().database);

        const stmt = db.prepare('SELECT * FROM collections WHERE collection_id = ? OR collection_id LIKE ?');
        const coll = stmt.get(id, `${id}%`) as Record<string, unknown> | undefined;

        if (!coll) {
          console.log(chalk.red(`Collection not found: ${id}`));
          process.exit(1);
        }

        const countStmt = db.prepare('SELECT COUNT(*) as count FROM collection_items WHERE collection_id = ?');
        const count = (countStmt.get(coll.collection_id) as { count: number }).count;

        if (!options.force) {
          console.log(chalk.yellow(`About to delete: ${coll.name}`));
          console.log(chalk.yellow(`This collection has ${count} items`));
          console.log(chalk.yellow('Use --force to confirm'));
          process.exit(1);
        }

        const spinner = ora('Deleting collection...').start();

        db.prepare('DELETE FROM collection_items WHERE collection_id = ?').run(coll.collection_id);
        db.prepare('DELETE FROM collections WHERE collection_id = ?').run(coll.collection_id);

        spinner.succeed(`Deleted: ${coll.name}`);
      } catch (error) {
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
}
