/**
 * Tag commands
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { createHash, randomBytes } from 'crypto';
import { getDatabase } from '../database';

export function registerTagCommands(program: Command): void {
  const tag = program
    .command('tag')
    .description('Manage tags');

  // List tags
  tag
    .command('list')
    .description('List all tags')
    .option('--category <category>', 'Filter by category')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const spinner = ora('Loading tags...').start();

      try {
        const db = await getDatabase(program.opts().database);

        let query = 'SELECT * FROM tags';
        const params: unknown[] = [];

        if (options.category) {
          query += ' WHERE category = ?';
          params.push(options.category);
        }

        query += ' ORDER BY category, name';

        const stmt = db.prepare(query);
        const rows = stmt.all(...params) as Record<string, unknown>[];

        // Get usage counts
        const countStmt = db.prepare('SELECT COUNT(*) as count FROM tag_assignments WHERE tag_id = ?');

        spinner.stop();

        if (options.json || program.opts().json) {
          const withCounts = rows.map((r) => ({
            ...r,
            usageCount: (countStmt.get(r.tag_id) as { count: number }).count,
          }));
          console.log(JSON.stringify(withCounts, null, 2));
          return;
        }

        if (rows.length === 0) {
          console.log(chalk.yellow('No tags found'));
          return;
        }

        const table = new Table({
          head: ['ID', 'Name', 'Category', 'Color', 'Used'].map((h) => chalk.cyan(h)),
          style: { head: [], border: [] },
        });

        for (const row of rows) {
          const count = (countStmt.get(row.tag_id) as { count: number }).count;
          const colorSwatch = row.color ? chalk.hex(row.color as string)('■') : '';

          table.push([
            (row.tag_id as string).slice(0, 8) + '...',
            row.name as string,
            (row.category as string) || '-',
            colorSwatch,
            String(count),
          ] as unknown as string[]);
        }

        console.log(table.toString());
        console.log(chalk.gray(`\nShowing ${rows.length} tags`));
      } catch (error) {
        spinner.fail('Failed to load tags');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Create tag
  tag
    .command('create')
    .description('Create a new tag')
    .requiredOption('-n, --name <name>', 'Tag name')
    .option('-c, --category <category>', 'Category')
    .option('--color <color>', 'Color (hex, e.g. #ff0000)')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const spinner = ora('Creating tag...').start();

      try {
        const db = await getDatabase(program.opts().database);

        // Check for duplicate
        const existsStmt = db.prepare('SELECT tag_id FROM tags WHERE name = ?');
        if (existsStmt.get(options.name)) {
          spinner.fail(`Tag already exists: ${options.name}`);
          process.exit(1);
        }

        const id = createHash('sha256').update(randomBytes(32)).digest('hex').slice(0, 16);
        const now = new Date().toISOString();

        const stmt = db.prepare(`
          INSERT INTO tags (tag_id, name, category, color, created_at)
          VALUES (?, ?, ?, ?, ?)
        `);

        stmt.run(id, options.name, options.category || null, options.color || null, now);

        spinner.succeed('Tag created');

        if (options.json || program.opts().json) {
          console.log(JSON.stringify({ id, name: options.name, category: options.category, color: options.color }, null, 2));
        } else {
          console.log(`${chalk.green('ID:')} ${id}`);
          console.log(`${chalk.green('Name:')} ${options.name}`);
        }
      } catch (error) {
        spinner.fail('Failed to create tag');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Assign tag to item
  tag
    .command('assign <tagName> <itemType> <itemId>')
    .description('Assign tag to item (itemType: location or media)')
    .action(async (tagName, itemType, itemId) => {
      const spinner = ora('Assigning tag...').start();

      try {
        const db = await getDatabase(program.opts().database);

        // Find tag
        const tagStmt = db.prepare('SELECT tag_id FROM tags WHERE name = ? OR tag_id = ? OR tag_id LIKE ?');
        const tag = tagStmt.get(tagName, tagName, `${tagName}%`) as { tag_id: string } | undefined;

        if (!tag) {
          spinner.fail(`Tag not found: ${tagName}`);
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

        // Insert assignment
        const insertStmt = db.prepare(`
          INSERT OR IGNORE INTO tag_assignments (tag_id, item_type, item_id)
          VALUES (?, ?, ?)
        `);

        const result = insertStmt.run(tag.tag_id, itemType, itemId);

        if (result.changes === 0) {
          spinner.warn('Tag already assigned');
        } else {
          spinner.succeed('Tag assigned');
        }
      } catch (error) {
        spinner.fail('Failed to assign tag');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Unassign tag from item
  tag
    .command('unassign <tagName> <itemType> <itemId>')
    .description('Remove tag from item')
    .action(async (tagName, itemType, itemId) => {
      const spinner = ora('Removing tag...').start();

      try {
        const db = await getDatabase(program.opts().database);

        const tagStmt = db.prepare('SELECT tag_id FROM tags WHERE name = ? OR tag_id = ? OR tag_id LIKE ?');
        const tag = tagStmt.get(tagName, tagName, `${tagName}%`) as { tag_id: string } | undefined;

        if (!tag) {
          spinner.fail(`Tag not found: ${tagName}`);
          process.exit(1);
        }

        const deleteStmt = db.prepare(`
          DELETE FROM tag_assignments
          WHERE tag_id = ? AND item_type = ? AND (item_id = ? OR item_id LIKE ?)
        `);

        const result = deleteStmt.run(tag.tag_id, itemType, itemId, `${itemId}%`);

        if (result.changes === 0) {
          spinner.warn('Tag not assigned to item');
        } else {
          spinner.succeed('Tag removed');
        }
      } catch (error) {
        spinner.fail('Failed to remove tag');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Show items with tag
  tag
    .command('show <tagName>')
    .description('Show items with a tag')
    .option('--json', 'Output as JSON')
    .action(async (tagName, options) => {
      const spinner = ora('Loading tagged items...').start();

      try {
        const db = await getDatabase(program.opts().database);

        const tagStmt = db.prepare('SELECT * FROM tags WHERE name = ? OR tag_id = ? OR tag_id LIKE ?');
        const tag = tagStmt.get(tagName, tagName, `${tagName}%`) as Record<string, unknown> | undefined;

        if (!tag) {
          spinner.fail(`Tag not found: ${tagName}`);
          process.exit(1);
        }

        // Get assignments with item names
        const itemsStmt = db.prepare(`
          SELECT ta.*,
            CASE ta.item_type
              WHEN 'location' THEN (SELECT locnam FROM locs WHERE locid = ta.item_id)
              WHEN 'media' THEN (SELECT filename FROM media WHERE hash = ta.item_id)
            END as item_name
          FROM tag_assignments ta
          WHERE ta.tag_id = ?
        `);
        const items = itemsStmt.all(tag.tag_id) as Record<string, unknown>[];

        spinner.stop();

        if (options.json || program.opts().json) {
          console.log(JSON.stringify({ tag, items }, null, 2));
          return;
        }

        console.log(chalk.bold.cyan(`\nTag: ${tag.name}\n`));
        console.log(chalk.gray('─'.repeat(50)));
        console.log(`${chalk.bold('ID:')}       ${tag.tag_id}`);
        console.log(`${chalk.bold('Category:')} ${tag.category || '-'}`);
        console.log(`${chalk.bold('Items:')}    ${items.length}`);

        if (items.length > 0) {
          console.log(chalk.bold('\nAssigned to:'));

          const locations = items.filter((i) => i.item_type === 'location');
          const media = items.filter((i) => i.item_type === 'media');

          if (locations.length > 0) {
            console.log(chalk.gray('  Locations:'));
            for (const loc of locations.slice(0, 10)) {
              console.log(`    📍 ${loc.item_name || loc.item_id}`);
            }
            if (locations.length > 10) {
              console.log(chalk.gray(`    ... and ${locations.length - 10} more`));
            }
          }

          if (media.length > 0) {
            console.log(chalk.gray('  Media:'));
            for (const m of media.slice(0, 10)) {
              console.log(`    🖼️ ${m.item_name || m.item_id}`);
            }
            if (media.length > 10) {
              console.log(chalk.gray(`    ... and ${media.length - 10} more`));
            }
          }
        }
      } catch (error) {
        spinner.fail('Failed to load tag');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Delete tag
  tag
    .command('delete <tagName>')
    .description('Delete a tag')
    .option('-f, --force', 'Skip confirmation')
    .action(async (tagName, options) => {
      try {
        const db = await getDatabase(program.opts().database);

        const tagStmt = db.prepare('SELECT * FROM tags WHERE name = ? OR tag_id = ? OR tag_id LIKE ?');
        const tag = tagStmt.get(tagName, tagName, `${tagName}%`) as Record<string, unknown> | undefined;

        if (!tag) {
          console.log(chalk.red(`Tag not found: ${tagName}`));
          process.exit(1);
        }

        const countStmt = db.prepare('SELECT COUNT(*) as count FROM tag_assignments WHERE tag_id = ?');
        const count = (countStmt.get(tag.tag_id) as { count: number }).count;

        if (!options.force) {
          console.log(chalk.yellow(`About to delete tag: ${tag.name}`));
          console.log(chalk.yellow(`This tag is assigned to ${count} items`));
          console.log(chalk.yellow('Use --force to confirm'));
          process.exit(1);
        }

        const spinner = ora('Deleting tag...').start();

        db.prepare('DELETE FROM tag_assignments WHERE tag_id = ?').run(tag.tag_id);
        db.prepare('DELETE FROM tags WHERE tag_id = ?').run(tag.tag_id);

        spinner.succeed(`Deleted: ${tag.name}`);
      } catch (error) {
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // Rename tag
  tag
    .command('rename <oldName> <newName>')
    .description('Rename a tag')
    .action(async (oldName, newName) => {
      const spinner = ora('Renaming tag...').start();

      try {
        const db = await getDatabase(program.opts().database);

        const tagStmt = db.prepare('SELECT tag_id FROM tags WHERE name = ? OR tag_id = ? OR tag_id LIKE ?');
        const tag = tagStmt.get(oldName, oldName, `${oldName}%`) as { tag_id: string } | undefined;

        if (!tag) {
          spinner.fail(`Tag not found: ${oldName}`);
          process.exit(1);
        }

        // Check if new name exists
        const existsStmt = db.prepare('SELECT tag_id FROM tags WHERE name = ?');
        if (existsStmt.get(newName)) {
          spinner.fail(`Tag already exists: ${newName}`);
          process.exit(1);
        }

        const updateStmt = db.prepare('UPDATE tags SET name = ? WHERE tag_id = ?');
        updateStmt.run(newName, tag.tag_id);

        spinner.succeed(`Renamed to: ${newName}`);
      } catch (error) {
        spinner.fail('Failed to rename tag');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // List categories
  tag
    .command('categories')
    .description('List tag categories')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const spinner = ora('Loading categories...').start();

      try {
        const db = await getDatabase(program.opts().database);

        const stmt = db.prepare(`
          SELECT category, COUNT(*) as count
          FROM tags
          WHERE category IS NOT NULL
          GROUP BY category
          ORDER BY count DESC
        `);
        const rows = stmt.all() as Array<{ category: string; count: number }>;

        spinner.stop();

        if (options.json || program.opts().json) {
          console.log(JSON.stringify(rows, null, 2));
          return;
        }

        if (rows.length === 0) {
          console.log(chalk.yellow('No categories found'));
          return;
        }

        console.log(chalk.bold.cyan('\nTag Categories\n'));
        for (const row of rows) {
          console.log(`  ${row.category}: ${row.count} tags`);
        }
      } catch (error) {
        spinner.fail('Failed to load categories');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
}
