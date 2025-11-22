# Where's Waldo 10: Master Issue List & Implementation Plan

Date: 2025-11-22
Status: **READY FOR IMPLEMENTATION**

---

## MASTER ISSUE LIST

### PHASE 1: CRITICAL BUGS (Must Fix First - Nothing Works Without These)

| # | Issue | File | Line | Fix | Status |
|---|-------|------|------|-----|--------|
| 1.1 | Type violation: `'unknown'` not in type union | `file-import-service.ts` | 222 | Change to `'document'` | [ ] TODO |
| 1.2 | Progress sent BEFORE work completes | `file-import-service.ts` | 196-198 | Move after try block | [ ] TODO |
| 1.3 | Silent success on total failure | `LocationDetail.svelte` | 364-377 | Add error feedback | [ ] TODO |
| 1.4 | IPC sender not validated (crash risk) | `ipc-handlers.ts` | 617-620 | Wrap in try-catch | [ ] TODO |
| 1.5 | No user-visible error messages | `LocationDetail.svelte` | 364-377 | Add toast notifications | [ ] TODO |

### PHASE 2: ARCHITECTURAL ISSUES (Performance & Reliability)

| # | Issue | File | Impact | Fix | Status |
|---|-------|------|--------|-----|--------|
| 2.1 | Heavy I/O blocks main thread | `file-import-service.ts` | Dashboard freezes | Add `setImmediate()` yields | [ ] TODO |
| 2.2 | All files in single transaction | `file-import-service.ts` | 184-258 | Per-file transactions | [ ] TODO |
| 2.3 | ExifTool global singleton | `exiftool-service.ts` | Queue exhaustion | Document limitation | [ ] TODO |
| 2.4 | SQLite write lock during import | `file-import-service.ts` | Read queries blocked | Per-file transactions | [ ] TODO |

### PHASE 3: MISSING FEATURES (Per Logseq Spec)

| # | Spec Step | Current Status | What's Missing | Status |
|---|-----------|----------------|----------------|--------|
| 3.1 | #import_exiftool | Images only | Add for videos, documents, maps | [ ] TODO |
| 3.2 | #import_gps | Images only | Add for videos (dashcams) | [ ] TODO |
| 3.3 | #import_address | NOT IMPLEMENTED | Reverse geocoding GPS→address | [ ] TODO |
| 3.4 | #import_maps | Files stored only | Parse geo-data from .gpx/.kml | [ ] TODO |

### PHASE 4: PREMIUM UX (Archive App Quality)

| # | Feature | Current | Target | Status |
|---|---------|---------|--------|--------|
| 4.1 | Progress indicator | Shows % only | Show current filename | [ ] TODO |
| 4.2 | Error details | None shown | Per-file error list | [ ] TODO |
| 4.3 | Cancel button | Not available | Allow abort | [ ] TODO |
| 4.4 | Retry failed | Not available | Retry individual files | [ ] TODO |
| 4.5 | Dashboard during import | Appears frozen | Shows "import in progress" banner | [ ] TODO |
| 4.6 | Toast notifications | None | Success/warning/error toasts | [ ] TODO |

---

## PHASE 1 DETAILED FIXES

### Issue 1.1: Type Violation

**Problem**: Error results use invalid type `'unknown'`

**Location**: `packages/desktop/electron/services/file-import-service.ts:222`

**Current Code**:
```typescript
results.push({
  success: false,
  hash: '',
  type: 'unknown',  // <-- BUG: Not in type union
  duplicate: false,
  error: error instanceof Error ? error.message : 'Unknown error',
});
```

**Fix**:
```typescript
results.push({
  success: false,
  hash: '',
  type: 'document',  // <-- FIXED: Use valid type
  duplicate: false,
  error: error instanceof Error ? error.message : 'Unknown error',
});
```

**Impact**: Error files excluded from counts, type filter breaks

---

### Issue 1.2: Progress Before Work

**Problem**: Progress events fire before file processing

**Location**: `packages/desktop/electron/services/file-import-service.ts:196-198`

**Current Code**:
```typescript
for (let i = 0; i < files.length; i++) {
  const file = files[i];

  // BUG: Progress reported BEFORE work
  if (onProgress) {
    onProgress(i + 1, files.length);
  }

  try {
    const result = await this.importSingleFile(file, deleteOriginals, trx);
```

**Fix**:
```typescript
for (let i = 0; i < files.length; i++) {
  const file = files[i];

  try {
    const result = await this.importSingleFile(file, deleteOriginals, trx);
    results.push(result);

    // FIXED: Progress AFTER completion
    if (onProgress) {
      onProgress(i + 1, files.length);
    }

    if (result.success) {
      // ... existing logic
    }
  } catch (error) {
    console.error('[FileImport] Error importing file', file.originalName, ':', error);
    results.push({
      success: false,
      hash: '',
      type: 'document',
      duplicate: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    errors++;

    // FIXED: Progress on error too (so UI doesn't stall)
    if (onProgress) {
      onProgress(i + 1, files.length);
    }
  }
}
```

---

### Issue 1.3: Silent Success on Total Failure

**Problem**: Frontend shows "complete" even when all files fail

**Location**: `packages/desktop/src/pages/LocationDetail.svelte:364-377`

**Current Code**:
```typescript
window.electronAPI.media.import({...})
  .then((result) => {
    importStore.completeJob({
      imported: result.imported,
      duplicates: result.duplicates,
      errors: result.errors,
    });
    loadLocation();
  })
```

**Fix**:
```typescript
window.electronAPI.media.import({...})
  .then((result) => {
    importStore.completeJob({
      imported: result.imported,
      duplicates: result.duplicates,
      errors: result.errors,
    });

    // FIXED: Show meaningful feedback
    if (result.errors > 0 && result.imported === 0) {
      // All failed
      importProgress = `Import failed: ${result.errors} files could not be imported`;
    } else if (result.errors > 0) {
      // Partial success
      importProgress = `Imported ${result.imported} files. ${result.errors} failed.`;
    } else if (result.imported > 0) {
      // Full success
      importProgress = `Successfully imported ${result.imported} files`;
    } else if (result.duplicates > 0) {
      // All duplicates
      importProgress = `${result.duplicates} files were already in archive`;
    }

    loadLocation();

    // Keep message visible longer for errors
    setTimeout(() => { importProgress = ''; }, result.errors > 0 ? 10000 : 3000);
  })
```

---

### Issue 1.4: IPC Sender Not Validated

**Problem**: `_event.sender.send()` crashes if window closed during import

**Location**: `packages/desktop/electron/main/ipc-handlers.ts:617-620`

**Current Code**:
```typescript
const result = await fileImportService.importFiles(
  filesForImport,
  validatedInput.deleteOriginals,
  (current, total) => {
    _event.sender.send('media:import:progress', { current, total });
  }
);
```

**Fix**:
```typescript
const result = await fileImportService.importFiles(
  filesForImport,
  validatedInput.deleteOriginals,
  (current, total) => {
    try {
      if (_event.sender && !_event.sender.isDestroyed()) {
        _event.sender.send('media:import:progress', { current, total });
      }
    } catch (e) {
      console.warn('[media:import] Failed to send progress:', e);
    }
  }
);
```

---

### Issue 1.5: No User-Visible Error Messages

**Problem**: Errors logged to console but user sees nothing

**What's Missing**:
- Toast notification system
- Error summary in UI
- Per-file error details

**Fix**: Use the importProgress state variable (already exists) to show messages. See Issue 1.3 fix.

---

## PHASE 2 DETAILED FIXES

### Issue 2.1: Heavy I/O Blocks Main Thread

**Problem**: 15 NEF files = ~1.5GB I/O blocks event loop

**Impact**:
- Dashboard queries wait in queue
- App appears frozen
- IPC messages delayed

**Fix Option A**: Add `setImmediate()` yields between files

```typescript
for (let i = 0; i < files.length; i++) {
  // ... process file ...

  // Yield to event loop between files
  await new Promise(resolve => setImmediate(resolve));
}
```

**Fix Option B**: Worker Threads (future enhancement)

---

### Issue 2.2: All Files in Single Transaction

**Problem**: One transaction for 15 files, any error affects all

**Current Code**:
```typescript
return await this.db.transaction().execute(async (trx) => {
  for (let i = 0; i < files.length; i++) {
    // All files in one transaction
  }
});
```

**Fix**: Per-file transactions

```typescript
const results: ImportResult[] = [];
let imported = 0, duplicates = 0, errors = 0;

for (let i = 0; i < files.length; i++) {
  try {
    const result = await this.db.transaction().execute(async (trx) => {
      return await this.importSingleFile(files[i], deleteOriginals, trx);
    });
    results.push(result);
    // ... count logic ...
  } catch (error) {
    results.push({ success: false, ... });
    errors++;
  }

  onProgress?.(i + 1, files.length);
  await new Promise(resolve => setImmediate(resolve));
}

// Create import record after all files
const importId = await this.createImportRecord({...});
return { total: files.length, imported, duplicates, errors, results, importId };
```

---

## PHASE 3 DETAILED FIXES

### Issue 3.1: ExifTool for All File Types

**Current**: Only images get ExifTool metadata

**Fix**: Run ExifTool on videos and documents too

```typescript
// In importSingleFile, Step 5:
if (type === 'image' || type === 'video' || type === 'document') {
  try {
    const exifData = await this.exifToolService.extractMetadata(file.filePath);
    metadata = { ...metadata, exif: exifData };
  } catch (e) {
    console.warn('[FileImport] ExifTool failed:', e);
  }
}

if (type === 'video') {
  // Also run FFmpeg for video-specific data
  const ffmpegData = await this.ffmpegService.extractMetadata(file.filePath);
  metadata = { ...metadata, ffmpeg: ffmpegData };
}
```

---

### Issue 3.2: GPS from Videos

**Current**: GPS only extracted from images

**Fix**: ExifTool extracts GPS from video files too (dashcams, phones)

```typescript
// After ExifTool extraction for videos:
if (type === 'video' && metadata?.exif?.gps) {
  // Store GPS from video
  videoRecord.meta_gps_lat = metadata.exif.gps.lat;
  videoRecord.meta_gps_lng = metadata.exif.gps.lng;
}
```

**Requires**: Add `meta_gps_lat`, `meta_gps_lng` columns to `vids` table

---

### Issue 3.3: #import_address - Reverse Geocoding

**Current**: GPS stored but not converted to address

**Fix**: Call geocoding service when GPS found

```typescript
// After GPS extraction:
if (metadata?.gps) {
  try {
    const geoResult = await this.geocodingService.reverseGeocode(
      metadata.gps.lat,
      metadata.gps.lng
    );
    if (geoResult) {
      metadata.address = {
        street: geoResult.address?.road,
        city: geoResult.address?.city,
        state: geoResult.address?.state,
        country: geoResult.address?.country,
      };
    }
  } catch (e) {
    console.warn('[FileImport] Reverse geocoding failed:', e);
  }
}
```

**Requires**:
- Add `meta_address_*` columns to imgs/vids tables
- Pass geocodingService to FileImportService constructor

---

### Issue 3.4: Parse Map Files

**Current**: .gpx/.kml files stored but not parsed

**Fix**: Parse geo-data on import

```typescript
if (type === 'map') {
  try {
    const ext = path.extname(file.filePath).toLowerCase();
    if (ext === '.gpx') {
      metadata.mapData = await this.parseGPX(file.filePath);
    } else if (ext === '.kml' || ext === '.kmz') {
      metadata.mapData = await this.parseKML(file.filePath);
    } else if (ext === '.geojson') {
      metadata.mapData = JSON.parse(await fs.readFile(file.filePath, 'utf-8'));
    }
  } catch (e) {
    console.warn('[FileImport] Map parsing failed:', e);
  }
}
```

**Requires**: GPX/KML parser library (e.g., `fast-xml-parser`)

---

## PHASE 4 DETAILED FIXES

### Issue 4.1-4.6: Premium UX Features

These are enhancement features to implement after core bugs are fixed:

1. **Progress with filename**: Send filename in progress event
2. **Error details**: Store and display per-file errors
3. **Cancel button**: Add abort controller
4. **Retry failed**: Store failed files, offer retry
5. **Dashboard banner**: Show import status globally
6. **Toast notifications**: Add toast component

---

## IMPLEMENTATION ORDER

```
PHASE 1 (CRITICAL - Do First):
  1.1 Type violation         → 1 line change
  1.2 Progress timing        → ~10 lines
  1.3 Error feedback         → ~15 lines
  1.4 IPC safety             → ~8 lines
  1.5 User messages          → (included in 1.3)

PHASE 2 (PERFORMANCE - Do Second):
  2.1 Event loop yields      → ~3 lines per location
  2.2 Per-file transactions  → ~30 line refactor

PHASE 3 (FEATURES - Do Third):
  3.1 ExifTool for all       → ~10 lines + DB columns
  3.2 Video GPS              → ~5 lines + DB columns
  3.3 Reverse geocoding      → ~20 lines + dependency
  3.4 Map parsing            → ~30 lines + library

PHASE 4 (UX - Do Last):
  4.1-4.6 Various UI features
```

---

## VERIFICATION CHECKLIST

After implementing Phase 1, verify:

1. [ ] Drop 15 NEF files onto location
2. [ ] Console shows `[FileImport] Starting batch import of 15 files`
3. [ ] Console shows `[FileImport] Step 0: Pre-fetching location data...`
4. [ ] Progress bar updates AFTER each file (not before)
5. [ ] If errors occur, UI shows error count
6. [ ] If all succeed, files appear in location media section
7. [ ] Dashboard is NOT frozen during import
8. [ ] Archive folder contains copied files with SHA256 names

---

## FILE LOCATIONS QUICK REFERENCE

| File | Path |
|------|------|
| File Import Service | `packages/desktop/electron/services/file-import-service.ts` |
| IPC Handlers | `packages/desktop/electron/main/ipc-handlers.ts` |
| Location Detail UI | `packages/desktop/src/pages/LocationDetail.svelte` |
| Import Store | `packages/desktop/src/stores/import-store.ts` |
| ExifTool Service | `packages/desktop/electron/services/exiftool-service.ts` |
| FFmpeg Service | `packages/desktop/electron/services/ffmpeg-service.ts` |
| Preload Script | `packages/desktop/electron/preload/preload.cjs` |

---

## METADATA DUMP STATUS

| File Type | ExifTool | FFmpeg | GPS | Address | Currently |
|-----------|----------|--------|-----|---------|-----------|
| Images | **YES** | N/A | **YES** | NO | Working |
| Videos | NO | **YES** | NO | NO | Partial |
| Documents | NO | N/A | N/A | N/A | Not extracted |
| Maps | NO | N/A | NO | N/A | Not parsed |

**After Phase 3**:

| File Type | ExifTool | FFmpeg | GPS | Address |
|-----------|----------|--------|-----|---------|
| Images | **YES** | N/A | **YES** | **YES** |
| Videos | **YES** | **YES** | **YES** | **YES** |
| Documents | **YES** | N/A | N/A | N/A |
| Maps | **YES** | N/A | **YES** | N/A |

---

End of Report
