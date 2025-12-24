/**
 * Database utility for CLI
 */

import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

const DEFAULT_DB_PATH = resolve(homedir(), '.abandoned-archive', 'archive.db');

let cachedDb: Database.Database | null = null;

/**
 * Get database connection
 * Uses provided path or falls back to default location
 */
export async function getDatabase(dbPath?: string): Promise<Database.Database> {
  const path = dbPath || process.env.AA_DATABASE || DEFAULT_DB_PATH;

  if (cachedDb) {
    return cachedDb;
  }

  if (!existsSync(path)) {
    throw new Error(`Database not found: ${path}\nRun 'aa db init' to create a new database.`);
  }

  cachedDb = new Database(path);
  cachedDb.pragma('journal_mode = WAL');
  cachedDb.pragma('foreign_keys = ON');

  return cachedDb;
}

/**
 * Initialize a new database
 */
export async function initDatabase(dbPath?: string): Promise<Database.Database> {
  const path = dbPath || process.env.AA_DATABASE || DEFAULT_DB_PATH;

  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create schema
  db.exec(SCHEMA);

  cachedDb = db;
  return db;
}

/**
 * Close database connection
 */
export function closeDatabase(): void {
  if (cachedDb) {
    cachedDb.close();
    cachedDb = null;
  }
}

/**
 * Database schema for abandoned-archive
 *
 * IMPORTANT: This schema is aligned with the desktop app schema.
 * Changes here must be reflected in packages/desktop/electron/main/schema.sql
 */
const SCHEMA = `
-- Locations table (aligned with desktop schema)
CREATE TABLE IF NOT EXISTS locs (
  -- Identity
  locid TEXT PRIMARY KEY,
  loc12 TEXT UNIQUE,

  -- Basic Info
  locnam TEXT NOT NULL,
  slocnam TEXT,
  akanam TEXT,

  -- Classification
  type TEXT,
  stype TEXT,
  category TEXT,

  -- GPS (Primary Source of Truth)
  gps_lat REAL,
  gps_lng REAL,
  gps_accuracy REAL,
  gps_source TEXT,
  gps_status TEXT,
  gps_verified_on_map INTEGER DEFAULT 0,
  gps_captured_at TEXT,
  gps_leaflet_data TEXT,

  -- Address (Secondary, Optional)
  address_street TEXT,
  address_city TEXT,
  address_county TEXT,
  address_state TEXT CHECK(length(address_state) = 2 OR address_state IS NULL),
  address_zipcode TEXT,
  address_confidence TEXT,
  address_geocoded_at TEXT,

  -- Status
  condition TEXT,
  status TEXT,
  documentation TEXT,
  access TEXT,
  historic INTEGER DEFAULT 0,
  favorite INTEGER DEFAULT 0,

  -- Content
  description TEXT,
  notes TEXT,

  -- Relationships
  sublocs TEXT,
  sub12 TEXT,

  -- Metadata
  locadd TEXT,
  locup TEXT,
  auth_imp TEXT,
  locloc TEXT,

  -- Regions
  regions TEXT,
  state TEXT,

  -- Hero image
  heroimg TEXT,
  hero_focal_x REAL,
  hero_focal_y REAL,

  -- Media counts (denormalized)
  imgct INTEGER DEFAULT 0,
  vidct INTEGER DEFAULT 0,
  docct INTEGER DEFAULT 0,

  -- Dates
  discovered_at TEXT,
  visited_at TEXT,
  built_year INTEGER,
  abandoned_year INTEGER,
  demolished_year INTEGER,

  -- Audit
  created_at TEXT,
  updated_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_by_id TEXT,
  modified_by TEXT,
  modified_by_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_locs_name ON locs(locnam);
CREATE INDEX IF NOT EXISTS idx_locs_state ON locs(address_state);
CREATE INDEX IF NOT EXISTS idx_locs_type ON locs(type);
CREATE INDEX IF NOT EXISTS idx_locs_gps ON locs(gps_lat, gps_lng) WHERE gps_lat IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_locs_loc12 ON locs(loc12);
CREATE INDEX IF NOT EXISTS idx_locs_favorite ON locs(favorite) WHERE favorite = 1;

-- Sub-Locations table
CREATE TABLE IF NOT EXISTS slocs (
  subid TEXT PRIMARY KEY,
  sub12 TEXT UNIQUE NOT NULL,
  locid TEXT NOT NULL REFERENCES locs(locid) ON DELETE CASCADE,

  subnam TEXT NOT NULL,
  ssubname TEXT,

  UNIQUE(subnam, locid)
);

CREATE INDEX IF NOT EXISTS idx_slocs_locid ON slocs(locid);

-- Images table (aligned with desktop)
CREATE TABLE IF NOT EXISTS imgs (
  imghash TEXT PRIMARY KEY,
  imgnam TEXT NOT NULL,
  imgnamo TEXT NOT NULL,
  imgloc TEXT NOT NULL,
  imgloco TEXT NOT NULL,

  locid TEXT REFERENCES locs(locid),
  subid TEXT REFERENCES slocs(subid),

  auth_imp TEXT,
  imgadd TEXT,

  meta_exiftool TEXT,

  -- Extracted metadata
  meta_width INTEGER,
  meta_height INTEGER,
  meta_date_taken TEXT,
  meta_camera_make TEXT,
  meta_camera_model TEXT,
  meta_gps_lat REAL,
  meta_gps_lng REAL,

  -- Processing
  status TEXT DEFAULT 'pending',
  processed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_imgs_locid ON imgs(locid);
CREATE INDEX IF NOT EXISTS idx_imgs_subid ON imgs(subid);
CREATE INDEX IF NOT EXISTS idx_imgs_sha ON imgs(imghash);

-- Videos table (aligned with desktop)
CREATE TABLE IF NOT EXISTS vids (
  vidhash TEXT PRIMARY KEY,
  vidnam TEXT NOT NULL,
  vidnamo TEXT NOT NULL,
  vidloc TEXT NOT NULL,
  vidloco TEXT NOT NULL,

  locid TEXT REFERENCES locs(locid),
  subid TEXT REFERENCES slocs(subid),

  auth_imp TEXT,
  vidadd TEXT,

  meta_ffmpeg TEXT,
  meta_exiftool TEXT,

  -- Extracted metadata
  meta_duration REAL,
  meta_width INTEGER,
  meta_height INTEGER,
  meta_codec TEXT,
  meta_fps REAL,
  meta_date_taken TEXT,
  meta_gps_lat REAL,
  meta_gps_lng REAL,

  -- Processing
  status TEXT DEFAULT 'pending',
  processed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_vids_locid ON vids(locid);
CREATE INDEX IF NOT EXISTS idx_vids_subid ON vids(subid);

-- Documents table (aligned with desktop)
CREATE TABLE IF NOT EXISTS docs (
  dochash TEXT PRIMARY KEY,
  docnam TEXT NOT NULL,
  docnamo TEXT NOT NULL,
  docloc TEXT NOT NULL,
  docloco TEXT NOT NULL,

  locid TEXT REFERENCES locs(locid),
  subid TEXT REFERENCES slocs(subid),

  auth_imp TEXT,
  docadd TEXT,

  -- Processing
  status TEXT DEFAULT 'pending',
  processed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_docs_locid ON docs(locid);
CREATE INDEX IF NOT EXISTS idx_docs_subid ON docs(subid);

-- Unified media view (combines imgs, vids, docs for CLI compatibility)
CREATE VIEW IF NOT EXISTS media AS
SELECT
  imghash AS hash,
  imgnam AS filename,
  imgnamo AS original_filename,
  imgloc AS file_path,
  imgloco AS original_path,
  'image' AS media_type,
  locid,
  subid,
  status,
  meta_date_taken AS capture_time,
  imgadd AS created_at,
  NULL AS file_size
FROM imgs
UNION ALL
SELECT
  vidhash AS hash,
  vidnam AS filename,
  vidnamo AS original_filename,
  vidloc AS file_path,
  vidloco AS original_path,
  'video' AS media_type,
  locid,
  subid,
  status,
  meta_date_taken AS capture_time,
  vidadd AS created_at,
  NULL AS file_size
FROM vids
UNION ALL
SELECT
  dochash AS hash,
  docnam AS filename,
  docnamo AS original_filename,
  docloc AS file_path,
  docloco AS original_path,
  'document' AS media_type,
  locid,
  subid,
  status,
  NULL AS capture_time,
  docadd AS created_at,
  NULL AS file_size
FROM docs;

-- Import jobs table
CREATE TABLE IF NOT EXISTS import_jobs (
  job_id TEXT PRIMARY KEY,
  source_path TEXT NOT NULL,
  target_locid TEXT,

  -- Status
  status TEXT DEFAULT 'pending',
  progress REAL DEFAULT 0,

  -- Counts
  total_files INTEGER DEFAULT 0,
  processed_files INTEGER DEFAULT 0,
  skipped_files INTEGER DEFAULT 0,
  failed_files INTEGER DEFAULT 0,

  -- Options
  options TEXT DEFAULT '{}',

  -- Results
  result TEXT,
  error TEXT,

  -- Timing
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON import_jobs(status);

-- Collections table
CREATE TABLE IF NOT EXISTS collections (
  collection_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,

  -- Type
  collection_type TEXT DEFAULT 'manual', -- manual, smart, trip

  -- Smart collection query
  query TEXT,

  -- Cover image
  cover_hash TEXT,

  -- Audit
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Collection items (many-to-many)
CREATE TABLE IF NOT EXISTS collection_items (
  collection_id TEXT NOT NULL,
  item_type TEXT NOT NULL, -- location, media
  item_id TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  added_at TEXT NOT NULL,

  PRIMARY KEY (collection_id, item_type, item_id),
  FOREIGN KEY (collection_id) REFERENCES collections(collection_id) ON DELETE CASCADE
);

-- Tags table
CREATE TABLE IF NOT EXISTS tags (
  tag_id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT,
  color TEXT,
  created_at TEXT NOT NULL
);

-- Tag assignments
CREATE TABLE IF NOT EXISTS tag_assignments (
  tag_id TEXT NOT NULL,
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,

  PRIMARY KEY (tag_id, item_type, item_id),
  FOREIGN KEY (tag_id) REFERENCES tags(tag_id) ON DELETE CASCADE
);

-- Reference maps table
CREATE TABLE IF NOT EXISTS refmaps (
  refmap_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,

  -- Source file
  source_path TEXT,
  source_type TEXT, -- gpx, kml, geojson, csv

  -- Bounds
  north REAL,
  south REAL,
  east REAL,
  west REAL,

  -- Stats
  waypoint_count INTEGER DEFAULT 0,
  track_count INTEGER DEFAULT 0,

  -- Audit
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Reference waypoints
CREATE TABLE IF NOT EXISTS ref_waypoints (
  waypoint_id TEXT PRIMARY KEY,
  refmap_id TEXT NOT NULL,

  name TEXT,
  description TEXT,

  lat REAL NOT NULL,
  lon REAL NOT NULL,
  elevation REAL,

  -- Link to location if matched
  locid TEXT,
  match_confidence REAL,

  -- Original data
  source_data TEXT,

  created_at TEXT NOT NULL,

  FOREIGN KEY (refmap_id) REFERENCES refmaps(refmap_id) ON DELETE CASCADE,
  FOREIGN KEY (locid) REFERENCES locs(locid) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_waypoints_refmap ON ref_waypoints(refmap_id);
CREATE INDEX IF NOT EXISTS idx_waypoints_gps ON ref_waypoints(lat, lon);

-- Config/settings table
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Schema version
INSERT OR IGNORE INTO config (key, value, updated_at)
VALUES ('schema_version', '1', datetime('now'));
`;
