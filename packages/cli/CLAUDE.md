# @aa/cli Package

Command-line interface for Abandoned Archive.

## Architecture

CLI uses Commander.js with sub-command pattern. Each domain has its own command file.

```
src/
├── cli.ts              # Entry point, registers all commands
├── database.ts         # Database connection and schema
└── commands/
    ├── location.ts     # aa location [list|create|update|delete|stats]
    ├── media.ts        # aa media [list|show|assign|unassign|delete|stats]
    ├── import.ts       # aa import [dir|file|jobs]
    ├── export.ts       # aa export [locations|media|location|gpx|backup]
    ├── refmap.ts       # aa refmap [import|list|match|delete]
    ├── collection.ts   # aa collection [list|create|add|remove]
    ├── tag.ts          # aa tag [list|create|assign|unassign]
    └── db.ts           # aa db [init|info|migrate|vacuum|check|exec|reset]
```

## Database

Uses local SQLite via better-sqlite3. Schema defined in `database.ts`.

### Tables
- `locs` - Locations (main entity)
- `slocs` - Sub-locations
- `imgs`, `vids`, `docs` - Media tables (images, videos, documents)
- `media` - Unified view combining all media tables
- `collections`, `collection_items` - Collections
- `tags`, `tag_assignments` - Tags
- `refmaps`, `ref_waypoints` - Reference maps/GPX waypoints
- `import_jobs` - Import job tracking
- `config` - Key-value config storage

### Column Naming
- GPS: `gps_lat`, `gps_lng`, `gps_source`, `gps_accuracy`
- Address: `address_street`, `address_city`, `address_state`, `address_county`, `address_zipcode`
- Media counts: `imgct`, `vidct`, `docct`

## Adding a Command

1. Create command file in `src/commands/<domain>.ts`
2. Export a `registerXxxCommands(program: Command)` function
3. Register in `src/cli.ts`
4. Add tests

Example:
```typescript
import { Command } from 'commander';
import { getDatabase } from '../database';

export function registerFooCommands(program: Command): void {
  const foo = program
    .command('foo')
    .description('Manage foo');

  foo
    .command('list')
    .description('List all foos')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const db = await getDatabase(program.opts().database);
      // ... implementation
    });
}
```

## Global Options

All commands accept:
- `--database <path>` - Override database path
- `--json` - Output as JSON (where supported)

## Output Patterns

### Table Output
Use `cli-table3` for formatted tables:
```typescript
import Table from 'cli-table3';
const table = new Table({
  head: ['ID', 'Name', 'Status'].map(h => chalk.cyan(h)),
});
```

### Spinners
Use `ora` for long operations:
```typescript
import ora from 'ora';
const spinner = ora('Loading...').start();
// ... work
spinner.succeed('Done');
```

### Colors
Use `chalk` for output colors:
```typescript
import chalk from 'chalk';
console.log(chalk.green('Success'));
console.log(chalk.red('Error'));
console.log(chalk.yellow('Warning'));
console.log(chalk.gray('Info'));
```

## Error Handling

- Use `process.exit(1)` for errors
- Print error in red with chalk
- Show spinner.fail() if spinner is active

## Testing

Run tests:
```bash
pnpm test
```

## Building

```bash
pnpm build        # Compile TypeScript
pnpm link         # Link globally for 'aa' command
```

## Usage Examples

```bash
# Initialize database
aa db init

# Create location
aa location create "Old Mill" --state MA --type industrial

# Import photos
aa import dir /path/to/photos -l abc123 -r --skip-duplicates

# Export to GPX
aa export gpx -o locations.gpx --state MA

# Show statistics
aa location stats
aa media stats
aa db info
```

## Media Table Architecture

The CLI uses a unified `media` VIEW that combines:
- `imgs` - Images (hash: `imghash`, name: `imgnam`)
- `vids` - Videos (hash: `vidhash`, name: `vidnam`)
- `docs` - Documents (hash: `dochash`, name: `docnam`)

The view provides a consistent interface:
- `hash` - Media hash
- `filename` - Display filename
- `media_type` - 'image', 'video', or 'document'
- `locid` - Associated location

**Important**: SELECT works on the view, but INSERT/UPDATE/DELETE must target the underlying tables based on media type.
