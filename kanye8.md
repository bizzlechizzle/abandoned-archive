# KANYE8 - ULTRATHINK ANALYSIS: Premium Archive Experience

## Executive Summary

This document provides a comprehensive audit of the AU Archive application focusing on the user's reported issues. After thorough codebase analysis, the problems fall into **three categories**: Missing Features, Configuration Gaps, and UX Polish Issues.

**Critical Finding:** The codebase has GOOD infrastructure but POOR integration. Most features exist in isolation but aren't properly connected.

---

## Issue Tracker

| # | Issue | Category | Root Cause | Severity | Status |
|---|-------|----------|------------|----------|--------|
| 1 | Thumbnails not generating | Config Gap | Import flow not calling thumbnail service | CRITICAL | Needs Fix |
| 2 | Existing thumbnails too low quality | Config Gap | Legacy 256px thumbs, not using 3-tier system | HIGH | Needs Fix |
| 3 | GPS missing from address-only imports | Missing Feature | Forward geocoding exists but not triggered | HIGH | Needs Fix |
| 4 | Map not showing for address-only locations | Integration Gap | Map only uses GPS, ignores address | HIGH | Needs Fix |
| 5 | Address display is sloppy | UX Polish | Missing link formatting, no prefix removal | MEDIUM | Needs Fix |
| 6 | Map not zooming to exact address | Integration Gap | No zoom control on address-based display | MEDIUM | Needs Fix |
| 7 | NEF shows "Cannot display" | Integration Gap | Preview extraction not triggered on import | CRITICAL | Needs Fix |
| 8 | Hero image selection unclear | UX Gap | Feature exists but UI not discoverable | LOW | Needs Fix |
| 9 | Darktable not set up | N/A | NOT NEEDED - ExifTool preview extraction used | N/A | Non-issue |

---

## ULTRATHINK: Deep Root Cause Analysis

### ISSUE 1 & 2: Thumbnails Not Generating / Low Quality

#### What EXISTS in the codebase:

**Backend Services (GOOD):**
```
packages/desktop/electron/services/thumbnail-service.ts
├── generateAllSizes(sourcePath, hash) - Creates 400px, 800px, 1920px
├── generateSize() - Quality: 85-90% JPEG
├── generateBatch() - Batch processing
└── allThumbnailsExist(hash) - Check existence
```

**IPC Handler (GOOD):**
```
packages/desktop/electron/main/ipc-handlers/media-processing.ts
├── media:generateThumbnail - Single file
├── media:regenerateAllThumbnails - Batch regeneration
└── Handles RAW files correctly (extracts preview first)
```

**Three-Tier System (per Kanye6):**
- `thumb_path_sm` (400px) - Grid view
- `thumb_path_lg` (800px) - HiDPI displays
- `preview_path` (1920px) - Lightbox/detail

#### What is BROKEN:

**ROOT CAUSE:** The import flow saves files but NEVER calls thumbnail generation.

Looking at the import service flow:
1. Files are copied to archive ✓
2. EXIF metadata is extracted ✓
3. Database records are created ✓
4. **Thumbnails are NOT generated** ✗

The `media:regenerateAllThumbnails` handler exists for MANUAL regeneration, but there's no AUTOMATIC thumbnail generation during import.

**WHY Legacy 256px Thumbnails Exist:**
- Old `generateThumbnail()` method (legacy) created 256px thumbnails
- Database has `thumb_path` column for these legacy thumbs
- New 3-tier system added `thumb_path_sm`, `thumb_path_lg`, `preview_path` columns
- **OLD IMPORTS** only have `thumb_path` (256px) - explains low quality

#### FIX REQUIRED:

```typescript
// In import flow, AFTER file copy and EXIF extraction:
// 1. For RAW files: Extract preview first
if (previewExtractorService.isRawFormat(filePath)) {
  await previewExtractorService.extractPreview(archivePath, hash);
}

// 2. Generate all thumbnail sizes
const sourceForThumbnails = previewPath || archivePath;
await thumbnailService.generateAllSizes(sourceForThumbnails, hash);
```

---

### ISSUE 3: GPS Missing From Address-Only Imports

#### What EXISTS:

**Forward Geocoding (Address → GPS) - IMPLEMENTED:**
```typescript
// packages/desktop/electron/services/geocoding-service.ts:233-268
async forwardGeocode(address: string): Promise<GeocodingResult | null> {
  // Uses Nominatim /search endpoint
  // Limited to US (countrycodes: 'us')
  // Returns lat/lng + full address
}
```

**IPC Handler - IMPLEMENTED:**
```typescript
// packages/desktop/electron/main/ipc-handlers/geocode.ts:50-74
ipcMain.handle('geocode:forward', async (_, address: string) => {
  // Validates address (3-500 chars)
  // Calls geocodingService.forwardGeocode()
})
```

#### What is BROKEN:

**ROOT CAUSE:** Forward geocoding is NEVER CALLED during import or location creation.

When importing Mary McAllen shots with address but no GPS:
1. EXIF data extracted - no GPS coordinates in EXIF ✓
2. Address provided manually by user ✓
3. Location created with address only ✓
4. **Forward geocoding NEVER triggered** ✗
5. Map shows nothing (needs GPS coordinates)

The code EXISTS but nothing TRIGGERS it.

#### FIX REQUIRED:

Add automatic forward geocoding when:
1. Location has address but no GPS
2. After manual address entry
3. On location save/update

```typescript
// When saving location with address but no GPS:
if (address && !gps) {
  const fullAddress = `${address.street}, ${address.city}, ${address.state} ${address.zipcode}`;
  const result = await window.electronAPI.geocode.forward(fullAddress);
  if (result) {
    // Update location with GPS from forward geocoding
    await window.electronAPI.locations.update(locationId, {
      gps_lat: result.lat,
      gps_lng: result.lng,
      gps_source: 'geocoded_address'
    });
  }
}
```

---

### ISSUE 4 & 6: Map Not Showing / Not Zooming to Address

#### What EXISTS:

**Map Component (GOOD):**
```
packages/desktop/src/components/Map.svelte
├── Leaflet integration
├── Multiple tile layers (satellite, street, topo)
├── Clustering support
├── State capital fallback (50 states)
└── Heat map visualization
```

**State Capital Fallback (lines 10-62):**
```typescript
const STATE_CAPITALS = {
  'AL': { name: 'Montgomery', lat: 32.377716, lng: -86.300568 },
  'NY': { name: 'Albany', lat: 42.652580, lng: -73.756232 },
  // ... all 50 states
};
```

#### What is BROKEN:

**ROOT CAUSE 1:** Map component requires GPS coordinates. When location has address but no GPS, map uses state capital fallback - NOT the actual address.

**ROOT CAUSE 2:** No zoom control. Map uses default zoom, not "highest zoom level" to show exact address.

**Current Flow (BROKEN):**
```
Location has address + no GPS
  → getBestCoordinates() called
    → No exact GPS found
      → Falls back to state capital
        → Shows "Approximate (NY)" at Albany
          → User sees map 200 miles away from actual address
```

**Desired Flow (FIXED):**
```
Location has address + no GPS
  → Forward geocode the address
    → Get actual GPS coordinates
      → Show map at EXACT address
        → Zoom to highest level (18-19)
```

#### FIX REQUIRED:

1. **Trigger forward geocoding** before map display
2. **Set zoom level to 18** (building-level) for address-based locations
3. **Update getBestCoordinates()** to forward geocode as needed

```typescript
// In getBestCoordinates or map component:
async function getCoordinatesForLocation(location) {
  // 1. Check for exact GPS first
  if (location.gps_lat && location.gps_lng) {
    return { lat: location.gps_lat, lng: location.gps_lng, zoom: 16 };
  }

  // 2. No GPS but have address? Forward geocode!
  if (location.address?.street) {
    const result = await forwardGeocode(formatFullAddress(location.address));
    if (result) {
      return { lat: result.lat, lng: result.lng, zoom: 18 }; // HIGH ZOOM
    }
  }

  // 3. Fallback to state capital
  if (location.address?.state) {
    const capital = STATE_CAPITALS[location.address.state];
    return { lat: capital.lat, lng: capital.lng, zoom: 6, approximate: true };
  }

  // 4. Ultimate fallback: US center
  return { lat: 39.8283, lng: -98.5795, zoom: 4, approximate: true };
}
```

---

### ISSUE 5: Address Display is Sloppy

#### Current Display (BROKEN):
```
Address

99 Myrtle Avenue Village Of Cambridge, NY 12816
Washington County
```

**Problems:**
1. "Village Of Cambridge" should just be "Cambridge"
2. Some parts clickable, some not - inconsistent
3. Not properly formatted as separate clickable components
4. No "open on map" link for street address

#### Desired Display (per user):
```
99 Myrtle Avenue  [click to open on map]
Cambridge  [clickable filter]
NY  [clickable filter]
12816  [clickable filter]
Washington County  [clickable filter]
```

#### What EXISTS:

**Address Normalizer (GOOD):**
```typescript
// packages/desktop/electron/services/address-normalizer.ts
normalizeCity(city) - Trims and title-cases
```

**Display Helper (PARTIAL):**
```typescript
// packages/desktop/src/lib/display-helpers.ts:155-158
getDisplayCity(city) {
  // Removes "Village of", "City of", "Town of" prefixes
}
```

**LocationAddress Component (NEEDS WORK):**
```typescript
// packages/desktop/src/components/location/LocationAddress.svelte
// Currently: Inline display, mixed clickability
```

#### FIX REQUIRED:

Rewrite `LocationAddress.svelte` for consistent, clickable formatting:

```svelte
<script>
  export let address;
  export let onOpenMap = () => {};

  function getDisplayCity(city) {
    if (!city) return '';
    return city
      .replace(/^(Village Of|City Of|Town Of)\s+/i, '')
      .trim();
  }
</script>

<div class="address-display">
  {#if address.street}
    <div class="address-line street">
      <span class="address-value">{address.houseNumber} {address.street}</span>
      <button class="map-link" on:click={() => onOpenMap(address)}>
        Open on map
      </button>
    </div>
  {/if}

  {#if address.city}
    <a href="/locations?city={encodeURIComponent(getDisplayCity(address.city))}"
       class="address-link">
      {getDisplayCity(address.city)}
    </a>
  {/if}

  {#if address.state}
    <a href="/locations?state={address.state}" class="address-link">
      {address.state}
    </a>
  {/if}

  {#if address.zipcode}
    <a href="/locations?zipcode={address.zipcode}" class="address-link">
      {address.zipcode}
    </a>
  {/if}

  {#if address.county}
    <a href="/locations?county={encodeURIComponent(address.county)}"
       class="address-link">
      {address.county}
    </a>
  {/if}
</div>
```

---

### ISSUE 7: NEF Files Show "Cannot display this file format in browser"

#### What EXISTS:

**Preview Extractor Service (GOOD):**
```typescript
// packages/desktop/electron/services/preview-extractor-service.ts
├── isRawFormat(filePath) - Detects 40+ RAW formats including NEF
├── extractPreview(sourcePath, hash) - Extracts embedded JPEG
├── extractBatch(items) - Batch processing
└── Storage: .previews/ab/abcd1234.jpg
```

**How It Works:**
1. RAW files (NEF, CR2, etc.) contain embedded JPEG previews
2. ExifTool extracts these previews in <1 second
3. Preview stored as JPEG in `.previews/` directory
4. Thumbnails generated FROM the preview (not from RAW)

#### What is BROKEN:

**ROOT CAUSE:** Import flow NEVER calls `extractPreview()` for RAW files.

**Current Import Flow (BROKEN):**
```
1. NEF file detected → ext is .nef
2. File copied to archive → ✓
3. EXIF extracted → ✓
4. Database record created with file_path = .../abc123.nef → ✓
5. preview_path = NULL → ✗
6. thumb_path_* = NULL → ✗
7. Frontend tries to display .nef → FAILS
8. Error: "Cannot display this file format in browser"
```

**Correct Flow (FIXED):**
```
1. NEF file detected → ext is .nef
2. File copied to archive → ✓
3. EXIF extracted → ✓
4. Preview extracted → .previews/ab/abc123.jpg → ✓ (NEW)
5. Thumbnails generated from preview → ✓ (NEW)
6. Database record created with:
   - file_path = .../abc123.nef
   - preview_path = .previews/ab/abc123.jpg → ✓
   - thumb_path_sm = .thumbnails/ab/abc123_400.jpg → ✓
   - thumb_path_lg = .thumbnails/ab/abc123_800.jpg → ✓
7. Frontend displays thumbnail/preview → SUCCESS
```

#### FIX REQUIRED:

Add to import flow:

```typescript
// After file copy, BEFORE database insert:
let previewPath = null;
let thumbPaths = { sm: null, lg: null };

// 1. Extract preview for RAW files
if (previewExtractorService.isRawFormat(archivePath)) {
  previewPath = await previewExtractorService.extractPreview(archivePath, hash);
}

// 2. Generate thumbnails (from preview if RAW, from original if JPEG/PNG)
const sourceForThumbs = previewPath || archivePath;
const thumbResult = await thumbnailService.generateAllSizes(sourceForThumbs, hash);
if (thumbResult) {
  thumbPaths.sm = thumbResult.small;
  thumbPaths.lg = thumbResult.large;
}

// 3. Insert into database with all paths
await mediaRepository.create({
  imgsha: hash,
  file_path: archivePath,
  preview_path: previewPath,
  thumb_path_sm: thumbPaths.sm,
  thumb_path_lg: thumbPaths.lg,
  // ... other fields
});
```

---

### ISSUE 8: Hero Image Selection - How Does It Work?

#### GOOD NEWS: Feature ALREADY EXISTS!

**Database Schema (Migration 10):**
```sql
ALTER TABLE locs ADD COLUMN hero_imgsha TEXT;
```

**UI Components:**
- `LocationHero.svelte` - Displays the hero image
- `LocationGallery.svelte` - Shows "Set as Hero" button on hover

**How to Use (Current - but not obvious):**
1. Go to a location detail page
2. Scroll to image gallery
3. **Hover over any image**
4. Click "Set as Hero" button that appears

#### What is BROKEN:

**ROOT CAUSE:** UI is not discoverable. "Set as Hero" only appears on hover, no visual indicator that feature exists.

#### FIX REQUIRED (UX Improvement):

1. Add "Hero" badge more prominently on current hero
2. Add explicit "Change Hero Image" button in gallery header
3. Add tooltip: "Hover over any image to set as hero"

```svelte
<!-- LocationGallery.svelte enhancement -->
<div class="gallery-header">
  <h3>Gallery ({images.length})</h3>
  <span class="hero-hint">Hover any image to set as hero</span>
</div>
```

---

### ISSUE 9: Darktable Not Set Up

#### ANSWER: DARKTABLE IS NOT NEEDED

The codebase uses **ExifTool preview extraction** instead of Darktable conversion.

**Why This Is Better:**
| Method | Time | Quality | Complexity |
|--------|------|---------|------------|
| ExifTool Preview Extract | <1 sec | Camera-generated JPEG | Simple |
| Darktable Conversion | 2-5 sec | Custom processing | Complex |
| LibRAW Conversion | 1-3 sec | Custom processing | Medium |

**What ExifTool Does:**
- Extracts the **embedded JPEG preview** that cameras store in RAW files
- This preview is generated BY THE CAMERA at capture time
- It's typically 1920x1280 or larger - plenty for viewing
- The original RAW is preserved for professional editing

**For a Premium Archive:**
- Original RAW files are preserved unmodified ✓
- Fast preview extraction for browsing ✓
- No external tool dependencies ✓
- XMP sidecars supported for metadata ✓

**If User Wants Full RAW Conversion Later:**
- Export RAW to external editor (Darktable, Lightroom, etc.)
- Edit and export JPEG/TIFF
- Re-import the edited version

**CONCLUSION:** Darktable integration is NOT required. Current ExifTool approach is correct.

---

## Implementation Guide for Inexperienced Coder

### Priority Order

1. **FIX RAW PREVIEW EXTRACTION** (Issue 7) - Critical
2. **FIX THUMBNAIL GENERATION** (Issues 1, 2) - Critical
3. **FIX FORWARD GEOCODING TRIGGER** (Issue 3) - High
4. **FIX MAP FOR ADDRESS-ONLY** (Issues 4, 6) - High
5. **FIX ADDRESS DISPLAY** (Issue 5) - Medium
6. **IMPROVE HERO IMAGE UX** (Issue 8) - Low

---

### FIX 1: RAW Preview Extraction During Import

**File to Modify:** `packages/desktop/electron/services/file-import-service.ts`

**Find the section where files are imported and database records are created.**

**Add this code AFTER the file is copied to archive, BEFORE database insert:**

```typescript
// Import these at top of file if not already imported
import { PreviewExtractorService } from '../services/preview-extractor-service';
import { ThumbnailService } from '../services/thumbnail-service';

const previewExtractor = new PreviewExtractorService();
const thumbnailService = new ThumbnailService();

// In the import function, after copying file:
async function processImportedFile(archivePath: string, hash: string) {
  let previewPath: string | null = null;
  let thumbPaths = { sm: null, lg: null, preview: null };

  // Step 1: For RAW files, extract the embedded preview
  if (previewExtractor.isRawFormat(archivePath)) {
    console.log(`[Import] Extracting preview from RAW: ${archivePath}`);
    previewPath = await previewExtractor.extractPreview(archivePath, hash);
    if (previewPath) {
      console.log(`[Import] Preview extracted: ${previewPath}`);
    } else {
      console.warn(`[Import] Failed to extract preview from: ${archivePath}`);
    }
  }

  // Step 2: Generate thumbnails from the best available source
  // For RAW files: use the extracted preview
  // For JPEG/PNG: use the original file
  const thumbnailSource = previewPath || archivePath;

  console.log(`[Import] Generating thumbnails from: ${thumbnailSource}`);
  const thumbResult = await thumbnailService.generateAllSizes(thumbnailSource, hash);

  if (thumbResult) {
    thumbPaths.sm = thumbResult.small;     // 400px
    thumbPaths.lg = thumbResult.large;     // 800px
    thumbPaths.preview = thumbResult.preview; // 1920px
    console.log(`[Import] Thumbnails generated successfully`);
  }

  // Step 3: Return paths for database insert
  return {
    preview_path: previewPath,
    thumb_path_sm: thumbPaths.sm,
    thumb_path_lg: thumbPaths.lg,
    // preview_path doubles as large preview for lightbox
  };
}
```

---

### FIX 2: Forward Geocoding When Address Has No GPS

**File to Modify:** `packages/desktop/src/pages/LocationDetail.svelte`

**Add automatic forward geocoding when location loads with address but no GPS:**

```typescript
// In the script section, add this function:
async function ensureGpsFromAddress() {
  if (!location) return;

  // Skip if we already have GPS coordinates
  if (location.gps_lat && location.gps_lng) return;

  // Skip if no address to geocode from
  const addr = location.address;
  if (!addr?.street && !addr?.city) return;

  // Build address string for geocoding
  const parts = [];
  if (addr.houseNumber && addr.street) {
    parts.push(`${addr.houseNumber} ${addr.street}`);
  } else if (addr.street) {
    parts.push(addr.street);
  }
  if (addr.city) parts.push(addr.city);
  if (addr.state) parts.push(addr.state);
  if (addr.zipcode) parts.push(addr.zipcode);

  const fullAddress = parts.join(', ');
  if (parts.length < 2) return; // Need at least 2 parts for reliable geocoding

  console.log(`[Geocode] Forward geocoding: ${fullAddress}`);

  try {
    const result = await window.electronAPI.geocode.forward(fullAddress);
    if (result && result.lat && result.lng) {
      console.log(`[Geocode] Got coordinates: ${result.lat}, ${result.lng}`);

      // Update location with GPS coordinates
      await window.electronAPI.locations.update(location.locid, {
        gps_lat: result.lat,
        gps_lng: result.lng,
        gps_source: 'geocoded_address'
      });

      // Reload location to show updated map
      await loadLocation();
    }
  } catch (err) {
    console.error('[Geocode] Forward geocoding failed:', err);
  }
}

// Call this after loading the location
onMount(async () => {
  await loadLocation();
  await ensureGpsFromAddress(); // ADD THIS LINE
});
```

---

### FIX 3: Map Zoom to Exact Address

**File to Modify:** `packages/desktop/src/components/location/LocationMapSection.svelte`

**Update the map display to use high zoom for geocoded addresses:**

```typescript
// Add zoom level prop to map component
$: mapZoom = (() => {
  if (!location?.gps) return 4; // No GPS - default zoom

  // High zoom for exact addresses (geocoded or EXIF GPS)
  const source = location.gps.source || '';
  if (source === 'geocoded_address' || source === 'exif' || source === 'media_gps') {
    return 18; // Building-level zoom
  }

  // Medium zoom for other GPS sources
  if (location.gps.lat && location.gps.lng) {
    return 15;
  }

  // Low zoom for approximate/state capital fallback
  return 6;
})();

// Pass to Map component:
<Map
  locations={[location]}
  zoom={mapZoom}
  center={[location.gps.lat, location.gps.lng]}
/>
```

---

### FIX 4: Clean Address Display

**File to Modify:** `packages/desktop/src/components/location/LocationAddress.svelte`

**Replace the entire component with this cleaner version:**

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';

  export let address: {
    houseNumber?: string;
    street?: string;
    city?: string;
    state?: string;
    zipcode?: string;
    county?: string;
  };
  export let onOpenMap: (() => void) | null = null;

  function getDisplayCity(city: string | undefined): string {
    if (!city) return '';
    // Remove administrative prefixes
    return city
      .replace(/^(Village Of|City Of|Town Of|Borough Of|Township Of)\s+/i, '')
      .trim();
  }

  function filterByField(field: string, value: string) {
    goto(`/locations?${field}=${encodeURIComponent(value)}`);
  }

  $: displayCity = getDisplayCity(address?.city);
  $: streetDisplay = [address?.houseNumber, address?.street]
    .filter(Boolean)
    .join(' ');
</script>

{#if address}
<div class="address-display">
  <!-- Street Address with Map Link -->
  {#if streetDisplay}
    <div class="address-row street-row">
      <span class="street-address">{streetDisplay}</span>
      {#if onOpenMap}
        <button class="map-link" on:click={onOpenMap} title="View on map">
          Open on map
        </button>
      {/if}
    </div>
  {/if}

  <!-- City, State, Zip - Each Clickable -->
  <div class="address-row location-row">
    {#if displayCity}
      <button class="address-link" on:click={() => filterByField('city', displayCity)}>
        {displayCity}
      </button>
    {/if}

    {#if address.state}
      <button class="address-link" on:click={() => filterByField('state', address.state)}>
        {address.state}
      </button>
    {/if}

    {#if address.zipcode}
      <button class="address-link" on:click={() => filterByField('zipcode', address.zipcode)}>
        {address.zipcode}
      </button>
    {/if}
  </div>

  <!-- County - Clickable -->
  {#if address.county}
    <div class="address-row county-row">
      <button class="address-link" on:click={() => filterByField('county', address.county)}>
        {address.county}
      </button>
    </div>
  {/if}
</div>
{/if}

<style>
  .address-display {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .address-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .street-address {
    font-weight: 600;
    font-size: 1rem;
  }

  .map-link {
    background: none;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    padding: 0.125rem 0.5rem;
    font-size: 0.75rem;
    color: var(--color-primary);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .map-link:hover {
    background: var(--color-primary);
    color: white;
  }

  .address-link {
    background: none;
    border: none;
    padding: 0;
    color: var(--color-link);
    cursor: pointer;
    text-decoration: underline;
    text-decoration-style: dotted;
    text-underline-offset: 2px;
  }

  .address-link:hover {
    color: var(--color-link-hover);
    text-decoration-style: solid;
  }

  .location-row .address-link:not(:last-child)::after {
    content: ',';
    margin-right: 0.25rem;
  }
</style>
```

---

### FIX 5: Hero Image UX Improvement

**File to Modify:** `packages/desktop/src/components/location/LocationGallery.svelte`

**Add a hint about hero selection:**

```svelte
<!-- In the gallery header section -->
<div class="gallery-header">
  <h3>Images ({images.length})</h3>
  {#if images.length > 0}
    <span class="hero-hint" title="Hover over any image and click 'Set as Hero'">
      Tip: Hover any image to set as hero
    </span>
  {/if}
</div>

<style>
  .hero-hint {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    font-style: italic;
  }
</style>
```

---

### FIX 6: Batch Regeneration for Existing Files

**Create a migration/utility to regenerate thumbnails for existing imports:**

**File:** `packages/desktop/electron/scripts/regenerate-all-thumbnails.ts`

```typescript
/**
 * Run this script to regenerate all thumbnails for existing imports.
 * This fixes Issue 1 (thumbnails not showing) and Issue 2 (low quality).
 *
 * Usage: npx tsx packages/desktop/electron/scripts/regenerate-all-thumbnails.ts
 */

import { ThumbnailService } from '../services/thumbnail-service';
import { PreviewExtractorService } from '../services/preview-extractor-service';
import { getDatabase } from '../main/database';

async function regenerateAllThumbnails() {
  const db = await getDatabase();
  const thumbnailService = new ThumbnailService();
  const previewExtractor = new PreviewExtractorService();

  // Find all media without the new 3-tier thumbnails
  const mediaToProcess = await db
    .selectFrom('media')
    .select(['imgsha', 'file_path', 'preview_path'])
    .where('thumb_path_sm', 'is', null)
    .execute();

  console.log(`Found ${mediaToProcess.length} files needing thumbnail regeneration`);

  let processed = 0;
  let failed = 0;

  for (const media of mediaToProcess) {
    try {
      let sourceForThumbs = media.preview_path || media.file_path;

      // For RAW files without preview, extract it first
      if (!media.preview_path && previewExtractor.isRawFormat(media.file_path)) {
        const previewPath = await previewExtractor.extractPreview(
          media.file_path,
          media.imgsha
        );
        if (previewPath) {
          sourceForThumbs = previewPath;
          // Update preview_path in database
          await db
            .updateTable('media')
            .set({ preview_path: previewPath })
            .where('imgsha', '=', media.imgsha)
            .execute();
        }
      }

      // Generate all thumbnail sizes
      const result = await thumbnailService.generateAllSizes(sourceForThumbs, media.imgsha);

      if (result) {
        await db
          .updateTable('media')
          .set({
            thumb_path_sm: result.small,
            thumb_path_lg: result.large,
          })
          .where('imgsha', '=', media.imgsha)
          .execute();

        processed++;
        console.log(`[${processed}/${mediaToProcess.length}] Processed: ${media.imgsha}`);
      } else {
        failed++;
        console.warn(`[FAILED] Could not generate thumbnails for: ${media.imgsha}`);
      }
    } catch (err) {
      failed++;
      console.error(`[ERROR] ${media.imgsha}:`, err);
    }
  }

  console.log(`\nComplete!`);
  console.log(`  Processed: ${processed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total: ${mediaToProcess.length}`);
}

regenerateAllThumbnails().catch(console.error);
```

---

## Verification Checklist

After implementing fixes, verify:

- [ ] Import a NEF file → Preview extracted → Thumbnails generated → Displays in app
- [ ] Import a JPEG → Thumbnails at 400px, 800px, 1920px → Displays in grid
- [ ] Create location with address only → Forward geocoding triggers → GPS populated
- [ ] View location with address → Map shows at EXACT address → Zoom level 18
- [ ] Address display shows: Street [Open on map] | City | State | Zip | County (all clickable)
- [ ] Run regenerate script → Old imports get new thumbnails
- [ ] Hero image selection → Hover image → "Set as Hero" → Works

---

## Files Modified Summary

| File | Changes |
|------|---------|
| `packages/desktop/electron/services/file-import-service.ts` | Add preview extraction + thumbnail generation |
| `packages/desktop/src/pages/LocationDetail.svelte` | Add forward geocoding on load |
| `packages/desktop/src/components/location/LocationMapSection.svelte` | Add dynamic zoom level |
| `packages/desktop/src/components/location/LocationAddress.svelte` | Complete rewrite for clean UX |
| `packages/desktop/src/components/location/LocationGallery.svelte` | Add hero hint |
| `packages/desktop/electron/scripts/regenerate-all-thumbnails.ts` | NEW - batch regeneration |

---

## Conclusion

The AU Archive codebase has **solid infrastructure** but **poor integration**. The thumbnail service works, the geocoding service works, the map component works - they just aren't connected properly during the import flow.

**Key Insight:** This is a WIRING problem, not a CAPABILITY problem. The fixes above are about connecting existing pieces, not building new ones.

**Estimated Code Changes:** ~200 lines of new/modified code across 6 files.

**No Darktable Needed:** ExifTool preview extraction is the correct approach for an archive application.
