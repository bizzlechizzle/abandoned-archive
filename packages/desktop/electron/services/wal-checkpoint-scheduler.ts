import { app } from 'electron';
import Database from 'better-sqlite3';
import { join } from 'path';
import { getLogger } from './logger-service';
import { existsSync, statSync } from 'fs';

const logger = getLogger();

export interface WalCheckpointResult {
  success: boolean;
  walSizeBefore: number;
  walSizeAfter: number;
  spaceRecovered: number;
  duration: number;
  timestamp: string;
  mode: 'PASSIVE' | 'FULL' | 'RESTART' | 'TRUNCATE';
}

export interface WalStats {
  walSize: number;
  walPages: number;
  checkpointedPages: number;
  lastCheckpoint: string | null;
}

/**
 * WAL Checkpoint Scheduler
 * Periodically checkpoints the WAL file to prevent bloat
 * Runs on startup, before backups, and when idle
 */
export class WalCheckpointScheduler {
  private readonly WAL_SIZE_THRESHOLD = 10 * 1024 * 1024; // 10MB
  private readonly IDLE_CHECKPOINT_INTERVAL = 30 * 60 * 1000; // 30 minutes
  private readonly STARTUP_DELAY = 5000; // 5 seconds

  private dbPath: string;
  private lastCheckpointTime: Date | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private isCheckpointing = false;

  constructor() {
    this.dbPath = join(app.getPath('userData'), 'au-archive.db');
  }

  /**
   * Initialize checkpoint scheduler
   * Runs initial checkpoint after startup delay
   */
  async initialize(): Promise<void> {
    logger.info('WalCheckpointScheduler', 'Initializing WAL checkpoint scheduler', {
      startupDelay: this.STARTUP_DELAY,
      idleInterval: this.IDLE_CHECKPOINT_INTERVAL,
    });

    // Run initial checkpoint after startup delay
    setTimeout(() => {
      this.runCheckpoint('PASSIVE');
    }, this.STARTUP_DELAY);

    // Start idle monitoring
    this.startIdleMonitoring();
  }

  /**
   * Get current WAL file statistics
   */
  async getWalStats(): Promise<WalStats> {
    try {
      const walPath = `${this.dbPath}-wal`;
      let walSize = 0;

      if (existsSync(walPath)) {
        const stats = statSync(walPath);
        walSize = stats.size;
      }

      const db = new Database(this.dbPath, { readonly: true });
      const walInfo = db.pragma('wal_checkpoint') as Array<{
        busy: number;
        log: number;
        checkpointed: number;
      }>;
      db.close();

      const info = walInfo[0] || { busy: 0, log: 0, checkpointed: 0 };

      return {
        walSize,
        walPages: info.log,
        checkpointedPages: info.checkpointed,
        lastCheckpoint: this.lastCheckpointTime?.toISOString() || null,
      };
    } catch (error) {
      logger.error('WalCheckpointScheduler', 'Failed to get WAL stats', error as Error);
      return {
        walSize: 0,
        walPages: 0,
        checkpointedPages: 0,
        lastCheckpoint: null,
      };
    }
  }

  /**
   * Check if WAL needs checkpointing
   */
  async needsCheckpoint(): Promise<boolean> {
    const stats = await this.getWalStats();
    return stats.walSize > this.WAL_SIZE_THRESHOLD;
  }

  /**
   * Run WAL checkpoint
   * @param mode Checkpoint mode (PASSIVE, FULL, RESTART, TRUNCATE)
   */
  async runCheckpoint(
    mode: 'PASSIVE' | 'FULL' | 'RESTART' | 'TRUNCATE' = 'TRUNCATE'
  ): Promise<WalCheckpointResult> {
    if (this.isCheckpointing) {
      logger.warn('WalCheckpointScheduler', 'Checkpoint already in progress, skipping');
      return {
        success: false,
        walSizeBefore: 0,
        walSizeAfter: 0,
        spaceRecovered: 0,
        duration: 0,
        timestamp: new Date().toISOString(),
        mode,
      };
    }

    this.isCheckpointing = true;
    const startTime = Date.now();

    try {
      // Get WAL size before checkpoint
      const statsBefore = await this.getWalStats();
      const walSizeBefore = statsBefore.walSize;

      logger.info('WalCheckpointScheduler', `Running ${mode} checkpoint`, {
        walSizeBefore,
        walPages: statsBefore.walPages,
      });

      // Open database and run checkpoint
      const db = new Database(this.dbPath);
      db.pragma(`wal_checkpoint(${mode})`);
      db.close();

      // Get WAL size after checkpoint
      const statsAfter = await this.getWalStats();
      const walSizeAfter = statsAfter.walSize;
      const spaceRecovered = walSizeBefore - walSizeAfter;
      const duration = Date.now() - startTime;

      this.lastCheckpointTime = new Date();

      logger.info('WalCheckpointScheduler', 'Checkpoint completed', {
        mode,
        walSizeBefore,
        walSizeAfter,
        spaceRecovered,
        duration,
      });

      return {
        success: true,
        walSizeBefore,
        walSizeAfter,
        spaceRecovered,
        duration,
        timestamp: new Date().toISOString(),
        mode,
      };
    } catch (error) {
      logger.error('WalCheckpointScheduler', 'Checkpoint failed', error as Error);
      return {
        success: false,
        walSizeBefore: 0,
        walSizeAfter: 0,
        spaceRecovered: 0,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        mode,
      };
    } finally {
      this.isCheckpointing = false;
    }
  }

  /**
   * Run checkpoint before backup
   * Uses TRUNCATE mode to ensure WAL is fully checkpointed
   */
  async checkpointBeforeBackup(): Promise<WalCheckpointResult> {
    logger.info('WalCheckpointScheduler', 'Running pre-backup checkpoint');
    return this.runCheckpoint('TRUNCATE');
  }

  /**
   * Start idle monitoring for automatic checkpoints
   */
  private startIdleMonitoring(): void {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
    }

    this.idleTimer = setInterval(async () => {
      const needsCheckpoint = await this.needsCheckpoint();
      if (needsCheckpoint) {
        logger.info('WalCheckpointScheduler', 'Running idle checkpoint due to WAL size');
        await this.runCheckpoint('TRUNCATE');
      }
    }, this.IDLE_CHECKPOINT_INTERVAL);
  }

  /**
   * Stop idle monitoring
   */
  stopIdleMonitoring(): void {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
  }

  /**
   * Force immediate checkpoint
   * Used for maintenance operations
   */
  async forceCheckpoint(): Promise<WalCheckpointResult> {
    logger.info('WalCheckpointScheduler', 'Running forced checkpoint');
    return this.runCheckpoint('TRUNCATE');
  }
}

// Singleton instance
let schedulerInstance: WalCheckpointScheduler | null = null;

export function getWalCheckpointScheduler(): WalCheckpointScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new WalCheckpointScheduler();
  }
  return schedulerInstance;
}
