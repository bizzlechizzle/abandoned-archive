/**
 * @au-archive/import-core
 *
 * Framework-agnostic import pipeline for AU Archive.
 *
 * This package contains the core business logic for importing media files.
 * It is designed to be used by CLI, Electron, or cloud deployments.
 *
 * @example
 * ```typescript
 * import { ImportOrchestrator } from '@au-archive/import-core';
 * import { SQLiteAdapter, LocalStorageAdapter, ExifToolAdapter } from '@au-archive/adapters-local';
 *
 * const orchestrator = new ImportOrchestrator(
 *   { archivePath: '/archive', manifestPath: '/archive/imports' },
 *   { storage: new LocalStorageAdapter(), database: new SQLiteAdapter(), metadata: new ExifToolAdapter() }
 * );
 *
 * const result = await orchestrator.import({
 *   files: [{ path: '/photos/test.jpg', name: 'test.jpg', size: 1024 }],
 *   locationId: 'abc123',
 *   location: { ... },
 * });
 * ```
 *
 * @packageDocumentation
 */

// ─────────────────────────────────────────────────────────────
// Adapters (interfaces only - implementations in separate packages)
// ─────────────────────────────────────────────────────────────

export type {
  // Storage
  StorageAdapter,
  CopyOptions,
  CopyResult,
  FileStat,
  FileInfo,
  // Database
  DatabaseAdapter,
  TransactionContext,
  AuditEntry,
  AuditAction,
  EntityType,
  FixityRecord,
  FixityStatus,
  ImportRecord,
  // Metadata
  MetadataAdapter,
  GPSCoordinates,
  BaseMetadata,
  ImageMetadata,
  VideoMetadata,
  DocumentMetadata,
  MapMetadata,
  MediaMetadata,
  MetadataResult,
  BatchMetadataInput,
} from './adapters/index.js';

// ─────────────────────────────────────────────────────────────
// Domain Models
// ─────────────────────────────────────────────────────────────

export {
  // Location
  LocationSchema,
  LocationInputSchema,
  GPSSourceSchema,
  LocationStatusSchema,
  LocationConditionSchema,
  type Location,
  type LocationInput,
  type LocationRef,
  type GPSSource,
  type LocationStatus,
  type LocationCondition,
  // Media
  MediaTypeSchema,
  MediaRecordSchema,
  ImageRecordSchema,
  VideoRecordSchema,
  DocumentRecordSchema,
  MapRecordSchema,
  FILE_EXTENSIONS,
  getMediaType,
  type MediaType,
  type MediaRecord,
  type ImageRecord,
  type VideoRecord,
  type DocumentRecord,
  type MapRecord,
  // Provenance
  ProvenanceRecordSchema,
  ContributorRoleSchema,
  SourceVolumeSchema,
  CustodyEntrySchema,
  createProvenanceRecord,
  type ProvenanceRecord,
  type ContributorRole,
  type SourceVolume,
  type CustodyEntry,
  // Manifest
  ManifestSchema,
  ManifestFileSchema,
  ImportPhaseSchema,
  FileStatusSchema,
  ImportOptionsSchema,
  ImportSummarySchema,
  generateImportId,
  createManifest,
  calculateSummary,
  type Manifest,
  type ManifestFile,
  type ImportPhase,
  type FileStatus,
  type ImportOptions,
  type ImportSummary,
  type ImportProgress,
  type ImportInput,
  type ImportResult,
} from './domain/index.js';

// ─────────────────────────────────────────────────────────────
// Pipeline
// ─────────────────────────────────────────────────────────────

export {
  ImportOrchestrator,
  type OrchestratorConfig,
  type OrchestratorDependencies,
  PhaseLog,
  type PhaseLogDependencies,
  PhaseSerialize,
  type PhaseSerializeDependencies,
  PhaseCopy,
  type PhaseCopyDependencies,
  PhaseDump,
  type PhaseDumpDependencies,
} from './pipeline/index.js';
