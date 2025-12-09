# Import Workflow

## Import Spine

Watcher scans drop zone, hashes every file (BLAKE3), copies into archive folder, and links to locations via hash primary keys **before metadata extraction**.

## Import Sequence

1. **User selects files/folders** — Renderer sends absolute paths through preload
2. **Main process validates** — Check permissions, available disk space
3. **Hash service computes BLAKE3** — Stream file, compute 16-char hex hash, assign organized name `<hash>.<ext>`
4. **File copied to archive folder** — Organized by location structure
5. **Metadata extraction runs** — ExifTool/FFmpeg/sharp extract metadata in background
6. **Repository upserts** — Media record keyed by BLAKE3 hash, linked to location/sub-location (if provided)
7. **Import queue updates** — Status: pending → processing → complete/error
8. **Post-import processing** — Live Photo detection, SDR duplicate hiding
9. **Auto-hero selection** — If location has no hero image and images were imported, first image becomes hero

## Folder Organization (ADR-046)

User-selected base folder → `locations/[STATE]/[LOCID]/`

Subfolders:
- `data/org-img/` — Images
- `data/org-vid/` — Videos
- `data/org-doc/` — Documents
- `archive/` — BagIt package (RFC 8493)

## Idempotency

Imports are idempotent. Rerunning import on same directory only adds links, not duplicate bytes. Hash collisions reuse existing files.

## Status Tracking

Import queue stores status for UI progress bars:
- `pending` — Queued, not started
- `processing` — Currently importing
- `complete` — Successfully imported
- `error` — Failed with reason

## Error Handling

- **Hash mismatch** — File corrupted, reject import
- **Permission denied** — Show error, suggest folder permissions fix
- **Disk space** — Check before import, warn user if insufficient
- **Duplicate file** — Prompt: skip or overwrite

## Progress Indicators

- Real-time progress bars in UI
- Background job for metadata extraction (doesn't block)
- Progress events emitted via IPC (`media:import:progress`)

## Audit Trail

Every import captures:
- Importer username
- Timestamps (import_date)
- Source paths (original_name)
- BLAKE3 hash (organized_name)

## Auto-Hero Selection

After a successful import, the system automatically sets a hero image for dashboard thumbnails:

- **Condition**: Location has no `hero_imgsha` AND at least one image was successfully imported
- **Selection**: First successfully imported image (not duplicate, not skipped)
- **Behavior**: Only runs once per location; manual hero selection always takes precedence
- **Non-blocking**: Failure to set auto-hero does not fail the import

This ensures new locations immediately appear with thumbnails on the Dashboard without requiring manual hero selection.
