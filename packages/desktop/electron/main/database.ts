import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database as DatabaseSchema } from './database.types';

let db: Kysely<DatabaseSchema> | null = null;

/**
 * Database schema SQL - embedded to avoid bundling issues with Vite
 * This schema is kept in sync with schema.sql for reference
 */
const SCHEMA_SQL = `
-- AU Archive Database Schema
-- SQLite database for local-first abandoned location archive

-- Locations table (primary entity)
CREATE TABLE IF NOT EXISTS locs (
  -- Identity
  locid TEXT PRIMARY KEY,
  loc12 TEXT UNIQUE NOT NULL,

  -- Basic Info
  locnam TEXT NOT NULL,
  slocnam TEXT,
  akanam TEXT,

  -- Classification
  type TEXT,
  stype TEXT,

  -- GPS (Primary Source of Truth)
  gps_lat REAL,
  gps_lng REAL,
  gps_accuracy REAL,
  gps_source TEXT,
  gps_verified_on_map INTEGER DEFAULT 0,
  gps_captured_at TEXT,
  gps_leaflet_data TEXT,

  -- Address (Secondary, Optional)
  address_street TEXT,
  address_city TEXT,
  address_county TEXT,
  address_state TEXT CHECK(length(address_state) = 2),
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

  -- Relationships
  sublocs TEXT,
  sub12 TEXT,

  -- Metadata
  locadd TEXT,
  locup TEXT,
  auth_imp TEXT,

  -- Regions
  regions TEXT,
  state TEXT,

  UNIQUE(slocnam)
);

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

-- Images table
CREATE TABLE IF NOT EXISTS imgs (
  imgsha TEXT PRIMARY KEY,
  imgnam TEXT NOT NULL,
  imgnamo TEXT NOT NULL,
  imgloc TEXT NOT NULL,
  imgloco TEXT NOT NULL,

  locid TEXT REFERENCES locs(locid),
  subid TEXT REFERENCES slocs(subid),

  auth_imp TEXT,
  imgadd TEXT,

  meta_exiftool TEXT,

  -- Extracted metadata (for quick access)
  meta_width INTEGER,
  meta_height INTEGER,
  meta_date_taken TEXT,
  meta_camera_make TEXT,
  meta_camera_model TEXT,
  meta_gps_lat REAL,
  meta_gps_lng REAL
);

CREATE INDEX IF NOT EXISTS idx_imgs_locid ON imgs(locid);
CREATE INDEX IF NOT EXISTS idx_imgs_subid ON imgs(subid);
CREATE INDEX IF NOT EXISTS idx_imgs_sha ON imgs(imgsha);

-- Videos table
CREATE TABLE IF NOT EXISTS vids (
  vidsha TEXT PRIMARY KEY,
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
  meta_date_taken TEXT
);

CREATE INDEX IF NOT EXISTS idx_vids_locid ON vids(locid);
CREATE INDEX IF NOT EXISTS idx_vids_subid ON vids(subid);

-- Documents table
CREATE TABLE IF NOT EXISTS docs (
  docsha TEXT PRIMARY KEY,
  docnam TEXT NOT NULL,
  docnamo TEXT NOT NULL,
  docloc TEXT NOT NULL,
  docloco TEXT NOT NULL,

  locid TEXT REFERENCES locs(locid),
  subid TEXT REFERENCES slocs(subid),

  auth_imp TEXT,
  docadd TEXT,

  meta_exiftool TEXT,

  -- Document-specific metadata
  meta_page_count INTEGER,
  meta_author TEXT,
  meta_title TEXT
);

CREATE INDEX IF NOT EXISTS idx_docs_locid ON docs(locid);

-- Maps table (Historical Maps)
CREATE TABLE IF NOT EXISTS maps (
  mapsha TEXT PRIMARY KEY,
  mapnam TEXT NOT NULL,
  mapnamo TEXT NOT NULL,
  maploc TEXT NOT NULL,
  maploco TEXT NOT NULL,

  locid TEXT REFERENCES locs(locid),
  subid TEXT REFERENCES slocs(subid),

  auth_imp TEXT,
  mapadd TEXT,

  meta_exiftool TEXT,
  meta_map TEXT,

  reference TEXT,
  map_states TEXT,
  map_verified INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_maps_locid ON maps(locid);

-- Settings table (key-value store)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/**
 * Get the database file path
 * Uses userData directory for production, current directory for development
 */
export function getDatabasePath(): string {
  const userDataPath = app.getPath('userData');
  const dbDir = path.join(userDataPath, 'data');

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  return path.join(dbDir, 'au-archive.db');
}

/**
 * Initialize the database schema
 * Uses embedded SQL schema to avoid file bundling issues
 */
function initializeSchema(sqlite: Database.Database): void {
  const schema = SCHEMA_SQL;

  const statements = schema
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    sqlite.exec(statement);
  }

  console.log('Database schema initialized');
}

/**
 * Check if the database has the required schema tables
 * Returns true if core tables exist, false if schema needs initialization
 */
function hasSchema(sqlite: Database.Database): boolean {
  const tables = sqlite.pragma('table_list') as Array<{ name: string }>;
  const tableNames = tables.map(t => t.name);

  // Check for core tables that must exist
  const requiredTables = ['locs', 'slocs', 'imgs', 'vids', 'docs', 'maps'];
  const hasAllRequired = requiredTables.every(t => tableNames.includes(t));

  return hasAllRequired;
}

/**
 * Run database migrations for existing databases
 * Checks for missing columns and adds them
 * Safe to call on databases that already have all migrations applied
 */
function runMigrations(sqlite: Database.Database): void {
  try {
    // Get current table list for migration checks
    const tables = sqlite.pragma('table_list') as Array<{ name: string }>;
    const tableNames = tables.map(t => t.name);

    // Safety check: core tables must exist before running migrations
    if (!tableNames.includes('locs')) {
      throw new Error('Core table "locs" missing - schema initialization required');
    }

    // Migration 1: Add favorite column if it doesn't exist
    const columns = sqlite.pragma('table_info(locs)') as Array<{ name: string }>;
    const hasFavorite = columns.some(col => col.name === 'favorite');

    if (!hasFavorite) {
      console.log('Running migration: Adding favorite column to locs table');
      sqlite.exec('ALTER TABLE locs ADD COLUMN favorite INTEGER DEFAULT 0');
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_locs_favorite ON locs(favorite) WHERE favorite = 1');
      console.log('Migration completed: favorite column added');
    }

    // Migration 2: Create imports table if it doesn't exist
    const hasImports = tableNames.includes('imports');

    if (!hasImports) {
      console.log('Running migration: Creating imports table');
      sqlite.exec(`
        CREATE TABLE imports (
          import_id TEXT PRIMARY KEY,
          locid TEXT REFERENCES locs(locid) ON DELETE CASCADE,
          import_date TEXT NOT NULL,
          auth_imp TEXT,
          img_count INTEGER DEFAULT 0,
          vid_count INTEGER DEFAULT 0,
          doc_count INTEGER DEFAULT 0,
          map_count INTEGER DEFAULT 0,
          notes TEXT
        );
        CREATE INDEX idx_imports_date ON imports(import_date DESC);
        CREATE INDEX idx_imports_locid ON imports(locid);
      `);
      console.log('Migration completed: imports table created');
    }

    // Migration 3: Create notes table if it doesn't exist
    const hasNotes = tableNames.includes('notes');

    if (!hasNotes) {
      console.log('Running migration: Creating notes table');
      sqlite.exec(`
        CREATE TABLE notes (
          note_id TEXT PRIMARY KEY,
          locid TEXT REFERENCES locs(locid) ON DELETE CASCADE,
          note_text TEXT NOT NULL,
          note_date TEXT NOT NULL,
          auth_imp TEXT,
          note_type TEXT DEFAULT 'general'
        );
        CREATE INDEX idx_notes_locid ON notes(locid);
        CREATE INDEX idx_notes_date ON notes(note_date DESC);
      `);
      console.log('Migration completed: notes table created');
    }

    // Migration 4: Create projects tables if they don't exist
    const hasProjects = tableNames.includes('projects');

    if (!hasProjects) {
      console.log('Running migration: Creating projects tables');
      sqlite.exec(`
        CREATE TABLE projects (
          project_id TEXT PRIMARY KEY,
          project_name TEXT NOT NULL UNIQUE,
          description TEXT,
          created_date TEXT NOT NULL,
          auth_imp TEXT
        );
        CREATE INDEX idx_projects_name ON projects(project_name);
        CREATE INDEX idx_projects_date ON projects(created_date DESC);

        CREATE TABLE project_locations (
          project_id TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
          locid TEXT REFERENCES locs(locid) ON DELETE CASCADE,
          added_date TEXT NOT NULL,
          PRIMARY KEY (project_id, locid)
        );
        CREATE INDEX idx_project_locations_project ON project_locations(project_id);
        CREATE INDEX idx_project_locations_location ON project_locations(locid);
      `);
      console.log('Migration completed: projects tables created');
    }

    // Migration 5: Create bookmarks table if it doesn't exist
    const hasBookmarks = tableNames.includes('bookmarks');

    if (!hasBookmarks) {
      console.log('Running migration: Creating bookmarks table');
      sqlite.exec(`
        CREATE TABLE bookmarks (
          bookmark_id TEXT PRIMARY KEY,
          url TEXT NOT NULL,
          title TEXT,
          locid TEXT REFERENCES locs(locid) ON DELETE SET NULL,
          bookmark_date TEXT NOT NULL,
          auth_imp TEXT,
          thumbnail_path TEXT
        );
        CREATE INDEX idx_bookmarks_date ON bookmarks(bookmark_date DESC);
        CREATE INDEX idx_bookmarks_locid ON bookmarks(locid);
      `);
      console.log('Migration completed: bookmarks table created');
    }

    // Migration 6: Create settings table if it doesn't exist
    const hasSettings = tableNames.includes('settings');

    if (!hasSettings) {
      console.log('Running migration: Creating settings table');
      sqlite.exec(`
        CREATE TABLE settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
      console.log('Migration completed: settings table created');
    }

    // Migration 7: Create users table if it doesn't exist
    const hasUsers = tableNames.includes('users');

    if (!hasUsers) {
      console.log('Running migration: Creating users table');
      sqlite.exec(`
        CREATE TABLE users (
          user_id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          display_name TEXT,
          created_date TEXT NOT NULL
        );
        CREATE INDEX idx_users_username ON users(username);
      `);

      // Create default user using parameterized query (NOT template literals)
      const defaultUserId = 'default-user-id';
      const defaultDate = new Date().toISOString();
      const insertStmt = sqlite.prepare(
        'INSERT INTO users (user_id, username, display_name, created_date) VALUES (?, ?, ?, ?)'
      );
      insertStmt.run(defaultUserId, 'default', 'Default User', defaultDate);

      console.log('Migration completed: users table created with default user');
    }
  } catch (error) {
    console.error('Error running migrations:', error);
    throw error;
  }
}

/**
 * Get or create the database instance
 * Initializes the database on first run
 * FIX: Checks for TABLE existence, not just FILE existence
 */
export function getDatabase(): Kysely<DatabaseSchema> {
  if (db) {
    return db;
  }

  const dbPath = getDatabasePath();
  const fileExists = fs.existsSync(dbPath);

  const sqlite = new Database(dbPath, {
    verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
  });

  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  // Check if schema exists (tables present), not just if file exists
  // This fixes boot loops caused by empty database files
  const schemaExists = hasSchema(sqlite);

  if (!schemaExists) {
    if (fileExists) {
      console.log('Database file exists but has no schema, reinitializing:', dbPath);
    } else {
      console.log('Creating new database at:', dbPath);
    }
    initializeSchema(sqlite);
  } else {
    console.log('Using existing database at:', dbPath);
  }

  // Always run migrations to ensure all tables exist
  runMigrations(sqlite);

  const dialect = new SqliteDialect({
    database: sqlite,
  });

  db = new Kysely<DatabaseSchema>({
    dialect,
  });

  return db;
}

/**
 * Close the database connection
 * Should be called when the app is closing
 */
export function closeDatabase(): void {
  if (db) {
    db.destroy();
    db = null;
    console.log('Database connection closed');
  }
}
