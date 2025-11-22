/**
 * SQLite Database Adapter
 *
 * Implements DatabaseAdapter using better-sqlite3.
 * Provides synchronous, fast database operations for local use.
 *
 * @module adapters/sqlite-adapter
 */

import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type {
  DatabaseAdapter,
  TransactionContext,
  AuditEntry,
  AuditAction,
  EntityType,
  FixityRecord,
  ImportRecord,
} from '@au-archive/import-core';
import type { Location, LocationInput, MediaRecord, MediaType, ProvenanceRecord } from '@au-archive/import-core';

/**
 * SQLite database adapter for local storage.
 * Uses better-sqlite3 for synchronous, fast operations.
 */
export class SQLiteAdapter implements DatabaseAdapter {
  private db: Database.Database | null = null;
  private readonly dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async connect(): Promise<void> {
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initializeTables();
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  isConnected(): boolean {
    return this.db !== null;
  }

  async transaction<T>(fn: (trx: TransactionContext) => Promise<T>): Promise<T> {
    this.ensureConnected();
    // Create a minimal TransactionContext - the actual db is accessed via this.db
    const trx = { _brand: Symbol('sqlite-trx') } as TransactionContext;

    try {
      this.db!.exec('BEGIN TRANSACTION');
      const result = await fn(trx);
      this.db!.exec('COMMIT');
      return result;
    } catch (error) {
      this.db!.exec('ROLLBACK');
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Location Operations
  // ─────────────────────────────────────────────────────────────

  async findLocation(id: string): Promise<Location | null> {
    this.ensureConnected();
    const row = this.db!.prepare('SELECT * FROM locations WHERE locid = ?').get(id);
    return row ? this.rowToLocation(row as LocationRow) : null;
  }

  async findLocationByLoc12(loc12: string): Promise<Location | null> {
    this.ensureConnected();
    const row = this.db!.prepare('SELECT * FROM locations WHERE loc12 = ?').get(loc12);
    return row ? this.rowToLocation(row as LocationRow) : null;
  }

  async createLocation(data: LocationInput): Promise<Location> {
    this.ensureConnected();
    const locid = uuidv4();
    const loc12 = this.generateLoc12();
    const now = new Date().toISOString();

    const stmt = this.db!.prepare(`
      INSERT INTO locations (
        locid, loc12, locnam, slocnam, akanam, type, stype,
        gps_lat, gps_lng, gps_accuracy, gps_source, gps_verified_on_map,
        address_street, address_city, address_county, address_state, address_zipcode,
        condition, status, historic, locadd, locup, auth_imp
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )
    `);

    stmt.run(
      locid, loc12, data.locnam, data.slocnam ?? null, data.akanam ?? null,
      data.type ?? null, data.stype ?? null,
      data.gps_lat ?? null, data.gps_lng ?? null, data.gps_accuracy ?? null,
      data.gps_source ?? null, data.gps_verified_on_map ? 1 : 0,
      data.address_street ?? null, data.address_city ?? null, data.address_county ?? null,
      data.address_state ?? null, data.address_zipcode ?? null,
      data.condition ?? null, data.status ?? null, data.historic ? 1 : 0,
      now, null, null
    );

    return (await this.findLocation(locid))!;
  }

  async updateLocation(id: string, data: Partial<LocationInput>): Promise<void> {
    this.ensureConnected();
    const updates: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        updates.push(`${key} = ?`);
        values.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
      }
    }

    if (updates.length === 0) return;

    updates.push('locup = ?');
    values.push(new Date().toISOString());
    values.push(id);

    const sql = `UPDATE locations SET ${updates.join(', ')} WHERE locid = ?`;
    this.db!.prepare(sql).run(...values);
  }

  // ─────────────────────────────────────────────────────────────
  // Media Operations
  // ─────────────────────────────────────────────────────────────

  async findMediaByHash(hash: string, type: MediaType): Promise<MediaRecord | null> {
    this.ensureConnected();
    const table = this.getMediaTable(type);
    const row = this.db!.prepare(`SELECT * FROM ${table} WHERE sha = ?`).get(hash);
    return row ? this.rowToMediaRecord(row as MediaRow, type) : null;
  }

  async mediaExists(hash: string, type: MediaType): Promise<boolean> {
    this.ensureConnected();
    const table = this.getMediaTable(type);
    const row = this.db!.prepare(`SELECT 1 FROM ${table} WHERE sha = ?`).get(hash);
    return row !== undefined;
  }

  async insertMedia(_trx: TransactionContext, data: MediaRecord): Promise<void> {
    this.ensureConnected();
    const table = this.getMediaTable(data.type);
    const columns = this.getMediaColumns(data.type);
    const placeholders = columns.map(() => '?').join(', ');
    const values = this.getMediaValues(data);

    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
    this.db!.prepare(sql).run(...values);
  }

  // ─────────────────────────────────────────────────────────────
  // Provenance Operations
  // ─────────────────────────────────────────────────────────────

  async insertProvenance(_trx: TransactionContext, data: ProvenanceRecord): Promise<void> {
    this.ensureConnected();
    const stmt = this.db!.prepare(`
      INSERT INTO provenance (
        provenance_id, media_sha, media_type,
        captured_by, captured_by_role, imported_by, institution,
        original_filename, original_device, original_device_serial,
        captured_at, imported_at,
        capture_gps_lat, capture_gps_lng, capture_gps_accuracy,
        project, field_trip_id, notes,
        source_path, source_volume, custody_chain
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      data.provenanceId,
      data.mediaSha,
      data.mediaType,
      data.capturedBy ?? null,
      data.capturedByRole ?? null,
      data.importedBy,
      data.institution ?? null,
      data.originalFilename,
      data.originalDevice ?? null,
      data.originalDeviceSerial ?? null,
      data.capturedAt ?? null,
      data.importedAt,
      data.captureGpsLat ?? null,
      data.captureGpsLng ?? null,
      data.captureGpsAccuracy ?? null,
      data.project ?? null,
      data.fieldTripId ?? null,
      data.notes ?? null,
      data.sourcePath,
      data.sourceVolume ?? null,
      data.custodyChain ? JSON.stringify(data.custodyChain) : null
    );
  }

  async getProvenance(mediaSha: string, mediaType: MediaType): Promise<ProvenanceRecord | null> {
    this.ensureConnected();
    const row = this.db!.prepare(
      'SELECT * FROM provenance WHERE media_sha = ? AND media_type = ?'
    ).get(mediaSha, mediaType) as ProvenanceRow | undefined;

    return row ? this.rowToProvenance(row) : null;
  }

  // ─────────────────────────────────────────────────────────────
  // Audit Log Operations
  // ─────────────────────────────────────────────────────────────

  async appendAuditLog(entry: AuditEntry): Promise<void> {
    this.ensureConnected();
    const stmt = this.db!.prepare(`
      INSERT INTO audit_log (
        audit_id, action, entity_type, entity_id, actor, actor_role, actor_ip, details, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      uuidv4(), entry.action, entry.entityType, entry.entityId,
      entry.actor, entry.actorRole ?? null, entry.actorIp ?? null,
      entry.details ? JSON.stringify(entry.details) : null,
      new Date().toISOString()
    );
  }

  async getRecentAuditEntries(limit: number): Promise<AuditEntry[]> {
    this.ensureConnected();
    const rows = this.db!.prepare(
      'SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?'
    ).all(limit) as AuditRow[];

    return rows.map((row) => ({
      action: row.action as AuditAction,
      entityType: row.entity_type as EntityType,
      entityId: row.entity_id,
      actor: row.actor,
      actorRole: row.actor_role ?? undefined,
      actorIp: row.actor_ip ?? undefined,
      details: row.details ? JSON.parse(row.details) : undefined,
    }));
  }

  // ─────────────────────────────────────────────────────────────
  // Fixity Operations
  // ─────────────────────────────────────────────────────────────

  async insertFixityCheck(data: FixityRecord): Promise<void> {
    this.ensureConnected();
    const stmt = this.db!.prepare(`
      INSERT INTO fixity_checks (
        check_id, media_sha, media_type, file_path, checked_at, checked_by,
        expected_hash, actual_hash, status, expected_size, actual_size, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      data.checkId, data.mediaSha, data.mediaType, data.filePath, data.checkedAt, data.checkedBy,
      data.expectedHash, data.actualHash, data.status,
      data.expectedSize ?? null, data.actualSize ?? null, data.errorMessage ?? null
    );
  }

  async getLastFixityCheck(mediaSha: string, mediaType: MediaType): Promise<FixityRecord | null> {
    this.ensureConnected();
    const row = this.db!.prepare(
      'SELECT * FROM fixity_checks WHERE media_sha = ? AND media_type = ? ORDER BY checked_at DESC LIMIT 1'
    ).get(mediaSha, mediaType) as FixityRow | undefined;

    return row ? this.rowToFixityRecord(row) : null;
  }

  async getCorruptedFiles(): Promise<FixityRecord[]> {
    this.ensureConnected();
    const rows = this.db!.prepare(
      "SELECT * FROM fixity_checks WHERE status = 'corrupted' ORDER BY checked_at DESC"
    ).all() as FixityRow[];

    return rows.map((row) => this.rowToFixityRecord(row));
  }

  async getFilesNeedingVerification(
    since: Date,
    limit: number
  ): Promise<Array<{ sha: string; type: MediaType; path: string }>> {
    this.ensureConnected();
    const sinceStr = since.toISOString();

    const rows = this.db!.prepare(`
      SELECT DISTINCT i.sha, 'image' as type, i.archive_path as path
      FROM images i
      LEFT JOIN fixity_checks fc ON fc.media_sha = i.sha AND fc.media_type = 'image'
      WHERE fc.checked_at IS NULL OR fc.checked_at < ?
      UNION ALL
      SELECT DISTINCT v.sha, 'video' as type, v.archive_path as path
      FROM videos v
      LEFT JOIN fixity_checks fc ON fc.media_sha = v.sha AND fc.media_type = 'video'
      WHERE fc.checked_at IS NULL OR fc.checked_at < ?
      LIMIT ?
    `).all(sinceStr, sinceStr, limit) as Array<{ sha: string; type: string; path: string }>;

    return rows.map((row) => ({
      sha: row.sha,
      type: row.type as MediaType,
      path: row.path,
    }));
  }

  // ─────────────────────────────────────────────────────────────
  // Import Operations
  // ─────────────────────────────────────────────────────────────

  async createImportRecord(_trx: TransactionContext, data: ImportRecord): Promise<string> {
    this.ensureConnected();
    const stmt = this.db!.prepare(`
      INSERT INTO imports (
        import_id, locid, import_date, auth_imp, img_count, vid_count, doc_count, map_count, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      data.importId, data.locid, data.importDate, data.authImp,
      data.imgCount, data.vidCount, data.docCount, data.mapCount, data.notes ?? null
    );

    return data.importId;
  }

  async getImport(importId: string): Promise<ImportRecord | null> {
    this.ensureConnected();
    const row = this.db!.prepare('SELECT * FROM imports WHERE import_id = ?').get(importId) as ImportRow | undefined;
    return row ? this.rowToImportRecord(row) : null;
  }

  async getRecentImports(limit: number): Promise<ImportRecord[]> {
    this.ensureConnected();
    const rows = this.db!.prepare(
      'SELECT * FROM imports ORDER BY import_date DESC LIMIT ?'
    ).all(limit) as ImportRow[];

    return rows.map((row) => this.rowToImportRecord(row));
  }

  // ─────────────────────────────────────────────────────────────
  // Private Helper Methods
  // ─────────────────────────────────────────────────────────────

  private ensureConnected(): void {
    if (!this.db) {
      throw new Error('Database not connected. Call connect() first.');
    }
  }

  private generateLoc12(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 12; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private getMediaTable(type: MediaType): string {
    const tables: Record<MediaType, string> = {
      image: 'images',
      video: 'videos',
      document: 'documents',
      map: 'maps',
    };
    return tables[type];
  }

  private getMediaColumns(type: MediaType): string[] {
    const base = [
      'sha', 'type', 'locid', 'subid', 'original_name', 'archive_name',
      'original_path', 'archive_path', 'auth_imp', 'added_at',
      'width', 'height', 'date_taken', 'gps_lat', 'gps_lng', 'raw_exif',
    ];

    const typeSpecific: Record<MediaType, string[]> = {
      image: ['camera_make', 'camera_model'],
      video: ['duration', 'codec', 'fps', 'raw_ffmpeg'],
      document: ['page_count', 'author', 'title'],
      map: ['map_type', 'waypoint_count', 'reference', 'map_states'],
    };

    return [...base, ...typeSpecific[type]];
  }

  private getMediaValues(data: MediaRecord): unknown[] {
    const base = [
      data.sha, data.type, data.locid, data.subid ?? null,
      data.originalName, data.archiveName, data.originalPath, data.archivePath,
      data.authImp ?? null, data.addedAt,
      data.width ?? null, data.height ?? null, data.dateTaken ?? null,
      data.gpsLat ?? null, data.gpsLng ?? null,
      data.rawExif ? JSON.stringify(data.rawExif) : null,
    ];

    switch (data.type) {
      case 'image':
        return [...base, data.cameraMake ?? null, data.cameraModel ?? null];
      case 'video':
        return [...base, data.duration ?? null, data.codec ?? null, data.fps ?? null,
          data.rawFfmpeg ? JSON.stringify(data.rawFfmpeg) : null];
      case 'document':
        return [...base, data.pageCount ?? null, data.author ?? null, data.title ?? null];
      case 'map':
        return [...base, data.mapType ?? null, data.waypointCount ?? null,
          data.reference ?? null, data.mapStates ?? null];
    }
  }

  private initializeTables(): void {
    this.db!.exec(`
      CREATE TABLE IF NOT EXISTS locations (
        locid TEXT PRIMARY KEY,
        loc12 TEXT UNIQUE NOT NULL,
        locnam TEXT NOT NULL,
        slocnam TEXT,
        akanam TEXT,
        type TEXT,
        stype TEXT,
        gps_lat REAL,
        gps_lng REAL,
        gps_accuracy REAL,
        gps_source TEXT,
        gps_verified_on_map INTEGER DEFAULT 0,
        address_street TEXT,
        address_city TEXT,
        address_county TEXT,
        address_state TEXT,
        address_zipcode TEXT,
        condition TEXT,
        status TEXT,
        historic INTEGER DEFAULT 0,
        locadd TEXT NOT NULL,
        locup TEXT,
        auth_imp TEXT
      );

      CREATE TABLE IF NOT EXISTS images (
        sha TEXT PRIMARY KEY,
        type TEXT NOT NULL DEFAULT 'image',
        locid TEXT NOT NULL,
        subid TEXT,
        original_name TEXT NOT NULL,
        archive_name TEXT NOT NULL,
        original_path TEXT NOT NULL,
        archive_path TEXT NOT NULL,
        auth_imp TEXT,
        added_at TEXT NOT NULL,
        width INTEGER,
        height INTEGER,
        date_taken TEXT,
        gps_lat REAL,
        gps_lng REAL,
        raw_exif TEXT,
        camera_make TEXT,
        camera_model TEXT,
        FOREIGN KEY (locid) REFERENCES locations(locid)
      );

      CREATE TABLE IF NOT EXISTS videos (
        sha TEXT PRIMARY KEY,
        type TEXT NOT NULL DEFAULT 'video',
        locid TEXT NOT NULL,
        subid TEXT,
        original_name TEXT NOT NULL,
        archive_name TEXT NOT NULL,
        original_path TEXT NOT NULL,
        archive_path TEXT NOT NULL,
        auth_imp TEXT,
        added_at TEXT NOT NULL,
        width INTEGER,
        height INTEGER,
        date_taken TEXT,
        gps_lat REAL,
        gps_lng REAL,
        raw_exif TEXT,
        duration REAL,
        codec TEXT,
        fps REAL,
        raw_ffmpeg TEXT,
        FOREIGN KEY (locid) REFERENCES locations(locid)
      );

      CREATE TABLE IF NOT EXISTS documents (
        sha TEXT PRIMARY KEY,
        type TEXT NOT NULL DEFAULT 'document',
        locid TEXT NOT NULL,
        subid TEXT,
        original_name TEXT NOT NULL,
        archive_name TEXT NOT NULL,
        original_path TEXT NOT NULL,
        archive_path TEXT NOT NULL,
        auth_imp TEXT,
        added_at TEXT NOT NULL,
        width INTEGER,
        height INTEGER,
        date_taken TEXT,
        gps_lat REAL,
        gps_lng REAL,
        raw_exif TEXT,
        page_count INTEGER,
        author TEXT,
        title TEXT,
        FOREIGN KEY (locid) REFERENCES locations(locid)
      );

      CREATE TABLE IF NOT EXISTS maps (
        sha TEXT PRIMARY KEY,
        type TEXT NOT NULL DEFAULT 'map',
        locid TEXT NOT NULL,
        subid TEXT,
        original_name TEXT NOT NULL,
        archive_name TEXT NOT NULL,
        original_path TEXT NOT NULL,
        archive_path TEXT NOT NULL,
        auth_imp TEXT,
        added_at TEXT NOT NULL,
        width INTEGER,
        height INTEGER,
        date_taken TEXT,
        gps_lat REAL,
        gps_lng REAL,
        raw_exif TEXT,
        map_type TEXT,
        waypoint_count INTEGER,
        reference TEXT,
        map_states TEXT,
        FOREIGN KEY (locid) REFERENCES locations(locid)
      );

      CREATE TABLE IF NOT EXISTS provenance (
        provenance_id TEXT PRIMARY KEY,
        media_sha TEXT NOT NULL,
        media_type TEXT NOT NULL,
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
        custody_chain TEXT
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        audit_id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        actor TEXT NOT NULL,
        actor_role TEXT,
        actor_ip TEXT,
        details TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS fixity_checks (
        check_id TEXT PRIMARY KEY,
        media_sha TEXT NOT NULL,
        media_type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        checked_at TEXT NOT NULL,
        checked_by TEXT NOT NULL,
        expected_hash TEXT NOT NULL,
        actual_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        expected_size INTEGER,
        actual_size INTEGER,
        error_message TEXT
      );

      CREATE TABLE IF NOT EXISTS imports (
        import_id TEXT PRIMARY KEY,
        locid TEXT NOT NULL,
        import_date TEXT NOT NULL,
        auth_imp TEXT,
        img_count INTEGER DEFAULT 0,
        vid_count INTEGER DEFAULT 0,
        doc_count INTEGER DEFAULT 0,
        map_count INTEGER DEFAULT 0,
        notes TEXT,
        FOREIGN KEY (locid) REFERENCES locations(locid)
      );

      CREATE INDEX IF NOT EXISTS idx_images_locid ON images(locid);
      CREATE INDEX IF NOT EXISTS idx_videos_locid ON videos(locid);
      CREATE INDEX IF NOT EXISTS idx_documents_locid ON documents(locid);
      CREATE INDEX IF NOT EXISTS idx_maps_locid ON maps(locid);
      CREATE INDEX IF NOT EXISTS idx_provenance_media ON provenance(media_sha, media_type);
      CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
      CREATE INDEX IF NOT EXISTS idx_fixity_media ON fixity_checks(media_sha, media_type);
      CREATE INDEX IF NOT EXISTS idx_imports_locid ON imports(locid);
    `);
  }

  private rowToLocation(row: LocationRow): Location {
    return {
      locid: row.locid,
      loc12: row.loc12,
      locnam: row.locnam,
      slocnam: row.slocnam,
      akanam: row.akanam,
      type: row.type,
      stype: row.stype,
      gps_lat: row.gps_lat,
      gps_lng: row.gps_lng,
      gps_accuracy: row.gps_accuracy,
      gps_source: row.gps_source as Location['gps_source'],
      gps_verified_on_map: row.gps_verified_on_map === 1,
      address_street: row.address_street,
      address_city: row.address_city,
      address_county: row.address_county,
      address_state: row.address_state,
      address_zipcode: row.address_zipcode,
      condition: row.condition as Location['condition'],
      status: row.status as Location['status'],
      historic: row.historic === 1,
      locadd: row.locadd,
      locup: row.locup,
      auth_imp: row.auth_imp,
    };
  }

  private rowToMediaRecord(row: MediaRow, type: MediaType): MediaRecord {
    const base = {
      sha: row.sha,
      locid: row.locid,
      subid: row.subid,
      originalName: row.original_name,
      archiveName: row.archive_name,
      originalPath: row.original_path,
      archivePath: row.archive_path,
      authImp: row.auth_imp,
      addedAt: row.added_at,
      width: row.width,
      height: row.height,
      dateTaken: row.date_taken,
      gpsLat: row.gps_lat,
      gpsLng: row.gps_lng,
      rawExif: row.raw_exif ? JSON.parse(row.raw_exif) : undefined,
    };

    switch (type) {
      case 'image':
        return { ...base, type: 'image', cameraMake: row.camera_make, cameraModel: row.camera_model };
      case 'video':
        return {
          ...base, type: 'video', duration: row.duration, codec: row.codec, fps: row.fps,
          rawFfmpeg: row.raw_ffmpeg ? JSON.parse(row.raw_ffmpeg) : undefined
        };
      case 'document':
        return { ...base, type: 'document', pageCount: row.page_count, author: row.author, title: row.title };
      case 'map':
        return { ...base, type: 'map', mapType: row.map_type, waypointCount: row.waypoint_count,
          reference: row.reference, mapStates: row.map_states };
    }
  }

  private rowToProvenance(row: ProvenanceRow): ProvenanceRecord {
    return {
      provenanceId: row.provenance_id,
      mediaSha: row.media_sha,
      mediaType: row.media_type as MediaType,
      capturedBy: row.captured_by,
      capturedByRole: row.captured_by_role as ProvenanceRecord['capturedByRole'],
      importedBy: row.imported_by,
      institution: row.institution,
      originalFilename: row.original_filename,
      originalDevice: row.original_device,
      originalDeviceSerial: row.original_device_serial,
      capturedAt: row.captured_at,
      importedAt: row.imported_at,
      captureGpsLat: row.capture_gps_lat,
      captureGpsLng: row.capture_gps_lng,
      captureGpsAccuracy: row.capture_gps_accuracy,
      project: row.project,
      fieldTripId: row.field_trip_id,
      notes: row.notes,
      sourcePath: row.source_path,
      sourceVolume: row.source_volume as ProvenanceRecord['sourceVolume'],
      custodyChain: row.custody_chain ? JSON.parse(row.custody_chain) : undefined,
    };
  }

  private rowToFixityRecord(row: FixityRow): FixityRecord {
    return {
      checkId: row.check_id,
      mediaSha: row.media_sha,
      mediaType: row.media_type as MediaType,
      filePath: row.file_path,
      checkedAt: row.checked_at,
      checkedBy: row.checked_by,
      expectedHash: row.expected_hash,
      actualHash: row.actual_hash,
      status: row.status as FixityRecord['status'],
      expectedSize: row.expected_size ?? undefined,
      actualSize: row.actual_size ?? undefined,
      errorMessage: row.error_message ?? undefined,
    };
  }

  private rowToImportRecord(row: ImportRow): ImportRecord {
    return {
      importId: row.import_id,
      locid: row.locid,
      importDate: row.import_date,
      authImp: row.auth_imp,
      imgCount: row.img_count,
      vidCount: row.vid_count,
      docCount: row.doc_count,
      mapCount: row.map_count,
      notes: row.notes ?? undefined,
    };
  }
}

// ─────────────────────────────────────────────────────────────
// Row Types (Database Representation)
// ─────────────────────────────────────────────────────────────

interface LocationRow {
  locid: string;
  loc12: string;
  locnam: string;
  slocnam: string | null;
  akanam: string | null;
  type: string | null;
  stype: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  gps_accuracy: number | null;
  gps_source: string | null;
  gps_verified_on_map: number;
  address_street: string | null;
  address_city: string | null;
  address_county: string | null;
  address_state: string | null;
  address_zipcode: string | null;
  condition: string | null;
  status: string | null;
  historic: number;
  locadd: string;
  locup: string | null;
  auth_imp: string | null;
}

interface MediaRow {
  sha: string;
  type: string;
  locid: string;
  subid: string | null;
  original_name: string;
  archive_name: string;
  original_path: string;
  archive_path: string;
  auth_imp: string | null;
  added_at: string;
  width: number | null;
  height: number | null;
  date_taken: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  raw_exif: string | null;
  camera_make?: string | null;
  camera_model?: string | null;
  duration?: number | null;
  codec?: string | null;
  fps?: number | null;
  raw_ffmpeg?: string | null;
  page_count?: number | null;
  author?: string | null;
  title?: string | null;
  map_type?: string | null;
  waypoint_count?: number | null;
  reference?: string | null;
  map_states?: string | null;
}

interface ProvenanceRow {
  provenance_id: string;
  media_sha: string;
  media_type: string;
  captured_by: string | null;
  captured_by_role: string | null;
  imported_by: string;
  institution: string | null;
  original_filename: string;
  original_device: string | null;
  original_device_serial: string | null;
  captured_at: string | null;
  imported_at: string;
  capture_gps_lat: number | null;
  capture_gps_lng: number | null;
  capture_gps_accuracy: number | null;
  project: string | null;
  field_trip_id: string | null;
  notes: string | null;
  source_path: string;
  source_volume: string | null;
  custody_chain: string | null;
}

interface AuditRow {
  audit_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  actor: string;
  actor_role: string | null;
  actor_ip: string | null;
  details: string | null;
  created_at: string;
}

interface FixityRow {
  check_id: string;
  media_sha: string;
  media_type: string;
  file_path: string;
  checked_at: string;
  checked_by: string;
  expected_hash: string;
  actual_hash: string;
  status: string;
  expected_size: number | null;
  actual_size: number | null;
  error_message: string | null;
}

interface ImportRow {
  import_id: string;
  locid: string;
  import_date: string;
  auth_imp: string | null;
  img_count: number;
  vid_count: number;
  doc_count: number;
  map_count: number;
  notes: string | null;
}
