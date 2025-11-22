/**
 * Domain Models
 *
 * Core business entities for the import pipeline.
 *
 * @module domain
 */

// Location
export {
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
} from './location.js';

// Media
export {
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
} from './media.js';

// Provenance
export {
  ProvenanceRecordSchema,
  ContributorRoleSchema,
  SourceVolumeSchema,
  CustodyEntrySchema,
  createProvenanceRecord,
  type ProvenanceRecord,
  type ContributorRole,
  type SourceVolume,
  type CustodyEntry,
} from './provenance.js';

// Manifest
export {
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
} from './manifest.js';
