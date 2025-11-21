import { app } from 'electron';
import Database from 'better-sqlite3';
import { join } from 'path';
import { promises as fs } from 'fs';
import { existsSync, statSync } from 'fs';
import { getLogger } from './logger-service';

const logger = getLogger();

export interface MaintenanceResult {
  operation: 'VACUUM' | 'ANALYZE';
  success: boolean;
  duration: number;
  spaceRecovered?: number;
  dbSizeBefore?: number;
  dbSizeAfter?: number;
  timestamp: string;
  trigger: 'scheduled' | 'idle' | 'manual';
}

export interface MaintenanceSchedule {
  lastVacuum: string | null;
  lastAnalyze: string | null;
  nextVacuum: string | null;
  nextAnalyze: string | null;
  vacuumCount: number;
  analyzeCount: number;
}

/**
 * Maintenance Scheduler
 * Handles periodic VACUUM and ANALYZE operations
 */
export class MaintenanceScheduler {
  private readonly VACUUM_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 7 days
  private readonly ANALYZE_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly IDLE_THRESHOLD = 60 * 60 * 1000; // 1 hour
  private readonly VACUUM_DAY = 0; // Sunday
  private readonly VACUUM_HOUR = 3; // 3 AM
  private readonly SCHEDULE_FILE = 'maintenance-schedule.json';

  private dbPath: string;
  private scheduleFilePath: string;
  private isRunningMaintenance = false;
  private schedule: MaintenanceSchedule;

  constructor() {
    this.dbPath = join(app.getPath('userData'), 'au-archive.db');
    this.scheduleFilePath = join(app.getPath('userData'), this.SCHEDULE_FILE);
    this.schedule = {
      lastVacuum: null,
      lastAnalyze: null,
      nextVacuum: null,
      nextAnalyze: null,
      vacuumCount: 0,
      analyzeCount: 0,
    };
  }

  /**
   * Initialize maintenance scheduler
   */
  async initialize(): Promise<void> {
    logger.info('MaintenanceScheduler', 'Initializing maintenance scheduler');

    // Load schedule from disk
    await this.loadSchedule();

    // Update next scheduled times
    this.updateSchedule();

    // Start periodic checks
    this.startPeriodicChecks();
  }

  /**
   * Load maintenance schedule from disk
   */
  private async loadSchedule(): Promise<void> {
    try {
      if (existsSync(this.scheduleFilePath)) {
        const content = await fs.readFile(this.scheduleFilePath, 'utf-8');
        this.schedule = JSON.parse(content);
        logger.info('MaintenanceScheduler', 'Schedule loaded', this.schedule);
      }
    } catch (error) {
      logger.error('MaintenanceScheduler', 'Failed to load schedule', error as Error);
    }
  }

  /**
   * Save maintenance schedule to disk
   */
  private async saveSchedule(): Promise<void> {
    try {
      await fs.writeFile(
        this.scheduleFilePath,
        JSON.stringify(this.schedule, null, 2),
        'utf-8'
      );
    } catch (error) {
      logger.error('MaintenanceScheduler', 'Failed to save schedule', error as Error);
    }
  }

  /**
   * Update next scheduled maintenance times
   */
  private updateSchedule(): void {
    const now = new Date();

    // Calculate next VACUUM (next Sunday at 3 AM)
    if (!this.schedule.lastVacuum) {
      this.schedule.nextVacuum = this.getNextSundayAt3AM(now).toISOString();
    } else {
      const lastVacuum = new Date(this.schedule.lastVacuum);
      const nextVacuum = new Date(lastVacuum.getTime() + this.VACUUM_INTERVAL);
      this.schedule.nextVacuum = nextVacuum.toISOString();
    }

    // Calculate next ANALYZE (24 hours from last run)
    if (!this.schedule.lastAnalyze) {
      this.schedule.nextAnalyze = new Date(now.getTime() + this.ANALYZE_INTERVAL).toISOString();
    } else {
      const lastAnalyze = new Date(this.schedule.lastAnalyze);
      const nextAnalyze = new Date(lastAnalyze.getTime() + this.ANALYZE_INTERVAL);
      this.schedule.nextAnalyze = nextAnalyze.toISOString();
    }
  }

  /**
   * Get next Sunday at 3 AM
   */
  private getNextSundayAt3AM(from: Date): Date {
    const next = new Date(from);
    next.setHours(this.VACUUM_HOUR, 0, 0, 0);

    // If today is Sunday and it's before 3 AM, use today
    if (from.getDay() === this.VACUUM_DAY && from.getHours() < this.VACUUM_HOUR) {
      return next;
    }

    // Otherwise find next Sunday
    const daysUntilSunday = (7 - from.getDay()) % 7;
    next.setDate(from.getDate() + (daysUntilSunday === 0 ? 7 : daysUntilSunday));

    return next;
  }

  /**
   * Check if VACUUM is needed
   */
  needsVacuum(): boolean {
    if (!this.schedule.nextVacuum) {
      return true;
    }

    const now = new Date();
    const nextVacuum = new Date(this.schedule.nextVacuum);
    return now >= nextVacuum;
  }

  /**
   * Check if ANALYZE is needed
   */
  needsAnalyze(): boolean {
    if (!this.schedule.nextAnalyze) {
      return true;
    }

    const now = new Date();
    const nextAnalyze = new Date(this.schedule.nextAnalyze);
    return now >= nextAnalyze;
  }

  /**
   * Run VACUUM operation
   */
  async runVacuum(trigger: 'scheduled' | 'idle' | 'manual' = 'scheduled'): Promise<MaintenanceResult> {
    if (this.isRunningMaintenance) {
      logger.warn('MaintenanceScheduler', 'Maintenance already in progress');
      return {
        operation: 'VACUUM',
        success: false,
        duration: 0,
        timestamp: new Date().toISOString(),
        trigger,
      };
    }

    this.isRunningMaintenance = true;
    const startTime = Date.now();

    try {
      // Get database size before VACUUM
      const dbSizeBefore = existsSync(this.dbPath) ? statSync(this.dbPath).size : 0;

      logger.info('MaintenanceScheduler', 'Starting VACUUM operation', {
        dbSizeBefore,
        trigger,
      });

      // Run VACUUM
      const db = new Database(this.dbPath);
      db.exec('VACUUM;');
      db.close();

      // Get database size after VACUUM
      const dbSizeAfter = existsSync(this.dbPath) ? statSync(this.dbPath).size : 0;
      const spaceRecovered = dbSizeBefore - dbSizeAfter;
      const duration = Date.now() - startTime;

      // Update schedule
      this.schedule.lastVacuum = new Date().toISOString();
      this.schedule.vacuumCount++;
      this.updateSchedule();
      await this.saveSchedule();

      logger.info('MaintenanceScheduler', 'VACUUM completed', {
        dbSizeBefore,
        dbSizeAfter,
        spaceRecovered,
        duration,
        trigger,
      });

      return {
        operation: 'VACUUM',
        success: true,
        duration,
        spaceRecovered,
        dbSizeBefore,
        dbSizeAfter,
        timestamp: new Date().toISOString(),
        trigger,
      };
    } catch (error) {
      logger.error('MaintenanceScheduler', 'VACUUM failed', error as Error);
      return {
        operation: 'VACUUM',
        success: false,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        trigger,
      };
    } finally {
      this.isRunningMaintenance = false;
    }
  }

  /**
   * Run ANALYZE operation
   */
  async runAnalyze(trigger: 'scheduled' | 'idle' | 'manual' = 'scheduled'): Promise<MaintenanceResult> {
    if (this.isRunningMaintenance) {
      logger.warn('MaintenanceScheduler', 'Maintenance already in progress');
      return {
        operation: 'ANALYZE',
        success: false,
        duration: 0,
        timestamp: new Date().toISOString(),
        trigger,
      };
    }

    this.isRunningMaintenance = true;
    const startTime = Date.now();

    try {
      logger.info('MaintenanceScheduler', 'Starting ANALYZE operation', { trigger });

      // Run ANALYZE
      const db = new Database(this.dbPath);
      db.exec('ANALYZE;');
      db.close();

      const duration = Date.now() - startTime;

      // Update schedule
      this.schedule.lastAnalyze = new Date().toISOString();
      this.schedule.analyzeCount++;
      this.updateSchedule();
      await this.saveSchedule();

      logger.info('MaintenanceScheduler', 'ANALYZE completed', {
        duration,
        trigger,
      });

      return {
        operation: 'ANALYZE',
        success: true,
        duration,
        timestamp: new Date().toISOString(),
        trigger,
      };
    } catch (error) {
      logger.error('MaintenanceScheduler', 'ANALYZE failed', error as Error);
      return {
        operation: 'ANALYZE',
        success: false,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        trigger,
      };
    } finally {
      this.isRunningMaintenance = false;
    }
  }

  /**
   * Run both VACUUM and ANALYZE
   */
  async runFullMaintenance(trigger: 'scheduled' | 'idle' | 'manual' = 'scheduled'): Promise<MaintenanceResult[]> {
    const results: MaintenanceResult[] = [];

    // Run VACUUM first
    if (this.needsVacuum() || trigger === 'manual') {
      results.push(await this.runVacuum(trigger));
    }

    // Then run ANALYZE
    if (this.needsAnalyze() || trigger === 'manual') {
      results.push(await this.runAnalyze(trigger));
    }

    return results;
  }

  /**
   * Start periodic maintenance checks
   */
  private startPeriodicChecks(): void {
    // Check every hour
    setInterval(async () => {
      if (this.needsVacuum()) {
        await this.runVacuum('scheduled');
      }

      if (this.needsAnalyze()) {
        await this.runAnalyze('scheduled');
      }
    }, 60 * 60 * 1000); // 1 hour
  }

  /**
   * Trigger maintenance after import operations
   */
  async afterImport(): Promise<void> {
    logger.info('MaintenanceScheduler', 'Checking maintenance after import');

    // Always run ANALYZE after imports to update statistics
    await this.runAnalyze('idle');
  }

  /**
   * Get maintenance schedule
   */
  getSchedule(): MaintenanceSchedule {
    return { ...this.schedule };
  }

  /**
   * Get time until next maintenance
   */
  getTimeUntilNext(): { vacuum: number; analyze: number } {
    const now = new Date();

    const vacuumMs = this.schedule.nextVacuum
      ? new Date(this.schedule.nextVacuum).getTime() - now.getTime()
      : 0;

    const analyzeMs = this.schedule.nextAnalyze
      ? new Date(this.schedule.nextAnalyze).getTime() - now.getTime()
      : 0;

    return {
      vacuum: Math.max(0, vacuumMs),
      analyze: Math.max(0, analyzeMs),
    };
  }

  /**
   * Format time until next maintenance
   */
  formatTimeUntilNext(): { vacuum: string; analyze: string } {
    const times = this.getTimeUntilNext();

    return {
      vacuum: this.formatDuration(times.vacuum),
      analyze: this.formatDuration(times.analyze),
    };
  }

  /**
   * Format duration in milliseconds to human-readable string
   */
  private formatDuration(ms: number): string {
    if (ms <= 0) return 'Due now';

    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }
}

// Singleton instance
let schedulerInstance: MaintenanceScheduler | null = null;

export function getMaintenanceScheduler(): MaintenanceScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new MaintenanceScheduler();
  }
  return schedulerInstance;
}
