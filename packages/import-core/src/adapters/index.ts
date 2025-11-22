/**
 * Adapter Interfaces
 *
 * These interfaces define the contracts for external dependencies.
 * Implementations live in separate packages (adapters-local, adapters-cloud).
 *
 * @module adapters
 */

// Storage adapter
export type {
  StorageAdapter,
  CopyOptions,
  CopyResult,
  FileStat,
  FileInfo,
} from './storage.js';

// Database adapter
export type {
  DatabaseAdapter,
  TransactionContext,
  AuditEntry,
  AuditAction,
  EntityType,
  FixityRecord,
  FixityStatus,
  ImportRecord,
} from './database.js';

// Metadata adapter
export type {
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
} from './metadata.js';
