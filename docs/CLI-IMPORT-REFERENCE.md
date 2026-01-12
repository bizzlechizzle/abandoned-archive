# CLI Import Reference

Command-line interface for location import, export, and deduplication operations.

## Prerequisites

- Dispatch Hub running at `DISPATCH_HUB_URL` (default: `http://192.168.1.199:3000`)
- Archive folder configured
- Node.js 20+

## Quick Start

```bash
# From abandoned-archive root
cd packages/cli
pnpm build

# Run commands
pnpm aa <command> [options]
```

---

## Import Commands

### `aa import files <path>`

Import media files to a location.

```bash
aa import files ./photos -l loc_abc123def456
aa import files /Volumes/SD/DCIM -l loc_abc123 --recursive
aa import files ./batch --dry-run
```

| Option | Description | Default |
|--------|-------------|---------|
| `-l, --location <id>` | Target location ID | Required |
| `-r, --recursive` | Scan subdirectories | `false` |
| `--dry-run` | Preview without importing | `false` |
| `--skip-duplicates` | Skip files with existing hashes | `true` |

**What it does:**
1. Scans path for media files (images, videos, documents)
2. Computes BLAKE3 hash for each file
3. Copies to archive folder structure
4. Submits import job to Hub
5. Links files to specified location

### `aa import refmap <file>`

Import reference map points from GPS file (KML, KMZ, GPX, GeoJSON, CSV).

```bash
aa import refmap waypoints.kml
aa import refmap explore.gpx --match --dry-run
aa import refmap export.geojson --dedup --match
```

| Option | Description | Default |
|--------|-------------|---------|
| `-f, --format <fmt>` | Force format (kml, kmz, gpx, geojson, csv) | auto-detect |
| `--dedup` | Run deduplication pass | `true` |
| `--match` | Match points to existing locations | `true` |
| `--threshold <n>` | Name similarity threshold (0-1) | `0.85` |
| `--radius <m>` | GPS matching radius in meters | `50` |
| `--dry-run` | Preview matches without saving | `false` |

**What it does:**
1. Parses GPS file using map-tool
2. Extracts waypoint names and coordinates
3. Runs deduplication to merge near-identical points
4. Matches remaining points against existing locations
5. Creates `reference_map_points` records in Hub

### `aa import location <xmp-file>`

Reimport location from XMP backup file.

```bash
aa import location ./backup/location.xmp
aa import location /archive/locations/NY-IND/ACME-abc123/docs/backup/location.xmp --merge update
```

| Option | Description | Default |
|--------|-------------|---------|
| `--merge <strategy>` | If location exists: `create`, `update`, `skip` | `create` |
| `--dry-run` | Preview without importing | `false` |

**Merge strategies:**
- `create` - Fail if location ID already exists
- `update` - Update existing location with XMP data
- `skip` - Skip if location already exists

**Status**: Not yet implemented. See `docs/plans/location-import-implementation-plan.md`.

---

## Export Commands

### `aa export location <id>`

Export single location to XMP backup file.

```bash
aa export location loc_abc123def456
aa export location loc_abc123 -o ./backups/
```

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --output <path>` | Output directory | Location's `docs/backup/` |
| `--include-media` | Include media hash references | `true` |

**Creates:**
```
<output>/
  location.xmp          # Full metadata in XMP format
  location-info.json    # Human-readable summary
  manifest.sha256       # Checksums for verification
```

**Status**: Not yet implemented. See `docs/plans/location-import-implementation-plan.md`.

### `aa export csv`

Export all locations to CSV.

```bash
aa export csv
aa export csv -o locations.csv --state NY
aa export csv --category industrial --state PA
```

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --output <file>` | Output file path | `locations.csv` |
| `--state <code>` | Filter by state (2-letter) | All states |
| `--category <cat>` | Filter by category | All categories |
| `--include-gps` | Include GPS coordinates | `true` |
| `--include-address` | Include full address | `true` |

### `aa export geojson`

Export locations as GeoJSON FeatureCollection.

```bash
aa export geojson
aa export geojson -o map.geojson --state NY
```

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --output <file>` | Output file path | `locations.geojson` |
| `--state <code>` | Filter by state | All states |
| `--category <cat>` | Filter by category | All categories |

**Output format:**
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [-78.654321, 42.123456]
      },
      "properties": {
        "id": "loc_abc123def456",
        "name": "Acme Steel Mill",
        "category": "industrial",
        "status": "demolished"
      }
    }
  ]
}
```

### `aa export gpx`

Export locations as GPX waypoints.

```bash
aa export gpx -o explore.gpx
aa export gpx --state NY --category industrial
```

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --output <file>` | Output file path | `locations.gpx` |
| `--state <code>` | Filter by state | All states |
| `--category <cat>` | Filter by category | All categories |

---

## Deduplication Commands

### `aa dedup check <name> <lat> <lng>`

Check if a location might be a duplicate of existing locations.

```bash
aa dedup check "Old Steel Mill" 42.123 -78.654
aa dedup check "Acme Factory" 42.123 -78.654 --threshold 0.80 --radius 100
```

| Option | Description | Default |
|--------|-------------|---------|
| `--threshold <n>` | Name similarity threshold (0-1) | `0.85` |
| `--radius <m>` | GPS search radius in meters | `50` |

**Output:**
```
Checking for duplicates...

Found 2 potential matches:

1. Acme Steel Mill (loc_abc123)
   - Distance: 23m
   - Name similarity: 0.92
   - Match type: GPS + Name
   - Confidence: 95%

2. Old Acme Ironworks (loc_def456)
   - Distance: 156m
   - Name similarity: 0.78
   - Match type: Name only
   - Confidence: 65%
```

### `aa dedup compare <name1> <name2>`

Compare two location names for similarity (debugging tool).

```bash
aa dedup compare "St. Marys Hospital" "Saint Mary's Medical Center"
aa dedup compare "GM Plant" "General Motors Assembly"
```

**Output:**
```
Comparing names:
  Name 1: "St. Marys Hospital"
  Name 2: "Saint Mary's Medical Center"

Normalized:
  Name 1: "saint marys hospital"
  Name 2: "saint marys medical center"

Scores:
  Jaro-Winkler (raw):        0.76
  Jaro-Winkler (normalized): 0.89
  Token Set Ratio:           0.92
  Combined (max):            0.92

Word Analysis:
  Exact matches: 2 (saint, marys)
  Overlap ratio: 0.67
  Word boost applied: Yes (-0.10 threshold)

Blocking Analysis:
  Directional conflict: No
  Temporal conflict: No
  Numbered conflict: No

Final Decision: MATCH (0.92 >= 0.75 adjusted threshold)
```

### `aa dedup run`

Run deduplication across all locations (admin operation).

```bash
aa dedup run --dry-run
aa dedup run --threshold 0.90 --radius 25
```

| Option | Description | Default |
|--------|-------------|---------|
| `--threshold <n>` | Name similarity threshold | `0.85` |
| `--radius <m>` | GPS radius in meters | `50` |
| `--dry-run` | Preview without merging | `false` |
| `--auto-merge` | Auto-merge high-confidence matches | `false` |

---

## Reference Map Commands

### `aa refmap list`

List all reference maps.

```bash
aa refmap list
aa refmap list --with-stats
```

### `aa refmap stats <id>`

Show statistics for a reference map.

```bash
aa refmap stats map_abc123
```

**Output:**
```
Reference Map: explore-2024.kml
  ID: map_abc123
  Imported: 2024-06-15
  Format: KML

Points:
  Total: 156
  Matched: 89 (57%)
  Unmatched: 67 (43%)

Deduplication:
  Original: 198
  Merged: 42
  Final: 156
```

### `aa refmap match <id>`

Re-run matching for a reference map.

```bash
aa refmap match map_abc123
aa refmap match map_abc123 --threshold 0.80
```

---

## Database Commands

### `aa db backup`

Create database backup (requires Hub admin access).

```bash
aa db backup
aa db backup -o ./backups/dispatch-2026-01-12.sql
```

### `aa db stats`

Show database statistics.

```bash
aa db stats
```

**Output:**
```
Database Statistics:
  Locations: 1,234
  Media files: 45,678
  Reference maps: 12
  Reference points: 3,456

Storage:
  Archive folder: /Volumes/Archive
  Total size: 234.5 GB
  Thumbnails: 12.3 GB
  Proxies: 45.6 GB
```

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DISPATCH_HUB_URL` | Hub API endpoint | `http://192.168.1.199:3000` |
| `AA_ARCHIVE_FOLDER` | Archive root path | `~/.abandoned-archive/archive` |
| `AA_LOG_LEVEL` | Log verbosity (debug, info, warn, error) | `info` |

### Config File

Location: `~/.abandoned-archive/config.json`

```json
{
  "hubUrl": "http://192.168.1.199:3000",
  "archiveFolder": "/Volumes/Archive/abandoned-archive",
  "defaultState": "NY",
  "importOptions": {
    "skipDuplicates": true,
    "recursive": false
  },
  "dedupOptions": {
    "nameThreshold": 0.85,
    "gpsRadius": 50
  }
}
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Hub connection failed |
| 3 | Validation error (invalid input) |
| 4 | File not found |
| 5 | Permission denied |
| 6 | Operation cancelled by user |

---

## Examples

### Full import workflow

```bash
# 1. Check for duplicates first
aa dedup check "Bethlehem Steel" 40.6084 -75.3832

# 2. Create location via desktop app or API

# 3. Import media files
aa import files /Volumes/SD/DCIM -l loc_abc123 --recursive

# 4. Import GPS waypoints
aa import refmap explore.kml --match

# 5. Export backup
aa export location loc_abc123
```

### Batch export for external mapping

```bash
# Export all NY industrial locations
aa export geojson -o ny-industrial.geojson --state NY --category industrial

# Convert to GPX for handheld GPS
aa export gpx -o ny-industrial.gpx --state NY --category industrial
```

### Deduplication audit

```bash
# Preview what would be merged
aa dedup run --dry-run --threshold 0.90

# Review specific comparisons
aa dedup compare "Factory A" "Factory B"

# Run with conservative settings
aa dedup run --threshold 0.95 --radius 25
```

---

## Related Documentation

- [Import Workflow](workflows/import.md) - Detailed import pipeline
- [GPS Contract](contracts/gps.md) - GPS confidence rules
- [Hashing Contract](contracts/hashing.md) - BLAKE3/SHA256 requirements
- [Data Ownership](contracts/data-ownership.md) - Backup guarantees
- [Implementation Plan](plans/location-import-implementation-plan.md) - Upcoming features
