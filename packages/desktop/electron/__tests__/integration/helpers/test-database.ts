import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database as DatabaseSchema } from '../../../main/database.types';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Create a test database with schema
 */
export function createTestDatabase(): {
  db: Kysely<DatabaseSchema>;
  dbPath: string;
  cleanup: () => void;
} {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'au-test-db-'));
  const dbPath = path.join(tempDir, 'test.db');

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  // Initialize schema
  const schemaPath = path.join(__dirname, '../../../main/schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');

  const statements = schema
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    sqlite.exec(statement);
  }

  const dialect = new SqliteDialect({ database: sqlite });
  const db = new Kysely<DatabaseSchema>({ dialect });

  const cleanup = () => {
    db.destroy();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  };

  return { db, dbPath, cleanup };
}

/**
 * Create test location data
 */
export function createTestLocation(overrides: Partial<any> = {}) {
  return {
    locid: crypto.randomUUID(),
    loc12: `L-${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    locnam: 'Test Location',
    gps_lat: 45.5,
    gps_lng: -122.6,
    locadd: new Date().toISOString(),
    locup: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create test image data
 */
export function createTestImage(locid: string, overrides: Partial<any> = {}) {
  const hash = crypto.randomUUID().replace(/-/g, '');
  return {
    imgsha: hash,
    imgnam: `test-image-${hash.slice(0, 8)}.jpg`,
    imgnamo: 'test-image.jpg',
    imgloc: `/archive/images/${hash}.jpg`,
    imgloco: '/original/path/test-image.jpg',
    locid,
    imgadd: new Date().toISOString(),
    ...overrides,
  };
}
