/**
 * @au-archive/adapters-local
 *
 * Local adapter implementations for au-archive.
 * Provides SQLite, LocalStorage, and ExifTool adapters.
 *
 * @module @au-archive/adapters-local
 */

export { LocalStorageAdapter, SQLiteAdapter, ExifToolAdapter } from './adapters/index.js';

// Re-export types from import-core for convenience
export type {
  StorageAdapter,
  DatabaseAdapter,
  MetadataAdapter,
  CopyOptions,
  CopyResult,
  FileStat,
  FileInfo,
  TransactionContext,
  AuditEntry,
  FixityRecord,
  ImportRecord,
  MetadataResult,
  GPSCoordinates,
  ImageMetadata,
  VideoMetadata,
  DocumentMetadata,
  MapMetadata,
} from '@au-archive/import-core';
