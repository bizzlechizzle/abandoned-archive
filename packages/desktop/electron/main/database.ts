import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database as DatabaseSchema } from './database.types';
import { getEffectiveDatabasePath, getDefaultDatabasePath } from '../services/bootstrap-config';

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
  state TEXT
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
  meta_date_taken TEXT,
  -- FIX 3.2: GPS from video metadata (dashcams, phones)
  meta_gps_lat REAL,
  meta_gps_lng REAL
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
  -- FIX 3.4: GPS from parsed GPX/KML files
  meta_gps_lat REAL,
  meta_gps_lng REAL,

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
 * Uses custom path from bootstrap config if set, otherwise userData directory
 */
export function getDatabasePath(): string {
  return getEffectiveDatabasePath();
}

/**
 * Get the default database path (for display purposes)
 * This is the path used when no custom path is configured
 */
export function getDefaultDbPath(): string {
  return getDefaultDatabasePath();
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

      // NOTE: No default user created - users must be created via Setup wizard with required PIN
      console.log('Migration completed: users table created');
    }

    // Migration 8: Add thumbnail/preview/XMP columns to imgs and vids tables
    const imgColumns = sqlite.pragma('table_info(imgs)') as Array<{ name: string }>;
    const hasThumbPath = imgColumns.some(col => col.name === 'thumb_path');

    if (!hasThumbPath) {
      console.log('Running migration: Adding thumbnail/preview/XMP columns');

      // Add columns to imgs table
      sqlite.exec(`
        ALTER TABLE imgs ADD COLUMN thumb_path TEXT;
        ALTER TABLE imgs ADD COLUMN preview_path TEXT;
        ALTER TABLE imgs ADD COLUMN preview_extracted INTEGER DEFAULT 0;
        ALTER TABLE imgs ADD COLUMN xmp_synced INTEGER DEFAULT 0;
        ALTER TABLE imgs ADD COLUMN xmp_modified_at TEXT;
      `);

      // Add columns to vids table
      sqlite.exec(`
        ALTER TABLE vids ADD COLUMN thumb_path TEXT;
        ALTER TABLE vids ADD COLUMN poster_extracted INTEGER DEFAULT 0;
        ALTER TABLE vids ADD COLUMN xmp_synced INTEGER DEFAULT 0;
        ALTER TABLE vids ADD COLUMN xmp_modified_at TEXT;
      `);

      // Create indexes for finding media without thumbnails
      sqlite.exec(`
        CREATE INDEX IF NOT EXISTS idx_imgs_thumb_path ON imgs(thumb_path);
        CREATE INDEX IF NOT EXISTS idx_vids_thumb_path ON vids(thumb_path);
      `);

      console.log('Migration completed: thumbnail/preview/XMP columns added');
    }

    // Migration 9: Add multi-tier thumbnail columns (Premium Archive)
    // Adds thumb_path_sm (400px), thumb_path_lg (800px), preview_path (1920px)
    const imgColumnsCheck = sqlite.pragma('table_info(imgs)') as Array<{ name: string }>;
    const hasThumbPathSm = imgColumnsCheck.some(col => col.name === 'thumb_path_sm');

    if (!hasThumbPathSm) {
      console.log('Running migration 9: Adding multi-tier thumbnail columns');

      // Add columns to imgs table
      sqlite.exec(`
        ALTER TABLE imgs ADD COLUMN thumb_path_sm TEXT;
        ALTER TABLE imgs ADD COLUMN thumb_path_lg TEXT;
      `);
      // Note: preview_path already exists from migration 8

      // Add columns to vids table
      sqlite.exec(`
        ALTER TABLE vids ADD COLUMN thumb_path_sm TEXT;
        ALTER TABLE vids ADD COLUMN thumb_path_lg TEXT;
        ALTER TABLE vids ADD COLUMN preview_path TEXT;
      `);

      // Add columns to maps table (maps can have thumbnails too)
      sqlite.exec(`
        ALTER TABLE maps ADD COLUMN thumb_path_sm TEXT;
        ALTER TABLE maps ADD COLUMN thumb_path_lg TEXT;
        ALTER TABLE maps ADD COLUMN preview_path TEXT;
      `);

      // Create indexes for finding media without multi-tier thumbnails
      sqlite.exec(`
        CREATE INDEX IF NOT EXISTS idx_imgs_thumb_sm ON imgs(thumb_path_sm);
        CREATE INDEX IF NOT EXISTS idx_vids_thumb_sm ON vids(thumb_path_sm);
        CREATE INDEX IF NOT EXISTS idx_maps_thumb_sm ON maps(thumb_path_sm);
      `);

      console.log('Migration 9 completed: multi-tier thumbnail columns added');
    }

    // Migration 10: Add hero_imgsha to locs table for hero image selection
    // Per Kanye6: Allow users to select a featured image for each location
    const locsColumnsCheck = sqlite.prepare('PRAGMA table_info(locs)').all() as Array<{ name: string }>;
    const hasHeroImgsha = locsColumnsCheck.some(col => col.name === 'hero_imgsha');

    if (!hasHeroImgsha) {
      console.log('Running migration 10: Adding hero_imgsha column to locs');

      sqlite.exec(`
        ALTER TABLE locs ADD COLUMN hero_imgsha TEXT;
      `);

      // Create index for finding locations with hero images
      sqlite.exec(`
        CREATE INDEX IF NOT EXISTS idx_locs_hero_imgsha ON locs(hero_imgsha) WHERE hero_imgsha IS NOT NULL;
      `);

      console.log('Migration 10 completed: hero_imgsha column added');
    }

    // Migration 11: Add darktable_path column to imgs table (DEPRECATED)
    // NOTE: Darktable integration has been REMOVED from the app.
    // Columns remain for backwards compatibility but are unused.
    // Per original Kanye10: Darktable CLI integration for premium RAW processing
    const imgColsForDarktable = sqlite.prepare('PRAGMA table_info(imgs)').all() as Array<{ name: string }>;
    const hasDarktablePath = imgColsForDarktable.some(col => col.name === 'darktable_path');

    if (!hasDarktablePath) {
      console.log('Running migration 11: Adding Darktable columns to imgs');

      sqlite.exec(`
        ALTER TABLE imgs ADD COLUMN darktable_path TEXT;
        ALTER TABLE imgs ADD COLUMN darktable_processed INTEGER DEFAULT 0;
        ALTER TABLE imgs ADD COLUMN darktable_processed_at TEXT;
      `);

      // Create index for finding RAW files pending Darktable processing
      sqlite.exec(`
        CREATE INDEX IF NOT EXISTS idx_imgs_darktable ON imgs(darktable_processed) WHERE darktable_processed = 0;
      `);

      console.log('Migration 11 completed: Darktable columns added');
    }

    // Migration 12: Add address normalization columns to locs table
    // Per Kanye9: Store both raw and normalized addresses for premium archive
    const hasAddressRaw = locsColumnsCheck.some(col => col.name === 'address_raw');

    if (!hasAddressRaw) {
      console.log('Running migration 12: Adding address normalization columns to locs');

      sqlite.exec(`
        ALTER TABLE locs ADD COLUMN address_raw TEXT;
        ALTER TABLE locs ADD COLUMN address_normalized TEXT;
        ALTER TABLE locs ADD COLUMN address_parsed_json TEXT;
        ALTER TABLE locs ADD COLUMN address_source TEXT;
      `);

      console.log('Migration 12 completed: address normalization columns added');
    }

    // Migration 13: Add GPS geocode tier columns to locs table
    // Per Kanye9: Track which tier of cascade geocoding was used for accurate zoom levels
    const hasGeocodeTier = locsColumnsCheck.some(col => col.name === 'gps_geocode_tier');

    if (!hasGeocodeTier) {
      console.log('Running migration 13: Adding GPS geocode tier columns to locs');

      sqlite.exec(`
        ALTER TABLE locs ADD COLUMN gps_geocode_tier INTEGER;
        ALTER TABLE locs ADD COLUMN gps_geocode_query TEXT;
      `);

      console.log('Migration 13 completed: GPS geocode tier columns added');
    }

    // Migration 14: Add verification tracking columns to locs table
    // Per DECISION-010: Verification system for address, GPS, and location-level
    // - address_verified: User confirmed address is correct
    // - gps_verified_at/by: Metadata for existing gps_verified_on_map
    // - location_verified: Computed when BOTH address AND GPS verified
    const locsColsForVerification = sqlite.prepare('PRAGMA table_info(locs)').all() as Array<{ name: string }>;
    const hasAddressVerified = locsColsForVerification.some(col => col.name === 'address_verified');

    if (!hasAddressVerified) {
      console.log('Running migration 14: Adding verification tracking columns to locs');

      sqlite.exec(`
        -- Address verification
        ALTER TABLE locs ADD COLUMN address_verified INTEGER DEFAULT 0;
        ALTER TABLE locs ADD COLUMN address_verified_at TEXT;
        ALTER TABLE locs ADD COLUMN address_verified_by TEXT;

        -- GPS verification metadata (gps_verified_on_map already exists)
        ALTER TABLE locs ADD COLUMN gps_verified_at TEXT;
        ALTER TABLE locs ADD COLUMN gps_verified_by TEXT;

        -- Location-level verification (set when BOTH address AND GPS verified)
        ALTER TABLE locs ADD COLUMN location_verified INTEGER DEFAULT 0;
        ALTER TABLE locs ADD COLUMN location_verified_at TEXT;
      `);

      // Create index for finding verified locations
      sqlite.exec(`
        CREATE INDEX IF NOT EXISTS idx_locs_verified ON locs(location_verified) WHERE location_verified = 1;
        CREATE INDEX IF NOT EXISTS idx_locs_address_verified ON locs(address_verified) WHERE address_verified = 1;
      `);

      console.log('Migration 14 completed: verification tracking columns added');
    }

    // Migration 15: Add cultural_region column to locs table
    // Per DECISION-011: Location Box UI redesign with cultural region support
    // Cultural region is user-entered, subjective, does NOT count toward Location ✓
    const locsColsForCulturalRegion = sqlite.prepare('PRAGMA table_info(locs)').all() as Array<{ name: string }>;
    const hasCulturalRegion = locsColsForCulturalRegion.some(col => col.name === 'cultural_region');

    if (!hasCulturalRegion) {
      console.log('Running migration 15: Adding cultural_region column to locs');

      sqlite.exec(`
        ALTER TABLE locs ADD COLUMN cultural_region TEXT;
      `);

      console.log('Migration 15 completed: cultural_region column added');
    }

    // Migration 16: Add Census region/division and state direction columns to locs table
    // Per DECISION-012: Auto-population of regions for location discovery
    // - census_region: One of 4 US Census regions (Northeast, Midwest, South, West)
    // - census_division: One of 9 US Census divisions (New England, Middle Atlantic, etc.)
    // - state_direction: Position within state (e.g., "Eastern NY", "Central TX")
    // Note: cultural_region already exists from Migration 15
    const locsColsForCensus = sqlite.prepare('PRAGMA table_info(locs)').all() as Array<{ name: string }>;
    const hasCensusRegion = locsColsForCensus.some(col => col.name === 'census_region');

    if (!hasCensusRegion) {
      console.log('Running migration 16: Adding Census region/division columns to locs');

      sqlite.exec(`
        ALTER TABLE locs ADD COLUMN census_region TEXT;
        ALTER TABLE locs ADD COLUMN census_division TEXT;
        ALTER TABLE locs ADD COLUMN state_direction TEXT;
      `);

      // Create indexes for filtering by region
      sqlite.exec(`
        CREATE INDEX IF NOT EXISTS idx_locs_census_region ON locs(census_region) WHERE census_region IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_locs_census_division ON locs(census_division) WHERE census_division IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_locs_cultural_region ON locs(cultural_region) WHERE cultural_region IS NOT NULL;
      `);

      console.log('Migration 16 completed: Census region/division columns added');
    }

    // Migration 17: Add Information box fields for DECISION-013
    // - built_year/abandoned_year: Text storage for flexible date formats
    // - built_type/abandoned_type: 'year', 'range', 'date' for UI formatting
    // - project: Boolean flag for project membership
    // - doc_interior/exterior/drone/web_history: Documentation checkboxes
    const locsColsForInfo = sqlite.prepare('PRAGMA table_info(locs)').all() as Array<{ name: string }>;
    const hasBuiltYear = locsColsForInfo.some(col => col.name === 'built_year');

    if (!hasBuiltYear) {
      console.log('Running migration 17: Adding Information box columns to locs');

      sqlite.exec(`
        ALTER TABLE locs ADD COLUMN built_year TEXT;
        ALTER TABLE locs ADD COLUMN built_type TEXT;
        ALTER TABLE locs ADD COLUMN abandoned_year TEXT;
        ALTER TABLE locs ADD COLUMN abandoned_type TEXT;
        ALTER TABLE locs ADD COLUMN project INTEGER DEFAULT 0;
        ALTER TABLE locs ADD COLUMN doc_interior INTEGER DEFAULT 0;
        ALTER TABLE locs ADD COLUMN doc_exterior INTEGER DEFAULT 0;
        ALTER TABLE locs ADD COLUMN doc_drone INTEGER DEFAULT 0;
        ALTER TABLE locs ADD COLUMN doc_web_history INTEGER DEFAULT 0;
      `);

      // Create index for project flag
      sqlite.exec(`
        CREATE INDEX IF NOT EXISTS idx_locs_project ON locs(project) WHERE project = 1;
      `);

      console.log('Migration 17 completed: Information box columns added');
    }

    // Migration 18: Add Country Cultural Region and geographic hierarchy fields
    // Per DECISION-017: Local & Region sections overhaul
    // - country_cultural_region: 50 national-level regions (from GeoJSON)
    // - country_cultural_region_verified: User verification flag
    // - local_cultural_region_verified: User verification for existing cultural_region
    // - country: Defaults to "United States"
    // - continent: Defaults to "North America"
    const locsColsForCountryRegion = sqlite.prepare('PRAGMA table_info(locs)').all() as Array<{ name: string }>;
    const hasCountryCulturalRegion = locsColsForCountryRegion.some(col => col.name === 'country_cultural_region');

    if (!hasCountryCulturalRegion) {
      console.log('Running migration 18: Adding Country Cultural Region and geographic hierarchy columns to locs');

      sqlite.exec(`
        ALTER TABLE locs ADD COLUMN country_cultural_region TEXT;
        ALTER TABLE locs ADD COLUMN country_cultural_region_verified INTEGER DEFAULT 0;
        ALTER TABLE locs ADD COLUMN local_cultural_region_verified INTEGER DEFAULT 0;
        ALTER TABLE locs ADD COLUMN country TEXT DEFAULT 'United States';
        ALTER TABLE locs ADD COLUMN continent TEXT DEFAULT 'North America';
      `);

      // Create index for country cultural region filtering
      sqlite.exec(`
        CREATE INDEX IF NOT EXISTS idx_locs_country_cultural_region ON locs(country_cultural_region) WHERE country_cultural_region IS NOT NULL;
      `);

      console.log('Migration 18 completed: Country Cultural Region and geographic hierarchy columns added');
    }

    // Migration 19: Add Information Box overhaul fields
    // Per DECISION-019: Historical name and name verification fields
    // - historical_name: Historical/original name of location
    // - locnam_verified: User verified location name is correct
    // - historical_name_verified: User verified historical name is correct
    // - akanam_verified: User verified AKA name is correct
    const locsColsForInfoOverhaul = sqlite.prepare('PRAGMA table_info(locs)').all() as Array<{ name: string }>;
    const hasHistoricalName = locsColsForInfoOverhaul.some(col => col.name === 'historical_name');

    if (!hasHistoricalName) {
      console.log('Running migration 19: Adding Information Box overhaul columns to locs');

      sqlite.exec(`
        ALTER TABLE locs ADD COLUMN historical_name TEXT;
        ALTER TABLE locs ADD COLUMN locnam_verified INTEGER DEFAULT 0;
        ALTER TABLE locs ADD COLUMN historical_name_verified INTEGER DEFAULT 0;
        ALTER TABLE locs ADD COLUMN akanam_verified INTEGER DEFAULT 0;
      `);

      console.log('Migration 19 completed: Information Box overhaul columns added');
    }

    // Migration 20: Add Map Find documentation and status change tracking
    // Per Information Box overhaul:
    // - doc_map_find: Documentation checkbox for Map Find
    // - status_changed_at: Track when status last changed for nerd stats
    const locsColsForMapFind = sqlite.prepare('PRAGMA table_info(locs)').all() as Array<{ name: string }>;
    const hasDocMapFind = locsColsForMapFind.some(col => col.name === 'doc_map_find');

    if (!hasDocMapFind) {
      console.log('Running migration 20: Adding doc_map_find and status_changed_at columns to locs');

      sqlite.exec(`
        ALTER TABLE locs ADD COLUMN doc_map_find INTEGER DEFAULT 0;
        ALTER TABLE locs ADD COLUMN status_changed_at TEXT;
      `);

      console.log('Migration 20 completed: doc_map_find and status_changed_at columns added');
    }

    // Migration 21: Add hero display name fields
    // Per hero redesign: Smart title shortening with manual override
    // - locnam_short: Optional custom short name for hero display
    // - locnam_use_the: Boolean to prepend "The" to display name
    const locsColsForDisplayName = sqlite.prepare('PRAGMA table_info(locs)').all() as Array<{ name: string }>;
    const hasLocnamShort = locsColsForDisplayName.some(col => col.name === 'locnam_short');

    if (!hasLocnamShort) {
      console.log('Running migration 21: Adding hero display name columns to locs');

      sqlite.exec(`
        ALTER TABLE locs ADD COLUMN locnam_short TEXT;
        ALTER TABLE locs ADD COLUMN locnam_use_the INTEGER DEFAULT 0;
      `);

      console.log('Migration 21 completed: hero display name columns added');
    }

    // Migration 22: Add hero image focal point columns
    // Per premium UX: Allow user to set crop center point for hero images
    // - hero_focal_x: 0-1 horizontal position (0.5 = center)
    // - hero_focal_y: 0-1 vertical position (0.5 = center)
    const locsColsForFocal = sqlite.prepare('PRAGMA table_info(locs)').all() as Array<{ name: string }>;
    const hasHeroFocalX = locsColsForFocal.some(col => col.name === 'hero_focal_x');

    if (!hasHeroFocalX) {
      console.log('Running migration 22: Adding hero focal point columns to locs');

      sqlite.exec(`
        ALTER TABLE locs ADD COLUMN hero_focal_x REAL DEFAULT 0.5;
        ALTER TABLE locs ADD COLUMN hero_focal_y REAL DEFAULT 0.5;
      `);

      console.log('Migration 22 completed: hero focal point columns added');
    }

    // Migration 23: Add hidden and live photo columns to media tables
    // Per premium UX: Hide Live Photo videos, SDR duplicates, user-hidden items
    // - hidden: 0/1 flag for hiding from default view
    // - hidden_reason: 'user', 'live_photo', 'sdr_duplicate'
    // - is_live_photo: Flag for iPhone Live Photos and Android Motion Photos
    const imgColsForHidden = sqlite.prepare('PRAGMA table_info(imgs)').all() as Array<{ name: string }>;
    const hasHiddenCol = imgColsForHidden.some(col => col.name === 'hidden');

    if (!hasHiddenCol) {
      console.log('Running migration 23: Adding hidden and live photo columns to media tables');

      // Add columns to imgs table
      sqlite.exec(`
        ALTER TABLE imgs ADD COLUMN hidden INTEGER DEFAULT 0;
        ALTER TABLE imgs ADD COLUMN hidden_reason TEXT;
        ALTER TABLE imgs ADD COLUMN is_live_photo INTEGER DEFAULT 0;
      `);

      // Add columns to vids table
      sqlite.exec(`
        ALTER TABLE vids ADD COLUMN hidden INTEGER DEFAULT 0;
        ALTER TABLE vids ADD COLUMN hidden_reason TEXT;
        ALTER TABLE vids ADD COLUMN is_live_photo INTEGER DEFAULT 0;
      `);

      // Add columns to docs table
      sqlite.exec(`
        ALTER TABLE docs ADD COLUMN hidden INTEGER DEFAULT 0;
        ALTER TABLE docs ADD COLUMN hidden_reason TEXT;
      `);

      // Create indexes for filtering hidden items
      sqlite.exec(`
        CREATE INDEX IF NOT EXISTS idx_imgs_hidden ON imgs(hidden) WHERE hidden = 1;
        CREATE INDEX IF NOT EXISTS idx_vids_hidden ON vids(hidden) WHERE hidden = 1;
        CREATE INDEX IF NOT EXISTS idx_docs_hidden ON docs(hidden) WHERE hidden = 1;
        CREATE INDEX IF NOT EXISTS idx_imgs_live_photo ON imgs(is_live_photo) WHERE is_live_photo = 1;
        CREATE INDEX IF NOT EXISTS idx_vids_live_photo ON vids(is_live_photo) WHERE is_live_photo = 1;
      `);

      console.log('Migration 23 completed: hidden and live photo columns added');
    }

    // Migration 24: User authentication system
    // Multi-user support with simple PIN authentication
    // - pin_hash: SHA256 hash of user's PIN (null = no PIN required)
    // - is_active: Soft delete flag for users
    // - last_login: Track last login timestamp
    // - app_mode setting: 'single' or 'multi' user mode
    const userColsForPin = sqlite.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
    const hasPinHash = userColsForPin.some(col => col.name === 'pin_hash');

    if (!hasPinHash) {
      console.log('Running migration 24: Adding user authentication columns');

      // Add authentication columns to users table
      sqlite.exec(`
        ALTER TABLE users ADD COLUMN pin_hash TEXT;
        ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1;
        ALTER TABLE users ADD COLUMN last_login TEXT;
      `);

      // Set default app_mode to 'single' for existing installations
      const existingMode = sqlite.prepare("SELECT value FROM settings WHERE key = 'app_mode'").get();
      if (!existingMode) {
        sqlite.prepare("INSERT INTO settings (key, value) VALUES ('app_mode', 'single')").run();
      }

      console.log('Migration 24 completed: user authentication columns added');
    }

    // Migration 25: Activity tracking and author attribution
    // Phase 2 & 3: Track who creates, modifies, imports, and documents locations
    // - created_by_id, modified_by_id: Foreign keys to users table
    // - created_by, modified_by: Username strings for display (denormalized for performance)
    // - modified_at: Timestamp of last modification
    // - imported_by_id, imported_by: Track who imported media
    // - media_source: Track where media came from (e.g., "Personal camera", "Facebook archive")
    // - location_authors: Junction table for multiple authors per location
    const locsColsForTracking = sqlite.prepare('PRAGMA table_info(locs)').all() as Array<{ name: string }>;
    const hasCreatedById = locsColsForTracking.some(col => col.name === 'created_by_id');

    if (!hasCreatedById) {
      console.log('Running migration 25: Adding activity tracking and author attribution');

      // Add tracking columns to locs table
      sqlite.exec(`
        ALTER TABLE locs ADD COLUMN created_by_id TEXT REFERENCES users(user_id);
        ALTER TABLE locs ADD COLUMN created_by TEXT;
        ALTER TABLE locs ADD COLUMN modified_by_id TEXT REFERENCES users(user_id);
        ALTER TABLE locs ADD COLUMN modified_by TEXT;
        ALTER TABLE locs ADD COLUMN modified_at TEXT;
      `);

      // Add tracking columns to imgs table
      sqlite.exec(`
        ALTER TABLE imgs ADD COLUMN imported_by_id TEXT REFERENCES users(user_id);
        ALTER TABLE imgs ADD COLUMN imported_by TEXT;
        ALTER TABLE imgs ADD COLUMN media_source TEXT;
      `);

      // Add tracking columns to vids table
      sqlite.exec(`
        ALTER TABLE vids ADD COLUMN imported_by_id TEXT REFERENCES users(user_id);
        ALTER TABLE vids ADD COLUMN imported_by TEXT;
        ALTER TABLE vids ADD COLUMN media_source TEXT;
      `);

      // Add tracking columns to docs table
      sqlite.exec(`
        ALTER TABLE docs ADD COLUMN imported_by_id TEXT REFERENCES users(user_id);
        ALTER TABLE docs ADD COLUMN imported_by TEXT;
        ALTER TABLE docs ADD COLUMN media_source TEXT;
      `);

      // Add tracking columns to maps table
      sqlite.exec(`
        ALTER TABLE maps ADD COLUMN imported_by_id TEXT REFERENCES users(user_id);
        ALTER TABLE maps ADD COLUMN imported_by TEXT;
        ALTER TABLE maps ADD COLUMN media_source TEXT;
      `);

      // Create location_authors junction table for multiple contributors
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS location_authors (
          locid TEXT NOT NULL REFERENCES locs(locid) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
          role TEXT NOT NULL DEFAULT 'contributor',
          added_at TEXT NOT NULL,
          PRIMARY KEY (locid, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_location_authors_locid ON location_authors(locid);
        CREATE INDEX IF NOT EXISTS idx_location_authors_user_id ON location_authors(user_id);
      `);

      // Create indexes for activity queries
      sqlite.exec(`
        CREATE INDEX IF NOT EXISTS idx_locs_created_by_id ON locs(created_by_id) WHERE created_by_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_locs_modified_by_id ON locs(modified_by_id) WHERE modified_by_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_imgs_imported_by_id ON imgs(imported_by_id) WHERE imported_by_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_vids_imported_by_id ON vids(imported_by_id) WHERE imported_by_id IS NOT NULL;
      `);

      // Backfill existing locations with auth_imp data if available
      // This preserves the existing author attribution from the auth_imp field
      sqlite.exec(`
        UPDATE locs SET created_by = auth_imp WHERE created_by IS NULL AND auth_imp IS NOT NULL;
        UPDATE imgs SET imported_by = auth_imp WHERE imported_by IS NULL AND auth_imp IS NOT NULL;
        UPDATE vids SET imported_by = auth_imp WHERE imported_by IS NULL AND auth_imp IS NOT NULL;
        UPDATE docs SET imported_by = auth_imp WHERE imported_by IS NULL AND auth_imp IS NOT NULL;
        UPDATE maps SET imported_by = auth_imp WHERE imported_by IS NULL AND auth_imp IS NOT NULL;
      `);

      console.log('Migration 25 completed: activity tracking and author attribution columns added');
    }

    // Migration 26: Media contributor tracking
    // Track whether media was shot by the user (author) or contributed by someone else
    // - is_contributed: 0 = author shot it, 1 = someone else contributed it
    // - contribution_source: Free text describing who/where from (e.g., "John Smith via text")
    const imgsColsForContrib = sqlite.prepare('PRAGMA table_info(imgs)').all() as Array<{ name: string }>;
    const hasContributed = imgsColsForContrib.some(col => col.name === 'is_contributed');

    if (!hasContributed) {
      console.log('Running migration 26: Adding media contributor tracking');

      // Add contributor columns to imgs table
      sqlite.exec(`
        ALTER TABLE imgs ADD COLUMN is_contributed INTEGER DEFAULT 0;
        ALTER TABLE imgs ADD COLUMN contribution_source TEXT;
      `);

      // Add contributor columns to vids table
      sqlite.exec(`
        ALTER TABLE vids ADD COLUMN is_contributed INTEGER DEFAULT 0;
        ALTER TABLE vids ADD COLUMN contribution_source TEXT;
      `);

      console.log('Migration 26 completed: media contributor tracking columns added');
    }

    // Migration 27: Add contributor tracking to docs table
    // Consistency with imgs/vids - docs can also be contributed by others
    const docsColsForContrib = sqlite.prepare('PRAGMA table_info(docs)').all() as Array<{ name: string }>;
    const docsHasContributed = docsColsForContrib.some(col => col.name === 'is_contributed');

    if (!docsHasContributed) {
      console.log('Running migration 27: Adding contributor tracking to docs table');

      sqlite.exec(`
        ALTER TABLE docs ADD COLUMN is_contributed INTEGER DEFAULT 0;
        ALTER TABLE docs ADD COLUMN contribution_source TEXT;
      `);

      console.log('Migration 27 completed: docs contributor tracking columns added');
    }

    // Migration 28: Enhanced sub-location fields
    // Add type, status, hero image, primary flag, and activity tracking to slocs table
    const slocsColumns = sqlite.prepare('PRAGMA table_info(slocs)').all() as Array<{ name: string }>;
    const slocsHasType = slocsColumns.some(col => col.name === 'type');

    if (!slocsHasType) {
      console.log('Running migration 28: Adding enhanced sub-location fields to slocs');

      sqlite.exec(`
        ALTER TABLE slocs ADD COLUMN type TEXT;
        ALTER TABLE slocs ADD COLUMN status TEXT;
        ALTER TABLE slocs ADD COLUMN hero_imgsha TEXT REFERENCES imgs(imgsha);
        ALTER TABLE slocs ADD COLUMN is_primary INTEGER DEFAULT 0;
        ALTER TABLE slocs ADD COLUMN created_date TEXT;
        ALTER TABLE slocs ADD COLUMN created_by TEXT;
        ALTER TABLE slocs ADD COLUMN modified_date TEXT;
        ALTER TABLE slocs ADD COLUMN modified_by TEXT;
      `);

      // Create index for finding primary sub-locations
      sqlite.exec(`
        CREATE INDEX IF NOT EXISTS idx_slocs_is_primary ON slocs(is_primary) WHERE is_primary = 1;
        CREATE INDEX IF NOT EXISTS idx_slocs_type ON slocs(type) WHERE type IS NOT NULL;
      `);

      console.log('Migration 28 completed: enhanced sub-location fields added');
    }

    // Migration 29: Remove UNIQUE constraint on slocnam
    // The slocnam (short location name) was incorrectly marked UNIQUE in the original schema.
    // Multiple locations can legitimately have the same abbreviation (e.g., "Hospital").
    // SQLite requires table rebuild to drop constraints.
    // Check if migration needed by testing if we can insert duplicate slocnam
    const migration29Check = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='index' AND sql LIKE '%slocnam%' AND sql LIKE '%UNIQUE%'").get();
    const tableInfoForSlocnam = sqlite.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='locs'").get() as { sql: string } | undefined;
    const hasSlocnamUnique = tableInfoForSlocnam?.sql?.includes('UNIQUE(slocnam)');

    if (hasSlocnamUnique || migration29Check) {
      console.log('Running migration 29: Removing UNIQUE constraint on slocnam');

      // Disable foreign keys during table rebuild
      sqlite.exec(`PRAGMA foreign_keys = OFF`);

      // Clean up any leftover locs_new from interrupted migration
      sqlite.exec(`DROP TABLE IF EXISTS locs_new`);

      // Get all column names from locs table
      const locsTableInfo = sqlite.prepare('PRAGMA table_info(locs)').all() as Array<{ name: string; type: string; notnull: number; dflt_value: string | null; pk: number }>;
      const columnDefs = locsTableInfo.map(col => {
        let def = `${col.name} ${col.type || 'TEXT'}`;
        if (col.pk) def += ' PRIMARY KEY';
        if (col.notnull && !col.pk) def += ' NOT NULL';
        if (col.dflt_value !== null) def += ` DEFAULT ${col.dflt_value}`;
        return def;
      }).join(',\n  ');

      // Create new table without UNIQUE(slocnam) constraint
      // Keep UNIQUE on loc12 and CHECK on address_state
      sqlite.exec(`
        CREATE TABLE locs_new (
          ${columnDefs},
          UNIQUE(loc12),
          CHECK(address_state IS NULL OR length(address_state) = 2)
        )
      `);

      sqlite.exec(`INSERT INTO locs_new SELECT * FROM locs`);
      sqlite.exec(`DROP TABLE locs`);
      sqlite.exec(`ALTER TABLE locs_new RENAME TO locs`);

      // Recreate indexes
      sqlite.exec(`
        CREATE INDEX IF NOT EXISTS idx_locs_state ON locs(address_state);
        CREATE INDEX IF NOT EXISTS idx_locs_type ON locs(type);
        CREATE INDEX IF NOT EXISTS idx_locs_gps ON locs(gps_lat, gps_lng) WHERE gps_lat IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_locs_loc12 ON locs(loc12);
        CREATE INDEX IF NOT EXISTS idx_locs_favorite ON locs(favorite) WHERE favorite = 1;
        CREATE INDEX IF NOT EXISTS idx_locs_verified ON locs(location_verified) WHERE location_verified = 1;
        CREATE INDEX IF NOT EXISTS idx_locs_address_verified ON locs(address_verified) WHERE address_verified = 1;
        CREATE INDEX IF NOT EXISTS idx_locs_census_region ON locs(census_region) WHERE census_region IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_locs_census_division ON locs(census_division) WHERE census_division IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_locs_cultural_region ON locs(cultural_region) WHERE cultural_region IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_locs_country_cultural_region ON locs(country_cultural_region) WHERE country_cultural_region IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_locs_project ON locs(project) WHERE project = 1;
        CREATE INDEX IF NOT EXISTS idx_locs_hero_imgsha ON locs(hero_imgsha) WHERE hero_imgsha IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_locs_created_by_id ON locs(created_by_id) WHERE created_by_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_locs_modified_by_id ON locs(modified_by_id) WHERE modified_by_id IS NOT NULL
      `);

      // Re-enable foreign keys
      sqlite.exec(`PRAGMA foreign_keys = ON`);

      console.log('Migration 29 completed: UNIQUE constraint on slocnam removed');
    }

    // Migration 30: Add preview_quality column to imgs table
    // Track quality of extracted previews for RAW files
    // Values: 'full' (LibRaw rendered), 'embedded' (ExifTool extracted), 'low' (< 50% resolution)
    const imgsColsForQuality = sqlite.prepare('PRAGMA table_info(imgs)').all() as Array<{ name: string }>;
    const hasPreviewQuality = imgsColsForQuality.some(col => col.name === 'preview_quality');

    if (!hasPreviewQuality) {
      console.log('Running migration 30: Adding preview_quality column to imgs');

      sqlite.exec(`
        ALTER TABLE imgs ADD COLUMN preview_quality TEXT DEFAULT 'embedded';
      `);

      // Create index for finding low-quality previews that need regeneration
      sqlite.exec(`
        CREATE INDEX IF NOT EXISTS idx_imgs_preview_quality ON imgs(preview_quality) WHERE preview_quality = 'low';
      `);

      console.log('Migration 30 completed: preview_quality column added');
    }

    // Migration 31: Add GPS columns to slocs (sub-locations) table
    // Per user spec: Sub-locations need their OWN GPS, separate from host location
    // Host location = campus-level GPS (e.g., main entrance)
    // Sub-location = building-specific GPS (e.g., individual building)
    const slocsColsForGps = sqlite.prepare('PRAGMA table_info(slocs)').all() as Array<{ name: string }>;
    const slocsHasGpsLat = slocsColsForGps.some(col => col.name === 'gps_lat');

    if (!slocsHasGpsLat) {
      console.log('Running migration 31: Adding GPS columns to slocs');

      sqlite.exec(`
        ALTER TABLE slocs ADD COLUMN gps_lat REAL;
        ALTER TABLE slocs ADD COLUMN gps_lng REAL;
        ALTER TABLE slocs ADD COLUMN gps_accuracy REAL;
        ALTER TABLE slocs ADD COLUMN gps_source TEXT;
        ALTER TABLE slocs ADD COLUMN gps_verified_on_map INTEGER DEFAULT 0;
        ALTER TABLE slocs ADD COLUMN gps_captured_at TEXT;
      `);

      // Create index for sub-locations with GPS
      sqlite.exec(`
        CREATE INDEX IF NOT EXISTS idx_slocs_gps ON slocs(gps_lat, gps_lng) WHERE gps_lat IS NOT NULL;
      `);

      console.log('Migration 31 completed: GPS columns added to slocs');
    }

    // Migration 32: Add akanam and historicalName columns to slocs table
    // Per sub-location edit form: Buildings can have their own AKA and historical names
    const slocsColsForAka = sqlite.prepare('PRAGMA table_info(slocs)').all() as Array<{ name: string }>;
    const slocsHasAkanam = slocsColsForAka.some(col => col.name === 'akanam');

    if (!slocsHasAkanam) {
      console.log('Running migration 32: Adding akanam and historicalName columns to slocs');

      sqlite.exec(`
        ALTER TABLE slocs ADD COLUMN akanam TEXT;
        ALTER TABLE slocs ADD COLUMN historicalName TEXT;
      `);

      console.log('Migration 32 completed: akanam and historicalName columns added to slocs');
    }

    // Migration 33: Add view_count and last_viewed_at columns to locs table
    // For Nerd Stats: Track how many times a location has been viewed
    const locsColsForViews = sqlite.prepare('PRAGMA table_info(locs)').all() as Array<{ name: string }>;
    const locsHasViewCount = locsColsForViews.some(col => col.name === 'view_count');

    if (!locsHasViewCount) {
      console.log('Running migration 33: Adding view_count and last_viewed_at columns to locs');

      sqlite.exec(`
        ALTER TABLE locs ADD COLUMN view_count INTEGER DEFAULT 0;
        ALTER TABLE locs ADD COLUMN last_viewed_at TEXT;
      `);

      console.log('Migration 33 completed: view_count and last_viewed_at columns added to locs');
    }

    // Migration 34: Create location_views table for per-user view tracking
    // Tracks who viewed what location and when, for analytics and future features
    const locationViewsExists = sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='location_views'"
    ).get();

    if (!locationViewsExists) {
      console.log('Running migration 34: Creating location_views table');

      sqlite.exec(`
        CREATE TABLE location_views (
          view_id TEXT PRIMARY KEY,
          locid TEXT NOT NULL,
          user_id TEXT NOT NULL,
          viewed_at TEXT NOT NULL,
          FOREIGN KEY (locid) REFERENCES locs(locid) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
        );

        -- Index for efficient queries by location and user
        CREATE INDEX idx_location_views_locid ON location_views(locid);
        CREATE INDEX idx_location_views_user_id ON location_views(user_id);
        CREATE INDEX idx_location_views_viewed_at ON location_views(viewed_at);
        -- Composite index for checking if user already viewed today
        CREATE INDEX idx_location_views_locid_user_date ON location_views(locid, user_id, viewed_at);
      `);

      console.log('Migration 34 completed: location_views table created');
    }

    // Migration 35: Add subid column to bookmarks table for sub-location support
    const bookmarkColumns = sqlite.pragma('table_info(bookmarks)') as Array<{ name: string }>;
    const bookmarksHasSubid = bookmarkColumns.some(col => col.name === 'subid');

    if (!bookmarksHasSubid) {
      console.log('Running migration 35: Adding subid column to bookmarks table');

      sqlite.exec(`
        ALTER TABLE bookmarks ADD COLUMN subid TEXT REFERENCES slocs(subid) ON DELETE SET NULL;
        CREATE INDEX idx_bookmarks_subid ON bookmarks(subid);
      `);

      console.log('Migration 35 completed: subid column added to bookmarks');
    }

    // Migration 36: Create video_proxies table for optimized video playback
    // Stores H.264 proxy videos with faststart for instant scrubbing
    // Per video-proxy-system-plan.md: Solves slow loading, no scrubbing, and rotation issues
    const videoProxiesExists = sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='video_proxies'"
    ).get();

    if (!videoProxiesExists) {
      console.log('Running migration 36: Creating video_proxies table');

      sqlite.exec(`
        CREATE TABLE video_proxies (
          vidsha TEXT PRIMARY KEY,
          proxy_path TEXT NOT NULL,
          generated_at TEXT NOT NULL,
          last_accessed TEXT NOT NULL,
          file_size_bytes INTEGER,
          original_width INTEGER,
          original_height INTEGER,
          proxy_width INTEGER,
          proxy_height INTEGER
        );

        -- Index for finding old proxies to purge
        CREATE INDEX idx_video_proxies_last_accessed ON video_proxies(last_accessed);

        -- Trigger to auto-delete proxy records when video is deleted
        CREATE TRIGGER video_proxies_fk_delete
        AFTER DELETE ON vids
        BEGIN
          DELETE FROM video_proxies WHERE vidsha = OLD.vidsha;
        END;
      `);

      console.log('Migration 36 completed: video_proxies table created');
    }

    // Migration 37: Create reference maps tables for user-imported map data
    // Stores imported KML, GPX, GeoJSON, etc. for location reference
    const refMapsExists = sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='ref_maps'"
    ).get();

    if (!refMapsExists) {
      console.log('Running migration 37: Creating reference maps tables');

      sqlite.exec(`
        -- Imported map files metadata
        CREATE TABLE ref_maps (
          map_id TEXT PRIMARY KEY,
          map_name TEXT NOT NULL,
          file_path TEXT NOT NULL,
          file_type TEXT NOT NULL,
          point_count INTEGER DEFAULT 0,
          imported_at TEXT NOT NULL,
          imported_by TEXT
        );

        CREATE INDEX idx_ref_maps_name ON ref_maps(map_name);

        -- Points extracted from imported maps
        CREATE TABLE ref_map_points (
          point_id TEXT PRIMARY KEY,
          map_id TEXT NOT NULL REFERENCES ref_maps(map_id) ON DELETE CASCADE,
          name TEXT,
          description TEXT,
          lat REAL NOT NULL,
          lng REAL NOT NULL,
          state TEXT,
          category TEXT,
          raw_metadata TEXT
        );

        CREATE INDEX idx_ref_map_points_map ON ref_map_points(map_id);
        CREATE INDEX idx_ref_map_points_state ON ref_map_points(state);
        CREATE INDEX idx_ref_map_points_coords ON ref_map_points(lat, lng);
      `);

      console.log('Migration 37 completed: reference maps tables created');
    }

    // Migration 38: Create location_exclusions table for "different place" decisions
    // ADR: ADR-pin-conversion-duplicate-prevention.md
    // Stores user decisions that two names refer to different places
    // Prevents re-prompting for the same pair during location creation
    const locationExclusionsExists = sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='location_exclusions'"
    ).get();

    if (!locationExclusionsExists) {
      console.log('Running migration 38: Creating location_exclusions table');

      sqlite.exec(`
        -- Stores user decisions that two names refer to different places
        -- Prevents re-prompting for the same pair
        CREATE TABLE location_exclusions (
          exclusion_id TEXT PRIMARY KEY,
          name_a TEXT NOT NULL,
          name_b TEXT NOT NULL,
          decided_at TEXT NOT NULL,
          decided_by TEXT
        );

        -- Index for efficient lookup (both directions)
        CREATE INDEX idx_location_exclusions_names ON location_exclusions(name_a, name_b);
      `);

      console.log('Migration 38 completed: location_exclusions table created');
    }

    // Migration 39: Add aka_names to ref_map_points for deduplication
    // Stores alternate names when merging duplicate pins
    const akaColumnExists = sqlite.prepare(
      "SELECT COUNT(*) as cnt FROM pragma_table_info('ref_map_points') WHERE name='aka_names'"
    ).get() as { cnt: number };

    if (akaColumnExists.cnt === 0) {
      console.log('Running migration 39: Adding aka_names to ref_map_points');

      sqlite.exec(`
        -- Add aka_names column for storing alternate names from merged pins
        ALTER TABLE ref_map_points ADD COLUMN aka_names TEXT;

        -- Add index for rounded GPS lookup (deduplication)
        CREATE INDEX IF NOT EXISTS idx_ref_map_points_gps_rounded
          ON ref_map_points(ROUND(lat, 4), ROUND(lng, 4));
      `);

      console.log('Migration 39 completed: aka_names column added');
    }

    // Migration 40: Add BagIt self-documenting archive columns to locs table
    // Per RFC 8493: Each location folder becomes a self-documenting archive
    // that can be understood 35+ years from now without the database
    // - bag_status: 'none', 'valid', 'complete', 'incomplete', 'invalid'
    // - bag_last_verified: ISO8601 timestamp of last integrity check
    // - bag_last_error: Error message if validation failed
    const locsColsForBagit = sqlite.prepare('PRAGMA table_info(locs)').all() as Array<{ name: string }>;
    const hasBagStatus = locsColsForBagit.some(col => col.name === 'bag_status');

    if (!hasBagStatus) {
      console.log('Running migration 40: Adding BagIt archive columns to locs');

      sqlite.exec(`
        ALTER TABLE locs ADD COLUMN bag_status TEXT DEFAULT 'none';
        ALTER TABLE locs ADD COLUMN bag_last_verified TEXT;
        ALTER TABLE locs ADD COLUMN bag_last_error TEXT;
      `);

      // Create index for finding locations needing validation
      sqlite.exec(`
        CREATE INDEX IF NOT EXISTS idx_locs_bag_status ON locs(bag_status) WHERE bag_status != 'valid';
      `);

      console.log('Migration 40 completed: BagIt archive columns added');
    }

    // Migration 41: Create sidecar_imports table for metadata-only imports
    // Stores metadata from XML sidecar files when media file is not imported
    // Use case: Import XML metadata for reference without bringing large media files
    const sidecarImportsExists = sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='sidecar_imports'"
    ).get();

    if (!sidecarImportsExists) {
      console.log('Running migration 41: Creating sidecar_imports table');

      sqlite.exec(`
        -- Metadata-only imports from XML sidecar files
        -- When a media file has a matching .xml sidecar, we can import just the metadata
        CREATE TABLE sidecar_imports (
          sidecar_id TEXT PRIMARY KEY,
          original_filename TEXT NOT NULL,
          original_path TEXT NOT NULL,
          xml_filename TEXT NOT NULL,
          xml_path TEXT NOT NULL,
          xml_content TEXT,
          parsed_metadata TEXT,
          media_type TEXT,
          import_date TEXT NOT NULL,
          imported_by TEXT,
          imported_by_id TEXT REFERENCES users(user_id),
          locid TEXT REFERENCES locs(locid) ON DELETE CASCADE,
          subid TEXT REFERENCES slocs(subid) ON DELETE SET NULL
        );

        -- Indexes for efficient queries
        CREATE INDEX idx_sidecar_imports_locid ON sidecar_imports(locid);
        CREATE INDEX idx_sidecar_imports_date ON sidecar_imports(import_date DESC);
        CREATE INDEX idx_sidecar_imports_original ON sidecar_imports(original_filename);
      `);

      console.log('Migration 41 completed: sidecar_imports table created');
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
