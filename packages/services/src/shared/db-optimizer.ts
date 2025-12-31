/**
 * Database Optimization Service
 *
 * Applies performance optimizations for handling 100K-1M+ files:
 * - WAL mode with optimized synchronous setting
 * - Memory-mapped I/O for faster reads
 * - Increased cache size for better hit rates
 * - FTS5 full-text search indexes
 * - Periodic maintenance (VACUUM, ANALYZE)
 */

import type { Database as BetterSqliteDb } from 'better-sqlite3';

/**
 * Optimization profile
 */
export type OptimizationProfile = 'balanced' | 'performance' | 'safety';

/**
 * Optimization configuration
 */
export interface OptimizationConfig {
  /**
   * Profile name (affects PRAGMA choices)
   */
  profile: OptimizationProfile;

  /**
   * Cache size in KB (default: 64MB)
   */
  cacheSizeKb?: number;

  /**
   * Memory-mapped I/O size in bytes (default: 1GB)
   */
  mmapSize?: number;

  /**
   * Enable FTS5 indexes
   */
  enableFts?: boolean;

  /**
   * Temp store location: 'default' | 'file' | 'memory'
   */
  tempStore?: 'default' | 'file' | 'memory';
}

/**
 * Default optimization configs per profile
 */
const PROFILE_DEFAULTS: Record<OptimizationProfile, Partial<OptimizationConfig>> = {
  balanced: {
    cacheSizeKb: 64 * 1024, // 64MB
    mmapSize: 1024 * 1024 * 1024, // 1GB
    tempStore: 'memory',
    enableFts: true,
  },
  performance: {
    cacheSizeKb: 256 * 1024, // 256MB
    mmapSize: 2 * 1024 * 1024 * 1024, // 2GB
    tempStore: 'memory',
    enableFts: true,
  },
  safety: {
    cacheSizeKb: 16 * 1024, // 16MB
    mmapSize: 0, // Disable mmap
    tempStore: 'file',
    enableFts: true,
  },
};

/**
 * Apply performance PRAGMAs to the database
 */
export function applyPragmaOptimizations(
  db: BetterSqliteDb,
  config: OptimizationConfig
): void {
  const profile = PROFILE_DEFAULTS[config.profile];
  const cacheSizeKb = config.cacheSizeKb ?? profile.cacheSizeKb ?? 64 * 1024;
  const mmapSize = config.mmapSize ?? profile.mmapSize ?? 1024 * 1024 * 1024;
  const tempStore = config.tempStore ?? profile.tempStore ?? 'memory';

  // WAL mode for concurrent reads
  db.pragma('journal_mode = WAL');

  // Foreign keys for referential integrity
  db.pragma('foreign_keys = ON');

  // Synchronous mode (NORMAL is safe with WAL, faster than FULL)
  // NORMAL: Data is safe after OS crash, slightly faster than FULL
  if (config.profile === 'safety') {
    db.pragma('synchronous = FULL');
  } else {
    db.pragma('synchronous = NORMAL');
  }

  // Cache size (negative = KB, positive = pages)
  db.pragma(`cache_size = -${cacheSizeKb}`);

  // Memory-mapped I/O for faster reads
  if (mmapSize > 0) {
    db.pragma(`mmap_size = ${mmapSize}`);
  }

  // Temp store in memory for faster sorts
  switch (tempStore) {
    case 'memory':
      db.pragma('temp_store = MEMORY');
      break;
    case 'file':
      db.pragma('temp_store = FILE');
      break;
    // 'default' leaves it as-is
  }

  // Page size (4KB is optimal for most SSDs)
  // Note: Can only be changed on empty database
  // db.pragma('page_size = 4096');

  // Auto-vacuum for reclaiming space
  db.pragma('auto_vacuum = INCREMENTAL');

  // Busy timeout for concurrent access
  db.pragma('busy_timeout = 5000');

  // Threading mode (for better-sqlite3, this is set at compile time)
  // db.pragma('threads = 4');

  console.log(`[DbOptimizer] Applied ${config.profile} profile optimizations`);
}

/**
 * Create FTS5 full-text search indexes
 */
export function createFtsIndexes(db: BetterSqliteDb): void {
  // Check if FTS5 is available
  try {
    const ftsCheck = db.prepare(`SELECT sqlite_compileoption_used('ENABLE_FTS5')`).get() as Record<string, number>;
    if (!Object.values(ftsCheck)[0]) {
      console.warn('[DbOptimizer] FTS5 not available in SQLite build');
      return;
    }
  } catch {
    console.warn('[DbOptimizer] Could not check FTS5 availability');
    return;
  }

  // Locations FTS (name, description, notes)
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS locs_fts USING fts5(
      locnam,
      slocnam,
      akanam,
      description,
      notes,
      content=locs,
      content_rowid=rowid
    );
  `);

  // Trigger to keep FTS in sync with locations
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS locs_ai AFTER INSERT ON locs BEGIN
      INSERT INTO locs_fts(rowid, locnam, slocnam, akanam, description, notes)
      VALUES (new.rowid, new.locnam, new.slocnam, new.akanam,
              (SELECT description FROM locs WHERE locid = new.locid),
              (SELECT notes FROM locs WHERE locid = new.locid));
    END;
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS locs_ad AFTER DELETE ON locs BEGIN
      INSERT INTO locs_fts(locs_fts, rowid, locnam, slocnam, akanam, description, notes)
      VALUES ('delete', old.rowid, old.locnam, old.slocnam, old.akanam,
              NULL, NULL);
    END;
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS locs_au AFTER UPDATE ON locs BEGIN
      INSERT INTO locs_fts(locs_fts, rowid, locnam, slocnam, akanam, description, notes)
      VALUES ('delete', old.rowid, old.locnam, old.slocnam, old.akanam, NULL, NULL);
      INSERT INTO locs_fts(rowid, locnam, slocnam, akanam, description, notes)
      VALUES (new.rowid, new.locnam, new.slocnam, new.akanam,
              (SELECT description FROM locs WHERE locid = new.locid),
              (SELECT notes FROM locs WHERE locid = new.locid));
    END;
  `);

  console.log('[DbOptimizer] Created FTS5 indexes for locations');
}

/**
 * Create additional performance indexes for large-scale queries
 */
export function createPerformanceIndexes(db: BetterSqliteDb): void {
  // Compound index for location queries by state and category
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_locs_state_category
    ON locs(address_state, category)
    WHERE address_state IS NOT NULL;
  `);

  // Index for finding media by date range
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_imgs_date_taken
    ON imgs(meta_date_taken)
    WHERE meta_date_taken IS NOT NULL;
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_vids_date_taken
    ON vids(meta_date_taken)
    WHERE meta_date_taken IS NOT NULL;
  `);

  // Index for import timestamp queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_imgs_added
    ON imgs(imgadd);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_vids_added
    ON vids(vidadd);
  `);

  // Covering index for media list queries (avoids table lookups)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_imgs_list_covering
    ON imgs(locid, imghash, imgnam, meta_date_taken, meta_width, meta_height);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_vids_list_covering
    ON vids(locid, vidhash, vidnam, meta_date_taken, meta_duration);
  `);

  console.log('[DbOptimizer] Created performance indexes');
}

/**
 * Run database maintenance
 */
export function runMaintenance(db: BetterSqliteDb): void {
  // Analyze tables for query planner
  db.exec('ANALYZE');

  // Incremental vacuum to reclaim space
  db.pragma('incremental_vacuum');

  // Checkpoint WAL file
  db.pragma('wal_checkpoint(TRUNCATE)');

  console.log('[DbOptimizer] Ran maintenance (ANALYZE, vacuum, WAL checkpoint)');
}

/**
 * Get database statistics
 */
export function getDbStats(db: BetterSqliteDb): Record<string, number> {
  const stats: Record<string, number> = {};

  // Count rows in main tables
  const tables = ['locs', 'slocs', 'imgs', 'vids', 'docs', 'maps'];
  for (const table of tables) {
    try {
      const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
      stats[`${table}_count`] = result.count;
    } catch {
      // Table may not exist
      stats[`${table}_count`] = 0;
    }
  }

  // Database file size (page_count * page_size)
  const pageCount = (db.pragma('page_count') as [{ page_count: number }])[0]?.page_count ?? 0;
  const pageSize = (db.pragma('page_size') as [{ page_size: number }])[0]?.page_size ?? 4096;
  stats['db_size_bytes'] = pageCount * pageSize;
  stats['db_size_mb'] = Math.round(stats['db_size_bytes'] / (1024 * 1024));

  // WAL file size
  const walPages = (db.pragma('wal_checkpoint') as [{ log: number }])[0]?.log ?? 0;
  stats['wal_pages'] = walPages;

  // Cache stats
  const cacheSize = db.pragma('cache_size');
  stats['cache_size_kb'] = Math.abs((cacheSize as [{ cache_size: number }])[0]?.cache_size ?? 0);

  return stats;
}

/**
 * Full optimization pass
 */
export function optimizeDatabase(
  db: BetterSqliteDb,
  config: OptimizationConfig = { profile: 'balanced' }
): Record<string, number> {
  console.log(`[DbOptimizer] Starting optimization with ${config.profile} profile...`);

  // Apply PRAGMA optimizations
  applyPragmaOptimizations(db, config);

  // Create FTS indexes if enabled
  if (config.enableFts ?? true) {
    try {
      createFtsIndexes(db);
    } catch (err) {
      console.warn('[DbOptimizer] FTS5 index creation failed:', err);
    }
  }

  // Create performance indexes
  createPerformanceIndexes(db);

  // Run maintenance
  runMaintenance(db);

  // Return stats
  const stats = getDbStats(db);
  console.log('[DbOptimizer] Optimization complete:', stats);

  return stats;
}
