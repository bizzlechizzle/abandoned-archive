# Folder Drop → New Location Implementation Plan

**Feature**: Drag folder onto "New Location" button to create location + auto-import
**Date**: 2025-12-17

---

## Summary

Enable users to drag a folder onto the "New Location" sidebar button. This will:
1. Open the ImportModal with the folder name pre-filled as the location name
2. After location creation, automatically start importing the folder's contents
3. Navigate to the LocationDetail page with the import already in progress

---

## Current Architecture

### Files Involved

| File | Current Role |
|------|--------------|
| `packages/desktop/src/components/Navigation.svelte` | Contains "New Location" button (line 62-67) |
| `packages/desktop/src/stores/import-modal-store.ts` | Global store for modal state + prefilled data |
| `packages/desktop/src/components/ImportModal.svelte` | Location creation popup |
| `packages/desktop/src/pages/LocationDetail.svelte` | Handles `?autoImport=true` (scrolls to import zone) |

### Current Flow

```
User clicks "New Location" button
  → openImportModal() called (no prefill)
  → ImportModal opens
  → User fills Name + State
  → Clicks "Create"
  → location:create IPC call
  → Navigate to /location/{locid}?autoImport=true
  → LocationDetail scrolls to import zone
  → User manually drops/selects files
```

### Target Flow

```
User drags folder onto "New Location" button
  → Folder path extracted from drop event
  → openImportModal({ name: folderName, pendingImportPaths: [folderPath] })
  → ImportModal opens with name pre-filled
  → Shows "1 folder ready to import" indicator
  → User fills State, clicks "Create"
  → location:create IPC call
  → Auto-trigger media:import IPC with pendingImportPaths
  → Navigate to /location/{locid}
  → Import already running, progress visible
```

---

## Implementation Steps

### Step 1: Update import-modal-store.ts

Add `pendingImportPaths` to the prefilled data interface:

```typescript
interface ImportModalState {
  isOpen: boolean;
  prefilledData?: {
    name?: string;
    gps_lat?: number;
    gps_lng?: number;
    gps_source?: GpsSource;
    state?: string;
    type?: string;
    refPointId?: string;
    // NEW: Folder paths to import after location creation
    pendingImportPaths?: string[];
  };
}
```

### Step 2: Update Navigation.svelte

Convert the "New Location" button into a drop target:

1. Add drag state: `let isDraggingFolder = $state(false);`
2. Add drag event handlers:
   - `ondragover` - Set visual feedback, check for folders
   - `ondragleave` - Reset visual state
   - `ondrop` - Extract folder path, call openImportModal with prefill
3. Extract folder name from path for pre-fill
4. Style changes for drag-over state (dashed border, highlight)

Key implementation details:
- Use `event.dataTransfer.items` to check for directories
- Extract folder name: `path.split('/').pop() || path.split('\\').pop()`
- Only accept folders (reject individual files with helpful tooltip)

### Step 3: Update ImportModal.svelte

1. Add visual indicator when `pendingImportPaths` exists:
   - Show folder icon + "X folder(s) ready to import"
   - Display folder name(s) in a subtle list
2. After location creation, trigger import:
   - Before navigating, call `window.electronAPI.media.import(locid, pendingImportPaths)`
   - Don't wait for import to complete (async)
   - Navigate immediately to LocationDetail
3. Update navigation to not include `?autoImport=true` (import already started)

### Step 4: No Changes Needed to LocationDetail

The existing import progress UI will handle displaying the running import. The import-store will be updated by the orchestrator's progress events.

---

## Code Changes Summary

| File | Change Type | Lines Changed |
|------|-------------|---------------|
| `import-modal-store.ts` | Add interface field | ~3 lines |
| `Navigation.svelte` | Add drag handlers + styles | ~50 lines |
| `ImportModal.svelte` | Add indicator + auto-import | ~30 lines |

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| User drops file (not folder) | Ignore drop, show tooltip "Drop a folder to create a location" |
| User drops multiple folders | Accept first folder only OR show picker? → **Decision: Accept first folder** |
| Folder name is empty/invalid | Fall back to "Untitled" and let user edit |
| User cancels modal after drop | Clear pendingImportPaths, no import happens |
| Import fails after creation | Location exists, import errors show in LocationDetail |

---

## Testing Checklist

- [ ] Drag folder onto button shows visual feedback (border highlight)
- [ ] Drop folder opens modal with name pre-filled
- [ ] "Ready to import" indicator shows folder path
- [ ] Clicking Cancel clears pending import
- [ ] Clicking Create starts import + navigates
- [ ] Import progress shows on LocationDetail
- [ ] Dropping file (not folder) shows rejection feedback
- [ ] Normal button click still works (no prefill)
- [ ] Build succeeds: `pnpm build`
- [ ] Dev mode works: `pnpm dev`

---

## Audit Checklist vs CLAUDE.md

- [x] **Scope Discipline**: Only adds requested feature, no extras
- [x] **Archive-First**: Serves import workflow
- [x] **Offline-First**: Uses existing local import pipeline
- [x] **One Script = One Function**: Modifying existing files, not creating new ones
- [x] **Keep It Simple**: Minimal changes, leverages existing stores/components
- [x] **Real-Time UI Updates**: Uses existing import-store progress system
- [x] **Verify Build Before Done**: Will run `pnpm build && pnpm dev`

---

## Implementation Guide for Less Experienced Coder

### Prerequisites
- Node.js 20+, pnpm 10+ installed
- Run `pnpm install` if not done
- Read the three files involved before editing

### File 1: import-modal-store.ts

Location: `packages/desktop/src/stores/import-modal-store.ts`

Find the `prefilledData` interface (around line 14-24) and add one new optional field:

```typescript
pendingImportPaths?: string[];  // Folder paths to import after create
```

That's the only change to this file.

### File 2: Navigation.svelte

Location: `packages/desktop/src/components/Navigation.svelte`

**Step A**: Add state variable at the top (after line 9):
```typescript
let isDraggingFolder = $state(false);
```

**Step B**: Add helper function (after line 33):
```typescript
function extractFolderName(path: string): string {
  const name = path.split('/').pop() || path.split('\\').pop() || 'Untitled';
  return name;
}

function handleDragOver(event: DragEvent) {
  event.preventDefault();
  event.stopPropagation();
  // Only accept if it looks like a file/folder drag
  if (event.dataTransfer?.types.includes('Files')) {
    isDraggingFolder = true;
    event.dataTransfer.dropEffect = 'copy';
  }
}

function handleDragLeave(event: DragEvent) {
  event.preventDefault();
  isDraggingFolder = false;
}

async function handleDrop(event: DragEvent) {
  event.preventDefault();
  event.stopPropagation();
  isDraggingFolder = false;

  const files = event.dataTransfer?.files;
  if (!files || files.length === 0) return;

  // Get the first item's path
  const firstFile = files[0];
  const filePath = (firstFile as any).path;

  if (!filePath) {
    console.warn('[Navigation] No path on dropped file');
    return;
  }

  // Extract folder name from path
  const folderName = extractFolderName(filePath);

  // Open modal with prefilled name and pending import path
  openImportModal({
    name: folderName,
    pendingImportPaths: [filePath],
  });
}
```

**Step C**: Update the button HTML (replace lines 62-67):
```svelte
<button
  onclick={() => openImportModal()}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
  class="w-full px-4 py-3 bg-braun-900 text-white rounded text-sm font-medium hover:bg-braun-600 transition-colors flex items-center justify-center
         {isDraggingFolder ? 'ring-2 ring-braun-400 ring-offset-2 bg-braun-600' : ''}"
>
  {isDraggingFolder ? 'Drop to Create' : 'New Location'}
</button>
```

### File 3: ImportModal.svelte

Location: `packages/desktop/src/components/ImportModal.svelte`

**Step A**: Add pending import indicator (after the GPS indicator, around line 661, inside the form conditional):

```svelte
<!-- Pending Import Indicator -->
{#if $importModal.prefilledData?.pendingImportPaths?.length}
  <div class="p-3 bg-braun-100 border border-braun-300 rounded flex items-center gap-2">
    <svg class="w-4 h-4 text-braun-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
    <p class="text-sm text-braun-700">
      {$importModal.prefilledData.pendingImportPaths.length} folder ready to import
    </p>
  </div>
{/if}
```

**Step B**: Modify handleCreate() to auto-trigger import (modify the function starting at line 368):

Find the section after location creation (around line 394-396) and update it:

```typescript
// Auto-trigger import if we have pending paths
const pendingPaths = $importModal.prefilledData?.pendingImportPaths;
if (pendingPaths?.length && newLocation?.locid) {
  // Start import async - don't wait for completion
  window.electronAPI.media.import(newLocation.locid, pendingPaths).catch(err => {
    console.error('[ImportModal] Auto-import failed:', err);
  });
}

closeImportModal();
const successMsg = isHostLocation
  ? 'Host location created - add buildings from the location page'
  : pendingPaths?.length
    ? 'Location created - import starting...'
    : 'Location created';
toasts.success(successMsg);

if (newLocation?.locid) {
  // Navigate without autoImport flag - import already triggered
  router.navigate(`/location/${newLocation.locid}`);
}
```

### Testing

After making changes:

```bash
# Build to check for TypeScript errors
pnpm build

# Run in dev mode to test
pnpm dev
```

Test sequence:
1. Drag a folder onto "New Location" button
2. Verify modal opens with folder name pre-filled
3. Fill in State field
4. Click Create
5. Verify you're navigated to LocationDetail
6. Verify import progress appears

---

End of Implementation Plan
