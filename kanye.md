# Media Viewer & Archive Metadata System

Version: 0.1.0
Created: 2025-11-23
Status: **Implementation Complete**

---

## Implementation Summary

All Phase 1-8 services and components have been implemented:

### Backend Services Created
| Service | Lines | Purpose |
|---------|-------|---------|
| media-path-service.ts | ~90 | Path utilities with hash bucketing |
| thumbnail-service.ts | ~100 | Sharp-based 256px JPEG generation |
| preview-extractor-service.ts | ~120 | ExifTool RAW preview extraction |
| poster-frame-service.ts | ~85 | FFmpeg video frame extraction |
| media-cache-service.ts | ~140 | LRU memory cache (100MB default) |
| preload-service.ts | ~100 | Adjacent image preloading |
| xmp-service.ts | ~190 | XMP sidecar read/write (source of truth) |

### Frontend Components Created
| Component | Lines | Purpose |
|-----------|-------|---------|
| MediaViewer.svelte | ~250 | Full-screen lightbox with keyboard nav |
| MediaGrid.svelte | ~100 | Thumbnail grid with lazy loading |
| ExifPanel.svelte | ~100 | EXIF metadata display |

### Database Changes
- Migration 8: Add thumb_path, preview_path, xmp_synced columns to imgs/vids
- New indexes for finding media without thumbnails

### Modified Files
- ipc-handlers.ts: Added media IPC handlers
- preload/index.ts: Added media API
- sqlite-media-repository.ts: Added thumbnail/preview methods
- LocationDetail.svelte: Integrated MediaViewer component
- exiftool-service.ts: Added extractBinaryTag method
- ffmpeg-service.ts: Added extractFrame method

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
│   - Rebuildable from XMP                │
└─────────────────────────────────────────┘
```

### Strategy: Hybrid Approach

| Format Type | Viewer Strategy | Tool |
|-------------|-----------------|------|
| Standard Images (JPG, PNG, WebP, GIF, BMP) | Native `<img>` tag | Browser |
| HEIC/HEIF | Convert to JPEG on import | Sharp |
| RAW Files (NEF, CR2, ARW, DNG, etc.) | Extract embedded JPEG preview | ExifTool |
| Video (H.264, WebM, VP8/VP9) | Native `<video>` tag | Browser |
| Unsupported Video | Poster frame + external | FFmpeg |

---

## Do Not Change

These architectural decisions are final. Do not modify without explicit approval:

### 1. XMP Sidecars as Source of Truth
**Decision:** XMP sidecar files are the source of truth for all user metadata (ratings, labels, keywords). SQLite is a rebuildable cache.

**Why:**
- Portability: Files can be moved, app can die, metadata survives
- Industry standard: PhotoMechanic, Lightroom, Bridge all use XMP
- Disaster recovery: Can rebuild SQLite from XMP sidecars
- True archive: The files ARE the archive, not the database

**Never:** Store user metadata only in SQLite

### 2. Extract RAW Previews, Don't Convert
**Decision:** Use ExifTool to extract embedded JPEG previews from RAW files. Do not add LibRaw, dcraw, or WASM decoders.

**Why:**
- Speed: Preview extraction is <1 second vs 2-5 seconds for full RAW conversion
- Dependencies: No 50MB LibRaw library needed
- Quality: Camera-generated previews are high quality
- BPL: ExifTool has been stable for 20+ years, updates for new cameras within weeks

**Never:** Add LibRaw, dcraw, rawloader-wasm, or any RAW conversion library

### 3. Native Browser Rendering
**Decision:** Use native `<img>` and `<video>` tags for display. Do not add canvas-based viewers, WebGL renderers, or PDF.js.

**Why:**
- Performance: Browser rendering is GPU-accelerated
- Simplicity: Zero maintenance burden
- Compatibility: Works on all platforms
- BPL: Browser APIs are stable and well-tested

**Never:** Add canvas-based image viewers, WebGL renderers, or custom video players

### 4. Thumbnails on Import, Not On-Demand
**Decision:** Generate thumbnails when files are imported, not when they're first viewed.

**Why:**
- UX: Grid browsing is instant, no loading spinners
- Offline: Works without regenerating on every view
- Consistency: PhotoMechanic pattern, proven approach

**Never:** Generate thumbnails on-demand or lazily

### 5. Full Performance System in v0.1.0
**Decision:** Build the complete caching, preloading, and (future) virtualization system now, not later.

**Why:**
- "Code once, cry once" - retrofitting performance is harder than building it in
- User expectations: If images load slowly, users won't trust the app
- PhotoMechanic comparison: We're competing with professional tools

**Never:** Defer performance features to "optimize later"

### 6. Separate Cache and Preload Services
**Decision:** Keep MediaCacheService and PreloadService as separate modules.

**Why:**
- Single responsibility: Cache manages storage, preload predicts what to cache
- LILBITS compliance: Each under 300 lines
- Testability: Each can be tested independently

**Never:** Merge cache and preload into one service

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
│   └── ...
└── components/
    ├── MediaViewer.md
    └── ...
```

### Required Sections

```markdown
# [Script Name]

## Overview
Brief description of what this script does and why it exists.

## File Location
`packages/desktop/electron/services/[script-name].ts`

## Dependencies
List every import with WHY it's used:
- `sharp`: Image processing - chosen over ImageMagick for speed and Node.js native binding

## Consumers (What Uses This)
- file-import-service.ts: Calls on import
- MediaGrid.svelte: Displays thumbnails

## Core Rules (DO NOT BREAK)
1. [Rule]: [Why this rule exists]
2. [Rule]: [Why this rule exists]

## Function-by-Function Breakdown

### `functionName(params)`
**Purpose:** What it does
**Parameters:**
- `param1` (type): What it's for
**Returns:** What and why
**Logic Flow:**
1. Step one
2. Step two
**Edge Cases:**
- If X happens, we do Y because Z

## Error Handling
How errors are handled and why

## Performance Considerations
Why certain choices were made for performance

## Testing
How to test this script manually or with automated tests

## Changelog
| Date | Who | Why | What Changed | Logic |
|------|-----|-----|--------------|-------|
| 2025-11-23 | Claude | Initial implementation | Created service | Per kanye.md Phase 1 |
```

### Enforcement

- No merge without documentation file
- No modification without changelog update
- AI must read script's .md before editing
- Code review verifies changelog was updated
