# Location Import Implementation Plan

**Created**: 2026-01-12
**Status**: Planning
**Scope**: Per-location XMP backup, map-tool integration, CLI documentation

This plan addresses gaps identified in the January 2026 audit while respecting the thin client architecture.

---

## Executive Summary

The abandoned-archive desktop app is missing three critical features for location import:

1. **Per-location XMP backup** - No mechanism to export/reimport individual locations
2. **Map-tool duplicate detection** - Fuzzy matching exists but isn't wired to desktop
3. **CLI documentation** - Import commands exist but aren't documented

All implementations MUST respect the thin client architecture: heavy processing happens on Dispatch Hub, desktop only handles UI and local file operations.

---

## Architecture Principles

| Principle | Implementation |
|-----------|----------------|
| **Thin client** | Desktop submits jobs to Hub workers, never processes data locally |
| **Hub owns data** | All metadata in PostgreSQL, desktop only caches for display |
| **Local files only** | Media files stay on user disk, Hub stores paths + hashes |
| **XMP for provenance** | Sidecar files document chain of custody for archival integrity |

---

## Phase 1: Per-Location XMP Backup (Hub Worker)

### Problem

Currently no way to:
- Export a single location as a portable package
- Reimport a location if database corrupts
- Self-document location folders with metadata

### Solution

Add `location-exporter` job type to existing `xmp-manager` worker on Dispatch Hub.

### Hub Changes (dispatch repo)

#### 1.1 New Job Type: `xmp-manager.location-export`

**File**: `src/worker/plugins/xmp-manager.ts`

```typescript
// New job payload
interface LocationExportPayload {
  locationId: string;
  outputPath: string;  // e.g., /archive/locations/NY-IND/ACME-abc123/docs/backup/
  includeMedia: boolean;  // Include media file references
}

// New job handler
case 'xmp-manager.location-export':
  return exportLocationToXmp(job.data);
```

#### 1.2 XMP Schema for Locations

**Namespace**: `http://dispatch.dev/xmp/location/1.0/`
**Prefix**: `loc`

```xml
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:loc="http://dispatch.dev/xmp/location/1.0/"
      xmlns:custody="http://dispatch.dev/xmp/custody/1.0/">

      <!-- Identity -->
      <loc:SchemaVersion>1</loc:SchemaVersion>
      <loc:LocationId>loc_abc123def456</loc:LocationId>
      <loc:Name>Acme Steel Mill</loc:Name>
      <loc:ShortName>ACME</loc:ShortName>
      <loc:AkaName>Acme Ironworks</loc:AkaName>

      <!-- Classification -->
      <loc:Category>industrial</loc:Category>
      <loc:Class>mill</loc:Class>
      <loc:Status>demolished</loc:Status>

      <!-- GPS (authoritative) -->
      <loc:GpsLat>42.123456</loc:GpsLat>
      <loc:GpsLon>-78.654321</loc:GpsLon>
      <loc:GpsAccuracy>5.2</loc:GpsAccuracy>
      <loc:GpsSource>map_verified</loc:GpsSource>
      <loc:GpsVerifiedOnMap>true</loc:GpsVerifiedOnMap>

      <!-- Address -->
      <loc:AddressStreet>123 Industrial Way</loc:AddressStreet>
      <loc:AddressCity>Buffalo</loc:AddressCity>
      <loc:AddressCounty>Erie</loc:AddressCounty>
      <loc:AddressState>NY</loc:AddressState>
      <loc:AddressZipcode>14201</loc:AddressZipcode>

      <!-- Metadata -->
      <loc:Notes>Former steel production facility, closed 1982</loc:Notes>
      <loc:HistoricalNames>
        <rdf:Seq>
          <rdf:li>Acme Iron Company (1901-1945)</rdf:li>
          <rdf:li>Acme Steel Corporation (1945-1982)</rdf:li>
        </rdf:Seq>
      </loc:HistoricalNames>

      <!-- Media References (BLAKE3 hashes) -->
      <loc:MediaCount>47</loc:MediaCount>
      <loc:MediaHashes>
        <rdf:Bag>
          <rdf:li>a1b2c3d4e5f67890</rdf:li>
          <rdf:li>b2c3d4e5f6789012</rdf:li>
        </rdf:Bag>
      </loc:MediaHashes>

      <!-- Sublocations -->
      <loc:Sublocations>
        <rdf:Seq>
          <rdf:li rdf:parseType="Resource">
            <loc:SubId>sub_xyz789</loc:SubId>
            <loc:SubName>Main Building</loc:SubName>
            <loc:SubGpsLat>42.123500</loc:SubGpsLat>
            <loc:SubGpsLon>-78.654200</loc:SubGpsLon>
          </rdf:li>
        </rdf:Seq>
      </loc:Sublocations>

      <!-- Export Metadata -->
      <loc:ExportedAt>2026-01-12T15:30:00Z</loc:ExportedAt>
      <loc:ExportedBy>user_abc123</loc:ExportedBy>
      <loc:HubVersion>0.5.2</loc:HubVersion>

      <!-- Custody Chain -->
      <custody:Events>
        <rdf:Seq>
          <rdf:li rdf:parseType="Resource">
            <custody:EventId>evt_export_001</custody:EventId>
            <custody:Timestamp>2026-01-12T15:30:00Z</custody:Timestamp>
            <custody:Action>location_export</custody:Action>
            <custody:Outcome>success</custody:Outcome>
            <custody:Tool>xmp-manager/0.1.1</custody:Tool>
          </rdf:li>
        </rdf:Seq>
      </custody:Events>

    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
```

#### 1.3 Output Location

```
[archive]/locations/[STATE]-[TYPE]/[SLOCNAM]-[LOC12]/
  docs/
    backup/
      location.xmp          # Full location metadata
      location-info.json    # Human-readable summary
      manifest.sha256       # Checksums for verification
```

#### 1.4 Hub API Endpoint

**File**: `src/hub/api/locations.ts`

```typescript
// POST /locations/:id/export
app.post('/locations/:id/export', async (request, reply) => {
  const { id } = request.params;
  const { outputPath } = request.body;

  // Queue export job
  await jobQueue.add('xmp-manager.location-export', {
    locationId: id,
    outputPath,
    includeMedia: true
  });

  return reply.code(202).send({ status: 'queued' });
});
```

### Desktop Changes (abandoned-archive repo)

#### 1.5 IPC Handler

**File**: `packages/desktop/electron/main/ipc-handlers/api-locations.ts`

```typescript
ipcMain.handle('location:export', async (_event, locationId: string) => {
  const config = getConfigService();
  const archiveFolder = config.get('archiveFolder');
  const location = await locationRepo.findById(locationId);

  if (!location) throw new Error('Location not found');

  const outputPath = path.join(
    archiveFolder,
    'locations',
    `${location.addressState}-${location.category}`,
    `${location.shortName}-${location.id.slice(-12)}`,
    'docs',
    'backup'
  );

  // Submit to Hub
  const client = getDispatchClient();
  await client.post(`/locations/${locationId}/export`, { outputPath });

  return { status: 'queued', outputPath };
});
```

#### 1.6 Preload Bridge

**File**: `packages/desktop/electron/preload/index.ts`

```typescript
export: (locationId: string) => ipcRenderer.invoke('location:export', locationId),
```

### Reimport Mechanism

#### 1.7 New Job Type: `xmp-manager.location-import`

```typescript
interface LocationImportPayload {
  xmpPath: string;  // Path to location.xmp
  mergeStrategy: 'create' | 'update' | 'skip';  // If location exists
}
```

This job:
1. Parses location.xmp
2. Validates against schema
3. Creates/updates location in database
4. Links existing media by hash (if files exist)
5. Records custody event

---

## Phase 2: Map-Tool Duplicate Detection

### Problem

- `plugins/map-tool/` has working fuzzy matching (Jaro-Winkler + Token Set Ratio)
- Desktop's `location:checkDuplicates` returns empty array (stub)
- Users can unknowingly create duplicate locations

### Solution

Wire map-tool's matching into location creation workflow via Hub API.

### Hub Changes (dispatch repo)

#### 2.1 New API Endpoint

**File**: `src/hub/api/locations.ts`

```typescript
// POST /locations/check-duplicates
app.post('/locations/check-duplicates', async (request, reply) => {
  const { name, gpsLat, gpsLon, gpsThreshold = 50, nameThreshold = 0.85 } = request.body;

  // Get candidates within GPS radius
  const candidates = await db
    .select()
    .from(schema.locations)
    .where(
      and(
        gte(schema.locations.gpsLat, gpsLat - 0.01),
        lte(schema.locations.gpsLat, gpsLat + 0.01),
        gte(schema.locations.gpsLon, gpsLon - 0.01),
        lte(schema.locations.gpsLon, gpsLon + 0.01)
      )
    );

  // Run through map-tool matching
  const matches = [];
  for (const candidate of candidates) {
    const result = checkDuplicate(
      { name, gpsLat, gpsLon },
      { name: candidate.name, gpsLat: candidate.gpsLat, gpsLon: candidate.gpsLon },
      { gpsThreshold, nameThreshold }
    );

    if (result.isDuplicate) {
      matches.push({
        location: candidate,
        confidence: result.confidence,
        matchType: result.matchType,
        reason: result.reason
      });
    }
  }

  return reply.send({ matches: matches.sort((a, b) => b.confidence - a.confidence) });
});
```

#### 2.2 Import map-tool Functions

**File**: `src/hub/api/locations.ts`

```typescript
import { checkDuplicate, combinedFuzzyMatch } from '@dispatch/map-tool';
```

### Desktop Changes (abandoned-archive repo)

#### 2.3 Wire IPC Handler

**File**: `packages/desktop/electron/main/ipc-handlers/api-locations.ts`

Replace stub with actual implementation:

```typescript
ipcMain.handle('location:checkDuplicates', async (_event, input: unknown) => {
  const { name, gpsLat, gpsLon } = LocationDuplicateCheckSchema.parse(input);

  const client = getDispatchClient();
  const response = await client.post('/locations/check-duplicates', {
    name,
    gpsLat,
    gpsLon,
    gpsThreshold: 50,
    nameThreshold: 0.85
  });

  return response.data.matches;
});
```

#### 2.4 UI Integration

**File**: `packages/desktop/src/components/LocationEditModal.svelte`

Add duplicate warning before save:

```svelte
<script>
  async function checkForDuplicates() {
    if (!name || !gpsLat || !gpsLon) return;

    duplicates = await window.api.location.checkDuplicates({
      name,
      gpsLat,
      gpsLon
    });

    showDuplicateWarning = duplicates.length > 0;
  }

  // Call on GPS change or name blur
</script>

{#if showDuplicateWarning}
  <div class="duplicate-warning">
    <p>Potential duplicates found:</p>
    <ul>
      {#each duplicates as dup}
        <li>
          {dup.location.name} ({dup.confidence}% match)
          <button on:click={() => navigateToLocation(dup.location.id)}>View</button>
        </li>
      {/each}
    </ul>
  </div>
{/if}
```

---

## Phase 3: CLI Documentation

### Problem

- CLI commands exist in `packages/cli/src/commands/`
- No unified documentation
- Users don't know import/export capabilities exist

### Solution

Create `docs/CLI-IMPORT-REFERENCE.md` documenting all location-related CLI commands.

### Documentation to Create

**File**: `docs/CLI-IMPORT-REFERENCE.md`

```markdown
# CLI Import Reference

## Overview

The abandoned-archive CLI provides batch operations for location import/export.
All commands require Dispatch Hub to be running.

## Prerequisites

- Dispatch Hub running at `DISPATCH_HUB_URL`
- Valid authentication token
- Archive folder configured

## Commands

### Import Commands

#### `aa import files <path>`

Import media files to a location.

| Option | Description | Default |
|--------|-------------|---------|
| `-l, --location <id>` | Target location ID | Required |
| `-r, --recursive` | Scan subdirectories | false |
| `--dry-run` | Preview without importing | false |
| `--skip-duplicates` | Skip files with existing hashes | true |

#### `aa import refmap <file>`

Import reference map points from GPS file.

| Option | Description | Default |
|--------|-------------|---------|
| `-f, --format <fmt>` | File format (kml,kmz,gpx,geojson,csv) | auto-detect |
| `--dedup` | Run deduplication pass | true |
| `--match` | Match points to existing locations | true |
| `--dry-run` | Preview matches without saving | false |

#### `aa import location <xmp>`

Reimport location from XMP backup file.

| Option | Description | Default |
|--------|-------------|---------|
| `--merge <strategy>` | create, update, skip | create |
| `--dry-run` | Preview without importing | false |

### Export Commands

#### `aa export location <id>`

Export single location to XMP backup.

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --output <path>` | Output directory | location's docs/backup/ |
| `--include-media` | Include media hash references | true |

#### `aa export csv`

Export all locations to CSV.

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --output <file>` | Output file path | locations.csv |
| `--state <state>` | Filter by state | all |
| `--category <cat>` | Filter by category | all |

#### `aa export geojson`

Export locations as GeoJSON FeatureCollection.

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --output <file>` | Output file path | locations.geojson |
| `--state <state>` | Filter by state | all |

### Deduplication Commands

#### `aa dedup check <name> <lat> <lng>`

Check for potential duplicates.

| Option | Description | Default |
|--------|-------------|---------|
| `--threshold <n>` | Name similarity threshold (0-1) | 0.85 |
| `--radius <m>` | GPS radius in meters | 50 |

#### `aa dedup compare <name1> <name2>`

Compare two location names for similarity.

Outputs:
- Jaro-Winkler score
- Token Set Ratio score
- Combined score
- Match decision

## Examples

### Import a KML file and match to locations

```bash
aa import refmap waypoints.kml --match --dry-run
# Review matches
aa import refmap waypoints.kml --match
```

### Export location for backup

```bash
aa export location loc_abc123
# Creates: [archive]/.../docs/backup/location.xmp
```

### Check for duplicate before creating

```bash
aa dedup check "Old Steel Mill" 42.123 -78.654
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Hub connection failed |
| 3 | Validation error |
| 4 | File not found |
```

---

## Phase 4: Remove Stub Handlers

### IPC Handlers to Implement or Remove

| Handler | Action | Rationale |
|---------|--------|-----------|
| `location:checkDuplicates` | Implement (Phase 2) | Wire to map-tool |
| `location:backfillRegions` | Remove | One-time migration, completed |
| `location:updateRegionData` | Remove | Replaced by Hub sync |
| `stats:*` (7 handlers) | Implement | Wire to Hub `/stats` endpoints |
| `settings:*` (3 handlers) | Implement | Wire to config-service |
| `geocode:*` (4 handlers) | Implement | Wire to Hub geocoding service |
| `database:*` (6 handlers) | Remove preload, keep CLI | DB ops are CLI/Hub admin only |
| `health:*` (11 handlers) | Implement | Wire to Hub `/health` endpoints |

### Desktop-Only Handlers to Keep

| Handler | Reason |
|---------|--------|
| `storage:getDiskSpace` | Local operation |
| `storage:getAppDataPath` | Local operation |
| `shell:openExternal` | Local operation |
| `dialog:*` | Local operation |

---

## Implementation Order

| Phase | Scope | Effort | Priority |
|-------|-------|--------|----------|
| Phase 2 | Map-tool integration | Medium | High (prevents data quality issues) |
| Phase 1 | Per-location XMP backup | High | High (data safety) |
| Phase 3 | CLI documentation | Low | Medium (usability) |
| Phase 4 | Stub handler cleanup | Medium | Low (code quality) |

---

## Testing Requirements

### Phase 1 Tests

- [ ] Location exports to XMP with all fields
- [ ] XMP validates against schema
- [ ] Reimport creates identical location record
- [ ] Reimport links existing media by hash
- [ ] Custody chain records export/import events

### Phase 2 Tests

- [ ] Duplicate check returns matches within GPS radius
- [ ] Name similarity scores match map-tool directly
- [ ] Bland names (house, church) require closer GPS
- [ ] Blocking words (North/South) prevent false matches
- [ ] UI shows warning before saving duplicate

### Phase 3 Tests

- [ ] All documented commands exist
- [ ] Help text matches documentation
- [ ] Examples work as shown

---

## Files to Modify

### Dispatch Hub (dispatch repo)

| File | Changes |
|------|---------|
| `src/hub/api/locations.ts` | Add `/export`, `/check-duplicates` endpoints |
| `src/worker/plugins/xmp-manager.ts` | Add `location-export`, `location-import` jobs |
| `plugins/xmp-manager/src/schemas/location.ts` | New XMP schema |
| `docs/sme/xmp-manager.md` | Document location namespace |

### Abandoned Archive (abandoned-archive repo)

| File | Changes |
|------|---------|
| `packages/desktop/electron/main/ipc-handlers/api-locations.ts` | Wire `export`, `checkDuplicates` |
| `packages/desktop/electron/preload/index.ts` | Add `export` to preload |
| `packages/desktop/src/components/LocationEditModal.svelte` | Add duplicate warning UI |
| `packages/cli/src/commands/export.ts` | Add `location` subcommand |
| `packages/cli/src/commands/import.ts` | Add `location` subcommand |
| `docs/CLI-IMPORT-REFERENCE.md` | New documentation |
| `docs/workflows/import.md` | Update with XMP backup info |

---

## Success Criteria

1. User can export any location to XMP with single CLI command
2. User can reimport location from XMP after database loss
3. User sees warning when creating potential duplicate
4. CLI documentation covers all import/export commands
5. All changes respect thin client architecture
