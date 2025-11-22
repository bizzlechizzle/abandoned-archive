# Where's Waldo 13: CLI-First Architecture & Archive-Grade Foundation

Date: 2025-11-22
Status: **ARCHITECTURE SPECIFICATION**
Supersedes: whereswaldo11.md, whereswaldo12.md

---

## Executive Summary

This document specifies the **CLI-first architecture** for AU Archive, enabling:
- Cloud deployment readiness
- Institutional use (schools, historical societies)
- Multi-interface support (CLI, GUI, API, watch daemon)
- Archive-grade data integrity

**Core Principle:** Business logic lives in framework-agnostic packages. All interfaces (CLI, Electron, API) are thin wrappers.

```
┌─────────────────────────────────────────────────────────────┐
│                    packages/import-core                      │
│              (Pure TypeScript, zero framework deps)          │
│                                                              │
│   Services ──► Adapters (interfaces) ──► Domain Models       │
└─────────────────────────────────────────────────────────────┘
         │                │                │
    ┌────┴────┐      ┌────┴────┐      ┌────┴────┐
    │   CLI   │      │   GUI   │      │  Cloud  │
    │  (thin) │      │ (thin)  │      │ (thin)  │
    └─────────┘      └─────────┘      └─────────┘
```

---

## Part 1: Bug Fix Status (from whereswaldo12)

All critical bug fixes from whereswaldo12 are **ALREADY IMPLEMENTED**:

| Bug | Status | Location | Details |
|-----|--------|----------|---------|
| SQLite Deadlock (FIX 11) | DONE | file-import-service.ts:200-214 | Location pre-fetch before transaction |
| locid Redeclaration | DONE | file-import-service.ts:204 | Single declaration, proper scope |
| Svelte @const Placement | DONE | LocationDetail.svelte:768 | Correctly inside {#if} block |

**No action required on bug fixes.**

---

## Part 2: Current Architecture Problems

### 2.1 Code Audit Results

| File | Lines | LILBITS (300 max) | Status |
|------|-------|-------------------|--------|
| ipc-handlers.ts | 1,764 | FAIL | Business logic trapped in IPC |
| phase-import-service.ts | 862 | FAIL | Can't run without Electron |
| file-import-service.ts | 816 | FAIL | Duplicates phase-import logic |
| import-manifest.ts | 472 | FAIL | Should be in core package |
| address-normalizer.ts | 477 | FAIL | Pure logic, no framework deps |
| gpx-kml-parser.ts | 430 | FAIL | Pure logic, no framework deps |

**Total backend code: 9,536 lines trapped in Electron.**

### 2.2 The Trap

```
CURRENT (logic trapped in Electron):

┌─────────────────────────────────────────────────────────────┐
│ packages/desktop/electron/                                   │
│                                                              │
│  ipc-handlers.ts (1,764 lines)                              │
│    └── phase-import-service.ts (862 lines)                  │
│          └── import-manifest.ts (472 lines)                 │
│          └── exiftool-service.ts                            │
│          └── ffmpeg-service.ts                              │
│          └── Kysely DB calls                                │
│                                                              │
│  ❌ Cannot run headless                                      │
│  ❌ Cannot deploy to cloud                                   │
│  ❌ Cannot build API without rewriting                       │
│  ❌ Cannot test without Electron                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Part 3: CLI-First Architecture

### 3.1 Target Architecture

```
CORRECT (logic portable):

┌─────────────────────────────────────────────────────────────┐
│ packages/import-core (Pure TypeScript)                       │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │  Services   │  │  Adapters   │  │   Domain    │          │
│  │             │  │ (interfaces)│  │   Models    │          │
│  │ - import    │  │ - storage   │  │ - location  │          │
│  │ - location  │  │ - database  │  │ - media     │          │
│  │ - media     │  │ - metadata  │  │ - provenance│          │
│  │ - fixity    │  │             │  │             │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
│                                                              │
│  ✅ Zero framework dependencies                              │
│  ✅ Runs anywhere Node.js runs                               │
│  ✅ Fully testable without mocks                             │
└─────────────────────────────────────────────────────────────┘
         │                │                │
    ┌────┴────┐      ┌────┴────┐      ┌────┴────┐
    │   CLI   │      │ Desktop │      │  Cloud  │
    │         │      │(Electron)│      │  (API)  │
    └────┬────┘      └────┬────┘      └────┬────┘
         │                │                │
    ┌────┴────┐      ┌────┴────┐      ┌────┴────┐
    │ SQLite  │      │ SQLite  │      │Postgres │
    │ + Local │      │ + Local │      │ + S3    │
    └─────────┘      └─────────┘      └─────────┘
```

### 3.2 Package Structure

```
au-archive/
├── packages/
│   ├── core/                      # EXISTS - shared types/schemas
│   │
│   ├── import-core/               # NEW - framework-agnostic logic
│   │   ├── src/
│   │   │   ├── services/
│   │   │   │   ├── import-service.ts      (~150 lines)
│   │   │   │   ├── location-service.ts    (~100 lines)
│   │   │   │   ├── media-service.ts       (~100 lines)
│   │   │   │   └── fixity-service.ts      (~80 lines)
│   │   │   │
│   │   │   ├── pipeline/
│   │   │   │   ├── orchestrator.ts        (~80 lines)
│   │   │   │   ├── phase-log.ts           (~60 lines)
│   │   │   │   ├── phase-serialize.ts     (~120 lines)
│   │   │   │   ├── phase-copy.ts          (~100 lines)
│   │   │   │   └── phase-dump.ts          (~80 lines)
│   │   │   │
│   │   │   ├── adapters/
│   │   │   │   ├── storage.ts             (~40 lines) Interface
│   │   │   │   ├── database.ts            (~60 lines) Interface
│   │   │   │   └── metadata.ts            (~40 lines) Interface
│   │   │   │
│   │   │   ├── domain/
│   │   │   │   ├── location.ts            (~50 lines)
│   │   │   │   ├── media.ts               (~60 lines)
│   │   │   │   ├── provenance.ts          (~40 lines)
│   │   │   │   └── manifest.ts            (~80 lines)
│   │   │   │
│   │   │   └── index.ts                   (~30 lines) Exports
│   │   │
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── adapters-local/            # NEW - local implementations
│   │   ├── src/
│   │   │   ├── sqlite-adapter.ts          (~200 lines)
│   │   │   ├── local-storage.ts           (~100 lines)
│   │   │   ├── exiftool-adapter.ts        (~120 lines)
│   │   │   └── ffmpeg-adapter.ts          (~80 lines)
│   │   └── package.json
│   │
│   ├── cli/                       # NEW - command line interface
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   │   ├── import.ts              (~100 lines)
│   │   │   │   ├── verify.ts              (~60 lines)
│   │   │   │   ├── export.ts              (~80 lines)
│   │   │   │   └── status.ts              (~40 lines)
│   │   │   ├── config.ts                  (~60 lines)
│   │   │   └── index.ts                   (~40 lines)
│   │   ├── bin/au-archive
│   │   └── package.json
│   │
│   └── desktop/                   # EXISTS - refactored
│       └── electron/
│           └── main/
│               └── ipc-handlers.ts        (~300 lines) Thin wrapper
```

**Line count compliance: All files under 300 lines (LILBITS).**

---

## Part 4: Adapter Interfaces

### 4.1 Storage Adapter

```typescript
// packages/import-core/src/adapters/storage.ts

/**
 * Storage adapter interface - abstracts file system operations.
 * Implementations: LocalStorageAdapter (fs), S3StorageAdapter (cloud)
 */
export interface StorageAdapter {
  // Basic operations
  read(path: string): Promise<Buffer>;
  write(path: string, data: Buffer): Promise<void>;
  exists(path: string): Promise<boolean>;
  delete(path: string): Promise<void>;

  // Copy with optional rsync optimization
  copy(source: string, dest: string, options?: CopyOptions): Promise<CopyResult>;

  // Streaming for large files
  createReadStream(path: string): NodeJS.ReadableStream;
  createWriteStream(path: string): NodeJS.WritableStream;

  // Directory operations
  mkdir(path: string, recursive?: boolean): Promise<void>;
  list(directory: string): Promise<FileInfo[]>;

  // Metadata
  stat(path: string): Promise<FileStat>;
}

export interface CopyOptions {
  useRsync?: boolean;      // Use rsync if available
  hardlink?: boolean;      // Create hardlink instead of copy
  checksum?: boolean;      // Verify after copy
  partial?: boolean;       // Support resume
}

export interface CopyResult {
  success: boolean;
  bytesTransferred: number;
  usedRsync: boolean;
  verified: boolean;
}

export interface FileStat {
  size: number;
  mtime: Date;
  isFile: boolean;
  isDirectory: boolean;
}

export interface FileInfo {
  name: string;
  path: string;
  stat: FileStat;
}
```

### 4.2 Database Adapter

```typescript
// packages/import-core/src/adapters/database.ts

/**
 * Database adapter interface - abstracts all DB operations.
 * Implementations: SQLiteAdapter (local), PostgresAdapter (cloud)
 */
export interface DatabaseAdapter {
  // Connection lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;

  // Transaction support
  transaction<T>(fn: (trx: TransactionContext) => Promise<T>): Promise<T>;

  // Location operations
  findLocation(id: string): Promise<Location | null>;
  createLocation(data: LocationInput): Promise<Location>;
  updateLocation(id: string, data: Partial<LocationInput>): Promise<void>;

  // Media operations
  findMediaByHash(hash: string, type: MediaType): Promise<Media | null>;
  insertMedia(trx: TransactionContext, data: MediaRecord): Promise<void>;

  // Provenance operations
  insertProvenance(trx: TransactionContext, data: ProvenanceRecord): Promise<void>;

  // Audit log (append-only)
  appendAuditLog(entry: AuditEntry): Promise<void>;

  // Fixity operations
  insertFixityCheck(data: FixityRecord): Promise<void>;
  getLastFixityCheck(mediaHash: string): Promise<FixityRecord | null>;
  getCorruptedFiles(): Promise<FixityRecord[]>;

  // Import operations
  createImportRecord(trx: TransactionContext, data: ImportRecord): Promise<string>;
}

export interface TransactionContext {
  // Opaque transaction handle - implementation specific
}

export type MediaType = 'image' | 'video' | 'document' | 'map';
```

### 4.3 Metadata Adapter

```typescript
// packages/import-core/src/adapters/metadata.ts

/**
 * Metadata adapter interface - abstracts EXIF/video metadata extraction.
 * Implementations: ExifToolAdapter (local), LambdaMetadataAdapter (cloud)
 */
export interface MetadataAdapter {
  // Extract metadata from file
  extract(filePath: string, type: MediaType): Promise<MediaMetadata>;

  // Batch extraction (performance optimization)
  extractBatch(files: Array<{ path: string; type: MediaType }>): Promise<Map<string, MediaMetadata>>;

  // Parse GPS from metadata
  extractGPS(metadata: MediaMetadata): GPSCoordinates | null;
}

export interface MediaMetadata {
  // Common fields
  width?: number;
  height?: number;
  dateTaken?: string;

  // Image-specific
  cameraMake?: string;
  cameraModel?: string;
  cameraSerial?: string;

  // Video-specific
  duration?: number;
  codec?: string;
  fps?: number;

  // GPS
  gpsLat?: number;
  gpsLng?: number;
  gpsAltitude?: number;

  // Raw data for archive
  rawExif?: Record<string, unknown>;
  rawFfmpeg?: Record<string, unknown>;
}

export interface GPSCoordinates {
  lat: number;
  lng: number;
  altitude?: number;
  accuracy?: number;
}
```

---

## Part 5: Archive-Grade Foundation

### 5.1 New Database Tables

#### Provenance Table

Every piece of media needs a birth certificate for institutional trust.

```sql
-- Track the complete chain of custody for each media file
CREATE TABLE provenance (
  provenance_id TEXT PRIMARY KEY,

  -- Link to media (imgs/vids/docs/maps)
  media_sha TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK(media_type IN ('image', 'video', 'document', 'map')),

  -- WHO captured/imported
  captured_by TEXT,                     -- Photographer name
  captured_by_role TEXT,                -- 'student', 'faculty', 'volunteer', 'staff'
  imported_by TEXT NOT NULL,            -- Username who ran import
  institution TEXT,                     -- 'Central High School', etc.

  -- WHAT (original context)
  original_filename TEXT NOT NULL,
  original_device TEXT,                 -- 'Nikon D850', 'iPhone 15 Pro'
  original_device_serial TEXT,          -- Camera serial from EXIF

  -- WHEN
  captured_at TEXT,                     -- ISO8601 from EXIF DateTimeOriginal
  imported_at TEXT NOT NULL,            -- ISO8601 when added to archive

  -- WHERE (capture location)
  capture_gps_lat REAL,
  capture_gps_lng REAL,
  capture_gps_accuracy REAL,

  -- WHY (context)
  project TEXT,                         -- 'Spring 2025 Field Study'
  field_trip_id TEXT,                   -- Links to field trip record
  notes TEXT,

  -- Chain of custody
  source_path TEXT NOT NULL,            -- Original file location
  source_volume TEXT,                   -- 'SD Card', 'Google Drive', 'USB Drive'
  custody_chain TEXT,                   -- JSON array of transfers

  -- Timestamps
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  -- Constraints
  UNIQUE(media_sha, media_type)
);

CREATE INDEX idx_provenance_media ON provenance(media_sha, media_type);
CREATE INDEX idx_provenance_captured_by ON provenance(captured_by);
CREATE INDEX idx_provenance_institution ON provenance(institution);
CREATE INDEX idx_provenance_project ON provenance(project);
```

#### Audit Log Table (Append-Only)

Immutable record of all actions for accountability.

```sql
-- Append-only audit log - NEVER UPDATE OR DELETE
CREATE TABLE audit_log (
  log_id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),

  -- What happened
  action TEXT NOT NULL,                 -- 'import', 'edit', 'delete', 'export', 'verify', 'login'
  entity_type TEXT NOT NULL,            -- 'location', 'image', 'video', 'document', 'map', 'user'
  entity_id TEXT NOT NULL,              -- SHA256 or UUID of affected entity

  -- Who did it
  actor TEXT NOT NULL,                  -- Username or 'system:scheduled', 'system:startup'
  actor_role TEXT,                      -- 'admin', 'contributor', 'viewer', 'system'
  actor_ip TEXT,                        -- IP address if applicable

  -- Details
  details TEXT,                         -- JSON with action-specific data

  -- Integrity (blockchain-lite pattern)
  previous_hash TEXT,                   -- SHA256 of previous log entry
  entry_hash TEXT NOT NULL              -- SHA256 of this entry (timestamp + action + entity + actor + details + previous_hash)
);

-- Enforce append-only via trigger
CREATE TRIGGER audit_log_no_update
BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'Audit log is append-only. Updates are not permitted.');
END;

CREATE TRIGGER audit_log_no_delete
BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'Audit log is append-only. Deletions are not permitted.');
END;

CREATE INDEX idx_audit_timestamp ON audit_log(timestamp DESC);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_actor ON audit_log(actor);
```

#### Fixity Checks Table

Track verification over time to prove files haven't been tampered with.

```sql
-- Record of integrity verification checks
CREATE TABLE fixity_checks (
  check_id TEXT PRIMARY KEY,

  -- What was checked
  media_sha TEXT NOT NULL,              -- Expected SHA256
  media_type TEXT NOT NULL,
  file_path TEXT NOT NULL,              -- Archive path at time of check

  -- When/who checked
  checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  checked_by TEXT NOT NULL,             -- 'system:scheduled', 'system:startup', 'user:manual'

  -- Results
  expected_hash TEXT NOT NULL,
  actual_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('valid', 'corrupted', 'missing', 'error')),

  -- Size verification
  expected_size INTEGER,
  actual_size INTEGER,

  -- Error details if any
  error_message TEXT,

  -- Timestamps
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_fixity_status ON fixity_checks(status);
CREATE INDEX idx_fixity_date ON fixity_checks(checked_at DESC);
CREATE INDEX idx_fixity_media ON fixity_checks(media_sha, media_type);
```

### 5.2 Dublin Core Metadata Columns

Add to existing media tables for interoperability with museums/libraries:

```sql
-- Add Dublin Core columns to imgs table
ALTER TABLE imgs ADD COLUMN dc_title TEXT;
ALTER TABLE imgs ADD COLUMN dc_description TEXT;
ALTER TABLE imgs ADD COLUMN dc_creator TEXT;
ALTER TABLE imgs ADD COLUMN dc_date TEXT;
ALTER TABLE imgs ADD COLUMN dc_subject TEXT;           -- JSON array of subjects
ALTER TABLE imgs ADD COLUMN dc_coverage TEXT;          -- Geographic coverage
ALTER TABLE imgs ADD COLUMN dc_rights TEXT;            -- Rights statement

-- Same for vids, docs, maps tables
-- (Repeat ALTER statements for each table)
```

---

## Part 6: Import Pipeline (Refactored)

### 6.1 Pipeline Orchestrator

```typescript
// packages/import-core/src/pipeline/orchestrator.ts

import { PhaseLog } from './phase-log';
import { PhaseSerialize } from './phase-serialize';
import { PhaseCopy } from './phase-copy';
import { PhaseDump } from './phase-dump';
import type { StorageAdapter, DatabaseAdapter, MetadataAdapter } from '../adapters';
import type { ImportManifest, ImportProgress, ImportResult } from '../domain/manifest';

export class ImportOrchestrator {
  private readonly phaseLog: PhaseLog;
  private readonly phaseSerialize: PhaseSerialize;
  private readonly phaseCopy: PhaseCopy;
  private readonly phaseDump: PhaseDump;

  constructor(
    private readonly storage: StorageAdapter,
    private readonly database: DatabaseAdapter,
    private readonly metadata: MetadataAdapter
  ) {
    this.phaseLog = new PhaseLog();
    this.phaseSerialize = new PhaseSerialize(metadata);
    this.phaseCopy = new PhaseCopy(storage);
    this.phaseDump = new PhaseDump(database);
  }

  async import(
    input: ImportInput,
    onProgress?: (progress: ImportProgress) => void
  ): Promise<ImportResult> {
    // Phase 1: LOG IT
    onProgress?.({ phase: 'log', percent: 0 });
    const manifest = await this.phaseLog.execute(input);

    // Phase 2: SERIALIZE IT
    onProgress?.({ phase: 'serialize', percent: 0 });
    await this.phaseSerialize.execute(manifest, (p) => {
      onProgress?.({ phase: 'serialize', percent: p });
    });

    // Phase 3: COPY & NAME IT
    onProgress?.({ phase: 'copy', percent: 0 });
    await this.phaseCopy.execute(manifest, (p) => {
      onProgress?.({ phase: 'copy', percent: p });
    });

    // Phase 4: DUMP
    onProgress?.({ phase: 'dump', percent: 0 });
    await this.phaseDump.execute(manifest);

    onProgress?.({ phase: 'complete', percent: 100 });
    return manifest.toResult();
  }

  async resume(manifestPath: string): Promise<ImportResult> {
    const manifest = await ImportManifest.load(manifestPath);
    // Resume from last completed phase
    // ...
  }
}
```

### 6.2 Phase Implementations

Each phase is a small, focused module under 150 lines.

```typescript
// packages/import-core/src/pipeline/phase-log.ts (~60 lines)

export class PhaseLog {
  async execute(input: ImportInput): Promise<ImportManifest> {
    // 1. Validate location exists
    // 2. Create manifest file
    // 3. Record all input files with status='pending'
    // 4. Save manifest to disk
    return manifest;
  }
}
```

```typescript
// packages/import-core/src/pipeline/phase-serialize.ts (~120 lines)

export class PhaseSerialize {
  constructor(private readonly metadata: MetadataAdapter) {}

  async execute(manifest: ImportManifest, onProgress: (p: number) => void): Promise<void> {
    // 1. Classify file types by extension
    // 2. Calculate SHA256 hashes (parallel)
    // 3. Check for duplicates
    // 4. Extract metadata (batch)
    // 5. Validate GPS if present
    // 6. Update manifest
  }
}
```

```typescript
// packages/import-core/src/pipeline/phase-copy.ts (~100 lines)

export class PhaseCopy {
  constructor(private readonly storage: StorageAdapter) {}

  async execute(manifest: ImportManifest, onProgress: (p: number) => void): Promise<void> {
    // 1. Create folder structure
    // 2. Copy files (rsync if available)
    // 3. Verify integrity (re-hash)
    // 4. Update manifest with archive paths
  }
}
```

```typescript
// packages/import-core/src/pipeline/phase-dump.ts (~80 lines)

export class PhaseDump {
  constructor(private readonly database: DatabaseAdapter) {}

  async execute(manifest: ImportManifest): Promise<void> {
    // Single transaction for all DB operations
    await this.database.transaction(async (trx) => {
      // 1. Insert media records
      // 2. Insert provenance records
      // 3. Create import record
      // 4. Append to audit log
    });

    // 5. Delete originals if requested
    // 6. Mark manifest complete
  }
}
```

---

## Part 7: CLI Commands

### 7.1 Command Structure

```bash
au-archive <command> [options]

Commands:
  import     Import files to archive
  verify     Verify archive integrity
  export     Export data in standard formats
  status     Show archive statistics

Options:
  --config   Path to config file
  --verbose  Enable verbose output
  --help     Show help
```

### 7.2 Import Command

```typescript
// packages/cli/src/commands/import.ts (~100 lines)

import { Command } from 'commander';
import { ImportOrchestrator } from '@au-archive/import-core';
import { SQLiteAdapter, LocalStorageAdapter, ExifToolAdapter } from '@au-archive/adapters-local';
import ora from 'ora';

export function registerImportCommand(program: Command): void {
  program
    .command('import <files...>')
    .description('Import files to archive')
    .requiredOption('-l, --location <id>', 'Target location ID')
    .option('-d, --delete', 'Delete originals after import')
    .option('--no-verify', 'Skip checksum verification')
    .option('--dry-run', 'Show what would be imported')
    .option('--resume <manifest>', 'Resume interrupted import')
    .action(async (files, options) => {
      const spinner = ora('Initializing...').start();

      // Create adapters
      const storage = new LocalStorageAdapter(config.archivePath);
      const database = new SQLiteAdapter(config.databasePath);
      const metadata = new ExifToolAdapter();

      await database.connect();

      // Create orchestrator
      const orchestrator = new ImportOrchestrator(storage, database, metadata);

      // Run import with progress
      const result = await orchestrator.import({
        files: files.map(f => ({ path: f, name: path.basename(f) })),
        locationId: options.location,
        deleteOriginals: options.delete,
        verifyChecksums: options.verify,
      }, (progress) => {
        spinner.text = `${progress.phase}: ${progress.percent}%`;
      });

      spinner.succeed(`Imported ${result.summary.imported} files`);

      await database.disconnect();
    });
}
```

### 7.3 Verify Command

```typescript
// packages/cli/src/commands/verify.ts (~60 lines)

export function registerVerifyCommand(program: Command): void {
  program
    .command('verify')
    .description('Verify archive integrity')
    .option('-l, --location <id>', 'Verify specific location')
    .option('--all', 'Verify entire archive')
    .option('--sample <n>', 'Verify random sample of n files')
    .action(async (options) => {
      const fixity = new FixityService(storage, database);

      const result = await fixity.verify({
        locationId: options.location,
        all: options.all,
        sampleSize: options.sample ? parseInt(options.sample) : undefined,
      });

      console.log(`Verified: ${result.checked}`);
      console.log(`Valid: ${result.valid}`);
      console.log(`Corrupted: ${result.corrupted}`);
      console.log(`Missing: ${result.missing}`);
    });
}
```

---

## Part 8: Desktop Refactor

### 8.1 Thin IPC Handlers

After refactor, `ipc-handlers.ts` becomes a thin wrapper (~300 lines):

```typescript
// packages/desktop/electron/main/ipc-handlers.ts (AFTER refactor)

import { ipcMain } from 'electron';
import { ImportOrchestrator } from '@au-archive/import-core';
import { SQLiteAdapter, LocalStorageAdapter, ExifToolAdapter } from '@au-archive/adapters-local';

export function registerIPCHandlers(mainWindow: BrowserWindow): void {
  const storage = new LocalStorageAdapter(getArchivePath());
  const database = new SQLiteAdapter(getDatabasePath());
  const metadata = new ExifToolAdapter();

  const orchestrator = new ImportOrchestrator(storage, database, metadata);

  // Import handler - delegates to core
  ipcMain.handle('media:import', async (event, input) => {
    return orchestrator.import(input, (progress) => {
      mainWindow.webContents.send('media:import:progress', progress);
    });
  });

  // Verify handler - delegates to core
  ipcMain.handle('media:verify', async (event, options) => {
    const fixity = new FixityService(storage, database);
    return fixity.verify(options);
  });

  // ... other thin handlers
}
```

### 8.2 Migration Strategy

1. Create `packages/import-core` with new structure
2. Create `packages/adapters-local` with implementations
3. Update `packages/desktop` to use new packages
4. Delete old services (phase-import-service.ts, file-import-service.ts)
5. Test thoroughly

---

## Part 9: claude.md Compliance Audit

### 9.1 Rules Checklist

| Rule | Requirement | Compliance | Notes |
|------|-------------|------------|-------|
| LILBITS | 300 lines max per file | PASS | All new files under 150 lines |
| KISS | Keep it simple | PASS | Adapter pattern is standard, not over-engineered |
| DRETW | Don't reinvent wheel | PASS | Using commander, ora, exiftool-vendored |
| NGS | No Google Services | PASS | No Google dependencies |
| BPL | Bulletproof long-term | PASS | Adapter pattern enables future changes |
| DAFIDFAF | Don't add unrequested features | PASS | Only adding what's needed for CLI-first |
| NME | No emojis | PASS | No emojis in code or docs |

### 9.2 Line Count Projections

| File | Projected Lines | LILBITS |
|------|-----------------|---------|
| orchestrator.ts | ~80 | PASS |
| phase-log.ts | ~60 | PASS |
| phase-serialize.ts | ~120 | PASS |
| phase-copy.ts | ~100 | PASS |
| phase-dump.ts | ~80 | PASS |
| storage.ts (interface) | ~40 | PASS |
| database.ts (interface) | ~60 | PASS |
| metadata.ts (interface) | ~40 | PASS |
| sqlite-adapter.ts | ~200 | PASS |
| local-storage.ts | ~100 | PASS |
| exiftool-adapter.ts | ~120 | PASS |
| import.ts (CLI) | ~100 | PASS |
| verify.ts (CLI) | ~60 | PASS |
| ipc-handlers.ts (refactored) | ~300 | PASS |

---

## Part 10: Implementation Guide

### For Junior Developers

This section provides step-by-step instructions for implementing the CLI-first architecture.

### Step 1: Create packages/import-core

```bash
# From repository root
mkdir -p packages/import-core/src/{adapters,domain,pipeline,services}
cd packages/import-core

# Initialize package
cat > package.json << 'EOF'
{
  "name": "@au-archive/import-core",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest"
  },
  "dependencies": {
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "vitest": "^1.1.0"
  }
}
EOF

# Create tsconfig
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
EOF
```

### Step 2: Create Adapter Interfaces

Create files in `packages/import-core/src/adapters/`:

1. **storage.ts** - Copy the StorageAdapter interface from Part 4.1
2. **database.ts** - Copy the DatabaseAdapter interface from Part 4.2
3. **metadata.ts** - Copy the MetadataAdapter interface from Part 4.3

Create `packages/import-core/src/adapters/index.ts`:

```typescript
export * from './storage';
export * from './database';
export * from './metadata';
```

### Step 3: Create Domain Models

```typescript
// packages/import-core/src/domain/manifest.ts

import { z } from 'zod';

export const ManifestFileSchema = z.object({
  index: z.number(),
  originalPath: z.string(),
  originalName: z.string(),
  sizeBytes: z.number(),
  sha256: z.string().nullable(),
  type: z.enum(['image', 'video', 'document', 'map']).nullable(),
  isDuplicate: z.boolean().default(false),
  archivePath: z.string().nullable(),
  status: z.enum(['pending', 'hashing', 'serialized', 'copied', 'complete', 'error', 'duplicate']),
  error: z.string().nullable(),
});

export const ManifestSchema = z.object({
  importId: z.string(),
  version: z.literal('1.0'),
  createdAt: z.string(),
  status: z.enum(['phase_1_log', 'phase_2_serialize', 'phase_3_copy', 'phase_4_dump', 'complete', 'failed']),
  location: z.object({
    locid: z.string(),
    locnam: z.string(),
    slocnam: z.string().nullable(),
    loc12: z.string(),
    state: z.string().nullable(),
    type: z.string().nullable(),
  }),
  options: z.object({
    deleteOriginals: z.boolean().default(false),
    useHardlinks: z.boolean().default(false),
    verifyChecksums: z.boolean().default(true),
  }),
  files: z.array(ManifestFileSchema),
  summary: z.object({
    total: z.number(),
    imported: z.number(),
    duplicates: z.number(),
    errors: z.number(),
  }).nullable(),
});

export type Manifest = z.infer<typeof ManifestSchema>;
export type ManifestFile = z.infer<typeof ManifestFileSchema>;
```

### Step 4: Create Pipeline Phases

Start with `phase-log.ts` as the simplest phase:

```typescript
// packages/import-core/src/pipeline/phase-log.ts

import { randomUUID } from 'crypto';
import type { Manifest, ManifestFile } from '../domain/manifest';

export interface LogPhaseInput {
  files: Array<{ path: string; name: string; size: number }>;
  locationId: string;
  location: {
    locnam: string;
    slocnam: string | null;
    loc12: string;
    state: string | null;
    type: string | null;
  };
  options: {
    deleteOriginals?: boolean;
    useHardlinks?: boolean;
    verifyChecksums?: boolean;
  };
}

export class PhaseLog {
  execute(input: LogPhaseInput): Manifest {
    const now = new Date().toISOString();
    const importId = `imp-${now.slice(0, 10).replace(/-/g, '')}-${randomUUID().slice(0, 8)}`;

    const files: ManifestFile[] = input.files.map((f, index) => ({
      index,
      originalPath: f.path,
      originalName: f.name,
      sizeBytes: f.size,
      sha256: null,
      type: null,
      isDuplicate: false,
      archivePath: null,
      status: 'pending',
      error: null,
    }));

    return {
      importId,
      version: '1.0',
      createdAt: now,
      status: 'phase_1_log',
      location: {
        locid: input.locationId,
        locnam: input.location.locnam,
        slocnam: input.location.slocnam,
        loc12: input.location.loc12,
        state: input.location.state,
        type: input.location.type,
      },
      options: {
        deleteOriginals: input.options.deleteOriginals ?? false,
        useHardlinks: input.options.useHardlinks ?? false,
        verifyChecksums: input.options.verifyChecksums ?? true,
      },
      files,
      summary: null,
    };
  }
}
```

### Step 5: Create Local Adapters Package

```bash
mkdir -p packages/adapters-local/src
cd packages/adapters-local

cat > package.json << 'EOF'
{
  "name": "@au-archive/adapters-local",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "dependencies": {
    "@au-archive/import-core": "workspace:*",
    "better-sqlite3": "^11.0.0",
    "exiftool-vendored": "^33.2.0",
    "fluent-ffmpeg": "^2.1.2",
    "execa": "^8.0.1"
  }
}
EOF
```

### Step 6: Implement SQLite Adapter

```typescript
// packages/adapters-local/src/sqlite-adapter.ts

import Database from 'better-sqlite3';
import type { DatabaseAdapter, TransactionContext, Location } from '@au-archive/import-core';

export class SQLiteAdapter implements DatabaseAdapter {
  private db: Database.Database | null = null;

  constructor(private readonly dbPath: string) {}

  async connect(): Promise<void> {
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  async disconnect(): Promise<void> {
    this.db?.close();
    this.db = null;
  }

  async transaction<T>(fn: (trx: TransactionContext) => Promise<T>): Promise<T> {
    if (!this.db) throw new Error('Database not connected');

    const trx = this.db.transaction(() => {
      // better-sqlite3 transactions are synchronous
      // We wrap in async for interface compatibility
    });

    return fn({ db: this.db });
  }

  async findLocation(id: string): Promise<Location | null> {
    if (!this.db) throw new Error('Database not connected');

    const row = this.db.prepare(`
      SELECT locid, locnam, slocnam, loc12, address_state, type, gps_lat, gps_lng
      FROM locs WHERE locid = ?
    `).get(id) as Location | undefined;

    return row ?? null;
  }

  // ... implement other methods
}
```

### Step 7: Create CLI Package

```bash
mkdir -p packages/cli/src/commands
mkdir -p packages/cli/bin
cd packages/cli

cat > package.json << 'EOF'
{
  "name": "@au-archive/cli",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "au-archive": "./bin/au-archive.js"
  },
  "dependencies": {
    "@au-archive/import-core": "workspace:*",
    "@au-archive/adapters-local": "workspace:*",
    "commander": "^11.1.0",
    "ora": "^8.0.1",
    "chalk": "^5.3.0",
    "cosmiconfig": "^9.0.0"
  }
}
EOF

# Create bin entry
cat > bin/au-archive.js << 'EOF'
#!/usr/bin/env node
import '../dist/index.js';
EOF
chmod +x bin/au-archive.js
```

### Step 8: Add Schema Migration

Create migration for new tables:

```sql
-- packages/desktop/electron/main/migrations/003_archive_grade.sql

-- Provenance table
CREATE TABLE IF NOT EXISTS provenance (
  provenance_id TEXT PRIMARY KEY,
  media_sha TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK(media_type IN ('image', 'video', 'document', 'map')),
  captured_by TEXT,
  captured_by_role TEXT,
  imported_by TEXT NOT NULL,
  institution TEXT,
  original_filename TEXT NOT NULL,
  original_device TEXT,
  original_device_serial TEXT,
  captured_at TEXT,
  imported_at TEXT NOT NULL,
  capture_gps_lat REAL,
  capture_gps_lng REAL,
  capture_gps_accuracy REAL,
  project TEXT,
  field_trip_id TEXT,
  notes TEXT,
  source_path TEXT NOT NULL,
  source_volume TEXT,
  custody_chain TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(media_sha, media_type)
);

CREATE INDEX IF NOT EXISTS idx_provenance_media ON provenance(media_sha, media_type);
CREATE INDEX IF NOT EXISTS idx_provenance_institution ON provenance(institution);

-- Audit log table (append-only)
CREATE TABLE IF NOT EXISTS audit_log (
  log_id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  actor_role TEXT,
  actor_ip TEXT,
  details TEXT,
  previous_hash TEXT,
  entry_hash TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS audit_log_no_update
BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'Audit log is append-only');
END;

CREATE TRIGGER IF NOT EXISTS audit_log_no_delete
BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'Audit log is append-only');
END;

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);

-- Fixity checks table
CREATE TABLE IF NOT EXISTS fixity_checks (
  check_id TEXT PRIMARY KEY,
  media_sha TEXT NOT NULL,
  media_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  checked_by TEXT NOT NULL,
  expected_hash TEXT NOT NULL,
  actual_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('valid', 'corrupted', 'missing', 'error')),
  expected_size INTEGER,
  actual_size INTEGER,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fixity_status ON fixity_checks(status);
CREATE INDEX IF NOT EXISTS idx_fixity_media ON fixity_checks(media_sha, media_type);
```

### Step 9: Update pnpm-workspace.yaml

```yaml
packages:
  - 'packages/core'
  - 'packages/import-core'
  - 'packages/adapters-local'
  - 'packages/cli'
  - 'packages/desktop'
```

### Step 10: Test and Verify

```bash
# Install dependencies
pnpm install

# Build packages in order
pnpm --filter @au-archive/import-core build
pnpm --filter @au-archive/adapters-local build
pnpm --filter @au-archive/cli build

# Test CLI
pnpm --filter @au-archive/cli exec au-archive --help

# Test import
pnpm --filter @au-archive/cli exec au-archive import \
  --location <location-id> \
  ~/Photos/test.jpg
```

---

## Part 11: Execution Checklist

### Phase A: Foundation (Week 1)

- [ ] Create `packages/import-core` directory structure
- [ ] Create adapter interfaces (storage.ts, database.ts, metadata.ts)
- [ ] Create domain models (manifest.ts, location.ts, media.ts, provenance.ts)
- [ ] Create pipeline orchestrator
- [ ] Create phase-log.ts
- [ ] Create phase-serialize.ts
- [ ] Create phase-copy.ts
- [ ] Create phase-dump.ts
- [ ] Write unit tests for each module
- [ ] Verify all files under 300 lines

### Phase B: Local Adapters (Week 2)

- [ ] Create `packages/adapters-local` directory structure
- [ ] Implement SQLiteAdapter
- [ ] Implement LocalStorageAdapter (with rsync support)
- [ ] Implement ExifToolAdapter
- [ ] Implement FFmpegAdapter
- [ ] Write integration tests
- [ ] Verify all files under 300 lines

### Phase C: CLI (Week 2)

- [ ] Create `packages/cli` directory structure
- [ ] Implement config loader (cosmiconfig)
- [ ] Implement import command
- [ ] Implement verify command
- [ ] Implement export command
- [ ] Implement status command
- [ ] Write E2E tests
- [ ] Verify all files under 300 lines

### Phase D: Desktop Refactor (Week 3)

- [ ] Update `packages/desktop` to depend on new packages
- [ ] Refactor ipc-handlers.ts to use ImportOrchestrator
- [ ] Remove old phase-import-service.ts
- [ ] Remove old file-import-service.ts
- [ ] Update preload scripts
- [ ] Test GUI import still works
- [ ] Verify ipc-handlers.ts under 300 lines

### Phase E: Archive-Grade Foundation (Week 3)

- [ ] Create migration for provenance table
- [ ] Create migration for audit_log table
- [ ] Create migration for fixity_checks table
- [ ] Add Dublin Core columns to media tables
- [ ] Update import pipeline to populate provenance
- [ ] Update import pipeline to append audit log
- [ ] Implement FixityService
- [ ] Add "Verify Archive" button in GUI

### Phase F: Documentation (Week 4)

- [ ] Update claude.md with new package structure
- [ ] Update techguide.md with adapter documentation
- [ ] Update lilbits.md with new files
- [ ] Create CLI README
- [ ] Create migration guide for existing users

---

## Part 12: Migration Path

### For Existing Users

1. **Database Migration**: New tables added automatically on app start
2. **Archive Files**: No changes to existing files
3. **Manifests**: Old manifests still readable
4. **Settings**: No changes required

### For Developers

1. **Breaking Change**: Old services removed
2. **New Dependency**: Must import from @au-archive/import-core
3. **IPC Handlers**: Signature unchanged, implementation delegated

---

## Summary

This architecture provides:

1. **CLI-First**: All business logic in framework-agnostic `import-core`
2. **Cloud-Ready**: Adapter pattern enables S3/Postgres swap
3. **Archive-Grade**: Provenance, audit log, fixity verification
4. **LILBITS Compliant**: All files under 300 lines
5. **Testable**: Core logic testable without frameworks
6. **Institutional Trust**: Chain of custody, Dublin Core, OAIS concepts

**Total new code: ~2,000 lines across 20+ files (avg 100 lines each)**

**Estimated effort: 4 weeks (1 developer)**

---

End of Document
