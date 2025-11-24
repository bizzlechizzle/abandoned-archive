# v0.10 Launch Cleanup Steps

## Executive Summary

This document outlines cleanup and improvement tasks for the AU Archive Desktop App to prepare for launch. All changes focus on **PUEA (Premium User Experience Always)** and **AAA (Archive App Always)** principles.

**Goal:** Streamlined, intuitive location management with fewer clicks, cleaner data, and better UX.

---

## Priority Overview

| Priority | Category | Impact | Effort |
|----------|----------|--------|--------|
| P0 | Data Model: Access Status Migration | HIGH | HIGH |
| P1 | UX: Pop-up Import Form | HIGH | MEDIUM |
| P2 | UX: State/Type Dependencies | MEDIUM | MEDIUM |
| P3 | Atlas: Core Improvements | HIGH | MEDIUM |
| P4 | Location Page Fixes | MEDIUM | LOW |
| P5 | Browser Fixes | MEDIUM | LOW |
| P6 | Cleanup: Darktable Removal | LOW | LOW |
| P7 | Cleanup: Navigation & Dashboard | LOW | LOW |

---

## Implementation Guide

### PHASE 1: Data Model Cleanup (Do First - Breaking Changes)

---

#### P0: Access Status Migration

**What:** Consolidate `condition` and `status` fields into single `access` field.

**Why:**
- Current schema has 3 overlapping fields: `condition`, `status`, `access`
- Users confused about which to use
- Simplifies data entry and queries

**New Access Status Values:**
- Abandoned
- Demolished
- Active
- Partially Active
- Future Classic
- Vacant
- Unknown

**Files to Modify:**

| File | Location | Action |
|------|----------|--------|
| schema.sql | `electron/main/schema.sql` | Remove columns, update constraints |
| locations.ts | `electron/main/ipc-handlers/locations.ts` | Remove field handling |
| ImportForm.svelte | `src/components/ImportForm.svelte` | Remove condition/status dropdowns |
| LocationEditForm.svelte | `src/components/LocationEditForm.svelte` | Remove condition/status fields |
| LocationInfo.svelte | `src/components/location/LocationInfo.svelte` | Update display |
| location.ts | `packages/core/src/domain/location.ts` | Update type definitions |

**Step-by-Step Implementation:**

```
STEP 1: Create Migration Script
----------------------------------------
Location: electron/main/migrations/
File: 001-access-status-consolidation.ts

1. Map existing data:
   - condition='abandoned' OR status='abandoned' → access='Abandoned'
   - condition='demolished' → access='Demolished'
   - condition='active' OR status='active' → access='Active'
   - condition='vacant' OR status='vacant' → access='Vacant'
   - (no match) → access='Unknown'

2. Run migration to populate access field

3. Verify all rows have access value

STEP 2: Update Schema (after migration verified)
----------------------------------------
1. Remove 'condition' column from locs table
2. Remove 'status' column from locs table
3. Update indexes if any reference these columns

STEP 3: Update Backend
----------------------------------------
1. Update IPC handler to not accept condition/status
2. Update any queries that filter by condition/status
3. Update location repository create/update methods

STEP 4: Update Frontend
----------------------------------------
1. Remove condition dropdown from ImportForm.svelte
2. Remove status dropdown from ImportForm.svelte
3. Remove from LocationEditForm.svelte
4. Update LocationInfo.svelte to show only access

STEP 5: Test
----------------------------------------
1. Create new location - verify only access field
2. Edit existing location - verify access saves correctly
3. Filter by access - verify queries work
4. Verify no references to condition/status remain
```

**Testing Checklist:**
- [ ] Migration script runs without errors
- [ ] All existing locations have valid access value
- [ ] New location creation works
- [ ] Location editing works
- [ ] No console errors about missing fields

---

### PHASE 2: Pop-up Import System (Core UX Change)

---

#### P1: Global Import Pop-up Form

**What:** Replace dedicated `/imports` page with global pop-up modal accessible anywhere.

**Why:**
- Faster workflow - no page navigation
- Consistent access from any screen
- Matches Squarespace-style pop-up forms

**Architecture Decision:**
- Modal component at App.svelte level (global)
- Trigger button in Navigation.svelte header
- Event-based open/close via store

**Files to Create:**

| File | Location | Purpose |
|------|----------|---------|
| ImportModal.svelte | `src/components/ImportModal.svelte` | New modal component |
| import-modal-store.ts | `src/stores/import-modal-store.ts` | Modal state management |

**Files to Modify:**

| File | Location | Action |
|------|----------|--------|
| App.svelte | `src/App.svelte` | Add modal at root level |
| Navigation.svelte | `src/components/Navigation.svelte` | Add "+ New Location" button, remove Imports nav item |
| router.ts | `src/stores/router.ts` | Remove /imports route (optional) |

**Pop-up Form Fields (Step 1 - Quick Add):**
1. Name (required) - text input
2. Type (required) - dropdown, filtered by State
3. State (required) - dropdown
4. Author - text input (can default to user)
5. Documentation Level - dropdown
6. Access Status - dropdown (new consolidated field)

**Step 2 Details (on Location Edit Page):**
- GPS coordinates
- Address
- Additional metadata

**Step-by-Step Implementation:**

```
STEP 1: Create Modal Store
----------------------------------------
Location: src/stores/import-modal-store.ts

import { writable } from 'svelte/store';

interface ImportModalState {
  isOpen: boolean;
  prefilledData?: {
    gps_lat?: number;
    gps_lng?: number;
    state?: string;
    type?: string;
  };
}

export const importModal = writable<ImportModalState>({ isOpen: false });

export function openImportModal(prefill?: ImportModalState['prefilledData']) {
  importModal.set({ isOpen: true, prefilledData: prefill });
}

export function closeImportModal() {
  importModal.set({ isOpen: false });
}

STEP 2: Create ImportModal Component
----------------------------------------
Location: src/components/ImportModal.svelte

- Use existing modal pattern from Atlas.svelte
- Import fields: Name, Type, State, Author, Documentation Level, Access Status
- On submit: create location via electronAPI.locations.create()
- On success: close modal, show toast, optionally navigate to new location

STEP 3: Add to App.svelte
----------------------------------------
- Import ImportModal component
- Import importModal store
- Render modal when $importModal.isOpen is true

STEP 4: Update Navigation.svelte
----------------------------------------
- Add "+ New Location" button in header area
- Button calls openImportModal()
- Remove "Imports" from navigation menu items
- Keep Atlas at top of navigation

STEP 5: Add Triggers Elsewhere
----------------------------------------
- Current Page: Add "New Location" button
- Atlas: Right-click "Add Location" opens modal (already has similar)
- Consider: Keyboard shortcut (Ctrl+N or Ctrl+I)

STEP 6: Handle Post-Submit ✅ CONFIRMED
----------------------------------------
On successful location creation:
1. Close modal
2. Show toast "Location created"
3. Navigate to new location detail page
4. User adds GPS, address, other Step 2 details on location page
```

**Testing Checklist:**
- [ ] Modal opens from Navigation button
- [ ] Modal opens from Current Page button
- [ ] All form fields work correctly
- [ ] Type dropdown filters by State
- [ ] Location creates successfully
- [ ] Toast notification appears
- [ ] Navigation to new location works
- [ ] Modal closes on escape key
- [ ] Modal closes on backdrop click

---

#### P2: State/Type Field Dependencies

**What:** Type dropdown filters based on selected State.

**Why:**
- Not all types exist in all states
- Reduces user confusion
- Smarter defaults prevent invalid combinations

**Logic:**
1. When State changes → filter Type options to only show types that exist in that state
2. If current Type has no results in new State → default Type to "all"
3. If Type changes and has no results in current State → default State to "all"

**Files to Modify:**

| File | Location | Action |
|------|----------|--------|
| ImportModal.svelte | `src/components/ImportModal.svelte` | Add dependency logic |
| ImportForm.svelte | `src/components/ImportForm.svelte` | Add dependency logic (if keeping) |
| locations.ts | `electron/main/ipc-handlers/locations.ts` | Add query for types-by-state |

**Step-by-Step Implementation:**

```
STEP 1: Add Backend Query
----------------------------------------
Location: electron/main/ipc-handlers/locations.ts

Add IPC handler: 'locations:getTypesByState'
- Input: state (string) or null for all
- Output: string[] of unique types in that state
- Query: SELECT DISTINCT type FROM locs WHERE address_state = ? AND type IS NOT NULL

STEP 2: Add to Preload
----------------------------------------
Location: electron/preload/index.ts

Add: getTypesByState: (state) => ipcRenderer.invoke('locations:getTypesByState', state)

STEP 3: Update Form Component
----------------------------------------
In ImportModal.svelte:

let availableTypes = $state<string[]>([]);
let selectedState = $state<string>('');
let selectedType = $state<string>('');

// When state changes, fetch available types
$effect(() => {
  if (selectedState) {
    window.electronAPI.locations.getTypesByState(selectedState)
      .then(types => {
        availableTypes = types;
        // Reset type if not available in new state
        if (selectedType && !types.includes(selectedType)) {
          selectedType = '';
        }
      });
  }
});

STEP 4: Update Dropdowns ✅ DATABASE-DRIVEN
----------------------------------------
- State dropdown: Query DB for states with locations
  `SELECT DISTINCT address_state FROM locs WHERE address_state IS NOT NULL`
- Type dropdown: Query DB for types in selected state
  `SELECT DISTINCT type FROM locs WHERE address_state = ? AND type IS NOT NULL`
- Show "All" option when no specific selection
```

**Testing Checklist:**
- [ ] Type dropdown shows only types for selected state
- [ ] Changing state updates type options
- [ ] Invalid type selection resets appropriately
- [ ] "All" option works correctly

---

### PHASE 3: Atlas Improvements

---

#### P3a: Pin Colors to Accent Color

**What:** Change map pin colors to use brand accent color (#b9975c).

**Where:** `src/components/Map.svelte`

**Implementation:**
```svelte
// Find marker styling code
// Update color from current to accent color

const accentColor = '#b9975c';

// Update L.divIcon or marker options
```

---

#### P3b: Mini Location Pop-up on Pin Click

**What:** Show preview popup instead of navigating directly to location page.

**Why:**
- Preview before committing to navigation
- Faster browsing of multiple locations
- Match common map UX patterns

**Popup Content:**
- Location name
- Type
- Thumbnail image (if available)
- "View Details" button → navigates to location page

**Where:** `src/components/Map.svelte` or `src/pages/Atlas.svelte`

**Implementation:**
```
STEP 1: Create popup content
----------------------------------------
Use Leaflet's bindPopup() with HTML content:

marker.bindPopup(`
  <div class="location-popup">
    <h3>${location.locnam}</h3>
    <p>${location.type || 'Unknown Type'}</p>
    <button onclick="navigateToLocation('${location.locid}')">
      View Details
    </button>
  </div>
`);

STEP 2: Style popup
----------------------------------------
Add CSS for .location-popup in app.css or component styles

STEP 3: Handle navigation
----------------------------------------
Expose navigation function to window or use custom events
```

---

#### P3c: Additional Map Layers

**What:** Add more free/open-source map tile layers.

**Why:** Users prefer different map styles for different tasks.

**Suggested Layers:**
- OpenStreetMap (already have)
- ESRI Satellite (already have)
- OpenTopoMap (already have)
- Stamen Terrain
- Stamen Toner (high contrast)
- CartoDB Positron (light)
- CartoDB Dark Matter (dark mode)

**Where:** `src/components/Map.svelte` - tile layer configuration

---

#### P3d: Fix Right-Click Map Freeze

**What:** Right-clicking map freezes it - should show context menu.

**Why:** Bug breaking core GPS-first workflow.

**Debug Steps:**
1. Check browser console for errors on right-click
2. Check if contextmenu event is being captured
3. Check if Leaflet event propagation is blocked
4. Test if issue is in Map.svelte or Atlas.svelte

**Right-Click Context Menu Options:**
- Add to map (create location here)
- Copy GPS coordinates

**Where:** `src/pages/Atlas.svelte` - right-click handler

---

### PHASE 4: Location Page Fixes

---

#### P4a: Remove "Source: geocoded_address"

**What:** Remove display of GPS source when it shows "geocoded_address".

**Why:** Internal implementation detail, not useful to users.

**Where:** `src/components/location/LocationMapSection.svelte` or similar

---

#### P4b: Fix "Approximate Location" Message

**What:** Only show "Approximate location" message when GPS is actually missing/defaulted.

**Current Problem:** Shows even when location has real GPS coordinates.

**Logic:**
```
IF gps_lat AND gps_lng exist AND gps_source != 'geocoded_address':
  → Show actual GPS, no warning
ELSE IF gps_source == 'geocoded_address':
  → Show "Location based on address geocoding"
ELSE IF no GPS but has state:
  → Show "Approximate location - Based on state center"
ELSE:
  → Show "No location data"
```

**Where:** `src/components/location/LocationMapSection.svelte`

---

#### P4c: Location Box Organization

**What:** Organize location box to clearly show: Address, GPS, Map

**Layout:**
```
┌─────────────────────────────┐
│ ADDRESS                     │
│ 123 Main St                 │
│ Albany, NY 12207            │
├─────────────────────────────┤
│ GPS                         │
│ 42.6526° N, 73.7562° W      │
│ Source: Map Click ✓         │
├─────────────────────────────┤
│ [      MINI MAP        ]    │
│ [                      ]    │
└─────────────────────────────┘
```

---

### PHASE 5: Browser Fixes

---

#### P5a: Investigate abandonedupstate.com Browser Failure

**What:** Internal browser fails to load abandonedupstate.com but real browser works.

**Debug Steps:**
1. Check Electron webview security settings
2. Check CSP (Content Security Policy) headers
3. Check if site blocks embedded frames
4. Check console errors in webview

---

#### P5b: Rename "Save Bookmark To" → "Save Bookmark"

**What:** Simpler label.

**Where:** Browser component - find the button/label

---

#### P5c: Fix Recents Autofill

**What:** "Save Bookmark → Recents" should autofill last 5 recent locations.

**Debug Steps:**
1. Check if recent locations query works
2. Check if data is being passed to component
3. Check if dropdown is rendering options

---

#### P5d: Remove "Recent Uploads"

**What:** Remove "Recent Uploads" section - redundant with recent locations.

**Where:** Browser component or related page

---

#### P5e: Bookmarks Browser Pre-fill

**What:** Consider pre-filling state and type in bookmarks browser from database.

**Decision Needed:** Is this necessary? Discuss with user.

---

### PHASE 6: Cleanup Tasks

---

#### P6: Remove Darktable Completely

**What:** Remove all Darktable references - not using this feature.

**Search Pattern:** `darktable` (case-insensitive)

**Files Likely Affected:**
- Install scripts
- Settings page
- Any RAW processing components
- Package.json dependencies (if any)

**Items to Remove:**
- "Darktable RAW Processing" section
- "Darktable CLI Not Found" message
- "Install Darktable for premium RAW processing: darktable.org/install"

---

#### P7a: Move Atlas to Top of Navigation

**What:** Reorder navigation menu - Atlas first.

**Where:** `src/components/Navigation.svelte`

**Current Order:** Dashboard, Locations, Browser, Imports, Search, Settings, Atlas

**New Order:** Atlas, Dashboard, Locations, Browser, Search, Settings
(Note: Imports removed per P1)

**Important:** Still default to Dashboard on app load (don't change initial route).

---

#### P7b: Remove "Special Filters" from Dashboard

**What:** Remove "Map View" special filter - redundant with Atlas.

**Where:** Dashboard page component

---

### PHASE 7: Current Page Enhancement

---

#### P7c: Add "New Location" Button to Current Page

**What:** Add button that opens import modal.

**Where:** Determine which component represents "Current Page"

**Implementation:** Button that calls `openImportModal()`

---

## Implementation Order (Recommended)

```
WEEK 1: Data Foundation
├── P0: Access Status Migration (CRITICAL - do first)
│   ├── Create migration script
│   ├── Test migration on copy of database
│   ├── Run migration
│   └── Update all affected files
└── P6: Remove Darktable (quick cleanup)

WEEK 2: Core UX
├── P1: Pop-up Import Form
│   ├── Create store
│   ├── Create modal component
│   ├── Integrate into App.svelte
│   ├── Update Navigation
│   └── Test thoroughly
└── P2: State/Type Dependencies
    ├── Add backend query
    ├── Update form logic
    └── Test combinations

WEEK 3: Atlas & Maps
├── P3a: Pin colors
├── P3b: Mini popup
├── P3c: Map layers
└── P3d: Right-click fix

WEEK 4: Polish & Fixes
├── P4: Location Page fixes
├── P5: Browser fixes
├── P7a: Navigation reorder
├── P7b: Dashboard cleanup
└── P7c: Current Page button
```

---

## Resolved Decisions

1. **Data Migration:** ✅ ALWAYS backup database before migrations
   - `cp archive.db archive.db.backup` before any schema changes
   - Keep backups until changes verified working

2. **Types List:** ✅ Database-driven
   - Query: `SELECT DISTINCT type FROM locs WHERE type IS NOT NULL`
   - Filter by state when state is selected

3. **States List:** ✅ Database-driven
   - Query: `SELECT DISTINCT address_state FROM locs WHERE address_state IS NOT NULL`
   - Shows only states that have locations

4. **Post-Submit Behavior:** ✅ Navigate to new location page
   - After successful creation: close modal → navigate to location detail page
   - User can then add GPS, address, and other Step 2 details

5. **Bookmarks Browser:** ✅ Yes, necessary
   - Pre-fill State/Type dropdowns from database
   - Same pattern as Import Modal dropdowns

6. **Right-Click GPS:** ✅ Open Import Modal with pre-filled GPS
   - Right-click on map → get lat/lng coordinates
   - Open Import Modal with GPS pre-filled
   - User completes rest of form (Name, Type, State, etc.)
   - Matches GPS-first workflow from claude.md

---

## File Reference Quick Index

| Component | Path |
|-----------|------|
| Navigation | `src/components/Navigation.svelte` |
| Import Form | `src/components/ImportForm.svelte` |
| Import Page | `src/pages/Imports.svelte` |
| Atlas Page | `src/pages/Atlas.svelte` |
| Map Component | `src/components/Map.svelte` |
| Location Detail | `src/pages/LocationDetail.svelte` |
| Location Edit | `src/components/LocationEditForm.svelte` |
| Location Info | `src/components/location/LocationInfo.svelte` |
| Location Map | `src/components/location/LocationMapSection.svelte` |
| DB Schema | `electron/main/schema.sql` |
| IPC Handlers | `electron/main/ipc-handlers/` |
| Router Store | `src/stores/router.ts` |
| App Root | `src/App.svelte` |

---

## Success Criteria

### Implemented ✅

- [x] Access Status migration script created (run manually before schema change)
- [x] Pop-up import form works from anywhere (ImportModal.svelte)
- [x] State/Type filtering works correctly (in ImportModal)
- [x] Darktable UI removed from Settings
- [x] Navigation has Atlas at top
- [x] No console errors in production build (build passes)

### Remaining (Manual Testing Required)

- [ ] Access Status migration: run migration, verify data, remove columns
- [ ] Atlas pins use accent color
- [ ] Atlas mini popup shows on click
- [ ] Atlas right-click works (no freeze)
- [ ] Location page shows correct GPS status
- [ ] Remove remaining Darktable backend code
- [ ] Test toast notifications

---

## Notes for Less Experienced Developers

### Modal Pattern
All modals in this app follow the same pattern:
```svelte
{#if showModal}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
      <!-- Header -->
      <div class="p-4 border-b">
        <h2>Title</h2>
        <button on:click={() => showModal = false}>X</button>
      </div>
      <!-- Content -->
      <div class="p-4">
        <!-- Form fields here -->
      </div>
      <!-- Footer -->
      <div class="p-4 border-t flex justify-end gap-2">
        <button on:click={() => showModal = false}>Cancel</button>
        <button on:click={handleSubmit}>Save</button>
      </div>
    </div>
  </div>
{/if}
```

### IPC Pattern
To call backend from frontend:
```typescript
// Frontend (Svelte component)
const result = await window.electronAPI.locations.create(data);

// Backend (IPC handler)
ipcMain.handle('location:create', async (event, data) => {
  return await locationRepository.create(data);
});
```

### Store Pattern
```typescript
// store.ts
import { writable } from 'svelte/store';
export const myStore = writable(initialValue);

// component.svelte
import { myStore } from './stores/myStore';
$myStore // read value
myStore.set(newValue) // write value
```

### Testing Database Changes
1. Always backup database first: `cp archive.db archive.db.backup`
2. Test migration on copy
3. Verify data integrity after migration
4. Keep backup until confirmed working

---

_Document Version: 1.0_
_Last Updated: v0.10 Brainstorming Session_
