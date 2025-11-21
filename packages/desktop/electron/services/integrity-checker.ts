import Database from 'better-sqlite3';
import { getDatabasePath } from '../main/database';
import { getLogger } from './logger-service';

const logger = getLogger();

export interface IntegrityResult {
  isHealthy: boolean;
  errors: string[];
  warnings: string[];
  timestamp: string;
  checkDuration: number;
}

/**
 * Required tables that must exist for a healthy database
 */
const REQUIRED_TABLES = ['locs', 'slocs', 'imgs', 'vids', 'docs', 'maps'];

/**
 * Database integrity verification service
 * Runs PRAGMA integrity_check and foreign_key_check
 * FIX: Also verifies required tables exist (empty DB = unhealthy)
 */
export class IntegrityChecker {
  private lastCheckTime: Date | null = null;
  private lastResult: IntegrityResult | null = null;

  /**
   * Check if required schema tables exist
   */
  private checkRequiredTables(db: Database.Database): string[] {
    const errors: string[] = [];
    const tables = db.pragma('table_list') as Array<{ name: string }>;
    const tableNames = tables.map(t => t.name);

    for (const required of REQUIRED_TABLES) {
      if (!tableNames.includes(required)) {
        errors.push(`Required table "${required}" is missing`);
      }
    }

    return errors;
  }

  async runFullCheck(): Promise<IntegrityResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    logger.info('IntegrityChecker', 'Starting full integrity check');

    try {
      const dbPath = getDatabasePath();
      const db = new Database(dbPath, { readonly: true });

      try {
        // Check required tables exist first
        const tableErrors = this.checkRequiredTables(db);
        errors.push(...tableErrors);

        // Run integrity check
        const integrityResults = db.pragma('integrity_check') as Array<{ integrity_check: string }>;

        if (integrityResults.length > 0) {
          integrityResults.forEach((row) => {
            const result = row.integrity_check;
            if (result !== 'ok') {
              errors.push(`Integrity check failed: ${result}`);
            }
          });
        }

        // Run foreign key check
        const fkResults = db.pragma('foreign_key_check') as Array<{
          table: string;
          rowid: number;
          parent: string;
          fkid: number;
        }>;

        if (fkResults.length > 0) {
          fkResults.forEach((row) => {
            errors.push(
              `Foreign key violation in table ${row.table}, rowid ${row.rowid}, parent ${row.parent}`
            );
          });
        }

        // Check for suspicious database size
        const pageCount = db.pragma('page_count', { simple: true }) as number;
        const pageSize = db.pragma('page_size', { simple: true }) as number;
        const dbSize = pageCount * pageSize;

        if (dbSize > 5 * 1024 * 1024 * 1024) {
          // > 5GB
          warnings.push('Database size is very large (>5GB), consider optimization');
        }

        // Check WAL file size
        const walSize = db.pragma('wal_checkpoint(PASSIVE)') as number[];
        if (walSize && walSize[0] > 10000) {
          // > 10000 pages
          warnings.push('WAL file is large, checkpoint recommended');
        }
      } finally {
        db.close();
      }
    } catch (error) {
      logger.error('IntegrityChecker', 'Integrity check failed', error as Error);
      errors.push(`Integrity check error: ${(error as Error).message}`);
    }

    const duration = Date.now() - startTime;
    const result: IntegrityResult = {
      isHealthy: errors.length === 0,
      errors,
      warnings,
      timestamp: new Date().toISOString(),
      checkDuration: duration,
    };

    this.lastCheckTime = new Date();
    this.lastResult = result;

    if (errors.length > 0) {
      logger.error('IntegrityChecker', 'Database integrity issues found', undefined, {
        errors,
        duration,
      });
    } else {
      logger.info('IntegrityChecker', 'Integrity check passed', {
        warnings: warnings.length,
        duration,
      });
    }

    return result;
  }

  async runQuickCheck(): Promise<IntegrityResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    logger.debug('IntegrityChecker', 'Running quick integrity check');

    try {
      const dbPath = getDatabasePath();
      const db = new Database(dbPath, { readonly: true });

      try {
        // Check required tables exist first
        const tableErrors = this.checkRequiredTables(db);
        errors.push(...tableErrors);

        // Quick integrity check (first 100 pages)
        const result = db.pragma('quick_check(100)', { simple: true }) as string;

        if (result !== 'ok') {
          errors.push(`Quick check failed: ${result}`);
        }

        // Foreign key check
        const fkResults = db.pragma('foreign_key_check') as Array<{
          table: string;
          rowid: number;
          parent: string;
          fkid: number;
        }>;

        if (fkResults.length > 0) {
          errors.push(`Found ${fkResults.length} foreign key violations`);
        }
      } finally {
        db.close();
      }
    } catch (error) {
      logger.error('IntegrityChecker', 'Quick check failed', error as Error);
      errors.push(`Quick check error: ${(error as Error).message}`);
    }

    const duration = Date.now() - startTime;
    const result: IntegrityResult = {
      isHealthy: errors.length === 0,
      errors,
      warnings,
      timestamp: new Date().toISOString(),
      checkDuration: duration,
    };

    this.lastResult = result;

    return result;
  }

  async verifyBackupFile(backupPath: string): Promise<IntegrityResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    logger.info('IntegrityChecker', 'Verifying backup file', { path: backupPath });

    try {
      const db = new Database(backupPath, { readonly: true });

      try {
        // Run integrity check on backup
        const integrityResults = db.pragma('integrity_check') as Array<{ integrity_check: string }>;

        if (integrityResults.length > 0) {
          integrityResults.forEach((row) => {
            const result = row.integrity_check;
            if (result !== 'ok') {
              errors.push(`Backup integrity check failed: ${result}`);
            }
          });
        }

        // Verify table counts
        const tables = db
          .prepare(
            `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
          )
          .all() as Array<{ name: string }>;

        if (tables.length === 0) {
          errors.push('Backup contains no tables');
        }
      } finally {
        db.close();
      }
    } catch (error) {
      logger.error('IntegrityChecker', 'Backup verification failed', error as Error, {
        path: backupPath,
      });
      errors.push(`Backup verification error: ${(error as Error).message}`);
    }

    const duration = Date.now() - startTime;
    const result: IntegrityResult = {
      isHealthy: errors.length === 0,
      errors,
      warnings,
      timestamp: new Date().toISOString(),
      checkDuration: duration,
    };

    if (errors.length > 0) {
      logger.error('IntegrityChecker', 'Backup file is corrupt', undefined, {
        path: backupPath,
        errors,
      });
    } else {
      logger.info('IntegrityChecker', 'Backup file verified successfully', {
        path: backupPath,
        duration,
      });
    }

    return result;
  }

  getLastCheckResult(): IntegrityResult | null {
    return this.lastResult;
  }

  getLastCheckTime(): Date | null {
    return this.lastCheckTime;
  }

  shouldRunCheck(): boolean {
    if (!this.lastCheckTime) {
      return true;
    }

    const hoursSinceLastCheck =
      (Date.now() - this.lastCheckTime.getTime()) / (1000 * 60 * 60);

    // Run check every 6 hours
    return hoursSinceLastCheck >= 6;
  }
}

// Singleton instance
let checkerInstance: IntegrityChecker | null = null;

export function getIntegrityChecker(): IntegrityChecker {
  if (!checkerInstance) {
    checkerInstance = new IntegrityChecker();
  }
  return checkerInstance;
}
