# packages/mapcombine

GPS waypoint parsing, fuzzy matching, and deduplication CLI tool.

## Structure

- `src/` - Source TypeScript files
  - `geo-utils.ts` - Haversine distance, bounding box, US state lookup from coords
  - `jaro-winkler.ts` - String similarity with 280+ alias expansions
  - `token-set-ratio.ts` - Word-order independent matching, blocking detection
  - `parser.ts` - KML, KMZ, GPX, GeoJSON, CSV parsing with auto state detection
  - `dedup.ts` - Union-Find clustering with safeguards (max size/diameter)
  - `cli.ts` - Command-line interface
  - `index.ts` - Public API exports
- `tests/` - Vitest test files (180 tests)
- `tests/fixtures/` - Sample map files for testing
- `bin/` - CLI entry point

## Commands

```bash
# Build
pnpm build

# Run tests
pnpm test

# Dev mode (tsx)
pnpm dev parse file.kml

# After build
node dist/cli.js parse file.kml
```

## CLI Usage

```bash
# Parse map files (supports json, geojson, kml, gpx, csv, table output)
mapcombine parse file.kml file.gpx -o output.json
mapcombine parse *.kmz -f kml -o combined.kml
mapcombine parse *.gpx -f gpx -o merged.gpx

# Deduplicate with safeguards
mapcombine dedup *.kml -o deduped.geojson -f geojson
mapcombine dedup *.kml --max-cluster-size 10 --max-diameter 200
mapcombine dedup *.kml --require-gps --min-confidence 80
mapcombine dedup *.kml --dry-run  # Preview what would be merged

# Compare two names
mapcombine compare "Union Station" "Station Union"

# Show statistics
mapcombine stats *.kml --alias-stats

# Merge without dedup
mapcombine merge *.kml -o merged.geojson

# Match target against reference (with safeguards)
mapcombine match reference.kml target.gpx --require-both --min-confidence 70
```

## Dedup Safeguards

Prevents over-clustering with these limits:
- `--max-cluster-size <n>` - Max points per cluster (default: 20)
- `--max-diameter <meters>` - Max geographic spread (default: 500m)
- `--min-confidence <0-100>` - Min match confidence (default: 60)
- `--dry-run` - Preview mode, shows what would be merged

## Key Algorithms

1. **Token Set Ratio** - Word-order independent matching
2. **Jaro-Winkler with Normalization** - Character-level with alias expansion
3. **Union-Find Clustering** - GPS-based deduplication with safeguards
4. **Blocking Word Detection** - Prevents North/South false matches
5. **US State Lookup** - Auto-detects state from GPS coordinates

## Export Formats

- `json` - Raw point array
- `geojson` - GeoJSON FeatureCollection
- `kml` - Google Earth KML
- `gpx` - GPS Exchange Format
- `csv` - Comma-separated values
- `table` - Human-readable table

## Testing

All tests use Vitest. Run with `pnpm test`.

Coverage areas:
- Haversine distance calculations
- Jaro-Winkler similarity scores
- Token Set Ratio algorithm
- Blocking conflict detection
- Deduplication clustering
- Parser (KML, GPX, GeoJSON, CSV)
- CLI integration tests
