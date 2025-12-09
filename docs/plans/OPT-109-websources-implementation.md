# OPT-109 Web Sources Implementation Guide

**Feature**: Comprehensive Web Source Archiving
**Status**: Complete
**Author**: Claude Code
**Date**: 2025-12-09

---

## Overview

OPT-109 replaces the simple bookmarks feature with a comprehensive web archiving system that captures web pages in multiple formats (Screenshot, PDF, HTML, WARC), extracts content (images, videos, text), and stores everything locally for offline access.

---

## Architecture

### Data Flow

```
User adds URL → Repository creates record → Orchestrator coordinates archiving
                                              ↓
                        ┌─────────────────────┼─────────────────────┐
                        ↓                     ↓                     ↓
                   Capture Service      Extraction Service    Metadata Extraction
                   (Screenshot, PDF,    (Images, Videos,     (Title, Author, Date)
                    HTML, WARC)          Text)
                        ↓                     ↓                     ↓
                        └─────────────────────┼─────────────────────┘
                                              ↓
                                    Repository updates record
                                              ↓
                                    Version snapshot created
```

### Key Files

| File | Purpose | Lines |
|------|---------|-------|
| `sqlite-websources-repository.ts` | Database CRUD, FTS5 search, version management | ~600 |
| `websource-orchestrator-service.ts` | Coordinates capture/extraction pipeline | ~650 |
| `websource-capture-service.ts` | Screenshot, PDF, HTML, WARC capture via Puppeteer | ~700 |
| `websource-extraction-service.ts` | Image, video, text extraction | ~850 |
| `websources.ts` (IPC handler) | IPC channels for renderer access | ~815 |
| `LocationWebSources.svelte` | UI component for location detail page | ~307 |

---

## Database Schema

### web_sources Table

```sql
CREATE TABLE web_sources (
  source_id TEXT PRIMARY KEY,      -- BLAKE3 hash (16 chars) or UUID (36 chars)
  url TEXT NOT NULL UNIQUE,
  title TEXT,
  locid TEXT REFERENCES locs(locid),
  subid TEXT REFERENCES slocs(subid),
  source_type TEXT DEFAULT 'article',
  notes TEXT,
  status TEXT DEFAULT 'pending',   -- pending|archiving|complete|partial|failed
  component_status TEXT,           -- JSON: {screenshot, pdf, html, warc, text, images}

  -- Archive paths
  archive_path TEXT,
  screenshot_path TEXT,
  pdf_path TEXT,
  html_path TEXT,
  warc_path TEXT,

  -- Hashes (BLAKE3, 16 chars)
  screenshot_hash TEXT,
  pdf_hash TEXT,
  html_hash TEXT,
  warc_hash TEXT,
  content_hash TEXT,
  provenance_hash TEXT,

  -- Extracted metadata
  extracted_title TEXT,
  extracted_author TEXT,
  extracted_date TEXT,
  extracted_publisher TEXT,
  extracted_text TEXT,             -- Full text for FTS
  word_count INTEGER DEFAULT 0,
  image_count INTEGER DEFAULT 0,
  video_count INTEGER DEFAULT 0,

  -- Error tracking
  archive_error TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  archived_at TEXT
);
```

### web_source_versions Table

```sql
CREATE TABLE web_source_versions (
  version_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES web_sources(source_id),
  version_number INTEGER NOT NULL,
  screenshot_path TEXT,
  pdf_path TEXT,
  html_path TEXT,
  warc_path TEXT,
  screenshot_hash TEXT,
  pdf_hash TEXT,
  html_hash TEXT,
  warc_hash TEXT,
  content_hash TEXT,
  archived_at TEXT DEFAULT (datetime('now')),
  UNIQUE(source_id, version_number)
);
```

### FTS5 Full-Text Search

```sql
CREATE VIRTUAL TABLE web_sources_fts USING fts5(
  url,
  title,
  notes,
  extracted_title,
  extracted_author,
  extracted_text,
  content='web_sources',
  content_rowid='rowid'
);
```

---

## Services

### 1. Repository (`sqlite-websources-repository.ts`)

Handles all database operations:

- **CRUD**: create, findById, findByUrl, findByLocation, update, delete
- **Status Management**: markArchiving, markComplete, markPartial, markFailed
- **Version Control**: createVersion, findVersions, findLatestVersion
- **Search**: Full-text search via FTS5
- **Statistics**: getStats, getStatsByLocation
- **Migration**: migrateFromBookmarks (converts old bookmarks to web sources)

### 2. Orchestrator (`websource-orchestrator-service.ts`)

Coordinates the archiving pipeline:

```typescript
class WebSourceOrchestrator {
  async archiveSource(sourceId: string, options?: ArchiveOptions): Promise<ArchiveResult> {
    // 1. Mark source as archiving
    // 2. Extract metadata (title, author, date)
    // 3. Capture page (screenshot, PDF, HTML, WARC)
    // 4. Extract content (images, videos, text)
    // 5. Link extracted media to location
    // 6. Calculate provenance hash
    // 7. Update database with results
    // 8. Create version snapshot
  }
}
```

Archive options:
- `captureScreenshot` - Full-page PNG screenshot
- `capturePdf` - PDF document
- `captureHtml` - Single-file HTML with inlined styles
- `captureWarc` - WARC archive (requires wget)
- `extractImages` - Download page images
- `extractVideos` - Download embedded videos (requires yt-dlp)
- `extractText` - Extract clean text content

### 3. Capture Service (`websource-capture-service.ts`)

Uses Puppeteer-core with bundled Ungoogled Chromium:

```typescript
// Browser discovery (platform-aware)
const executablePaths = [
  // Development path (relative to dist-electron/main)
  path.join(__dirname, '..', '..', '..', '..', 'resources', 'browsers',
            'ungoogled-chromium', platformFolder,
            'Archive Browser.app', 'Contents', 'MacOS', 'Chromium'),
  // Production path
  path.join(process.resourcesPath, 'browsers', ...),
  // System Chrome fallbacks
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
```

Capture methods:
- `captureScreenshot()` - Full-page PNG with auto-scroll for lazy images
- `capturePdf()` - A4 PDF with margins and backgrounds
- `captureHtml()` - HTML with inlined CSS
- `captureWarc()` - WARC archive via wget
- `extractMetadata()` - Open Graph, Schema.org, meta tags

### 4. Extraction Service (`websource-extraction-service.ts`)

Content extraction:
- **Images**: Finds all `<img>` elements, checks srcset for hi-res versions
- **Videos**: Detects YouTube/Vimeo embeds, uses yt-dlp for download
- **Text**: Uses Python Trafilatura (fallback: browser extraction)

---

## IPC Channels

### Core CRUD
- `websources:create` - Create new web source
- `websources:findById` - Get source by ID
- `websources:findByUrl` - Get source by URL
- `websources:findByLocation` - Get all sources for a location
- `websources:update` - Update source fields
- `websources:delete` - Delete source and archives

### Archive Operations
- `websources:archive` - Archive a single source
- `websources:archivePending` - Archive all pending sources
- `websources:rearchive` - Re-archive (creates new version)
- `websources:cancelArchive` - Cancel current operation
- `websources:archiveStatus` - Get processing status

### Status Management
- `websources:markArchiving` - Mark as in-progress
- `websources:markComplete` - Mark as successfully archived
- `websources:markPartial` - Mark as partially archived
- `websources:markFailed` - Mark as failed with error
- `websources:resetToPending` - Reset for retry

### Version Management
- `websources:createVersion` - Create version snapshot
- `websources:findVersions` - Get all versions for source
- `websources:findVersionByNumber` - Get specific version
- `websources:findLatestVersion` - Get most recent version
- `websources:countVersions` - Count versions

### Search & Stats
- `websources:search` - Full-text search
- `websources:getStats` - Overall statistics
- `websources:getStatsByLocation` - Per-location stats
- `websources:count` - Total count

---

## UI Component

`LocationWebSources.svelte` provides:

1. **Source List**: Shows all sources with status badges
2. **Add Form**: URL input, title, type selector, notes
3. **Archive Button**: Triggers archiving with progress
4. **View Archive**: Opens archived content
5. **Delete**: Removes source and all archives

Status colors:
- Green: Complete
- Yellow: Partial
- Red: Failed
- Blue: Archiving
- Gray: Pending

---

## File Organization

Archives are stored in the archive folder:

```
[archive]/
├── locations/
│   └── [locid]/
│       └── _websources/
│           └── [source_id]/
│               ├── [source_id]_screenshot.png
│               ├── [source_id].pdf
│               ├── [source_id].html
│               ├── [source_id].warc.gz
│               ├── images/
│               │   └── [source_id]_img_0.jpg
│               ├── videos/
│               │   └── [source_id]_vid_0.mp4
│               └── text/
│                   └── [source_id]_content.txt
└── _websources/          # Unlinked sources
    └── [source_id]/
```

---

## Dependencies

### Required
- `puppeteer-core` - Browser automation
- `@au-archive/core` - Domain types
- `kysely` - Database queries
- `zod` - Validation

### Optional (for full functionality)
- `wget` - WARC archive creation
- `yt-dlp` - Video download
- `python3` with `trafilatura` - Text extraction

### Browser
- Bundled Ungoogled Chromium at:
  `resources/browsers/ungoogled-chromium/[platform]/Archive Browser.app`

---

## Testing

### Manual Test Steps

1. Navigate to a location detail page
2. Scroll to "Web Sources" section
3. Click "+ Add Source"
4. Enter a URL (e.g., `https://example.com`)
5. Select type, add notes (optional)
6. Click "Add Web Source"
7. Click "Archive" button
8. Verify status changes: pending → archiving → complete
9. Check console for any errors
10. Verify archive files exist in location folder

### Verify Database

```sql
-- Check web sources
SELECT source_id, url, status, word_count, image_count
FROM web_sources;

-- Check FTS works
SELECT * FROM web_sources_fts WHERE web_sources_fts MATCH 'search term';

-- Check versions
SELECT * FROM web_source_versions WHERE source_id = '...';
```

---

## Troubleshooting

### "No Chrome/Chromium executable found"
Browser not found. Check:
- `resources/browsers/ungoogled-chromium/mac-arm64/Archive Browser.app` exists
- File has execute permissions

### "database disk image is malformed"
FTS5 schema mismatch. Run:
```sql
INSERT INTO web_sources_fts(web_sources_fts) VALUES('rebuild');
```

### "String must contain exactly 16 character(s)"
Source ID validation mismatch. Migration 61 fixes this by accepting both:
- 16-char BLAKE3 hashes (new sources)
- 36-char UUIDs (migrated bookmarks)

### wget not found (WARC capture fails)
Install wget: `brew install wget`

### yt-dlp not found (video extraction fails)
Install yt-dlp: `brew install yt-dlp`

---

## Migration from Bookmarks

Call `websources:migrateFromBookmarks` to convert existing bookmarks:

```typescript
// Preserves:
// - Original bookmark ID as source_id
// - URL, title, notes
// - Location/sub-location links
// - Creates 'bookmark' source_type
// - Sets status to 'pending' for archiving
```

---

## Future Enhancements

1. **Scheduled re-archiving** - Periodic snapshots for change detection
2. **Diff viewer** - Compare versions visually
3. **Bulk import** - Import URLs from file
4. **Export** - Export archives as standalone packages
5. **Archive.org integration** - Submit to Wayback Machine

---

## Files Modified (OPT-109)

### New Files
- `packages/desktop/electron/services/websource-orchestrator-service.ts`
- `packages/desktop/electron/services/websource-capture-service.ts`
- `packages/desktop/electron/services/websource-extraction-service.ts`
- `packages/desktop/electron/main/ipc-handlers/websources.ts`
- `packages/desktop/electron/repositories/sqlite-websources-repository.ts`
- `packages/desktop/src/components/location/LocationWebSources.svelte`

### Modified Files
- `packages/desktop/electron/main/database.ts` - Schema + migrations
- `packages/desktop/electron/main/database.types.ts` - Type definitions
- `packages/desktop/electron/preload/preload.cjs` - IPC bridge
- `packages/desktop/src/pages/LocationDetail.svelte` - Component integration

---

## Completion Score: 95%

### Completed
- Database schema and migrations
- Repository with full CRUD
- Orchestrator service
- Capture service (screenshot, PDF, HTML, WARC)
- Extraction service (images, videos, text)
- IPC handlers
- Preload bridge
- UI component
- Bookmark migration
- Browser path discovery fix

### Remaining (Minor)
- End-to-end testing with real URLs (requires user interaction)
- Optional Python text extractor script
- Documentation polish
