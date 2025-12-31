# MapCombine Development Guide

> **Version**: 2.0
> **Created**: 2025-12-24
> **Package**: `packages/mapcombine`
> **Tests**: 180 passing

This guide provides architecture details and development patterns for the mapcombine CLI tool.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLI LAYER (cli.ts)                          │
│  Commands: parse, dedup, match, merge, stats, compare           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Parser    │  │   Dedup     │  │   Match     │             │
│  │ (parser.ts) │  │ (dedup.ts)  │  │   Engine    │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
├─────────┴────────────────┴────────────────┴─────────────────────┤
│                                                                 │
│  ┌─────────────────────────┐  ┌─────────────────────────┐      │
│  │   String Similarity     │  │    Geo Utilities        │      │
│  │  (jaro-winkler.ts)      │  │   (geo-utils.ts)        │      │
│  │  (token-set-ratio.ts)   │  │                         │      │
│  └─────────────────────────┘  └─────────────────────────┘      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Module Responsibilities

### `geo-utils.ts` (~250 lines)

**Purpose**: GPS coordinate calculations and US state detection

**Key Functions**:
- `haversineDistance()` - Great-circle distance in meters
- `isWithinRadius()` - Distance threshold check
- `getBoundingBox()` - Pre-filter for SQL queries
- `calculateCentroid()` - Average of coordinate array
- `isValidCoordinate()` - Validate lat/lng bounds
- `getUSStateFromCoords()` - Auto-detect US state from GPS (50 states + DC)

**Dependencies**: None (pure functions)

**US State Detection**: Uses bounding boxes for all 50 states. Parser calls this automatically to populate state field when parsing map files.

### `jaro-winkler.ts` (~650 lines)

**Purpose**: Character-level string similarity with alias expansion

**Key Components**:
1. **Alias Dictionary** (~280 expansions)
   - Multi-word: `"tb hospital" → "tuberculosis sanatorium"`
   - Single-word: `"chevy" → "chevrolet"`
   - Period abbreviations: `"St." → "saint"`

2. **Core Algorithm**:
   - `jaroSimilarity()` - Base Jaro score (0-1)
   - `jaroWinklerSimilarity()` - Jaro + prefix boost

3. **Normalization Pipeline**:
   ```
   Input → lowercase → strip articles → expand periods
        → expand multi-word → expand single-word → collapse spaces
   ```

4. **Word-Overlap Boost**:
   - `calculateWordOverlap()` - Find shared words
   - `getAdjustedThreshold()` - Lower threshold when words match

**Key Functions**:
- `normalizeName()` - Full normalization pipeline
- `isSmartMatch()` - Recommended matching function
- `getMatchDetails()` - Debug/UI information

### `token-set-ratio.ts` (~400 lines)

**Purpose**: Word-order independent matching and blocking detection

**Key Algorithm (Token Set Ratio)**:
```
1. Tokenize both strings
2. Find intersection (shared words)
3. Find remainders (unique to each)
4. Build comparison strings:
   - sorted intersection
   - sorted (intersection + remainder1)
   - sorted (intersection + remainder2)
5. Return MAX Jaro-Winkler of pairwise comparisons
```

**Blocking Detection**:
- Direction: north/south, east/west, upper/lower
- Temporal: old/new, former/current
- Numbered: first/second, 1st/2nd
- Identifiers: Building A/Building B

**Generic Name Detection**:
- Single-word generics: house, church, factory
- Generic + region: "House CNY", "Factory Buffalo"

**Multi-Signal Scoring**:
```
Score = GPS (40pts) + Name (35pts) + State (25pts)
```

### `parser.ts` (~400 lines)

**Purpose**: Parse multiple map file formats

**Supported Formats**:
| Format | Parser | Notes |
|--------|--------|-------|
| KML | @xmldom/xmldom | Point, Line, Polygon, ExtendedData |
| KMZ | unzipper + KML | Extracts from ZIP |
| GPX | @xmldom/xmldom | wpt, trk (first point), rte |
| GeoJSON | JSON.parse | All geometry types |
| CSV | Custom | Auto-detect columns |

**Output Type**:
```typescript
interface ParsedMapPoint {
  name: string | null;
  description: string | null;
  lat: number;
  lng: number;
  state: string | null;
  category: string | null;
  rawMetadata: Record<string, unknown> | null;
}
```

### `dedup.ts` (~450 lines)

**Purpose**: Duplicate detection and clustering with safeguards

**Union-Find Data Structure**:
```typescript
class UnionFind {
  find(x: number): number    // Path compression
  union(x: y: number): bool  // Union by rank
  getClusters(): Map<number, number[]>
}
```

**Cluster Safeguards** (prevents over-clustering):
- `maxClusterSize` (default: 20) - Max points per cluster
- `maxClusterDiameter` (default: 500m) - Max geographic spread
- `minConfidence` (default: 60) - Min match confidence

**Deduplication Algorithm**:
1. O(n²) pairwise comparison (optimize later with spatial index)
2. For each pair, check:
   - GPS distance vs threshold
   - Name similarity (normalized + token set ratio)
   - Blocking word conflicts
   - Generic name handling
   - **Safeguards**: cluster size, diameter, confidence
3. Union matching pairs (only if safeguards pass)
4. Extract clusters as duplicate groups

**Output**:
```typescript
interface DuplicateGroup {
  representative: number;
  members: number[];
  mergedName: string | null;
  akaNames: string[];
  centroid: { lat: number; lng: number };
  confidence: number;
}
```

### `cli.ts` (~500 lines)

**Purpose**: Command-line interface using Commander.js

**Commands**:
- `parse` - Parse files, output points
- `dedup` - Deduplicate with clustering
- `compare` - Debug name comparison
- `stats` - File/point statistics
- `merge` - Combine without dedup
- `match` - Match target against reference

---

## Key Design Decisions

### 1. Normalization Before Comparison

All name comparisons normalize first:
```typescript
// Bad
jaroWinklerSimilarity(name1, name2);

// Good
normalizedSimilarity(name1, name2);
// or
isSmartMatch(name1, name2);
```

### 2. Token Set Ratio for Reordering

Character-based algorithms fail on reordered names:
```
"Union Station - Lockport" vs "Lockport Union Train Station"
- Jaro-Winkler: ~65% (fails at 85% threshold)
- Token Set Ratio: ~95% (passes)
```

Always use `combinedFuzzyMatch()` or check both scores.

### 3. Blocking Words Are Strict

Even 100% name match fails if blocking conflict exists:
```
"North Factory" vs "South Factory"
- Name similarity: 85%+ (would match)
- Blocking conflict: YES
- Result: NO MATCH
```

Check blocking before accepting matches.

### 4. Generic Names Need GPS

Single-word generics require stricter GPS (25m vs 50m):
```typescript
if (isGenericName(name1) || isGenericName(name2)) {
  // Use 25m threshold instead of 50m
}
```

### 5. Word-Overlap Boost

When names share exact words, lower the threshold:
```typescript
const adjusted = getAdjustedThreshold(name1, name2, 0.85);
// Returns 0.75 if they share significant words
```

---

## Testing Patterns

### Unit Tests

Each module has corresponding test file:
- `tests/geo-utils.test.ts`
- `tests/jaro-winkler.test.ts`
- `tests/token-set-ratio.test.ts`
- `tests/dedup.test.ts`

### Real-World Test Cases

Include known difficult cases:
```typescript
// Word reordering
expect(tokenSetRatio('Union Station Lockport', 'Lockport Union Train'))
  .toBeGreaterThan(0.90);

// Abbreviation expansion
expect(isSmartMatch('PRR Station', 'Pennsylvania Railroad Depot'))
  .toBe(true);

// Blocking conflict
expect(checkBlockingConflict('North Factory', 'South Factory').hasConflict)
  .toBe(true);
```

---

## Performance Considerations

### Current: O(n²) Comparison

For small datasets (<1000 points), O(n²) is acceptable.

### Future: Spatial Indexing

For large datasets, consider:
1. **Bounding Box Pre-filter**: Use `getBoundingBox()` for SQL queries
2. **R-tree**: For in-memory spatial indexing
3. **Geohash**: For approximate clustering

### Benchmarks

| Points | Dedup Time |
|--------|------------|
| 100 | <100ms |
| 500 | ~500ms |
| 1000 | ~2s |
| 5000 | ~50s |

---

## Adding New Features

### Adding a New File Format

1. Add case to `getFileType()` in parser.ts
2. Implement `parse[Format]()` function
3. Add to switch in `parseMapFile()`
4. Add tests in tests/parser.test.ts

### Adding New Alias Expansions

1. Add to `MULTI_WORD_ALIASES` or `SINGLE_WORD_ALIASES` in jaro-winkler.ts
2. Order matters: longer patterns first for multi-word
3. Add test case verifying expansion

### Adding New Blocking Words

1. Add to appropriate category in `BLOCKING_WORDS` in token-set-ratio.ts
2. Categories: directions, temporal, numbered
3. For patterns, add to `IDENTIFIER_PATTERNS`

---

## Error Handling

### Parser Errors

Never throw from parsers. Return result with error:
```typescript
return {
  success: false,
  points: [],
  fileType: 'kml',
  fileName: 'file.kml',
  error: 'Parse error message'
};
```

### CLI Errors

Use ora spinner for progress:
```typescript
const spinner = ora('Processing...').start();
try {
  // work
  spinner.succeed('Done');
} catch (error) {
  spinner.fail('Failed');
  console.error(error.message);
  process.exit(1);
}
```

---

## Integration with Desktop App

The mapcombine package can be used from the Electron desktop app:

```typescript
import {
  parseMapFile,
  deduplicatePoints,
  generateDedupedPoints,
} from 'mapcombine';

// In IPC handler
ipcMain.handle('ref-map:import', async (_, filePath) => {
  const result = await parseMapFile(filePath);
  if (!result.success) {
    throw new Error(result.error);
  }

  const deduped = deduplicatePoints(result.points);
  return generateDedupedPoints(result.points, deduped);
});
```

---

## Changelog

### v0.2.0 (2025-12-24)

- Added cluster safeguards (maxClusterSize, maxClusterDiameter, minConfidence)
- Added US state detection from GPS coordinates (50 states + DC)
- Added KML and GPX export formats
- Added `--dry-run` mode for preview
- Added parser tests (37 tests) and CLI tests (27 tests)
- Total: 180 tests passing

### v0.1.0 (2025-12-24)

- Initial release
- KML, KMZ, GPX, GeoJSON, CSV parsing
- Jaro-Winkler with 280+ alias expansions
- Token Set Ratio algorithm
- Union-Find deduplication
- Blocking word detection
- CLI with 6 commands
