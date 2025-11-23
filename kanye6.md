# KANYE6: ULTRATHINK Premium Archive Deep Dive

**Version:** 6.0.0
**Created:** 2025-11-23
**Status:** COMPREHENSIVE AUDIT + IMPLEMENTATION PLAN
**Type:** Root Cause Analysis, Architecture Review, Implementation Guide

---

## EXECUTIVE SUMMARY

### The User's Core Complaints (Verbatim)

1. **"Thumbnails are not generating on the pages, and the ones that are there are so low quality"**
2. **"No GPS? We uploaded the Mary McAllen shots and got an address but no GPS"**
3. **"Why isn't the map showing based on an address? It SHOULD DO BOTH"**
4. **"The entire street address looks sloppy"**
5. **"Why does the map not zoom in to this exact address at the highest zoom level"**
6. **"Cannot display this file format in browser - .nef"**
7. **"How do we select a hero image?"**
8. **"Do we have libpostal set up yet?"**

### Current State vs User Expectations

| Feature | User Expects | Current Reality | Root Cause |
|---------|--------------|-----------------|------------|
| Thumbnails | Crisp, visible images | **WORKS** (if imported recently) | Multi-tier implemented but OLD imports need regeneration |
| GPS from Address | Auto-convert address to GPS | **NOT IMPLEMENTED** | Forward geocode exists but NOT auto-triggered |
| Map from Address | Zoom to exact street address | Shows STATE CAPITAL fallback | Forward geocoding not auto-run on location load |
| Address Display | Clean, clickable, map link | **WORKS** (per kanye3) | Already fixed |
| Address -> Map Zoom | Highest zoom on exact address | State capital, low zoom | Need to forward geocode THEN zoom |
| NEF Display | See RAW images in app | "Cannot display" error | Browser can't render NEF; need to show PREVIEW instead |
| Hero Image | Select featured thumbnail | **NOT IMPLEMENTED** | No hero_image field or UI |
| Libpostal | Advanced address parsing | **NOT INSTALLED** | Only referenced in docs |

---

## ULTRATHINK: ARCHITECTURE DEEP DIVE

### Data Flow Analysis

```
FILE IMPORT FLOW (Currently Working):
┌─────────────────────────────────────────────────────────────────────────────┐
│ User drops files                                                             │
│ ↓                                                                            │
│ file-import-service.ts                                                       │
│ ├── Hash file (SHA256)                                                       │
│ ├── Detect file type (image/video/document)                                  │
│ │                                                                            │
│ ├── IF IMAGE:                                                                │
│ │   ├── Extract EXIF metadata (exiftool-service.ts)                         │
│ │   ├── Extract GPS from EXIF if present                                     │
│ │   ├── IF RAW FORMAT (NEF, CR2, etc):                                       │
│ │   │   └── Extract embedded JPEG preview (preview-extractor-service.ts)    │
│ │   │       └── Save to .previews/[bucket]/[hash].jpg                       │
│ │   ├── Generate multi-tier thumbnails (thumbnail-service.ts)               │
│ │   │   ├── 400px → .thumbnails/[bucket]/[hash]_400.jpg                     │
│ │   │   ├── 800px → .thumbnails/[bucket]/[hash]_800.jpg                     │
│ │   │   └── 1920px → .thumbnails/[bucket]/[hash]_1920.jpg                   │
│ │   └── Source for thumbnails: preview (if RAW) OR original file            │
│ │                                                                            │
│ ├── IF VIDEO:                                                                │
│ │   ├── Extract poster frame (ffmpeg-service.ts)                            │
│ │   └── Generate thumbnails from poster frame                               │
│ │                                                                            │
│ ├── Copy to archive folder                                                   │
│ ├── Save to database with ALL paths:                                         │
│ │   ├── thumb_path (legacy 256px - deprecated)                              │
│ │   ├── thumb_path_sm (400px)                                               │
│ │   ├── thumb_path_lg (800px)                                               │
│ │   └── preview_path (1920px)                                               │
│ └── DONE                                                                     │
└─────────────────────────────────────────────────────────────────────────────┘

LOCATION DISPLAY FLOW (Partially Working):
┌─────────────────────────────────────────────────────────────────────────────┐
│ User opens location detail                                                   │
│ ↓                                                                            │
│ LocationDetail.svelte                                                        │
│ ├── Load location from database                                              │
│ ├── Load media (images, videos, docs)                                        │
│ │                                                                            │
│ ├── THUMBNAIL DISPLAY:                                                       │
│ │   ├── IF image.thumb_path_sm exists:                                       │
│ │   │   └── Show <img src="media://[thumb_path_sm]" srcset="...">  WORKS!   │
│ │   └── ELSE: Show gray placeholder SVG                                      │
│ │                                                                            │
│ ├── MAP DISPLAY:                                                             │
│ │   ├── IF location.gps exists: Show map at exact GPS              WORKS!   │
│ │   ├── ELSE IF location.address.state exists:                               │
│ │   │   └── Show map at STATE CAPITAL (approximate)                WORKS!   │
│ │   └── ELSE: Show "No location data" prompt                                │
│ │                                                                            │
│ └── ADDRESS DISPLAY:                                                         │
│     ├── Street (bold)                                                        │
│     ├── City, State ZIP (clickable filters)                                  │
│     ├── County (subtle)                                                      │
│     └── Copy button                                                 WORKS!   │
└─────────────────────────────────────────────────────────────────────────────┘

GPS FROM ADDRESS FLOW (NOT IMPLEMENTED):
┌─────────────────────────────────────────────────────────────────────────────┐
│ Location has address "99 Myrtle Avenue, Cambridge, NY 12816"                │
│ Location has NO GPS coordinates                                              │
│ ↓                                                                            │
│ WHAT SHOULD HAPPEN:                                                          │
│ ├── On location load, detect: has address but no GPS                        │
│ ├── Call geocodingService.forwardGeocode(addressString)          EXISTS!    │
│ ├── Save returned GPS to location record                                     │
│ ├── Map now shows at EXACT address (not state capital)                      │
│ └── Badge shows "GPS from geocoding"                                        │
│                                                                              │
│ WHAT ACTUALLY HAPPENS:                                                       │
│ ├── Location loads                                                          │
│ ├── No GPS → falls back to state capital                                    │
│ ├── Map shows Albany, NY (state capital) at low zoom                        │
│ └── User sees approximate location, NOT their street address                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## ISSUE #1: THUMBNAILS - ANALYSIS

### Status: IMPLEMENTED BUT MAY NEED REGENERATION

**Code Path Verified:**
- `file-import-service.ts:496` - Calls `thumbnailService.generateAllSizes()`
- `thumbnail-service.ts:43-82` - Generates 400px, 800px, 1920px
- `LocationDetail.svelte:1073-1084` - Displays with srcset for HiDPI

**Why User Might Still See Issues:**

1. **OLD IMPORTS** - Files imported before multi-tier implementation only have 256px thumb_path
2. **RAW FILES** - If preview extraction failed, thumbnail generation has no source
3. **CACHE** - Browser may be showing cached placeholder

**Verification Query:**
```sql
-- Check for images missing new thumbnails
SELECT imgsha, imgnam, thumb_path, thumb_path_sm, thumb_path_lg, preview_path
FROM imgs
WHERE thumb_path_sm IS NULL
LIMIT 10;
```

**FIX NEEDED:**
- Add "Regenerate Thumbnails" button in Settings
- Run batch regeneration for all images missing thumb_path_sm

---

## ISSUE #2: GPS FROM ADDRESS - NOT AUTO-TRIGGERED

### Status: SERVICE EXISTS, NOT WIRED UP

**What We Have:**
- `geocoding-service.ts:233-268` - `forwardGeocode()` function EXISTS and WORKS
- `ipc-handlers/geocode.ts:50-74` - IPC handler `geocode:forward` EXISTS
- `preload/index.ts:101` - Frontend API exposed

**What's Missing:**
- NO automatic trigger when location has address but no GPS
- NO call from LocationDetail.svelte to get GPS from address

**THE GAP:**
```typescript
// This code DOES NOT EXIST anywhere:
if (location.address && !location.gps) {
  const gps = await window.electronAPI.geocode.forward(buildAddressString(location.address));
  if (gps) {
    await window.electronAPI.locations.update(location.locid, {
      gps_lat: gps.lat,
      gps_lng: gps.lng,
      gps_source: 'geocoded_address'
    });
  }
}
```

### FIX REQUIRED

Add auto-geocoding on location detail load:

```typescript
// LocationDetail.svelte - onMount or loadLocation()
async function ensureGpsFromAddress() {
  if (!location) return;

  // Already has GPS? Skip
  if (location.gps?.lat && location.gps?.lng) return;

  // No address to geocode? Skip
  if (!location.address?.street && !location.address?.city) return;

  // Build address string
  const addressParts = [
    location.address.street,
    location.address.city,
    location.address.state,
    location.address.zipcode
  ].filter(Boolean);

  if (addressParts.length === 0) return;

  const addressString = addressParts.join(', ');

  try {
    const result = await window.electronAPI.geocode.forward(addressString);

    if (result?.lat && result?.lng) {
      // Update location with geocoded GPS
      await window.electronAPI.locations.update(location.locid, {
        gps_lat: result.lat,
        gps_lng: result.lng,
        gps_source: 'geocoded_address'
      });

      // Reload location to get updated GPS
      await loadLocation();
    }
  } catch (error) {
    console.error('Forward geocoding failed:', error);
  }
}
```

---

## ISSUE #3: MAP NOT ZOOMING TO EXACT ADDRESS

### Status: FALLS BACK TO STATE CAPITAL, LOW ZOOM

**Current Behavior:**
1. Location has address "99 Myrtle Avenue, Cambridge, NY 12816" but no GPS
2. `LocationDetail.svelte:888-907` - Falls back to state capital
3. Map.svelte shows Albany, NY (state capital) at zoom level ~7

**Why This Happens:**
- Map.svelte `getLocationCoordinates()` checks `location.gps` first
- If no GPS, falls back to `STATE_CAPITALS[state]`
- Never attempts to geocode the full address

**Premium Archive Should:**
1. Forward geocode full address → get exact GPS
2. Map zooms to THAT GPS at zoom level 17+ (street level)
3. Show "GPS from address" badge

**FIX:** Same as Issue #2 - once forward geocoding auto-triggers, map will zoom to exact address.

**ADDITIONAL FIX NEEDED - Map Zoom Level:**
```typescript
// Map.svelte - When showing single location detail, zoom higher
if (locations.length === 1 && locations[0].gps) {
  map.setView([locations[0].gps.lat, locations[0].gps.lng], 17); // Street level
}
```

---

## ISSUE #4: NEF FILES "CANNOT DISPLAY IN BROWSER"

### Status: EXPECTED BEHAVIOR - NEED TO SHOW PREVIEW

**Why This Happens:**
- `.nef` is Nikon RAW format
- Browsers cannot render RAW files natively
- User sees "Cannot display this file format in browser"

**What We Already Have:**
- `preview-extractor-service.ts` - Extracts embedded JPEG from NEF
- Preview saved to `.previews/[bucket]/[hash].jpg`
- Database column `preview_path` stores this path

**THE GAP:**
When opening a file in MediaViewer that's a RAW format:
- We should show the `preview_path` image, NOT the original NEF
- MediaViewer currently tries to load original file path

**FIX NEEDED in MediaViewer.svelte:**
```typescript
// Get the best displayable source for an item
function getDisplaySource(item: MediaItem): string {
  // For RAW files, use preview if available
  const isRaw = /\.(nef|cr2|cr3|arw|orf|dng|raw|pef|raf)$/i.test(item.path);

  if (isRaw && item.previewPath) {
    return `media://${item.previewPath}`;
  }

  // For regular images/videos, use original
  return `media://${item.path}`;
}
```

---

## ISSUE #5: HERO IMAGE SELECTION

### Status: NOT IMPLEMENTED

**User Request:**
> "How do we select a hero image?"

**What a Hero Image Is:**
- Featured/primary thumbnail for a location
- Shows in location cards, lists, exports
- User-selected from imported images

**Current State:**
- No `hero_image` field in `locs` table
- No UI to select a hero image
- Location cards show first image or placeholder

**IMPLEMENTATION REQUIRED:**

1. **Database Migration:**
```sql
ALTER TABLE locs ADD COLUMN hero_imgsha TEXT REFERENCES imgs(imgsha);
```

2. **UI Component:**
```svelte
<!-- In image grid, right-click or button to "Set as Hero" -->
<button onclick={() => setHeroImage(image.imgsha)}>
  Set as Hero Image
</button>
```

3. **Display:**
```svelte
<!-- In location cards -->
{#if location.hero_imgsha}
  <img src={`media://${heroImageThumbPath}`} />
{:else if firstImage}
  <img src={`media://${firstImage.thumb_path_sm}`} />
{:else}
  <PlaceholderSVG />
{/if}
```

---

## ISSUE #6: LIBPOSTAL STATUS

### Status: NOT INSTALLED

**User Request:**
> "Do we have libpostal set up yet?"

**What Libpostal Is:**
- Open source library for parsing/normalizing addresses
- Handles messy address formats: "99 Myrtle Ave Village of Cambridge" → structured data
- Used by major tech companies for address validation

**Current State:**
- Referenced in `pages/address.md`: `normalization #libpostal`
- NOT installed as dependency
- NOT integrated into codebase

**Do We Need It?**
- Currently using `AddressNormalizer` service (manual regex-based)
- Nominatim returns structured address data
- For most US addresses, current solution works

**If We Want Libpostal:**
```bash
# Install node-postal (Node.js bindings)
npm install node-postal

# Requires libpostal C library installed on system:
# macOS: brew install libpostal
# Ubuntu: apt-get install libpostal
```

**Recommendation:** LOW PRIORITY - Current address normalizer handles US addresses well.

---

## ISSUE #7: ADDRESS DISPLAY - ZOOM TO EXACT ADDRESS

### User Request (Verbatim):
> "99 Myrtle Avenue 9 (click to open this exact address on map page)"
> "Village Of Cambridge (clickable) (but should just be 'Cambridge')"

**Current Behavior:**
- Street is plain text (not clickable)
- City is clickable (filters locations)
- "Village Of Cambridge" appears because that's what Nominatim returns

**Premium Archive Should:**

1. **Street Clickable to Open Map at Address:**
```svelte
{#if location.address.street}
  <button
    onclick={() => zoomToAddress(location.address)}
    class="font-medium text-accent hover:underline"
    title="View this address on map"
  >
    {location.address.street}
  </button>
{/if}
```

2. **Normalize City Names:**
```typescript
// AddressNormalizer - Remove "Village of", "City of", etc.
function normalizeCity(city: string): string {
  return city
    .replace(/^(Village of|City of|Town of)\s*/i, '')
    .trim();
}
```

---

## IMPLEMENTATION PLAN

### Priority Order

| # | Issue | Impact | Effort | Fix |
|---|-------|--------|--------|-----|
| 1 | Forward geocode auto-trigger | HIGH | MEDIUM | Add call in LocationDetail |
| 2 | NEF preview display | HIGH | LOW | Use preview_path in MediaViewer |
| 3 | Map zoom to exact address | MEDIUM | LOW | Increase zoom level |
| 4 | Hero image selection | MEDIUM | MEDIUM | DB migration + UI |
| 5 | Thumbnail regeneration | LOW | MEDIUM | Settings button + batch job |
| 6 | Libpostal | LOW | HIGH | Skip for now |

---

## IMPLEMENTATION CODE

### FIX 1: Auto Forward Geocode on Location Load

**File:** `packages/desktop/src/pages/LocationDetail.svelte`

Add function and call in loadLocation():

```typescript
/**
 * Ensure location has GPS coordinates by forward geocoding address if needed
 * Per kanye6.md - Premium Archive should ALWAYS show something on map
 */
async function ensureGpsFromAddress(): Promise<void> {
  if (!location) return;

  // Already has GPS? Skip
  if (location.gps?.lat && location.gps?.lng) return;

  // No address to geocode? Skip
  const hasAddress = location.address?.street || location.address?.city;
  if (!hasAddress) return;

  // Build address string
  const addressParts = [
    location.address?.street,
    location.address?.city,
    location.address?.state,
    location.address?.zipcode
  ].filter(Boolean);

  if (addressParts.length === 0) return;

  const addressString = addressParts.join(', ');

  try {
    const result = await window.electronAPI.geocode.forward(addressString);

    if (result?.lat && result?.lng) {
      // Update location with geocoded GPS
      await window.electronAPI.locations.update(location.locid, {
        gps_lat: result.lat,
        gps_lng: result.lng,
        gps_source: 'geocoded_address'
      });

      console.log(`[LocationDetail] Forward geocoded address to GPS: ${result.lat}, ${result.lng}`);

      // Reload location to get updated GPS
      await loadLocation();
    }
  } catch (error) {
    console.error('[LocationDetail] Forward geocoding failed:', error);
  }
}
```

### FIX 2: Show Preview for RAW Files in MediaViewer

**File:** `packages/desktop/src/components/MediaViewer.svelte`

Modify image source selection:

```typescript
// RAW file extensions that need preview
const RAW_EXTENSIONS = /\.(nef|cr2|cr3|arw|srf|sr2|orf|pef|dng|rw2|raf|raw|rwl|3fr|fff|iiq|mrw|x3f|erf|mef|mos|kdc|dcr)$/i;

/**
 * Get the best displayable source for a media item
 * RAW files use extracted preview, regular files use original
 */
function getDisplaySource(item: MediaItem): string {
  // For RAW files, use preview if available
  if (RAW_EXTENSIONS.test(item.path) && item.previewPath) {
    return `media://${item.previewPath}`;
  }

  // Fallback to original path
  return `media://${item.path}`;
}
```

### FIX 3: Increase Map Zoom for Single Location

**File:** `packages/desktop/src/components/Map.svelte`

In `updateClusters` function, increase zoom for single location:

```typescript
// At the end of updateClusters function
if (locations.length === 1) {
  const coords = getLocationCoordinates(locations[0]);
  if (coords && !coords.isApproximate) {
    // Exact GPS - zoom to street level
    map.setView([coords.lat, coords.lng], 17);
  } else if (coords) {
    // Approximate (state capital) - zoom to city level
    map.setView([coords.lat, coords.lng], 10);
  }
}
```

---

## VERIFICATION CHECKLIST

After implementing fixes:

- [ ] **Test 1: Forward Geocoding**
  - Create location with address "99 Myrtle Avenue, Cambridge, NY 12816" (no GPS)
  - Load location detail page
  - Wait for geocoding (may take 1-2 seconds)
  - Verify: GPS coordinates now populated
  - Verify: Map shows at exact address, not state capital

- [ ] **Test 2: NEF Display**
  - Import a NEF file to any location
  - Open location detail page
  - Click on NEF thumbnail to open lightbox
  - Verify: Can see the image (not "cannot display" error)

- [ ] **Test 3: Map Zoom Level**
  - Go to location with GPS coordinates
  - Verify: Map zooms to street level (zoom 17+)
  - Verify: Can see individual buildings

- [ ] **Test 4: Existing Images**
  - Check location with OLD imports
  - If thumbnails missing, run regeneration
  - Verify: All images have visible thumbnails

---

## RELATED FILES

| File | Purpose | Changes Needed |
|------|---------|----------------|
| `packages/desktop/src/pages/LocationDetail.svelte` | Main UI | Add ensureGpsFromAddress() |
| `packages/desktop/src/components/MediaViewer.svelte` | Lightbox | Use preview for RAW |
| `packages/desktop/src/components/Map.svelte` | Map display | Increase single-location zoom |
| `packages/desktop/electron/services/geocoding-service.ts` | Geocoding | EXISTS - No changes |
| `packages/desktop/electron/services/preview-extractor-service.ts` | RAW preview | EXISTS - No changes |

---

## SUMMARY

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| No GPS from address | Forward geocoding not auto-triggered | Call on location load |
| Map not zooming | Falls back to state capital | After geocode, zoom to exact GPS |
| NEF not displaying | Browser can't render RAW | Show extracted preview instead |
| Thumbnails missing | Old imports before multi-tier | Regeneration needed |
| Hero image | Not implemented | Future: DB + UI |
| Libpostal | Not installed | Low priority |

---

## CHANGELOG

| Date | Issue | Action | Status |
|------|-------|--------|--------|
| 2025-11-23 | Forward geocoding | Documented root cause: service exists but not called | DOCUMENTED |
| 2025-11-23 | Map zoom | Documented: zoom level too low, falls back to state capital | DOCUMENTED |
| 2025-11-23 | NEF display | Documented: need to show preview_path not original | DOCUMENTED |
| 2025-11-23 | Hero image | Documented: not implemented, need DB migration | DOCUMENTED |
| 2025-11-23 | Libpostal | Documented: not installed, low priority | DOCUMENTED |
| 2025-11-23 | Full implementation plan | Created detailed fix code | READY TO IMPLEMENT |

---

## WHAT WOULD YOU DO DIFFERENTLY - CODING INSTRUCTIONS

This section outlines strategic improvements with step-by-step coding instructions for an inexperienced developer.

---

### PRINCIPLE 1: DATA-FIRST ARCHITECTURE

**Problem:** Features built in isolation. Thumbnails generated but not displayed. Forward geocoding exists but never called.

**Coding Instructions:**

1. **Before writing ANY new feature, document the complete data lifecycle:**

```markdown
## Feature: [Name]

### Data Flow
1. User action →
2. Backend processing →
3. Database storage →
4. Frontend retrieval →
5. User sees result

### Integration Points
- [ ] Point A calls Point B
- [ ] Point B stores data correctly
- [ ] Point C retrieves and displays data
```

2. **Create integration test file for each flow:**

**File to create:** `packages/desktop/tests/integration/import-to-display.test.ts`

```typescript
/**
 * Integration Test: Import to Display Flow
 * Tests that imported files are viewable immediately after import
 */
describe('Import to Display', () => {
  it('should display thumbnail immediately after import', async () => {
    // 1. Import a file
    const result = await importService.importFile(testImagePath, locationId);

    // 2. Verify thumbnail was generated
    expect(result.thumb_path_sm).not.toBeNull();
    expect(fs.existsSync(result.thumb_path_sm)).toBe(true);

    // 3. Verify database has the path
    const dbRecord = await mediaRepo.findImageByHash(result.hash);
    expect(dbRecord.thumb_path_sm).toBe(result.thumb_path_sm);

    // 4. Verify media:// protocol can serve it
    const response = await fetch(`media://${result.thumb_path_sm}`);
    expect(response.ok).toBe(true);
  });
});
```

---

### PRINCIPLE 2: ALWAYS SHOW SOMETHING (Graceful Degradation)

**Problem:** Current philosophy is "hide if data is missing". Premium archives show SOMETHING at every level.

**Coding Instructions:**

1. **Update all conditional displays to cascade:**

**File:** `packages/desktop/src/pages/LocationDetail.svelte`

**Pattern to follow (already implemented):**
```svelte
<!-- WRONG: Hide if missing -->
{#if location.gps}
  <Map />
{/if}

<!-- RIGHT: Cascade through options -->
{#if location.gps}
  <Map /> <!-- Exact GPS -->
{:else if location.address?.state}
  <Map /> <!-- State capital fallback -->
{:else}
  <AddLocationPrompt /> <!-- Always show something -->
{/if}
```

2. **Create a fallback helper function:**

**File to create:** `packages/desktop/src/lib/display-helpers.ts`

```typescript
/**
 * Get the best available display option for any data type
 * Per Kanye6: ALWAYS return something, never null
 */

// For images
export function getBestImageSource(image: MediaImage): string {
  return image.preview_path
    || image.thumb_path_lg
    || image.thumb_path_sm
    || image.thumb_path
    || '/placeholder-image.svg';
}

// For GPS coordinates
export function getBestCoordinates(location: Location): Coordinates | null {
  // Priority 1: Exact GPS
  if (location.gps?.lat && location.gps?.lng) {
    return {
      lat: location.gps.lat,
      lng: location.gps.lng,
      confidence: 'exact',
      zoomLevel: 17
    };
  }

  // Priority 2: State capital
  if (location.address?.state) {
    const capital = STATE_CAPITALS[location.address.state.toUpperCase()];
    if (capital) {
      return {
        ...capital,
        confidence: 'approximate',
        zoomLevel: 10
      };
    }
  }

  // Priority 3: US center (last resort)
  return {
    lat: 39.8283,
    lng: -98.5795,
    confidence: 'none',
    zoomLevel: 4
  };
}

// For address display
export function getDisplayCity(city: string | null): string {
  if (!city) return '';
  // Remove "Village of", "City of", "Town of" prefixes
  return city.replace(/^(Village of|City of|Town of)\s*/i, '').trim();
}
```

---

### PRINCIPLE 3: IMPORT = COMPLETE EXPERIENCE

**Problem:** Import is treated as "copy files". Should create complete, viewable archive entry.

**Coding Instructions:**

1. **Add import validation step:**

**File:** `packages/desktop/electron/services/file-import-service.ts`

After the import is complete, add validation:

```typescript
/**
 * Validate import result - ensure file is immediately viewable
 * Per Kanye6: Import isn't done until user can browse/view without errors
 */
async function validateImportResult(
  hash: string,
  fileType: 'image' | 'video' | 'document'
): Promise<{ valid: boolean; issues: string[] }> {
  const issues: string[] = [];

  if (fileType === 'image') {
    const image = await mediaRepo.findImageByHash(hash);

    // Check thumbnail exists
    if (!image.thumb_path_sm) {
      issues.push('Missing small thumbnail');
    } else if (!fs.existsSync(image.thumb_path_sm)) {
      issues.push('Thumbnail file not found on disk');
    }

    // Check preview for RAW files
    const isRaw = RAW_EXTENSIONS.test(image.imgloc);
    if (isRaw && !image.preview_path) {
      issues.push('RAW file missing extracted preview');
    }
  }

  return {
    valid: issues.length === 0,
    issues
  };
}
```

2. **Add post-import repair for failed items:**

**File:** `packages/desktop/electron/services/file-import-service.ts`

```typescript
/**
 * Repair incomplete imports
 * Call this to regenerate missing thumbnails/previews
 */
async function repairIncompleteImport(hash: string): Promise<void> {
  const image = await mediaRepo.findImageByHash(hash);

  // Regenerate thumbnails if missing
  if (!image.thumb_path_sm) {
    const source = image.preview_path || image.imgloc;
    const thumbnails = await thumbnailService.generateAllSizes(source, hash);

    await mediaRepo.updateImageThumbnails(hash, {
      thumb_path_sm: thumbnails.thumb_sm,
      thumb_path_lg: thumbnails.thumb_lg,
      preview_path: thumbnails.preview
    });
  }

  // Extract preview for RAW files if missing
  const isRaw = RAW_EXTENSIONS.test(image.imgloc);
  if (isRaw && !image.preview_path) {
    const preview = await previewExtractorService.extractPreview(image.imgloc, hash);
    if (preview) {
      await mediaRepo.updateImagePreviewPath(hash, preview);
    }
  }
}
```

3. **Add "Regenerate Thumbnails" button in Settings:**

**File:** `packages/desktop/src/pages/Settings.svelte`

```svelte
<!-- Add to settings page -->
<div class="border-t pt-6 mt-6">
  <h3 class="text-lg font-semibold mb-4">Maintenance</h3>

  <div class="space-y-4">
    <div>
      <p class="text-sm text-gray-600 mb-2">
        Regenerate thumbnails for images imported before the multi-tier system.
      </p>
      <button
        onclick={regenerateThumbnails}
        disabled={regenerating}
        class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 disabled:opacity-50"
      >
        {regenerating ? `Regenerating... (${progress}/${total})` : 'Regenerate All Thumbnails'}
      </button>
    </div>
  </div>
</div>

<script>
  let regenerating = $state(false);
  let progress = $state(0);
  let total = $state(0);

  async function regenerateThumbnails() {
    regenerating = true;
    try {
      const result = await window.electronAPI.media.regenerateAllThumbnails(
        (current, totalCount) => {
          progress = current;
          total = totalCount;
        }
      );
      alert(`Regenerated ${result.success} of ${result.total} thumbnails`);
    } catch (error) {
      console.error('Regeneration failed:', error);
    } finally {
      regenerating = false;
    }
  }
</script>
```

4. **Add IPC handler for thumbnail regeneration:**

**File:** `packages/desktop/electron/main/ipc-handlers/media.ts`

```typescript
ipcMain.handle('media:regenerateAllThumbnails', async (event) => {
  const images = await mediaRepo.getImagesWithoutThumbnails();
  let success = 0;

  for (let i = 0; i < images.length; i++) {
    const img = images[i];

    // Send progress update
    event.sender.send('thumbnail-progress', { current: i + 1, total: images.length });

    try {
      // Get source (preview for RAW, original otherwise)
      const isRaw = RAW_EXTENSIONS.test(img.imgloc);
      let source = img.imgloc;

      if (isRaw) {
        // Extract preview first if needed
        const preview = await previewExtractorService.extractPreview(img.imgloc, img.imgsha);
        if (preview) {
          source = preview;
          await mediaRepo.updateImagePreviewPath(img.imgsha, preview);
        }
      }

      // Generate all thumbnail sizes
      const thumbnails = await thumbnailService.generateAllSizes(source, img.imgsha);

      await db.updateTable('imgs')
        .set({
          thumb_path_sm: thumbnails.thumb_sm,
          thumb_path_lg: thumbnails.thumb_lg,
          preview_path: thumbnails.preview
        })
        .where('imgsha', '=', img.imgsha)
        .execute();

      success++;
    } catch (error) {
      console.error(`Failed to regenerate thumbnails for ${img.imgsha}:`, error);
    }
  }

  return { total: images.length, success };
});
```

---

### PRINCIPLE 4: RAW FILES = SHOW PREVIEW, NEVER ORIGINAL

**Problem:** Browser cannot render NEF/CR2/ARW files. User sees "Cannot display" error.

**Coding Instructions:**

1. **MediaViewer already handles this correctly (lines 42-49):**

```typescript
const imageSrc = $derived(() => {
  if (!currentMedia) return '';
  // Priority: preview (for RAW) -> original path
  if (currentMedia.previewPath) {
    return `media://${currentMedia.previewPath}`;
  }
  return `media://${currentMedia.path}`;
});
```

2. **Ensure preview is passed from LocationDetail:**

**Verify in LocationDetail.svelte (line 91-105):**
```typescript
const mediaViewerList = $derived(images.map(img => ({
  hash: img.imgsha,
  path: img.imgloc,
  thumbPath: img.thumb_path_sm || img.thumb_path || null,
  previewPath: img.preview_path || null,  // <-- THIS MUST BE SET
  // ...
})));
```

3. **If NEF still shows error, check database:**

```sql
-- Run this to check if previews were extracted
SELECT imgsha, imgnam, imgloc, preview_path
FROM imgs
WHERE imgloc LIKE '%.nef' OR imgloc LIKE '%.NEF'
LIMIT 10;
```

If `preview_path` is NULL, the preview extraction failed. Re-import or run regeneration.

---

### PRINCIPLE 5: HERO IMAGE = USER CHOICE

**Problem:** No way to select featured image. Always shows first imported.

**Coding Instructions:**

1. **Database Migration (Migration 10):**

**File:** `packages/desktop/electron/main/database.ts`

Add to migrations array:

```typescript
// Migration 10: Hero image support
{
  version: 10,
  up: async (db: Kysely<any>) => {
    await sql`ALTER TABLE locs ADD COLUMN hero_imgsha TEXT`.execute(db);
    // Note: SQLite doesn't support foreign keys on ALTER, constraint is logical only
  }
}
```

2. **Add to Location type:**

**File:** `packages/core/src/types.ts`

```typescript
export interface Location {
  // ... existing fields ...
  hero_imgsha?: string | null;
}
```

3. **Add "Set as Hero" button to image grid:**

**File:** `packages/desktop/src/pages/LocationDetail.svelte`

In the image grid loop, add:

```svelte
<button
  onclick={() => openLightbox(actualIndex)}
  class="aspect-square bg-gray-100 rounded overflow-hidden hover:opacity-90 transition relative group"
>
  <!-- existing image display code -->

  <!-- Add hero image badge/button -->
  <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition">
    {#if image.imgsha === location.hero_imgsha}
      <span class="px-2 py-1 bg-yellow-500 text-white text-xs rounded">
        Hero
      </span>
    {:else}
      <button
        onclick|stopPropagation={() => setHeroImage(image.imgsha)}
        class="px-2 py-1 bg-black/50 text-white text-xs rounded hover:bg-black/70"
        title="Set as hero image"
      >
        Set Hero
      </button>
    {/if}
  </div>
</button>
```

4. **Add setHeroImage function:**

```typescript
async function setHeroImage(imgsha: string) {
  if (!location) return;

  try {
    await window.electronAPI.locations.update(location.locid, {
      hero_imgsha: imgsha
    });
    await loadLocation();
  } catch (error) {
    console.error('Failed to set hero image:', error);
  }
}
```

5. **Update Hero display to use selected image:**

```svelte
<!-- Replace existing hero section -->
{#if images.length > 0}
  {@const heroImage = location.hero_imgsha
    ? images.find(img => img.imgsha === location.hero_imgsha) || images[0]
    : images[0]}
  {@const heroSrc = heroImage.preview_path || heroImage.thumb_path_lg || heroImage.thumb_path_sm}
  <!-- rest of hero display -->
{/if}
```

---

### PRINCIPLE 6: THUMBNAIL QUALITY FOR MODERN DISPLAYS

**Problem:** 256px thumbnails look blurry on HiDPI (Retina, 4K).

**Status:** ALREADY IMPLEMENTED - Using 400/800/1920 tiers with srcset.

**Verification:**

Check that srcset is being used:
```svelte
<img
  src={`media://${image.thumb_path_sm || image.thumb_path}`}
  srcset={`
    media://${image.thumb_path_sm || image.thumb_path} 1x
    ${image.thumb_path_lg ? `, media://${image.thumb_path_lg} 2x` : ''}
  `}
/>
```

---

### PRINCIPLE 7: TEST USER JOURNEYS, NOT COMPONENTS

**Problem:** Components work in isolation. Bugs are at integration points.

**Coding Instructions:**

1. **Create user journey test file:**

**File:** `packages/desktop/tests/journeys/browse-archive.test.ts`

```typescript
/**
 * User Journey: Browse Archive
 * Tests the complete flow a user experiences when browsing their archive
 */
describe('Browse Archive Journey', () => {

  it('should show thumbnails for all imported images', async () => {
    // Setup: Import 5 images to a location
    const location = await createTestLocation();
    const images = await importTestImages(location.locid, 5);

    // Journey: Load location detail
    const locationDetail = await loadLocationDetail(location.locid);

    // Verify: All images have visible thumbnails
    for (const img of locationDetail.images) {
      expect(img.thumb_path_sm).not.toBeNull();
      // Simulate what the browser does
      const src = `media://${img.thumb_path_sm}`;
      const canLoad = await verifyMediaProtocolServes(src);
      expect(canLoad).toBe(true);
    }
  });

  it('should show map for location with address but no GPS', async () => {
    // Setup: Create location with address, no GPS
    const location = await createTestLocation({
      address_street: '99 Myrtle Avenue',
      address_city: 'Cambridge',
      address_state: 'NY',
      gps_lat: null,
      gps_lng: null
    });

    // Journey: Load location detail
    const locationDetail = await loadLocationDetail(location.locid);

    // Verify: GPS was populated via forward geocoding
    expect(locationDetail.location.gps_lat).not.toBeNull();
    expect(locationDetail.location.gps_lng).not.toBeNull();
    expect(locationDetail.location.gps_source).toBe('geocoded_address');
  });

  it('should display RAW files using extracted preview', async () => {
    // Setup: Import NEF file
    const location = await createTestLocation();
    const nefFile = await importTestFile(location.locid, 'test.nef');

    // Verify: Preview was extracted
    expect(nefFile.preview_path).not.toBeNull();

    // Journey: Open in MediaViewer
    const viewerSrc = getMediaViewerSource(nefFile);

    // Verify: Uses preview, not original NEF
    expect(viewerSrc).toContain('.previews/');
    expect(viewerSrc).not.toContain('.nef');
  });
});
```

---

### SUMMARY: CODING CHECKLIST FOR PREMIUM ARCHIVE

Before shipping any feature, verify:

- [ ] **Data Flow Complete:** Data goes from input → storage → display without gaps
- [ ] **Graceful Degradation:** Something shows at every state (exact, approximate, prompt)
- [ ] **Import Complete:** All thumbnails/previews generated and accessible
- [ ] **RAW Handled:** Preview extracted and used for display
- [ ] **HiDPI Ready:** Using srcset with 2x resolution available
- [ ] **User Journey Tested:** End-to-end flow works, not just individual components
- [ ] **Forward Geocoding:** Addresses auto-convert to GPS on load

---

## CHANGELOG - UPDATED

| Date | Issue | Action | Status |
|------|-------|--------|--------|
| 2025-11-23 | Forward geocoding | Implemented auto-trigger in LocationDetail | **DONE** |
| 2025-11-23 | Map zoom | Implemented street-level zoom for exact GPS | **DONE** |
| 2025-11-23 | Hero image display | Fixed to show actual thumbnail | **DONE** |
| 2025-11-23 | GPS confidence | Added 'geocoded_address' source support | **DONE** |
| 2025-11-23 | NEF display | MediaViewer already uses preview | VERIFIED |
| 2025-11-23 | Hero image selection | Documented implementation plan | PENDING |
| 2025-11-23 | Thumbnail regeneration | Documented Settings button | PENDING |
| 2025-11-23 | Coding principles | Added "What Would You Do Differently" section | **DONE** |

---

*This is kanye6.md - comprehensive ULTRATHINK analysis with coding instructions for Premium Archive implementation.*
