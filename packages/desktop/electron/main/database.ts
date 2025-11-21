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
function getDatabasePath(): string {
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
