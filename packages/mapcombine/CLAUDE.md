# packages/mapcombine

GPS waypoint parsing, fuzzy matching, and deduplication CLI tool.

## Structure

- `src/` - Source TypeScript files
  - `geo-utils.ts` - Haversine distance, bounding box, coordinate validation
  - `jaro-winkler.ts` - String similarity with 280+ alias expansions
  - `token-set-ratio.ts` - Word-order independent matching, blocking detection
  - `parser.ts` - KML, KMZ, GPX, GeoJSON, CSV parsing
  - `dedup.ts` - Union-Find clustering for deduplication
  - `cli.ts` - Command-line interface
  - `index.ts` - Public API exports
- `tests/` - Vitest test files
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
# Parse map files
mapcombine parse file.kml file.gpx -o output.json

# Deduplicate points
mapcombine dedup *.kml -o deduped.geojson -f geojson

# Compare two names
mapcombine compare "Union Station" "Station Union"

# Show statistics
mapcombine stats *.kml --alias-stats

# Merge without dedup
mapcombine merge *.kml -o merged.geojson

# Match target against reference
mapcombine match reference.kml target.gpx
```

## Key Algorithms

1. **Token Set Ratio** - Word-order independent matching
2. **Jaro-Winkler with Normalization** - Character-level with alias expansion
3. **Union-Find Clustering** - GPS-based deduplication
4. **Blocking Word Detection** - Prevents North/South false matches

## Testing

All tests use Vitest. Run with `pnpm test`.

Coverage areas:
- Haversine distance calculations
- Jaro-Winkler similarity scores
- Token Set Ratio algorithm
- Blocking conflict detection
- Deduplication clustering
