# Abandoned Archive

CLI-first application for archiving and documenting abandoned locations with media management, GPS-based organization, and interactive mapping.

> **Architecture**: CLI-first design - all functionality accessible via command line before GUI. The desktop app is a thin wrapper over CLI services.

> **History**: This project evolved from [AUPAT](https://github.com/bizzlechizzle/aupat) (Abandoned Upstate Photo & Archive Tracker), a Flask + Electron prototype. Abandoned Archive is a complete rewrite using a modern TypeScript monorepo architecture.

## CLI Quick Start

```bash
# Install CLI globally
pnpm install -g @aa/cli

# Initialize database
aa db init

# Create a location
aa location create --name "Old Mill" --state "NY" --lat 42.8864 --lon -78.8784

# Import media
aa import dir ./photos --location abc123 --recursive

# List locations
aa location list --state NY

# Export to GPX for field use
aa export gpx --state NY -o ny-locations.gpx
```

## CLI Commands

### Location Management
```bash
aa location list [--state X] [--type X] [--search X]  # List locations
aa location show <id>                                  # Show details
aa location create --name "X" [--lat X --lon X]       # Create location
aa location update <id> --name "X"                    # Update location
aa location delete <id> --force                       # Delete location
aa location duplicates [--threshold 0.8]              # Find duplicates
aa location stats                                      # Show statistics
```

### Media Management
```bash
aa media list [--location X] [--type image|video]     # List media
aa media show <hash>                                   # Show details
aa media assign <hash> <locationId>                   # Assign to location
aa media unassign <hash>                              # Remove from location
aa media delete <hash> --force [--delete-files]       # Delete (with files)
aa media stats                                         # Show statistics
```

### Import/Export
```bash
aa import dir <path> [--location X] [--recursive]     # Import directory
aa import file <path> [--location X]                  # Import single file
aa import jobs                                         # List import jobs

aa export locations [-f json|csv|geojson]             # Export locations
aa export media [-f json|csv]                         # Export media metadata
aa export location <id> [--copy-files]                # Export with files
aa export gpx [--state X]                             # Export to GPX
aa export backup                                       # Database backup
```

### Reference Maps (GPS Waypoints)
```bash
aa refmap list                                         # List reference maps
aa refmap import <file.gpx>                           # Import GPX/KML
aa refmap show <id>                                   # Show waypoints
aa refmap match <id> [--distance 100]                 # Match to locations
aa refmap unmatched                                   # List unmatched waypoints
aa refmap delete <id> --force                         # Delete refmap
```

### Collections & Tags
```bash
aa collection list                                     # List collections
aa collection create --name "Trip 2024"               # Create collection
aa collection add <id> location <locId>               # Add item
aa collection remove <id> location <locId>            # Remove item

aa tag list                                            # List all tags
aa tag create --name "industrial" --category "type"   # Create tag
aa tag assign industrial location <locId>             # Assign tag
aa tag show industrial                                # Show tagged items
```

### Database & Config
```bash
aa db init                                             # Initialize database
aa db info                                             # Show database info
aa db migrate                                          # Run migrations
aa db vacuum                                           # Optimize size
aa db optimize [--profile balanced|performance|safety] # Optimize for 100K+ files
aa db check                                            # Integrity check
aa db exec "SELECT * FROM locs LIMIT 5"               # Run SQL query
aa db reset --force                                    # Reset all data

aa config show                                         # Show configuration
aa config set <key> <value>                           # Set config value
aa config keys                                         # List config keys
```

### Pipeline Orchestration
```bash
aa pipeline run <tool> [args...]                        # Run any pipeline tool
aa pipeline import <source> <dest> [--sidecar] [--dedup] # Import via wake-n-blake
aa pipeline thumb <path> [-r] [--preset quality]        # Thumbnails via shoemaker
aa pipeline tag <path> [-r] [--size small]              # ML tagging via visual-buffet
aa pipeline capture <url> [-f screenshot,pdf]           # Web capture via national-treasure
aa pipeline status                                       # Show active pipeline jobs
```

### Global Options
```bash
aa --help                    # Show help
aa --version                 # Show version
aa -d /path/to/db.sqlite     # Use specific database
aa --json                    # JSON output
aa -v                        # Verbose output
aa -q                        # Quiet mode
```

## Development Quick Start

### Prerequisites

- **Node.js** 20+ LTS (22+ recommended)
- **pnpm** 8+ (10+ recommended)

### Installation

```bash
# Clone the repository
git clone https://github.com/bizzlechizzle/abandoned-archive.git
cd abandoned-archive

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start the development server (desktop app)
pnpm dev
```

### Common Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start desktop development server with hot reload |
| `pnpm build` | Build all packages for production |
| `pnpm build:cli` | Build CLI package |
| `pnpm build:services` | Build services package |
| `pnpm build:core` | Build core package |
| `pnpm test` | Run tests |
| `pnpm lint` | Lint code |
| `pnpm format` | Format code with Prettier |
| `pnpm clean` | Remove all node_modules and dist folders |
| `pnpm reinstall` | Clean and reinstall everything |

## Troubleshooting

### "Electron failed to install correctly"

pnpm v10+ blocks native build scripts by default. Clean reinstall:

```bash
pnpm reinstall
```

### "Failed to resolve entry for package @abandoned-archive/core"

The core package needs to be built (postinstall may have failed):

```bash
pnpm build:core
```

### "vite: command not found"

Dependencies not installed:

```bash
pnpm install
```

## Project Structure

```
abandoned-archive/
├── packages/
│   ├── cli/            # CLI application (@aa/cli)
│   ├── services/       # Shared services (@aa/services)
│   ├── core/           # Domain models (@aa/core)
│   ├── desktop/        # Electron + Svelte GUI
│   ├── mapcombine/     # GPS waypoint deduplication
│   ├── wake-n-blake/   # BLAKE3 hashing + metadata extraction
│   └── shoemaker/      # Photo post-processing pipeline
├── sme/                # Subject Matter Expert documents
├── resources/          # Icons and bundled binaries
├── CLAUDE.md           # Development standards
├── DEVELOPER.md        # Developer guide
└── techguide.md        # Implementation guide
```

### Package Hierarchy

```
@aa/cli (CLI commands)
   └── @aa/services (Business logic)
        └── @aa/core (Domain models)

desktop (GUI)
   └── @aa/services (Same services as CLI)
```

## Map Deduplication CLI

Deduplicate GPS waypoints from KML, GPX, GeoJSON, and CSV files with fuzzy name matching:

```bash
cd packages/mapcombine
pnpm dev dedup "/path/to/maps/*.kml" --dry-run -v
```

This command:
- Parses all KML files in the directory
- Detects duplicates using GPS proximity + fuzzy name matching
- Shows preview of what would be merged (`--dry-run`)
- Outputs verbose stats (`-v`)

Remove `--dry-run` to output deduplicated GeoJSON. See `packages/mapcombine/CLAUDE.md` for full CLI reference.

## Technology Stack

**CLI & Services**
- **CLI Framework**: Commander.js
- **Validation**: Zod
- **Database**: SQLite (better-sqlite3)
- **Hashing**: BLAKE3 (wake-n-blake)
- **Metadata**: exiftool-vendored, fluent-ffmpeg

**Desktop Application**
- **Framework**: Electron 35+
- **Frontend**: Svelte 5 + TypeScript
- **Build Tool**: Vite 5+
- **Mapping**: Leaflet.js

**Development**
- **Package Manager**: pnpm (monorepo)
- **Testing**: Vitest
- **Linting**: ESLint + Prettier

## Documentation

- [Developer Guide](DEVELOPER.md) - Complete development setup and guidelines
- [Technical Specification](techguide.md) - Implementation details and API docs
- [CLI Overhaul Plan](sme/CLI-FIRST-OVERHAUL-PLAN.md) - Architecture design
- [Implementation Checklist](sme/CLI-FIRST-IMPLEMENTATION-CHECKLIST.md) - Task tracking

## License

Private - All rights reserved
