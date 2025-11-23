# Media Viewer & Archive Metadata System

Version: 0.1.0
Created: 2025-11-23
Status: Planning Phase

---

## Overview

Implementation plan for:
1. Built-in media viewer (images, RAW photos, videos)
2. Performance optimizations (PhotoMechanic-level speed)
3. Metadata architecture (XMP sidecars as source of truth)

### Core Principle: True Archive

```
┌─────────────────────────────────────────┐
│           SOURCE OF TRUTH               │
│   Files + XMP Sidecars (portable)       │
│   - Ratings, labels, keywords           │
│   - All user metadata                   │
└─────────────────┬───────────────────────┘
                  │ read/index
                  ▼
┌─────────────────────────────────────────┐
│           SPEED LAYER                   │
│   SQLite Database (cache/index)         │
│   - Fast queries                        │
│   - Rebuildable from XMP sidecars       │
└─────────────────────────────────────────┘
```

**An archive isn't an archive if metadata is trapped in a database.**

---

## Do Not Change

This section documents key architectural decisions. Do not modify without understanding the rationale.

### 1. XMP Sidecars as Source of Truth

**Decision:** All user metadata (ratings, labels, keywords) is written to XMP sidecar files. SQLite is a cache.

**Why:**
- Portability: Users can open files in PhotoMechanic, Lightroom, Bridge without AU Archive
- Disaster recovery: If database is deleted, rebuild from XMP sidecars
- Industry standard: XMP has been stable since 2001, will outlive this app
- True archive: Files are self-describing, not locked in proprietary database

**Do not:** Store metadata only in SQLite. That's a catalog, not an archive.

### 2. Extract RAW Previews, Don't Convert

**Decision:** Use embedded JPEG previews from RAW files via ExifTool. Do not use LibRaw or dcraw for full RAW conversion.

**Why:**
- Speed: Preview extraction is <1 second. Full RAW conversion is 2-5 seconds.
- Quality: Camera-generated previews are high quality (3-6MP typically)
- Simplicity: No native dependencies, no 50MB LibRaw binary
- BPL: ExifTool has supported every RAW format for 20+ years

**Do not:** Add LibRaw, dcraw, or WASM RAW decoders. This is a viewer, not Lightroom.

### 3. Native Browser Rendering

**Decision:** Use native `<img>` and `<video>` tags for display. No custom rendering.

**Why:**
- Performance: Browser rendering is GPU-accelerated
- Reliability: Battle-tested in billions of browsers
- Simplicity: No canvas manipulation, no WebGL complexity
- Maintenance: Zero code to maintain for image display

**Do not:** Build custom image rendering with canvas or WebGL.

### 4. Thumbnails Generated on Import

**Decision:** Generate thumbnails during file import, not on-demand.

**Why:**
- UX: Grid browsing is instant, no loading spinners
- One-time cost: Import is already slow (hashing, copying), thumbnails add negligible time
- Offline: Thumbnails work without accessing original files

**Do not:** Generate thumbnails on-demand when viewing. That's slow and creates loading jank.

### 5. Full Performance System in v0.1.0

**Decision:** Build LRU cache, preloading, and virtualization now, not later.

**Why:**
- "Code once, cry once": Retrofitting performance is harder than building it in
- User expectation: PhotoMechanic users expect instant image switching
- Architecture: Cache/preload patterns affect IPC design, harder to add later
- Grid virtualization: Required for locations with 500+ images

**Do not:** Ship a slow viewer and "optimize later". Users will abandon the app.

### 6. Separate Cache and Preload Services

**Decision:** `media-cache-service.ts` and `preload-service.ts` are separate.

**Why:**
- Single responsibility: Cache manages memory, preload manages prediction
- Testability: Each service can be unit tested independently
- LILBITS: Each script under 100 lines, focused purpose

**Do not:** Merge into one mega-service. That violates LILBITS.

---

## Script Documentation Standard

**Update for claude.md:** Every script in this project MUST have a corresponding `.md` documentation file.

### Purpose

Prevent AI drift and enable any developer (regardless of skill level) to:
1. Understand exactly what the script does
2. Understand WHY it does it that way
3. Recreate the script from scratch if needed
4. Track all changes with full reasoning

### Location

```
docs/scripts/
├── services/
│   ├── thumbnail-service.md
│   ├── preview-extractor-service.md
│   ├── poster-frame-service.md
│   ├── media-path-service.md
│   ├── media-cache-service.md
│   ├── preload-service.md
│   ├── xmp-service.md
│   └── xmp-sync-service.md
└── components/
    ├── MediaViewer.md
    ├── MediaGrid.md
    └── ExifPanel.md
```

### Required Sections

Every script documentation file MUST contain:

```markdown
# [Script Name]

## Overview
One paragraph explaining what this script does and why it exists.

## File Location
`packages/desktop/electron/services/[name].ts`

## Dependencies
| Package | Why |
|---------|-----|
| sharp | Image resizing |
| fs/promises | File system operations |

## Consumers (What Uses This)
- `file-import-service.ts` - Calls on import
- `MediaGrid.svelte` - Displays output

## Core Rules (DO NOT BREAK)
1. [Rule 1 with explanation]
2. [Rule 2 with explanation]
3. [Rule 3 with explanation]

## Function-by-Function Breakdown

### functionName(param1: Type, param2: Type): ReturnType

**Purpose:** What this function does

**Parameters:**
- `param1` - Description and valid values
- `param2` - Description and valid values

**Returns:** What it returns and when

**Logic Flow:**
1. Step 1 - why
2. Step 2 - why
3. Step 3 - why

**Edge Cases:**
- What happens if X
- What happens if Y

**Example:**
```typescript
const result = await functionName('input', 123);
// Returns: '/path/to/output.jpg'
```

## Error Handling
How errors are handled and why (throw vs return null vs log)

## Performance Considerations
Why certain choices were made for performance

## Testing
How to test this script, what to verify

## Changelog

### [Date] - v0.1.0 - Initial Implementation
- Created by: [Author/AI Session]
- Reason: Initial media viewer implementation per kanye.md
- Changes: Initial implementation with X, Y, Z functions

### [Date] - v0.1.1 - [Change Title]
- Changed by: [Author/AI Session]
- Reason: [Why this change was needed]
- What changed: [Specific changes made]
- Logic: [The reasoning behind the approach taken]
- Impact: [What this affects]
```

### Example: thumbnail-service.md

```markdown
# Thumbnail Service

## Overview
Generates 256px JPEG thumbnails from images during import. Thumbnails enable
instant grid browsing without loading full-size images. Uses Sharp for
image processing. Non-blocking - failures return null, never throw.

## File Location
`packages/desktop/electron/services/thumbnail-service.ts`

## Dependencies
| Package | Why |
|---------|-----|
| sharp | Fast native image resizing, already in project |
| fs/promises | Async file operations |
| path | Path manipulation |

## Consumers
- `file-import-service.ts` - Calls generateThumbnail() after file copy
- `MediaGrid.svelte` - Displays thumbnails in grid
- `LocationDetail.svelte` - Shows thumbnail grid for location

## Core Rules (DO NOT BREAK)

1. **Size is 256px** - Matches MediaGrid cell size. Changing requires updating CSS.

2. **Output is ALWAYS JPEG** - Browser compatibility. PNG thumbnails are 5x larger.

3. **Quality is 80** - Tested balance. 60 is blurry, 90+ is diminishing returns.

4. **Never throw, return null** - Import must not fail because thumbnail failed.

5. **Hash bucketing** - Store as `.thumbnails/a3/a3d5e8f9...jpg` to avoid
   filesystem limits (some FS slow with 10k+ files in one directory).

6. **Sharp only** - Do not add ImageMagick, GraphicsMagick, Jimp, etc.

## Function-by-Function Breakdown

### generateThumbnail(sourcePath, hash, archivePath, size?): Promise<string | null>

**Purpose:** Generate a thumbnail for a single image file.

**Parameters:**
- `sourcePath` - Absolute path to source image
- `hash` - SHA256 hash of file (used for output filename)
- `archivePath` - Root archive folder path
- `size` - Optional, defaults to 256

**Returns:**
- Success: Absolute path to generated thumbnail
- Failure: null (never throws)

**Logic Flow:**
1. Calculate output path using hash bucketing (a3/a3d5e8...)
2. Create parent directory if not exists
3. Use Sharp to resize with cover fit (crop to square)
4. Save as JPEG quality 80
5. Return output path or null on any error

**Edge Cases:**
- Corrupted image: Returns null, logs warning
- Unsupported format: Sharp throws, caught, returns null
- Disk full: Returns null, logs error
- Source missing: Returns null

**Example:**
```typescript
const thumbPath = await thumbnailService.generateThumbnail(
  '/archive/locations/NY-Factory/org-img-A1B2/abc123.jpg',
  'abc123def456...',
  '/archive'
);
// Returns: '/archive/.thumbnails/ab/abc123def456.jpg'
```

## Error Handling
All errors are caught and logged. Function returns null on failure.
This is intentional - thumbnail generation is non-critical. Import
must succeed even if thumbnails fail. UI shows placeholder for
missing thumbnails.

## Performance Considerations
- Sharp uses native libvips - 10x faster than pure JS solutions
- Resize before decode (Sharp optimization) - processes only needed pixels
- Async/non-blocking - doesn't block import pipeline
- 256px is small enough for fast generation (~50ms per image)

## Testing
1. Unit test: Generate thumbnail, verify file exists and is JPEG
2. Unit test: Corrupted input returns null, no throw
3. Integration: Import flow creates thumbnails
4. Manual: Grid displays thumbnails correctly

## Changelog

### 2025-11-23 - v0.1.0 - Initial Implementation
- Created by: Claude (kanye.md media viewer plan)
- Reason: Enable fast grid browsing per Phase 1 of kanye.md
- Changes:
  - generateThumbnail() - single image thumbnail
  - generateFromHeic() - HEIC conversion + thumbnail
  - thumbnailExists() - check if already generated
  - regenerateAll() - batch regeneration for existing imports
- Logic: Used Sharp because already installed, native performance,
  simple API. 256px chosen to match PhotoMechanic thumbnail size.
```

### Enforcement

1. **Before merging any new script:** Documentation file must exist
2. **Before modifying any script:** Update the changelog with reasoning
3. **AI coding sessions:** Must read the script's .md file before editing
4. **Code review:** Verify changelog was updated with reasoning

### Why This Matters

| Without This | With This |
|--------------|-----------|
| AI changes thumbnail size "to improve quality" | AI sees rule: "Size is 256px - changing requires updating CSS" |
| Developer doesn't know why Sharp was chosen | Developer reads: "Sharp because already installed, native performance" |
| Bug fix breaks something else | Changelog shows what was changed and why |
| New dev can't understand the code | Documentation enables recreation from scratch |
| AI forgets session context | Documentation is permanent |

---

## Repository Cleanup

Before implementing, clean up the repository to follow standard practices.

### Files to Remove

These are temporary planning/session files that should not be in version control:

```
ARCHITECTURE_AUDIT.md
COMPLIANCE_AUDIT.md
FINAL_AUDIT_REPORT.md
IMPLEMENTATION_COMPLETE_SUMMARY.md
IMPLEMENTATION_GUIDE_v010.md
SESSION_SUMMARY.md
WEEK_1_2_IMPLEMENTATION_SUMMARY.md
coding_plan_temp.md
finish_v010.md
ineedabrowser.md
missing_shit.md
nostartup.md
officer_doofy.md
v0.1.0_plan_temp.md
whereswaldo.md
whereswaldo2.md
whereswaldo3.md
whereswaldo4.md
whereswaldo5.md
whereswaldo6.md
whereswaldo7.md
whereswaldo8.md
whereswaldo9.md
whereswaldo10.md
whereswaldo11.md
whereswaldo12.md
```

### Directories to Remove or Gitignore

```
logseq/              # Logseq knowledge base - not part of app
pages/               # Logseq pages - not part of app
```

### Files to Move

```
abandonedupstatelogo.png → resources/icons/abandonedupstatelogo.png
```

### Files to Keep

```
claude.md            # Main technical specification
lilbits.md           # Script documentation (required by claude.md)
techguide.md         # Technical implementation guide
kanye.md             # This file - v0.1.0 media viewer plan
README.md            # Standard project readme
```

### .gitignore Updates

Add to `.gitignore`:

```gitignore
# Logseq knowledge base
logseq/
pages/

# Already present but remove committed files:
.DS_Store
```

### Cleanup Commands

```bash
# Remove temp files
git rm ARCHITECTURE_AUDIT.md COMPLIANCE_AUDIT.md FINAL_AUDIT_REPORT.md \
  IMPLEMENTATION_COMPLETE_SUMMARY.md IMPLEMENTATION_GUIDE_v010.md \
  SESSION_SUMMARY.md WEEK_1_2_IMPLEMENTATION_SUMMARY.md \
  coding_plan_temp.md finish_v010.md ineedabrowser.md missing_shit.md \
  nostartup.md officer_doofy.md v0.1.0_plan_temp.md \
  whereswaldo.md whereswaldo2.md whereswaldo3.md whereswaldo4.md \
  whereswaldo5.md whereswaldo6.md whereswaldo7.md whereswaldo8.md \
  whereswaldo9.md whereswaldo10.md whereswaldo11.md whereswaldo12.md

# Remove logseq
git rm -r logseq/ pages/

# Remove .DS_Store
git rm .DS_Store

# Move logo
mkdir -p resources/icons
git mv abandonedupstatelogo.png resources/icons/

# Update .gitignore and commit
```

---

## Media Viewer Strategy

### Hybrid Approach

| Format Type | Viewer Strategy | Tool |
|-------------|-----------------|------|
| Standard Images (JPG, PNG, WebP, GIF, BMP) | Native `<img>` tag | Browser |
| HEIC/HEIF | Convert to JPEG on import | Sharp |
| RAW Files (NEF, CR2, ARW, DNG, etc.) | Extract embedded JPEG preview | ExifTool |
| Video (H.264, WebM, VP8/VP9) | Native `<video>` tag | Browser |
| Unsupported Video Codecs | Poster frame + "Open External" | FFmpeg |

### Why This Approach

| Principle | Alignment |
|-----------|-----------|
| KISS | Uses native browser for 90% of cases |
| BPL | Browser rendering eternal, ExifTool stable 20+ years |
| DRETW | ExifTool already extracts previews, Sharp already installed |
| LILBITS | Each service is a separate, focused module |
| DAFIDFAF | No LibRaw, no custom RAW decoder |

---

## Phase Breakdown

### Phase 1: Thumbnails on Import
Generate thumbnails during file import for fast grid browsing.

### Phase 2: Native Image Viewer
Display standard images in lightbox using browser `<img>` tag.

### Phase 3: RAW Preview Extraction
Extract embedded JPEG from RAW files on import.

### Phase 4: EXIF Metadata Panel
Display extracted EXIF data in viewer sidebar.

### Phase 5: Video Playback
Native video playback for supported codecs.

### Phase 6: Video Poster Frames
Generate poster frames for video thumbnails.

### Phase 7: Performance Optimizations
Preloading, in-memory cache, virtualized scrolling for PhotoMechanic-level speed.

### Phase 8: XMP Sidecar System
Write all metadata to XMP sidecars (source of truth), SQLite as cache.

---

## Database Schema Changes

### File: packages/desktop/electron/main/database.types.ts

**MODIFY: ImgsTable**
```typescript
// Thumbnails and previews
thumb_path: string | null;
preview_path: string | null;
preview_extracted: number;           // 0 = not extracted, 1 = extracted

// XMP sync status
xmp_synced: number;                  // 0 = needs sync, 1 = synced
xmp_modified_at: string | null;      // ISO8601 timestamp of last XMP write
```

**MODIFY: VidsTable**
```typescript
// Poster frames
thumb_path: string | null;
poster_extracted: number;

// XMP sync
xmp_synced: number;
xmp_modified_at: string | null;
```

### Migration SQL

```sql
-- Thumbnails and previews
ALTER TABLE imgs ADD COLUMN thumb_path TEXT;
ALTER TABLE imgs ADD COLUMN preview_path TEXT;
ALTER TABLE imgs ADD COLUMN preview_extracted INTEGER DEFAULT 0;

ALTER TABLE vids ADD COLUMN thumb_path TEXT;
ALTER TABLE vids ADD COLUMN poster_extracted INTEGER DEFAULT 0;

-- XMP sync
ALTER TABLE imgs ADD COLUMN xmp_synced INTEGER DEFAULT 0;
ALTER TABLE imgs ADD COLUMN xmp_modified_at TEXT;

ALTER TABLE vids ADD COLUMN xmp_synced INTEGER DEFAULT 0;
ALTER TABLE vids ADD COLUMN xmp_modified_at TEXT;

-- Indexes
CREATE INDEX idx_imgs_xmp_synced ON imgs(xmp_synced) WHERE xmp_synced = 0;
CREATE INDEX idx_imgs_thumb ON imgs(thumb_path) WHERE thumb_path IS NULL;
CREATE INDEX idx_vids_thumb ON vids(thumb_path) WHERE thumb_path IS NULL;
```

---

## Archive Folder Structure

```
[ARCHIVE_FOLDER]/
├── .thumbnails/                     # Generated thumbnails (256px)
│   └── [first2chars]/
│       └── [sha256].jpg
├── .previews/                       # Extracted RAW previews (full size)
│   └── [first2chars]/
│       └── [sha256].jpg
├── .posters/                        # Video poster frames
│   └── [first2chars]/
│       └── [sha256].jpg
├── .cache/                          # In-memory cache spillover
│   └── preload/
└── locations/
    └── [STATE]-[TYPE]/
        └── [SLOCNAM]-[LOC12]/
            ├── org-img-[LOC12]/
            │   ├── [sha256].nef     # Original RAW file
            │   └── [sha256].xmp     # XMP sidecar
            ├── org-vid-[LOC12]/
            └── org-doc-[LOC12]/
```

---

## New Scripts

### Phase 1-6: Media Viewer

#### 1. packages/desktop/electron/services/media-path-service.ts

**Purpose:** Centralized path utilities for thumbnails, previews, posters, XMP sidecars

**Exports:**
```typescript
class MediaPathService {
  constructor(archivePath: string)

  getThumbnailDir(): string
  getPreviewDir(): string
  getPosterDir(): string

  getThumbnailPath(hash: string): string
  getPreviewPath(hash: string): string
  getPosterPath(hash: string): string
  getXmpSidecarPath(originalPath: string): string

  ensureDirectories(): Promise<void>
  private bucketPath(hash: string, baseDir: string, ext: string): string
}
```

**Estimated Lines:** ~70

---

#### 2. packages/desktop/electron/services/thumbnail-service.ts

**Purpose:** Generate thumbnails from images using Sharp

**Exports:**
```typescript
class ThumbnailService {
  generateThumbnail(
    sourcePath: string,
    hash: string,
    archivePath: string,
    size?: number              // Default: 256
  ): Promise<string | null>

  generateFromHeic(
    sourcePath: string,
    hash: string,
    archivePath: string
  ): Promise<string | null>

  thumbnailExists(hash: string, archivePath: string): Promise<boolean>

  // Retroactive generation for existing imports
  regenerateAll(
    locid?: string,
    onProgress?: (current: number, total: number) => void
  ): Promise<{ success: number; failed: number }>
}
```

**Estimated Lines:** ~120

---

#### 3. packages/desktop/electron/services/preview-extractor-service.ts

**Purpose:** Extract embedded JPEG previews from RAW files using ExifTool

**Exports:**
```typescript
class PreviewExtractorService {
  extractPreview(
    sourcePath: string,
    hash: string,
    archivePath: string
  ): Promise<string | null>

  isRawFormat(extension: string): boolean

  // Fallback chain: PreviewImage -> JpgFromRaw -> ThumbnailImage
  private tryExtractTag(filePath: string, tag: string, outputPath: string): Promise<boolean>

  // Retroactive extraction for existing RAW imports
  extractAllMissing(
    locid?: string,
    onProgress?: (current: number, total: number) => void
  ): Promise<{ success: number; failed: number }>
}
```

**ExifTool Command:**
```bash
exiftool -b -PreviewImage source.NEF > preview.jpg
```

**Estimated Lines:** ~140

---

#### 4. packages/desktop/electron/services/poster-frame-service.ts

**Purpose:** Generate video poster frames using FFmpeg

**Exports:**
```typescript
class PosterFrameService {
  generatePosterFrame(
    sourcePath: string,
    hash: string,
    archivePath: string,
    timestampSeconds?: number  // Default: 1
  ): Promise<string | null>

  posterExists(hash: string, archivePath: string): Promise<boolean>

  // Retroactive generation for existing video imports
  generateAllMissing(
    locid?: string,
    onProgress?: (current: number, total: number) => void
  ): Promise<{ success: number; failed: number }>
}
```

**Estimated Lines:** ~110

---

#### 5. packages/desktop/src/components/MediaViewer.svelte

**Purpose:** Lightbox component for viewing images with EXIF panel

**Props:**
```typescript
{
  mediaPath: string;
  thumbnailPath?: string;
  previewPath?: string;
  mediaType: 'image' | 'video';
  exifData?: object;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
}
```

**Features:**
- Dark overlay background
- Native `<img>` for standard images
- Native `<video>` for videos
- Uses preview path for RAW files
- EXIF metadata sidebar (collapsible)
- Keyboard navigation (Escape, Arrow keys)
- "Open in External App" button

**Estimated Lines:** ~200

---

#### 6. packages/desktop/src/components/MediaGrid.svelte

**Purpose:** Thumbnail grid component with virtualization

**Props:**
```typescript
{
  media: Array<{
    hash: string;
    thumbPath: string | null;
    originalPath: string;
    type: 'image' | 'video';
  }>;
  onSelect: (hash: string) => void;
  columns?: number;            // Default: 4
  virtualized?: boolean;       // Default: true for 100+ items
}
```

**Features:**
- Lazy loading thumbnails
- Virtualized scrolling (only render visible rows)
- Placeholder for missing thumbnails
- Video badge overlay
- Click to open MediaViewer

**Estimated Lines:** ~180

---

#### 7. packages/desktop/src/components/ExifPanel.svelte

**Purpose:** Display EXIF metadata in a readable format

**Props:**
```typescript
{
  exifData: object | null;
  expanded?: boolean;
}
```

**Features:**
- Camera info (Make, Model)
- Date taken
- Dimensions
- GPS coordinates (with "View on Map" link)
- Exposure settings (ISO, Aperture, Shutter)
- Collapsible sections

**Estimated Lines:** ~100

---

### Phase 7: Performance Optimizations

#### 8. packages/desktop/electron/services/media-cache-service.ts

**Purpose:** In-memory LRU cache for recently viewed images

**Exports:**
```typescript
class MediaCacheService {
  constructor(maxSizeMB: number = 100)

  get(hash: string): Buffer | null
  set(hash: string, data: Buffer): void
  preload(hashes: string[]): Promise<void>
  clear(): void
  getStats(): { size: number; count: number; hits: number; misses: number }
}
```

**Features:**
- LRU eviction when cache exceeds maxSizeMB
- Preload images into cache
- Cache hits/misses tracking

**Estimated Lines:** ~80

---

#### 9. packages/desktop/electron/services/preload-service.ts

**Purpose:** Preload adjacent images when viewing in lightbox

**Exports:**
```typescript
class PreloadService {
  constructor(cacheService: MediaCacheService)

  setCurrentIndex(index: number, mediaList: string[]): void
  preloadAdjacent(count?: number): Promise<void>  // Default: 3 ahead, 1 behind
  cancelPreload(): void
}
```

**Estimated Lines:** ~60

---

### Phase 8: XMP Sidecar System

#### 10. packages/desktop/electron/services/xmp-service.ts

**Purpose:** Read and write XMP sidecar files

**Exports:**
```typescript
class XmpService {
  // Write operations (source of truth)
  writeSidecar(mediaPath: string, data: XmpData): Promise<void>

  // Read operations (for rebuild)
  readSidecar(mediaPath: string): Promise<XmpData | null>
  sidecarExists(mediaPath: string): Promise<boolean>

  // Batch operations
  rebuildFromSidecars(archivePath: string): Promise<{ synced: number; errors: number }>
}

interface XmpData {
  rating?: number;             // xmp:Rating
  label?: string;              // xmp:Label
  keywords?: string[];         // dc:subject
}
```

**XMP Structure:**
```xml
<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:xmp="http://ns.adobe.com/xap/1.0/"
      xmlns:dc="http://purl.org/dc/elements/1.1/">
      <xmp:Rating>5</xmp:Rating>
      <xmp:Label>Red</xmp:Label>
      <dc:subject>
        <rdf:Bag>
          <rdf:li>abandoned</rdf:li>
          <rdf:li>factory</rdf:li>
        </rdf:Bag>
      </dc:subject>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>
```

**Dependencies:**
- fast-xml-parser

**Estimated Lines:** ~200

---

#### 11. packages/desktop/electron/services/xmp-sync-service.ts

**Purpose:** Background sync between SQLite and XMP sidecars

**Exports:**
```typescript
class XmpSyncService {
  constructor(xmpService: XmpService, mediaRepo: SQLiteMediaRepository)

  // Triggered on metadata change
  queueSync(hash: string, type: 'image' | 'video'): void

  // Process queue (runs in background)
  processQueue(): Promise<void>

  // Manual full sync
  syncAll(): Promise<{ synced: number; errors: number }>

  // Rebuild SQLite from XMP (disaster recovery)
  rebuildDatabase(): Promise<{ imported: number; errors: number }>
}
```

**Estimated Lines:** ~120

---

## Impacted Scripts (Modifications)

### 1. packages/desktop/electron/services/file-import-service.ts

**Changes:**
- Inject ThumbnailService, PreviewExtractorService
- After file copy, call thumbnail generation
- For RAW files, extract preview
- Create empty XMP sidecar stub
- Update database with new fields

**Impact:** ~50 new lines

---

### 2. packages/desktop/electron/services/exiftool-service.ts

**Changes:**
- Add `extractPreviewImage()` method
- Add `extractPreviewTag()` with fallback chain

**Impact:** ~40 new lines

---

### 3. packages/desktop/electron/services/ffmpeg-service.ts

**Changes:**
- Add `generatePosterFrame()` method

**Impact:** ~30 new lines

---

### 4. packages/desktop/electron/main/database.types.ts

**Changes:**
- Add new columns to ImgsTable and VidsTable

**Impact:** ~20 new lines

---

### 5. packages/desktop/electron/main/ipc-handlers.ts

**Changes:**
Add handlers for:
```typescript
// Media viewer
'media:getThumbnail'
'media:getPreview'
'media:getPoster'
'media:getFileBase64'
'media:regenerateThumbnails'
'media:regeneratePreviews'
'media:regeneratePosters'

// XMP sync
'xmp:syncNow'
'xmp:rebuildDatabase'
'xmp:getSyncStatus'
```

**Impact:** ~100 new lines

---

### 6. packages/desktop/electron/preload/index.ts

**Changes:**
Expose all new IPC handlers to renderer.

**Impact:** ~40 new lines

---

### 7. packages/desktop/src/pages/LocationDetail.svelte

**Changes:**
- Replace skeleton lightbox with MediaViewer
- Use MediaGrid with virtualization
- Add "Regenerate Thumbnails" button for admin

**Impact:** Refactor ~100 lines

---

### 8. packages/desktop/electron/repositories/sqlite-media-repository.ts

**Changes:**
Add methods:
```typescript
updateThumbnailPath(hash: string, type: 'image' | 'video', thumbPath: string): Promise<void>
updatePreviewPath(hash: string, previewPath: string): Promise<void>
findImagesWithoutThumbnails(locid?: string): Promise<Array<{ imgsha: string; imgloc: string }>>
findVideosWithoutPosters(locid?: string): Promise<Array<{ vidsha: string; vidloc: string }>>
findRawImagesWithoutPreviews(locid?: string): Promise<Array<{ imgsha: string; imgloc: string }>>
findUnsynced(): Promise<MediaItem[]>
markSynced(hash: string, type: 'image' | 'video'): Promise<void>
```

**Impact:** ~80 new lines

---

## IPC Security

All file access restricted to archive folder:
```typescript
function validateArchivePath(filePath: string, archivePath: string): boolean {
  const resolved = path.resolve(filePath);
  const archiveResolved = path.resolve(archivePath);
  return resolved.startsWith(archiveResolved);
}
```

---

## Format Support Matrix

### Native Browser Display
| Format | Support |
|--------|---------|
| JPEG | Yes |
| PNG | Yes |
| GIF | Yes |
| WebP | Yes |
| AVIF | Yes (Electron 28+) |
| BMP | Yes |
| SVG | Yes |
| TIFF | Partial |

### Requires Conversion/Extraction
| Format | Strategy |
|--------|----------|
| HEIC/HEIF | Convert to JPEG via Sharp |
| NEF, CR2, CR3, ARW, DNG, RAF, ORF, RW2, PEF | Extract preview via ExifTool |

### Video Native Playback
| Format | Support |
|--------|---------|
| MP4 (H.264) | Yes |
| WebM (VP8/VP9) | Yes |
| MOV (H.264) | Yes |
| MKV (H.264) | Yes |

### Video External Only
| Format | Reason |
|--------|--------|
| ProRes, DNxHD | No browser support |
| H.265/HEVC | Partial, OS-dependent |

---

## Keyboard Shortcuts

### Viewer Navigation
| Key | Action |
|-----|--------|
| Escape | Close viewer |
| Left Arrow | Previous image |
| Right Arrow | Next image |
| Space | Toggle play/pause (video) |
| F | Toggle fullscreen |
| I | Toggle EXIF panel |

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Thumbnail grid load (100 images) | < 200ms |
| Thumbnail grid load (1000 images) | < 500ms (virtualized) |
| Image switch in viewer | < 50ms (cached) |
| RAW preview display | < 100ms (pre-extracted) |
| XMP write | < 50ms |

---

## Dependencies

### Already Installed
- sharp (^0.33.x)
- exiftool-vendored (^33.2.0)
- fluent-ffmpeg (^2.1.x)

### New Dependencies
| Package | Purpose | Phase |
|---------|---------|-------|
| fast-xml-parser | XMP read/write | 8 |

---

## Implementation Order

1. media-path-service.ts
2. thumbnail-service.ts
3. Database migration (thumbnails)
4. file-import-service.ts integration
5. preview-extractor-service.ts
6. poster-frame-service.ts
7. MediaViewer.svelte
8. MediaGrid.svelte
9. ExifPanel.svelte
10. LocationDetail.svelte integration
11. IPC handlers (media)
12. media-cache-service.ts
13. preload-service.ts
14. MediaGrid virtualization
15. xmp-service.ts
16. xmp-sync-service.ts
17. Database migration (XMP fields)
18. IPC handlers (XMP)
19. Retroactive thumbnail/preview generation UI

---

## LILBITS Compliance

| Script | Purpose | Est. Lines | Under 300 |
|--------|---------|------------|-----------|
| media-path-service.ts | Path utilities | 70 | Yes |
| thumbnail-service.ts | Thumbnail generation | 120 | Yes |
| preview-extractor-service.ts | RAW preview extraction | 140 | Yes |
| poster-frame-service.ts | Video poster frames | 110 | Yes |
| media-cache-service.ts | In-memory LRU cache | 80 | Yes |
| preload-service.ts | Adjacent image preload | 60 | Yes |
| xmp-service.ts | XMP read/write | 200 | Yes |
| xmp-sync-service.ts | Background sync | 120 | Yes |
| MediaViewer.svelte | Lightbox component | 200 | Yes |
| MediaGrid.svelte | Virtualized grid | 180 | Yes |
| ExifPanel.svelte | EXIF display | 100 | Yes |

---

## Testing Strategy

### Unit Tests
- thumbnail-service.test.ts
- preview-extractor-service.test.ts
- xmp-service.test.ts
- media-cache-service.test.ts

### Integration Tests
- Import flow generates thumbnails
- RAW import extracts preview
- XMP rebuild populates database
- Retroactive generation works on existing imports

### Manual Testing
- Open lightbox for JPG, PNG, RAW
- Video playback
- Keyboard shortcuts
- XMP interop with PhotoMechanic
- Regenerate thumbnails for existing location

---

## Notes

- All thumbnail/preview generation is non-blocking
- Import succeeds even if thumbnail generation fails
- XMP is source of truth; SQLite is rebuildable cache
- PhotoMechanic compatibility is a priority
- Retroactive generation handles existing imports without thumbnails

---

End of Plan
