import { app } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { getDatabasePath } from '../main/database';
import { getLogger } from './logger-service';

const logger = getLogger();

export interface BackupMetadata {
  backupId: string;
  category: 'yearly' | 'monthly' | 'weekly' | 'daily' | 'recent';
  filePath: string;
  timestamp: string;
  size: number;
  verified: boolean;
}

export interface BackupManifest {
  backups: BackupMetadata[];
  lastBackup: string | null;
  lastVerification: string | null;
}

/**
 * Automated backup system with GFS (Grandfather-Father-Son) retention
 * Keeps: 1 yearly, 12 monthly, 1 weekly, 1 daily, 1 most recent
 */
export class BackupScheduler {
  private backupDir: string;
  private manifestPath: string;
  private isRunning: boolean = false;

  constructor() {
    this.backupDir = path.join(app.getPath('userData'), 'backups');
    this.manifestPath = path.join(this.backupDir, 'backups.json');
  }

  async initialize(): Promise<void> {
    await this.ensureBackupDirectory();
    logger.info('BackupScheduler', 'Backup scheduler initialized', {
      backupDir: this.backupDir,
    });
  }

  private async ensureBackupDirectory(): Promise<void> {
    const categories = ['yearly', 'monthly', 'weekly', 'daily', 'recent'];
    const currentYear = new Date().getFullYear().toString();

    for (const category of categories) {
      const dir = path.join(this.backupDir, currentYear, category);
      await fs.mkdir(dir, { recursive: true });
    }
  }

  private async loadManifest(): Promise<BackupManifest> {
    try {
      if (!existsSync(this.manifestPath)) {
        return { backups: [], lastBackup: null, lastVerification: null };
      }

      const content = await fs.readFile(this.manifestPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      logger.error('BackupScheduler', 'Failed to load manifest', error as Error);
      return { backups: [], lastBackup: null, lastVerification: null };
    }
  }

  private async saveManifest(manifest: BackupManifest): Promise<void> {
    try {
      await fs.writeFile(this.manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    } catch (error) {
      logger.error('BackupScheduler', 'Failed to save manifest', error as Error);
    }
  }

  private determineBackupCategory(now: Date): 'yearly' | 'monthly' | 'weekly' | 'daily' | 'recent' {
    const isNewYear = now.getMonth() === 0 && now.getDate() === 1;
    const isFirstOfMonth = now.getDate() === 1;
    const isSunday = now.getDay() === 0;

    if (isNewYear) return 'yearly';
    if (isFirstOfMonth) return 'monthly';
    if (isSunday) return 'weekly';
    return 'daily'; // Will become 'recent' after rotation
  }

  private async enforceRetentionPolicy(manifest: BackupManifest): Promise<void> {
    const retention = {
      yearly: 1,
      monthly: 12,
      weekly: 1,
      daily: 1,
      recent: 1,
    };

    for (const [category, maxCount] of Object.entries(retention)) {
      const categoryBackups = manifest.backups
        .filter((b) => b.category === category)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

      // Delete excess backups
      for (let i = maxCount; i < categoryBackups.length; i++) {
        const backup = categoryBackups[i];
        try {
          if (existsSync(backup.filePath)) {
            await fs.unlink(backup.filePath);
            logger.info('BackupScheduler', 'Deleted old backup', {
              category: backup.category,
              file: backup.filePath,
            });
          }
        } catch (error) {
          logger.error('BackupScheduler', 'Failed to delete old backup', error as Error, {
            file: backup.filePath,
          });
        }
      }

      // Update manifest
      manifest.backups = manifest.backups.filter(
        (b) => b.category !== category || categoryBackups.slice(0, maxCount).includes(b)
      );
    }
  }

  async createBackup(category?: 'yearly' | 'monthly' | 'weekly' | 'daily' | 'recent'): Promise<BackupMetadata | null> {
    if (this.isRunning) {
      logger.warn('BackupScheduler', 'Backup already in progress, skipping');
      return null;
    }

    this.isRunning = true;

    try {
      const now = new Date();
      const backupCategory = category || this.determineBackupCategory(now);
      const timestamp = now.toISOString().replace(/:/g, '-').split('.')[0];
      const year = now.getFullYear().toString();

      const dbPath = getDatabasePath();
      const backupFileName = `au-archive-${timestamp}.db`;
      const backupPath = path.join(this.backupDir, year, backupCategory, backupFileName);

      logger.info('BackupScheduler', 'Creating backup', {
        category: backupCategory,
        path: backupPath,
      });

      // Copy database file
      await fs.copyFile(dbPath, backupPath);

      // Get file size
      const stats = await fs.stat(backupPath);

      const metadata: BackupMetadata = {
        backupId: `backup-${Date.now()}`,
        category: backupCategory,
        filePath: backupPath,
        timestamp: now.toISOString(),
        size: stats.size,
        verified: false,
      };

      // Update manifest
      const manifest = await this.loadManifest();
      manifest.backups.push(metadata);
      manifest.lastBackup = now.toISOString();

      // Enforce retention policy
      await this.enforceRetentionPolicy(manifest);

      await this.saveManifest(manifest);

      logger.info('BackupScheduler', 'Backup created successfully', {
        category: backupCategory,
        size: stats.size,
        path: backupPath,
      });

      return metadata;
    } catch (error) {
      logger.error('BackupScheduler', 'Backup failed', error as Error);
      return null;
    } finally {
      this.isRunning = false;
    }
  }

  async shouldCreateBackup(): Promise<boolean> {
    try {
      const manifest = await this.loadManifest();

      // Always backup if no backups exist
      if (!manifest.lastBackup) {
        return true;
      }

      const lastBackup = new Date(manifest.lastBackup);
      const now = new Date();
      const hoursSinceLastBackup = (now.getTime() - lastBackup.getTime()) / (1000 * 60 * 60);

      // Create backup if more than 4 hours since last backup
      return hoursSinceLastBackup >= 4;
    } catch (error) {
      logger.error('BackupScheduler', 'Failed to check backup status', error as Error);
      return false;
    }
  }

  async getBackupStats(): Promise<{
    totalBackups: number;
    byCategory: Record<string, number>;
    totalSize: number;
    lastBackup: string | null;
  }> {
    const manifest = await this.loadManifest();

    const byCategory = manifest.backups.reduce(
      (acc, backup) => {
        acc[backup.category] = (acc[backup.category] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const totalSize = manifest.backups.reduce((sum, backup) => sum + backup.size, 0);

    return {
      totalBackups: manifest.backups.length,
      byCategory,
      totalSize,
      lastBackup: manifest.lastBackup,
    };
  }

  async markBackupAsVerified(backupId: string): Promise<void> {
    const manifest = await this.loadManifest();
    const backup = manifest.backups.find((b) => b.backupId === backupId);

    if (backup) {
      backup.verified = true;
      manifest.lastVerification = new Date().toISOString();
      await this.saveManifest(manifest);
    }
  }

  async getRecentBackups(limit: number = 10): Promise<BackupMetadata[]> {
    const manifest = await this.loadManifest();
    return manifest.backups
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);
  }

  async getManifest(): Promise<BackupManifest> {
    return this.loadManifest();
  }

  async needsBackup(): Promise<boolean> {
    return this.shouldCreateBackup();
  }

  async markBackupVerified(fileName: string): Promise<void> {
    const manifest = await this.loadManifest();
    const backup = manifest.backups.find((b) => b.filePath.includes(fileName));

    if (backup) {
      backup.verified = true;
      manifest.lastVerification = new Date().toISOString();
      await this.saveManifest(manifest);
      logger.info('BackupScheduler', 'Backup marked as verified', { fileName });
    }
  }
}

// Singleton instance
let schedulerInstance: BackupScheduler | null = null;

export function getBackupScheduler(): BackupScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new BackupScheduler();
  }
  return schedulerInstance;
}
