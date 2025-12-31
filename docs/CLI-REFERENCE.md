# Abandoned Archive CLI Reference

Complete command reference for the `aa` CLI tool.

## Installation

```bash
# From the project root
npm run build:cli
```

## Global Options

| Option | Description |
|--------|-------------|
| `-V, --version` | Output version number |
| `-c, --config <path>` | Path to config file |
| `-d, --database <path>` | Path to database file |
| `-v, --verbose` | Enable verbose output |
| `-q, --quiet` | Suppress non-essential output |
| `--json` | Output as JSON |
| `-h, --help` | Display help |

## Commands

### location - Manage Locations

```bash
aa location list [options]         # List all locations
aa location show <id>              # Show location details
aa location create [options]       # Create a new location
aa location update <id> [options]  # Update a location
aa location delete <id>            # Delete a location
aa location duplicates [options]   # Find potential duplicates
aa location stats                  # Show location statistics
```

**Examples:**
```bash
aa location list --search "factory"
aa location show abc123def456
aa location create --name "Old Mill" --lat 42.5 --lon -76.8
aa location update abc123 --status explored
aa location delete abc123 --force
```

### media - Manage Media Files

```bash
aa media list [options]            # List media files
aa media show <hash>               # Show media details
aa media assign <hash> <locid>     # Assign media to location
aa media unassign <hash>           # Remove media from location
aa media delete <hash>             # Delete media
aa media stats                     # Show media statistics
```

**Examples:**
```bash
aa media list --location abc123
aa media show 1234567890abcdef
aa media assign 1234567890abcdef abc123
```

### import - Import Media

```bash
aa import dir <path> [options]     # Import from directory
aa import file <path> [options]    # Import single file
aa import jobs                     # List import jobs
```

**Examples:**
```bash
aa import dir /path/to/photos --location abc123
aa import file /path/to/photo.jpg --detect-duplicates
```

### export - Export Data

```bash
aa export locations [options]      # Export locations (JSON/CSV/GeoJSON)
aa export media [options]          # Export media metadata
aa export location <id> [options]  # Export specific location
aa export gpx [options]            # Export to GPX format
aa export backup [options]         # Create database backup
```

**Examples:**
```bash
aa export locations --format geojson --output locations.geojson
aa export gpx --output archive.gpx
aa export backup --output backup-$(date +%Y%m%d).db
```

### refmap - Reference Maps

```bash
aa refmap list                     # List reference maps
aa refmap import <file>            # Import GPX/KML
aa refmap show <id>                # Show refmap details
aa refmap match <id>               # Match waypoints to locations
aa refmap delete <id>              # Delete refmap
aa refmap unmatched                # List unmatched waypoints
```

**Examples:**
```bash
aa refmap import roadtrip.gpx --name "2024 Road Trip"
aa refmap match abc123 --threshold 0.8
```

### collection - Manage Collections

```bash
aa collection list                 # List collections
aa collection create [options]     # Create collection
aa collection show <id>            # Show collection details
aa collection add <id> <item>      # Add item to collection
aa collection remove <id> <item>   # Remove from collection
aa collection delete <id>          # Delete collection
```

**Examples:**
```bash
aa collection create --name "Favorites" --type static
aa collection add col123 loc456
```

### tag - Manage Tags

```bash
aa tag list                        # List tags
aa tag create <name> [options]     # Create tag
aa tag assign <tag> <item>         # Assign tag to item
aa tag unassign <tag> <item>       # Remove tag from item
aa tag show <name>                 # Show items with tag
aa tag delete <name>               # Delete tag
aa tag rename <old> <new>          # Rename tag
aa tag categories                  # List tag categories
```

**Examples:**
```bash
aa tag create "industrial" --category "type"
aa tag assign industrial loc123
```

### db - Database Management

```bash
aa db init                         # Initialize database
aa db info                         # Show database info
aa db migrate                      # Run migrations
aa db vacuum                       # Optimize database
aa db optimize                     # Optimize for large-scale
aa db check                        # Check integrity
aa db exec <sql>                   # Execute raw SQL
aa db reset                        # Reset database
```

**Examples:**
```bash
aa db info
aa db check --repair
aa db exec "SELECT count(*) FROM locs" --force
```

### config - Configuration

```bash
aa config show                     # Show configuration
aa config get <key>                # Get config value
aa config set <key> <value>        # Set config value
aa config unset <key>              # Remove config value
aa config keys                     # List available keys
aa config init                     # Initialize with defaults
aa config edit                     # Edit in editor
aa config validate                 # Validate configuration
```

**Examples:**
```bash
aa config set archive_folder /media/archive
aa config get dispatch_hub_url
```

### pipeline - Pipeline Tools

```bash
aa pipeline run <tool> [options]   # Run arbitrary tool
aa pipeline import [options]       # Import with wake-n-blake
aa pipeline thumb [options]        # Generate thumbnails
aa pipeline tag [options]          # Tag with visual-buffet
aa pipeline capture [options]      # Capture web pages
aa pipeline status                 # Show pipeline status
```

**Examples:**
```bash
aa pipeline import --source /camera/DCIM --dest /archive
aa pipeline thumb --location abc123
aa pipeline tag --batch 100
```

### dispatch - Dispatch Hub

```bash
aa dispatch status                 # Show connection status
aa dispatch login                  # Login to hub
aa dispatch logout                 # Logout from hub
aa dispatch jobs [options]         # List jobs
aa dispatch job <jobId>            # Get job details
aa dispatch cancel <jobId>         # Cancel a job
aa dispatch workers                # List workers
aa dispatch set-hub <url>          # Set hub URL
```

**Examples:**
```bash
aa dispatch status
aa dispatch login --username admin --password secret
aa dispatch jobs --status pending
aa dispatch set-hub http://192.168.1.199:3000
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `AA_CONFIG_PATH` | Path to config file |
| `AA_DATABASE_PATH` | Path to database file |
| `DISPATCH_HUB_URL` | Dispatch hub URL |

## Configuration File

Default location: `~/.abandoned-archive/config.json`

```json
{
  "archive_folder": "/media/abandoned-archive",
  "dispatch_hub_url": "http://192.168.1.199:3000",
  "auto_backup": true,
  "backup_interval_hours": 24
}
```

## Exit Codes

| Code | Description |
|------|-------------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid arguments |
| 3 | Database error |
| 4 | Network error |
