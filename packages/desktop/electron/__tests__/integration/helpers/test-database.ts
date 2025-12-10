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
 * Create test location data with all required fields per database.types.ts
 */
// ADR-046: Generate BLAKE3-like 16-char hex ID for testing
function generateTestBlake3Id(): string {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

export function createTestLocation(overrides: Partial<any> = {}) {
  return {
    // Identity - ADR-046: locid is BLAKE3 16-char hex
    locid: generateTestBlake3Id(),
    loc12: `L-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    locnam: 'Test Location',

    // GPS verification flags (required numbers)
    gps_verified_on_map: 0,

    // Address verification flags (required numbers)
    address_verified: 0,

    // Location verification (required numbers)
    location_verified: 0,
    country_cultural_region_verified: 0,
    local_cultural_region_verified: 0,

    // Status flags (required numbers)
    historic: 0,
    favorite: 0,
    project: 0,

    // Documentation flags (required numbers)
    doc_interior: 0,
    doc_exterior: 0,
    doc_drone: 0,
    doc_web_history: 0,
    doc_map_find: 0,

    // Name verification flags (required numbers)
    locnam_verified: 0,
    historical_name_verified: 0,
    akanam_verified: 0,

    // View tracking (required number)
    view_count: 0,

    // Timestamps
    locadd: new Date().toISOString(),
    locup: new Date().toISOString(),

    ...overrides,
  };
}

/**
 * Create test image data with all required fields per database.types.ts
 * ADR-049: Uses 16-char hex IDs
 */
export function createTestImage(locid: string, overrides: Partial<any> = {}) {
  const hash = generateTestBlake3Id();
  return {
    // Identity
    imghash: hash,
    imgnam: `${hash}.jpg`,
    imgnamo: 'test-image.jpg',
    imgloc: `/archive/images/${hash}.jpg`,
    imgloco: '/original/path/test-image.jpg',
    locid,
    imgadd: new Date().toISOString(),
    auth_imp: 'Test User',

    // Required number flags
    preview_extracted: 0,
    xmp_synced: 0,
    hidden: 0,
    is_live_photo: 0,
    is_contributed: 0,

    ...overrides,
  };
}
