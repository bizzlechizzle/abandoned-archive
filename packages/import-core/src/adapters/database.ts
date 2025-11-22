/**
 * Database Adapter Interface
 *
 * Abstracts all database operations for portability.
 * Implementations: SQLiteAdapter (local), PostgresAdapter (cloud)
 *
 * @module adapters/database
 */

import type { Location, LocationInput } from '../domain/location.js';
import type { MediaRecord, MediaType } from '../domain/media.js';
import type { ProvenanceRecord } from '../domain/provenance.js';

/** Opaque transaction context - implementation specific */
export interface TransactionContext {
  /** Implementation-specific transaction handle */
  readonly _brand: unique symbol;
}

/** Audit log entry */
export interface AuditEntry {
  action: AuditAction;
  entityType: EntityType;
  entityId: string;
  actor: string;
  actorRole?: string;
  actorIp?: string;
  details?: Record<string, unknown>;
}

/** Supported audit actions */
export type AuditAction =
  | 'import'
  | 'edit'
  | 'delete'
  | 'export'
  | 'verify'
  | 'login'
  | 'logout'
  | 'create'
  | 'update';

/** Entity types for audit log */
export type EntityType =
  | 'location'
  | 'image'
  | 'video'
  | 'document'
  | 'map'
  | 'user'
  | 'import'
  | 'settings';

/** Fixity check record */
export interface FixityRecord {
  checkId: string;
  mediaSha: string;
  mediaType: MediaType;
  filePath: string;
  checkedAt: string;
  checkedBy: string;
  expectedHash: string;
  actualHash: string;
  status: FixityStatus;
  expectedSize?: number;
  actualSize?: number;
  errorMessage?: string;
}

/** Fixity check status */
export type FixityStatus = 'valid' | 'corrupted' | 'missing' | 'error';

/** Import record for tracking import batches */
export interface ImportRecord {
  importId: string;
  locid: string;
  importDate: string;
  authImp: string | null;
  imgCount: number;
  vidCount: number;
  docCount: number;
  mapCount: number;
  notes?: string;
}

/**
 * Database adapter interface - abstracts all database operations.
 *
 * This allows the import pipeline to work with SQLite, Postgres,
 * or any other database backend without code changes.
 */
export interface DatabaseAdapter {
  /** Connect to database */
  connect(): Promise<void>;

  /** Disconnect from database */
  disconnect(): Promise<void>;

  /** Check if connected */
  isConnected(): boolean;

  /**
   * Execute function within a transaction.
   * Automatically commits on success, rolls back on error.
   */
  transaction<T>(fn: (trx: TransactionContext) => Promise<T>): Promise<T>;

  // ─────────────────────────────────────────────────────────────
  // Location Operations
  // ─────────────────────────────────────────────────────────────

  /** Find location by ID */
  findLocation(id: string): Promise<Location | null>;

  /** Find location by loc12 short ID */
  findLocationByLoc12(loc12: string): Promise<Location | null>;

  /** Create new location */
  createLocation(data: LocationInput): Promise<Location>;

  /** Update existing location */
  updateLocation(id: string, data: Partial<LocationInput>): Promise<void>;

  // ─────────────────────────────────────────────────────────────
  // Media Operations
  // ─────────────────────────────────────────────────────────────

  /** Find media by SHA256 hash */
  findMediaByHash(hash: string, type: MediaType): Promise<MediaRecord | null>;

  /** Check if media exists (duplicate check) */
  mediaExists(hash: string, type: MediaType): Promise<boolean>;

  /** Insert media record within transaction */
  insertMedia(trx: TransactionContext, data: MediaRecord): Promise<void>;

  // ─────────────────────────────────────────────────────────────
  // Provenance Operations
  // ─────────────────────────────────────────────────────────────

  /** Insert provenance record within transaction */
  insertProvenance(trx: TransactionContext, data: ProvenanceRecord): Promise<void>;

  /** Get provenance for media */
  getProvenance(mediaSha: string, mediaType: MediaType): Promise<ProvenanceRecord | null>;

  // ─────────────────────────────────────────────────────────────
  // Audit Log Operations (Append-Only)
  // ─────────────────────────────────────────────────────────────

  /** Append entry to audit log */
  appendAuditLog(entry: AuditEntry): Promise<void>;

  /** Get recent audit entries */
  getRecentAuditEntries(limit: number): Promise<AuditEntry[]>;

  // ─────────────────────────────────────────────────────────────
  // Fixity Operations
  // ─────────────────────────────────────────────────────────────

  /** Insert fixity check record */
  insertFixityCheck(data: FixityRecord): Promise<void>;

  /** Get last fixity check for media */
  getLastFixityCheck(mediaSha: string, mediaType: MediaType): Promise<FixityRecord | null>;

  /** Get all corrupted files */
  getCorruptedFiles(): Promise<FixityRecord[]>;

  /** Get files needing verification (not checked since date) */
  getFilesNeedingVerification(since: Date, limit: number): Promise<Array<{ sha: string; type: MediaType; path: string }>>;

  // ─────────────────────────────────────────────────────────────
  // Import Operations
  // ─────────────────────────────────────────────────────────────

  /** Create import record within transaction */
  createImportRecord(trx: TransactionContext, data: ImportRecord): Promise<string>;

  /** Get import by ID */
  getImport(importId: string): Promise<ImportRecord | null>;

  /** Get recent imports */
  getRecentImports(limit: number): Promise<ImportRecord[]>;
}
