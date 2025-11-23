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

*This is kanye6.md - comprehensive ULTRATHINK analysis of remaining Premium Archive issues with implementation-ready code.*
