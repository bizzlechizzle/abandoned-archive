# @au-archive/adapters-local

Local adapter implementations for the au-archive import pipeline.

## Overview

This package provides concrete implementations of the adapter interfaces defined in `@au-archive/import-core`:

```
┌─────────────────────────────────────────────────────────────┐
│                    adapters-local                           │
├─────────────────────────────────────────────────────────────┤
│  LocalStorageAdapter  │  SQLiteAdapter  │  ExifToolAdapter  │
│  (implements          │  (implements     │  (implements      │
│   StorageAdapter)     │   DatabaseAdapter│   MetadataAdapter│
├─────────────────────────────────────────────────────────────┤
│                    import-core (interfaces)                 │
└─────────────────────────────────────────────────────────────┘
```

## Installation

```bash
pnpm add @au-archive/adapters-local
```

## Adapters

### LocalStorageAdapter

Implements `StorageAdapter` using Node.js `fs` module.

```typescript
import { LocalStorageAdapter } from '@au-archive/adapters-local';

const storage = new LocalStorageAdapter();

// Read/write files
await storage.write('/path/to/file.txt', Buffer.from('content'));
const data = await storage.read('/path/to/file.txt');

// Copy with verification
const result = await storage.copy(source, dest, {
  checksum: true,   // Verify SHA256 after copy
  useRsync: true,   // Use rsync for large files (if available)
});

// Stream operations for large files
const readStream = storage.createReadStream('/path/to/large-file.mp4');
const writeStream = storage.createWriteStream('/path/to/output.mp4');
```

**Features:**
- rsync support for optimized large file transfers
- Hardlink support for same-filesystem copies
- Checksum verification after copy
- Stream support for memory-efficient large file handling

### SQLiteAdapter

Implements `DatabaseAdapter` using better-sqlite3.

```typescript
import { SQLiteAdapter } from '@au-archive/adapters-local';

const db = new SQLiteAdapter('/path/to/database.db');
await db.connect();

// Location operations
const location = await db.createLocation({
  locnam: 'Abandoned Hospital',
  gps_lat: 40.7128,
  gps_lng: -74.0060,
  address_state: 'NY',
});

// Media operations (within transaction)
await db.transaction(async (trx) => {
  await db.insertMedia(trx, mediaRecord);
  await db.insertProvenance(trx, provenanceRecord);
});

// Audit log (append-only)
await db.appendAuditLog({
  action: 'import',
  entityType: 'image',
  entityId: imageHash,
  actor: 'user@example.com',
});

// Fixity checks
await db.insertFixityCheck(fixityRecord);
const corrupted = await db.getCorruptedFiles();

await db.disconnect();
```

**Features:**
- WAL mode for concurrent reads
- Foreign key enforcement
- Automatic table creation
- Transaction support with automatic rollback

### ExifToolAdapter

Implements `MetadataAdapter` using exiftool-vendored.

```typescript
import { ExifToolAdapter } from '@au-archive/adapters-local';

const metadata = new ExifToolAdapter();
await metadata.initialize();

// Extract from single file
const result = await metadata.extract('/path/to/photo.jpg', 'image');
if (result.success) {
  console.log(result.metadata.cameraMake);
  console.log(result.metadata.gps);
}

// Batch extraction (optimized)
const results = await metadata.extractBatch([
  { path: '/photo1.jpg', type: 'image' },
  { path: '/video1.mp4', type: 'video' },
]);

// Extract GPS from metadata
const gps = metadata.extractGPS(result.metadata);

await metadata.shutdown();
```

**Features:**
- Support for 200+ file formats
- Parallel processing (configurable max processes)
- GPS extraction from EXIF
- Raw metadata preservation for archival

## Database Schema

The SQLiteAdapter automatically creates these tables:

| Table | Purpose |
|-------|---------|
| `locations` | Location records with GPS, address, status |
| `images` | Image media with camera metadata |
| `videos` | Video media with duration, codec |
| `documents` | Document media with page count |
| `maps` | Map media (GPX, KML, etc.) |
| `provenance` | Chain of custody records |
| `audit_log` | Append-only action log |
| `fixity_checks` | Integrity verification records |
| `imports` | Import batch records |

## Requirements

- Node.js 18+
- ExifTool (bundled via exiftool-vendored)

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Run tests once
pnpm test:run
```

## License

MIT
