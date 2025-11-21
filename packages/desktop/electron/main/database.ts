import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database as DatabaseSchema } from './database.types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db: Kysely<DatabaseSchema> | null = null;

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
 * Reads schema.sql and executes it
 */
function initializeSchema(sqlite: Database.Database): void {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');

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
 * Run database migrations for existing databases
 * Checks for missing columns and adds them
 */
function runMigrations(sqlite: Database.Database): void {
  try {
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
    const tables = sqlite.pragma('table_list') as Array<{ name: string }>;
    const hasImports = tables.some(t => t.name === 'imports');

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
    const hasNotes = tables.some(t => t.name === 'notes');

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
    const hasProjects = tables.some(t => t.name === 'projects');

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
    const hasBookmarks = tables.some(t => t.name === 'bookmarks');

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

    // Migration 6: Create users table if it doesn't exist
    const hasUsers = tables.some(t => t.name === 'users');

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

      // Create default user
      const defaultUserId = 'default-user-id';
      const defaultDate = new Date().toISOString();
      sqlite.exec(`
        INSERT INTO users (user_id, username, display_name, created_date)
        VALUES ('${defaultUserId}', 'default', 'Default User', '${defaultDate}');
      `);

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
 */
export function getDatabase(): Kysely<DatabaseSchema> {
  if (db) {
    return db;
  }

  const dbPath = getDatabasePath();
  const isNewDatabase = !fs.existsSync(dbPath);

  const sqlite = new Database(dbPath, {
    verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
  });

  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  if (isNewDatabase) {
    console.log('Creating new database at:', dbPath);
    initializeSchema(sqlite);
  } else {
    console.log('Using existing database at:', dbPath);
    runMigrations(sqlite);
  }

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
