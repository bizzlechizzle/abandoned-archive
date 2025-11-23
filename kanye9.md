# KANYE9 - ULTIMATE ARCHIVE APP MASTER PLAN

## Executive Summary

This document is the **definitive implementation plan** for transforming AU Archive into a premium, bulletproof archive application. After thorough ULTRATHINK analysis of the codebase, this plan addresses ALL identified gaps in a systematic, non-looping manner.

**Philosophy:** An archive is only as good as its ability to let you FIND and VIEW what you've stored.

---

## Table of Contents

1. [Current State Audit](#1-current-state-audit)
2. [libpostal Address Normalization](#2-libpostal-address-normalization)
3. [GPS Bulletproof System](#3-gps-bulletproof-system)
4. [Preview/Thumbnail Chain](#4-previewthumbnail-chain)
5. [Darktable Integration (Future)](#5-darktable-integration-future)
6. [CLI/GUI Integration Audit](#6-cligui-integration-audit)
7. [Implementation Order](#7-implementation-order)
8. [File-by-File Changes](#8-file-by-file-changes)

---

## 1. Current State Audit

### What EXISTS and WORKS

| Component | File | Status |
|-----------|------|--------|
| ExifTool GPS extraction | `exiftool-service.ts` | ✅ Working |
| ExifTool preview extraction | `preview-extractor-service.ts` | ✅ Working |
| Multi-tier thumbnails (400/800/1920) | `thumbnail-service.ts` | ✅ Working |
| Forward geocoding (addr→GPS) | `geocoding-service.ts:233-268` | ✅ Working |
| Reverse geocoding (GPS→addr) | `geocoding-service.ts:179-227` | ✅ Working |
| Auto forward geocode on page load | `LocationDetail.svelte:86-101` | ✅ Working |
| State capital fallback | `Map.svelte:10-62` | ✅ Working |
| GPS confidence badges | `LocationMapSection.svelte:20-45` | ✅ Working |
| Hero image selection | `LocationGallery.svelte:66-72` | ✅ Working |
| Import with thumbnail generation | `file-import-service.ts:474-538` | ✅ Working |

### What's BROKEN or MISSING

| Issue | Impact | Root Cause |
|-------|--------|------------|
| Old imports have no previews | NEF files show "Cannot display" | Imports before preview code was added |
| Old imports have 256px thumbnails | Low quality grid view | Legacy `thumb_path` vs new `thumb_path_sm/lg` |
| Address not normalized | "Village Of Cambridge" displays | No libpostal, only hacky regex |
| Geocoding uses raw address | Poor Nominatim results | Should use normalized address |
| No `address_raw` storage | Can't show original vs clean | Only one address field |
| Map zoom not confidence-based | All maps same zoom | No dynamic zoom logic |
| Zipcode not clickable | Inconsistent UX | Missing filter link |
| No "Open on map" link | Can't jump to address on map | Feature not implemented |
| No CLI interface | GUI-only operation | `packages/cli` doesn't exist |
| No batch regeneration UI | Must use IPC handler manually | No frontend trigger |

---

## 2. libpostal Address Normalization

### Why libpostal?

**Problem:** Address data comes from multiple sources with inconsistent formatting:
- EXIF (camera GPS → reverse geocode)
- User input ("99 myrtle ave village of cambridge")
- Nominatim response ("Village Of Cambridge")
- Historical records ("V. of Cambridge, N.Y.")

**Solution:** libpostal is an ML-trained address parser that handles ALL variations.

### Database Schema Changes

```sql
-- Add new columns to locs table
ALTER TABLE locs ADD COLUMN address_raw TEXT;           -- Original input
ALTER TABLE locs ADD COLUMN address_normalized TEXT;    -- libpostal output
ALTER TABLE locs ADD COLUMN address_parsed_json TEXT;   -- Parsed components

-- Rename existing columns for clarity (migration)
-- address_street → keep as-is (normalized street)
-- address_city → keep as-is (normalized city)
-- etc.
```

### Data Model

```typescript
interface AddressData {
  // Raw input (preserved exactly as entered/received)
  raw: string;

  // Normalized (libpostal processed)
  normalized: {
    street: string | null;      // "99 myrtle avenue"
    city: string | null;        // "cambridge"
    state: string | null;       // "new york" or "ny"
    stateCode: string | null;   // "NY" (always 2-letter)
    zipcode: string | null;     // "12816"
    county: string | null;      // "washington"
  };

  // Parsed components (libpostal parse output)
  parsed: {
    house_number: string | null;
    road: string | null;
    city: string | null;
    state: string | null;
    postcode: string | null;
    country: string | null;
  };

  // Metadata
  normalizationSource: 'libpostal' | 'manual' | 'legacy';
  normalizedAt: string | null;  // ISO timestamp
}
```

### Service Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   AddressService (NEW)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PARSE: Raw string → structured components                      │
│  ├── Input: "99 myrtle ave village of cambridge ny 12816"      │
│  └── Output: { house_number, road, city, state, postcode }     │
│                                                                  │
│  NORMALIZE: Structured → standardized format                    │
│  ├── Input: { city: "Village Of Cambridge", state: "ny" }      │
│  └── Output: { city: "cambridge", state: "NY" }                │
│                                                                  │
│  FORMAT: Structured → display string                            │
│  ├── Input: { street: "99 myrtle avenue", city: "cambridge" }  │
│  └── Output: "99 Myrtle Avenue, Cambridge, NY 12816"           │
│                                                                  │
│  COMPARE: Are two addresses the same location?                  │
│  ├── Input: addr1, addr2                                        │
│  └── Output: { match: true, confidence: 0.95 }                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### libpostal Integration

**File:** `packages/desktop/electron/services/address-service.ts`

```typescript
// Option 1: node-postal (requires native libpostal)
import postal from 'node-postal';

// Option 2: Fallback regex for systems without libpostal
import { AddressNormalizer } from './address-normalizer'; // existing

class AddressService {
  private libpostalAvailable: boolean;

  constructor() {
    try {
      postal.parser.parse_address('test');
      this.libpostalAvailable = true;
    } catch {
      this.libpostalAvailable = false;
      console.warn('[AddressService] libpostal not available, using fallback');
    }
  }

  parse(raw: string): ParsedAddress { /* ... */ }
  normalize(parsed: ParsedAddress): NormalizedAddress { /* ... */ }
  format(normalized: NormalizedAddress): string { /* ... */ }
  compare(addr1: string, addr2: string): CompareResult { /* ... */ }
}
```

### Integration Points

| Location | Change |
|----------|--------|
| Import flow | Normalize address from EXIF reverse geocode |
| Location create | Normalize user-entered address |
| Location edit | Normalize on save |
| Geocoding | Use normalized address for forward geocode |
| Display | Show normalized (clean) with tooltip for raw |
| Search | Match against normalized form |
| Deduplication | Compare normalized addresses |

---

## 3. GPS Bulletproof System

### Trust Hierarchy

```
TIER 1: VERIFIED (User confirmed on map)
├── gps_verified_on_map = 1
├── Confidence: HIGHEST
├── Map zoom: 18 (building)
└── Badge: Green checkmark

TIER 2: EXIF GPS (Camera/device captured)
├── gps_source = 'exif' | 'media_gps'
├── Confidence: HIGH
├── Map zoom: 17 (street)
└── Badge: Blue "From Media"

TIER 3: GEOCODED FROM ADDRESS (Nominatim forward)
├── gps_source = 'geocoded_address'
├── Confidence: MEDIUM-HIGH
├── Map zoom: 17 (street)
└── Badge: Blue "From Address"

TIER 4: REVERSE GEOCODED (GPS existed, got address)
├── gps_source = 'reverse_geocode' | 'geocoding'
├── Confidence: MEDIUM
├── Map zoom: 16
└── Badge: Blue "Geocoded"

TIER 5: MANUAL ENTRY (User typed coordinates)
├── gps_source = 'manual' | 'user_input'
├── Confidence: LOW
├── Map zoom: 15
└── Badge: Yellow "Manual"

TIER 6: STATE CAPITAL FALLBACK (Computed, not stored)
├── No GPS in DB, only state in address
├── Confidence: APPROXIMATE
├── Map zoom: 8 (state)
└── Badge: Gray "Approximate (State)"

TIER 7: NO DATA
├── No GPS, no state
├── Show "Add GPS" prompt
└── No map displayed
```

### Geocoding Cascade

When a location needs GPS coordinates:

```
1. Check: Does location have gps_lat/gps_lng?
   └── YES → Use existing GPS
   └── NO → Continue to step 2

2. Check: Does location have full address?
   └── YES → Forward geocode full address
       └── Success? Store GPS, source='geocoded_address'
       └── Fail? Continue to step 3
   └── NO → Continue to step 3

3. Check: Does location have city + state?
   └── YES → Forward geocode "City, State"
       └── Success? Store GPS, source='geocoded_address'
       └── Fail? Continue to step 4
   └── NO → Continue to step 4

4. Check: Does location have zipcode?
   └── YES → Forward geocode zipcode
       └── Success? Store GPS, source='geocoded_address'
       └── Fail? Continue to step 5
   └── NO → Continue to step 5

5. Check: Does location have county + state?
   └── YES → Forward geocode "County, State"
       └── Success? Store GPS, source='geocoded_address'
       └── Fail? Continue to step 6
   └── NO → Continue to step 6

6. Check: Does location have state?
   └── YES → Use STATE_CAPITALS[state] (not stored, display only)
   └── NO → Show "No location data" message
```

### Map Zoom Configuration

**File:** `packages/desktop/src/lib/constants.ts`

```typescript
export const GPS_ZOOM_LEVELS = {
  VERIFIED: 18,           // Building level
  EXIF: 17,               // Street level
  GEOCODED_ADDRESS: 17,   // Street level
  REVERSE_GEOCODE: 16,    // Block level
  MANUAL: 15,             // Neighborhood
  STATE_CAPITAL: 8,       // State overview
  US_CENTER: 4,           // Country view
} as const;
```

### GPS Update Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    GPS UPDATE TRIGGERS                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. IMPORT (media has EXIF GPS)                                 │
│     └── Extract GPS from media                                  │
│         └── If location has no GPS → Update location GPS        │
│             └── source = 'media_gps'                            │
│         └── If location has GPS → Check mismatch warning        │
│                                                                  │
│  2. IMPORT (media has EXIF GPS, location has no address)        │
│     └── Reverse geocode GPS → Get address                       │
│         └── Update location address fields                      │
│             └── Fire-and-forget (non-blocking)                  │
│                                                                  │
│  3. PAGE LOAD (location has address, no GPS)                    │
│     └── ensureGpsFromAddress() in LocationDetail.svelte         │
│         └── Forward geocode → Update GPS                        │
│             └── source = 'geocoded_address'                     │
│                                                                  │
│  4. USER EDIT (changes address)                                 │
│     └── Clear GPS if address significantly changed?             │
│         └── Or: Re-geocode with new address                     │
│                                                                  │
│  5. MAP CLICK (user places pin)                                 │
│     └── Update GPS directly                                     │
│         └── source = 'user_input'                               │
│         └── Optionally reverse geocode for address              │
│                                                                  │
│  6. MARK VERIFIED (user confirms GPS is correct)                │
│     └── Set gps_verified_on_map = 1                             │
│         └── Highest trust level achieved                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Preview/Thumbnail Chain

### Current Architecture (CORRECT)

```
RAW FILE (NEF/CR2/ARW)
    │
    ▼
ExifTool extractBinaryTag('PreviewImage')
    │
    ▼
Embedded JPEG Preview (~1920px)
    │
    ├──► Saved to: .previews/{bucket}/{hash}.jpg
    │        └── DB: preview_path
    │
    ▼
Sharp resize (from preview)
    │
    ├──► 400px  → .thumbnails/{bucket}/{hash}_400.jpg  → thumb_path_sm
    ├──► 800px  → .thumbnails/{bucket}/{hash}_800.jpg  → thumb_path_lg
    └──► 1920px → .thumbnails/{bucket}/{hash}_1920.jpg → preview_path (or separate)

JPEG/PNG FILE
    │
    ▼
Sharp resize (from original)
    │
    ├──► 400px  → thumb_path_sm
    ├──► 800px  → thumb_path_lg
    └──► 1920px → preview_path
```

### The Problem: Old Imports

Files imported BEFORE the multi-tier thumbnail code have:
- `thumb_path` = 256px (legacy)
- `thumb_path_sm` = NULL
- `thumb_path_lg` = NULL
- `preview_path` = NULL (for RAW files: "Cannot display")

### Solution: Batch Regeneration

**IPC Handler (EXISTS):** `media:regenerateAllThumbnails`

**File:** `packages/desktop/electron/main/ipc-handlers/media-processing.ts:178-239`

**What it does:**
1. Finds all images missing `thumb_path_sm`
2. For RAW: extracts preview first
3. Generates all three sizes
4. Updates database

**What's MISSING:** Frontend UI to trigger this

### Frontend Integration Needed

```svelte
<!-- Settings page or Admin panel -->
<button onclick={regenerateThumbnails}>
  Regenerate All Thumbnails
</button>

<script>
async function regenerateThumbnails() {
  const result = await window.electronAPI.media.regenerateAllThumbnails();
  toast.success(`Generated ${result.generated} thumbnails`);
}
</script>
```

### Display Chain

```
LocationGallery.svelte
    │
    ├── Has thumb_path_sm? → Use it (400px)
    │       └── srcset with thumb_path_lg for HiDPI
    │
    ├── Has thumb_path (legacy)? → Use it (256px, blurry)
    │
    └── Neither? → Show placeholder icon

MediaViewer.svelte (lightbox)
    │
    ├── Has preview_path? → Use it (1920px)
    │
    ├── Is displayable format (JPEG/PNG)? → Use original (imgloc)
    │
    └── Is RAW? → "Cannot display" (need preview_path)
```

---

## 5. Darktable Integration (Future)

### Current Approach: ExifTool Preview Extraction

| Aspect | Status |
|--------|--------|
| Speed | <1 second per file |
| Quality | Camera-generated JPEG (1920px typical) |
| Dependencies | ExifTool only (already required) |
| Offline | Yes |
| Customization | None (camera settings baked in) |

**Verdict:** SUFFICIENT for archive viewing. Keep as default.

### Future Enhancement: Optional Darktable

**When Darktable adds value:**
- Old cameras with tiny embedded previews (640px)
- Consistent color science across camera brands
- Custom develop presets for batch export
- Professional editing workflow integration

**Implementation approach (FUTURE):**

```
┌─────────────────────────────────────────────────────────────────┐
│                    RAW PROCESSING OPTIONS                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  DEFAULT: ExifTool Preview Extraction                           │
│  ├── Fast (<1 sec)                                              │
│  ├── No dependencies beyond ExifTool                            │
│  └── Used for: Import, browsing, grid view                      │
│                                                                  │
│  OPTIONAL: Darktable CLI Export                                 │
│  ├── Slower (2-5 sec per image)                                 │
│  ├── Requires Darktable installed                               │
│  ├── Settings: darktable_path in config                         │
│  └── Used for: On-demand "High Quality Render" button           │
│                                                                  │
│  Settings UI:                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ RAW Processing                                           │   │
│  │ ○ ExifTool Preview (fast, recommended)                   │   │
│  │ ○ Darktable CLI (slow, custom processing)                │   │
│  │                                                          │   │
│  │ Darktable Path: [/usr/bin/darktable-cli] [Browse]       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**NOT implementing now.** ExifTool approach is correct for v1.

---

## 6. CLI/GUI Integration Audit

### Current State

| Component | CLI Support | GUI Support |
|-----------|-------------|-------------|
| Import | ❌ No CLI | ✅ Drag-drop, file picker |
| Export | ❌ No CLI | ❌ Not implemented |
| Search | ❌ No CLI | ✅ Filter UI |
| Geocode | ❌ No CLI | ✅ Auto on page load |
| Thumbnail regen | ❌ No CLI | ⚠️ IPC only, no UI |
| Backup | ❌ No CLI | ✅ Settings UI |

### Target Architecture (per whereswaldo11)

```
┌─────────────────────────────────────────────────────────────────┐
│                    PACKAGE STRUCTURE                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  packages/                                                       │
│  ├── core/           # Shared types, constants                  │
│  │   └── (EXISTS)                                               │
│  │                                                               │
│  ├── import-core/    # Framework-agnostic import logic          │
│  │   └── (NOT EXISTS - business logic in desktop/electron)      │
│  │                                                               │
│  ├── cli/            # Command-line interface                   │
│  │   └── (NOT EXISTS)                                           │
│  │                                                               │
│  └── desktop/        # Electron GUI                             │
│      └── (EXISTS)                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### CLI Implementation (FUTURE)

**NOT implementing now.** Focus on fixing GUI first.

Future CLI commands:
```bash
au-archive import ./photos --location "DW Winkleman" --user "kanye"
au-archive geocode --forward "99 Myrtle Ave, Cambridge, NY"
au-archive thumbnails --regenerate --all
au-archive export --location "DW Winkleman" --format jpeg --quality 90
```

---

## 7. Implementation Order

### Phase 1: Critical Fixes (THIS SESSION)

| # | Task | Files | Priority |
|---|------|-------|----------|
| 1 | Add libpostal service | NEW: `address-service.ts` | HIGH |
| 2 | Add address DB columns | Migration in `database.ts` | HIGH |
| 3 | Normalize on import/save | `file-import-service.ts`, `location-repository.ts` | HIGH |
| 4 | Fix address display | `LocationAddress.svelte` | HIGH |
| 5 | Add map zoom by confidence | `LocationMapSection.svelte`, `Map.svelte` | HIGH |
| 6 | Make zipcode clickable | `LocationAddress.svelte` | MEDIUM |
| 7 | Add "Open on map" link | `LocationAddress.svelte`, `LocationDetail.svelte` | MEDIUM |
| 8 | Add thumbnail regen UI | `Settings.svelte` or admin page | MEDIUM |

### Phase 2: Polish (Next Session)

| # | Task | Priority |
|---|------|----------|
| 9 | Geocoding cascade (zipcode-only, county-only) | MEDIUM |
| 10 | Address comparison/deduplication | LOW |
| 11 | Hero image UX improvement | LOW |
| 12 | Batch operations UI | LOW |

### Phase 3: Future

| # | Task | Priority |
|---|------|----------|
| 13 | CLI package | FUTURE |
| 14 | Darktable optional integration | FUTURE |
| 15 | Export functionality | FUTURE |

---

## 8. File-by-File Changes

### NEW FILES

#### `packages/desktop/electron/services/address-service.ts`

```typescript
/**
 * AddressService - libpostal-powered address parsing and normalization
 *
 * Features:
 * - Parse raw address strings into components
 * - Normalize addresses for consistent storage
 * - Format addresses for display
 * - Compare addresses for deduplication
 *
 * Fallback: If libpostal not available, uses regex-based AddressNormalizer
 */

import { AddressNormalizer } from './address-normalizer';

// Try to load node-postal, gracefully degrade if not available
let postal: any = null;
try {
  postal = require('node-postal');
} catch {
  console.warn('[AddressService] node-postal not available, using fallback');
}

export interface ParsedAddress {
  house_number: string | null;
  road: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
}

export interface NormalizedAddress {
  street: string | null;
  city: string | null;
  county: string | null;
  state: string | null;
  stateCode: string | null;
  zipcode: string | null;
}

export interface AddressRecord {
  raw: string;
  normalized: NormalizedAddress;
  parsed: ParsedAddress;
  source: 'libpostal' | 'fallback' | 'manual';
  normalizedAt: string;
}

export class AddressService {
  private libpostalAvailable: boolean;

  constructor() {
    this.libpostalAvailable = postal !== null;
  }

  /**
   * Parse raw address string into components
   */
  parse(raw: string): ParsedAddress {
    if (!raw || raw.trim() === '') {
      return { house_number: null, road: null, city: null, state: null, postcode: null, country: null };
    }

    if (this.libpostalAvailable) {
      return this.parseWithLibpostal(raw);
    }
    return this.parseWithFallback(raw);
  }

  /**
   * Normalize address components to standard format
   */
  normalize(parsed: ParsedAddress): NormalizedAddress {
    const stateCode = AddressNormalizer.normalizeState(parsed.state || '');
    const zipcode = AddressNormalizer.normalizeZipcode(parsed.postcode || '');

    return {
      street: this.normalizeStreet(parsed.house_number, parsed.road),
      city: this.normalizeCity(parsed.city),
      county: null, // libpostal doesn't parse county
      state: parsed.state,
      stateCode,
      zipcode,
    };
  }

  /**
   * Full pipeline: raw string → normalized record
   */
  processAddress(raw: string): AddressRecord {
    const parsed = this.parse(raw);
    const normalized = this.normalize(parsed);

    return {
      raw,
      normalized,
      parsed,
      source: this.libpostalAvailable ? 'libpostal' : 'fallback',
      normalizedAt: new Date().toISOString(),
    };
  }

  /**
   * Format normalized address for display
   */
  format(normalized: NormalizedAddress): string {
    const parts = [
      normalized.street,
      normalized.city,
      normalized.stateCode || normalized.state,
      normalized.zipcode,
    ].filter(Boolean);
    return parts.join(', ');
  }

  // Private methods...
  private parseWithLibpostal(raw: string): ParsedAddress { /* ... */ }
  private parseWithFallback(raw: string): ParsedAddress { /* ... */ }
  private normalizeStreet(houseNumber: string | null, road: string | null): string | null { /* ... */ }
  private normalizeCity(city: string | null): string | null { /* ... */ }
}
```

### MODIFIED FILES

#### `packages/desktop/electron/main/database.ts`

Add migration for address columns:

```typescript
// Migration 11: Address normalization columns
{
  version: 11,
  migrate: async (db) => {
    await db.schema
      .alterTable('locs')
      .addColumn('address_raw', 'text')
      .execute();

    await db.schema
      .alterTable('locs')
      .addColumn('address_normalized', 'text')
      .execute();

    await db.schema
      .alterTable('locs')
      .addColumn('address_parsed_json', 'text')
      .execute();

    await db.schema
      .alterTable('locs')
      .addColumn('address_source', 'text')
      .execute();
  }
}
```

#### `packages/desktop/src/components/location/LocationAddress.svelte`

- Remove hacky `getDisplayCity()` regex
- Use normalized address from DB
- Make zipcode clickable
- Add "Open on map" button for street

#### `packages/desktop/src/components/location/LocationMapSection.svelte`

- Add zoom prop based on GPS confidence
- Pass zoom to Map component

#### `packages/desktop/src/components/Map.svelte`

- Accept zoom prop
- Use dynamic zoom based on confidence

#### `packages/desktop/src/pages/Settings.svelte`

- Add "Regenerate Thumbnails" button
- Show progress during regeneration

---

## Summary

### What We're Building

1. **libpostal integration** - Universal address normalization
2. **Dual address storage** - Raw + normalized
3. **Bulletproof GPS** - Cascade geocoding with trust hierarchy
4. **Dynamic map zoom** - Based on GPS confidence
5. **Complete address UX** - All parts clickable, map link
6. **Thumbnail regeneration UI** - Fix old imports

### What We're NOT Building (Yet)

1. CLI interface
2. Darktable integration
3. Export functionality
4. Address deduplication

### Success Criteria

- [ ] NEF files display preview (not "Cannot display")
- [ ] "Village Of Cambridge" displays as "Cambridge"
- [ ] All address parts are clickable filters
- [ ] Street address has "Open on map" link
- [ ] Map zooms to appropriate level based on GPS source
- [ ] Batch thumbnail regeneration available in UI
- [ ] Both raw and normalized addresses stored

---

## Next Steps

**READY TO CODE.** Implementation order:

1. Create `AddressService` with libpostal/fallback
2. Add database migration for address columns
3. Integrate normalization into import/save flows
4. Update `LocationAddress.svelte` for clean display
5. Add map zoom by confidence
6. Add thumbnail regeneration UI

---

*Document: kanye9.md*
*Created: Session continuing from kanye8*
*Status: PLANNING COMPLETE - READY FOR IMPLEMENTATION*
