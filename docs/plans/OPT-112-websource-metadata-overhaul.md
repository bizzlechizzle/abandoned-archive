# OPT-112: Web Source Metadata Extraction Overhaul

**Status**: Implementation
**Created**: 2025-12-12
**Author**: Claude Code

---

## Problem Statement

The web archiving feature captures pages (screenshot, PDF, HTML, WARC) but fails to extract and store comprehensive metadata. The database schema (`web_source_images`, `web_source_videos`, page-level metadata columns) and UI (`WebSourceDetailModal.svelte`) are ready for rich metadata - the extraction pipeline simply doesn't populate it.

---

## Goals

1. Extract comprehensive page-level metadata (Open Graph, Schema.org, Dublin Core, HTTP headers)
2. Populate `web_source_images` table with per-image metadata (alt, caption, credit, EXIF)
3. Populate `web_source_videos` table with yt-dlp extracted metadata
4. Store extracted links, canonical URL, language, favicon
5. Enable historians to reconstruct page provenance 35+ years from now

---

## Architecture

### New Service: `websource-metadata-service.ts`

Dedicated service for extracting structured metadata from web pages using Puppeteer DOM access.

```
websource-orchestrator-service.ts
    ├── websource-capture-service.ts (Screenshot, PDF, HTML, WARC)
    ├── websource-extraction-service.ts (Images, Videos, Text) [ENHANCED]
    └── websource-metadata-service.ts [NEW]
            ├── extractPageMetadata() - OG, Schema.org, Dublin Core
            ├── extractImageMetadata() - DOM context for each image
            ├── extractLinkMetadata() - All links with context
            └── extractHttpHeaders() - Response headers
```

### Data Flow

```
1. User saves URL via Research Browser extension
2. Orchestrator receives archive request
3. [NEW] Metadata service extracts page-level metadata from response headers + DOM
4. Capture service creates Screenshot/PDF/HTML/WARC
5. [ENHANCED] Extraction service downloads images with DOM context metadata
6. [ENHANCED] Extraction service downloads videos, stores full yt-dlp JSON
7. [NEW] Repository stores per-image metadata to web_source_images
8. [NEW] Repository stores per-video metadata to web_source_videos
9. Orchestrator updates web_sources with all extracted data
```

---

## Implementation Phases

### Phase 1: Page Metadata Service (`websource-metadata-service.ts`)

New service that extracts:
- Open Graph meta tags (og:title, og:image, og:description, etc.)
- Schema.org JSON-LD (parsed and raw)
- Dublin Core metadata
- Twitter Cards
- Standard meta tags (description, keywords, robots)
- HTTP response headers
- Canonical URL, language, favicon

### Phase 2: Enhanced Image Extraction

Modify `websource-extraction-service.ts` to extract DOM context:
- `alt` text from img element
- `caption` from nearest figcaption or [class*=caption]
- `credit` from [class*=credit], [class*=byline]
- `attribution` from data attributes
- `srcset_variants` parsed from srcset attribute
- `context_html` from parent figure/picture
- `link_url` if image wrapped in anchor
- Post-download EXIF extraction using exifreader

### Phase 3: Enhanced Video Metadata

Modify `websource-extraction-service.ts` to store full yt-dlp metadata:
- Parse complete .info.json file
- Store all platform-specific fields
- Preserve tags, categories, view counts

### Phase 4: Repository Methods

Add to `sqlite-websources-repository.ts`:
- `insertSourceImages(sourceId, images[])`
- `insertSourceVideos(sourceId, videos[])`
- `clearSourceMedia(sourceId)` for re-archiving

### Phase 5: Orchestrator Integration

Update `websource-orchestrator-service.ts`:
- Call new metadata service
- Pass DOM context to extraction service
- Store all metadata via repository
- Update web_sources with page-level metadata

---

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `websource-metadata-service.ts` | NEW | Page-level metadata extraction |
| `websource-extraction-service.ts` | MODIFY | Add DOM context extraction, EXIF, video metadata |
| `sqlite-websources-repository.ts` | MODIFY | Add insertSourceImages, insertSourceVideos |
| `websource-orchestrator-service.ts` | MODIFY | Integrate metadata service, store all data |
| `package.json` | MODIFY | Add exifreader dependency |

---

## Dependencies

| Package | Version | Purpose | License |
|---------|---------|---------|---------|
| exifreader | ^4.14.0 | EXIF/IPTC/XMP extraction from images | MPL-2.0 |

Note: metascraper considered but adds complexity; using direct DOM extraction instead for offline-first compliance.

---

## Testing Checklist

- [ ] Archive a news article - verify author, date, publisher extracted
- [ ] Archive page with images - verify captions, credits in web_source_images
- [ ] Archive page with embedded YouTube - verify full video metadata
- [ ] Archive page with Schema.org JSON-LD - verify structured data captured
- [ ] Archive page with Open Graph - verify OG tags captured
- [ ] Re-archive same URL - verify media tables cleared and repopulated
- [ ] View archived source in UI - verify all sections display data

---

## CLAUDE.md Compliance

- [ ] No features beyond scope
- [ ] Offline-first (no external API calls)
- [ ] BLAKE3 hashing for all files
- [ ] Error handling with graceful degradation
- [ ] No AI mentions in code/comments
- [ ] Under 300 LOC per new file (or documented exception)

---

## Rollback Plan

All changes are additive - existing archive functionality preserved. New metadata fields have NULL defaults. Repository methods use INSERT ON CONFLICT DO NOTHING for safety.
