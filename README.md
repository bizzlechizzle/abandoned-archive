# Abandoned Archive

A comprehensive media management and archival system for documenting abandoned locations. Features local-first architecture with optional cloud sync through the Dispatch hub.

## Quick Start

```bash
# Install dependencies
pnpm install

# Development (desktop app)
pnpm --filter @abandoned-archive/desktop dev

# CLI usage
pnpm --filter @abandoned-archive/cli build
pnpm aa --help
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Abandoned Archive                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────────┐  │
│  │   Desktop   │   │     CLI     │   │    Dispatch Hub     │  │
│  │  (Electron) │   │  (Node.js)  │   │   (PostgreSQL)      │  │
│  └──────┬──────┘   └──────┬──────┘   └──────────┬──────────┘  │
│         │                 │                      │              │
│         └────────┬────────┴──────────────────────┘              │
│                  │                                              │
│         ┌────────▼────────┐                                     │
│         │  @aa/services   │   API Repositories                  │
│         │  DispatchClient │   (14 repositories)                 │
│         └─────────────────┘                                     │
└─────────────────────────────────────────────────────────────────┘
```

## Packages

| Package | Description |
|---------|-------------|
| `@abandoned-archive/desktop` | Electron desktop app with Svelte 5 UI |
| `@abandoned-archive/cli` | Command-line interface (`aa` command) |
| `@aa/core` | Shared domain types and utilities |
| `@aa/services` | Dispatch client and service integrations |
| `wake-n-blake` | BLAKE3 hashing library |
| `shoemaker` | Media processing utilities |
| `mapcombine` | Map point deduplication and export |

## CLI Commands

The `aa` command provides a comprehensive CLI interface:

### Global Options

```bash
aa --version          # Show version
aa --help             # Show help
aa -c <path>          # Use config file
aa -d <path>          # Use database file
aa -v, --verbose      # Verbose output
aa -q, --quiet        # Quiet mode
aa --json             # JSON output
```

### Location Management

```bash
aa location list [--state <ST>] [--category <cat>]    # List locations
aa location show <locid>                               # Show location details
aa location create                                     # Interactive create
aa location update <locid>                             # Update location
aa location delete <locid>                             # Delete location
aa location search <query>                             # Search locations
```

### Media Management

```bash
aa media list [--locid <id>]                          # List media
aa media show <hash>                                  # Show media details
aa media info <path>                                  # Show file metadata
aa media delete <hash>                                # Delete media
aa media orphans                                      # Find orphaned files
aa media verify                                       # Verify file integrity
```

### Import Operations

```bash
aa import folder <path> [--locid <id>]               # Import from folder
aa import file <path> [--locid <id>]                 # Import single file
aa import watch <path>                               # Watch folder for imports
aa import status                                     # Show import status
```

### Export Operations

```bash
aa export location <locid> [--output <path>]         # Export location
aa export all [--output <path>]                      # Export all data
aa export media <locid> [--output <path>]            # Export media files
```

### Reference Maps

```bash
aa refmap list                                       # List reference maps
aa refmap create <name> <file>                       # Create from KML/GPX
aa refmap match <mapid>                              # Match points to locations
aa refmap export <mapid> [--format gpx|kml]          # Export map
```

### Tagging (ML)

```bash
aa tag image <path>                                  # Tag single image
aa tag batch <path>                                  # Batch tag folder
aa tag status                                        # Show tagging status
```

### Collection Management

```bash
aa collection list                                   # List collections
aa collection create <name>                          # Create collection
aa collection add <name> <locid>                     # Add location
aa collection export <name>                          # Export collection
```

### Database Operations

```bash
aa db migrate                                        # Run migrations
aa db status                                         # Show database status
aa db backup [--output <path>]                       # Backup database
aa db restore <path>                                 # Restore from backup
```

### Configuration

```bash
aa config show                                       # Show configuration
aa config set <key> <value>                          # Set config value
aa config get <key>                                  # Get config value
aa config path                                       # Show config file path
```

### Pipeline Operations

```bash
aa pipeline run <name>                               # Run named pipeline
aa pipeline status                                   # Show pipeline status
aa pipeline list                                     # List available pipelines
```

### Dispatch Hub Integration

```bash
aa dispatch status                                   # Show hub status
aa dispatch login                                    # Login to hub
aa dispatch logout                                   # Logout from hub
aa dispatch jobs [--status <status>]                 # List jobs
aa dispatch job <id>                                 # Show job details
aa dispatch workers                                  # List workers
aa dispatch sync                                     # Sync with hub
```

## API Repositories

The desktop app uses 14 API repositories for data access:

### Core Repositories
- `ApiLocationRepository` - Location CRUD operations
- `ApiSublocationRepository` - Sublocation management
- `ApiMediaRepository` - Media files (images, videos, documents)
- `ApiMapRepository` - Reference map operations

### Content Repositories
- `ApiNotesRepository` - Location notes
- `ApiUsersRepository` - User management
- `ApiImportRepository` - Import job tracking
- `ApiProjectsRepository` - Project collections

### Archive Repositories
- `ApiTimelineRepository` - Chronological media view
- `ApiWebSourcesRepository` - Web source archiving

### Metadata Repositories
- `ApiLocationViewsRepository` - View tracking
- `ApiLocationAuthorsRepository` - Author contributions
- `ApiLocationExclusionsRepository` - Hidden locations
- `ApiDateExtractionRepository` - Date metadata

## Environment Variables

```bash
# Required
ARCHIVE_PATH=/path/to/archive          # Media archive location

# Dispatch Hub (optional)
DISPATCH_HUB_URL=http://hub:3000       # Hub URL
DISPATCH_API_KEY=your-key              # API key

# ML Tagging (optional)
VB_PYTHON_PATH=/path/to/python         # Python for visual-buffet
OLLAMA_HOST=http://localhost:11434     # Ollama for LLM features
```

## Development

```bash
# Install all dependencies
pnpm install

# Run desktop in development
pnpm --filter @abandoned-archive/desktop dev

# Build all packages
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint
```

## Database

The system uses SQLite locally with optional sync to PostgreSQL via Dispatch:

- **Local**: SQLite at `~/Library/Application Support/@abandoned-archive/desktop/au-archive.db`
- **Hub**: PostgreSQL via Dispatch API
- **Sync**: Automatic via API repositories when connected

## ML Features

Integrated machine learning for image analysis:

- **RAM++** - 4,585 object-level tags
- **Florence-2** - Natural language captions
- **SigLIP** - Quality and view scoring
- **PaddleOCR** - Text extraction

See `/sme/ml-tagging-system.md` for documentation.

## License

MIT
