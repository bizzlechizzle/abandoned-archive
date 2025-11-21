import { app, dialog } from 'electron';
import { join } from 'path';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import { getLogger } from './logger-service';
import { getIntegrityChecker } from './integrity-checker';
import { getBackupScheduler } from './backup-scheduler';
import type { IntegrityResult } from './integrity-checker';
import type { BackupMetadata } from './backup-scheduler';

const logger = getLogger();

export interface RecoveryResult {
  success: boolean;
  action: 'none' | 'backup_restored' | 'read_only_mode' | 'emergency_backup';
  message: string;
  backupUsed?: BackupMetadata;
  timestamp: string;
  duration: number;
}

export interface RecoveryState {
  isInReadOnlyMode: boolean;
  lastRecoveryAttempt: string | null;
  recoveryAttemptCount: number;
  canAttemptRecovery: boolean;
}

/**
 * Recovery System
 * Handles automated recovery from database corruption and failures
 */
export class RecoverySystem {
  private readonly MAX_RECOVERY_ATTEMPTS = 3;
  private readonly RECOVERY_COOLDOWN = 5 * 60 * 1000; // 5 minutes

  private dbPath: string;
  private recoveryState: RecoveryState;

  constructor() {
    this.dbPath = join(app.getPath('userData'), 'au-archive.db');
    this.recoveryState = {
      isInReadOnlyMode: false,
      lastRecoveryAttempt: null,
      recoveryAttemptCount: 0,
      canAttemptRecovery: true,
    };
  }

  /**
   * Get current recovery state
   */
  getState(): RecoveryState {
    return { ...this.recoveryState };
  }

  /**
   * Check if recovery is needed
   */
  async checkNeedsRecovery(): Promise<boolean> {
    try {
      const integrityChecker = getIntegrityChecker();
      const result = await integrityChecker.runQuickCheck();
      return !result.isHealthy;
    } catch (error) {
      logger.error('RecoverySystem', 'Failed to check if recovery needed', error as Error);
      return true; // Assume recovery needed on error
    }
  }

  /**
   * Attempt automated recovery
   */
  async attemptRecovery(): Promise<RecoveryResult> {
    const startTime = Date.now();

    // Check if we can attempt recovery
    if (!this.recoveryState.canAttemptRecovery) {
      return {
        success: false,
        action: 'none',
        message: 'Recovery cooldown in effect',
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
      };
    }

    // Check if we've exceeded max attempts
    if (this.recoveryState.recoveryAttemptCount >= this.MAX_RECOVERY_ATTEMPTS) {
      logger.error(
        'RecoverySystem',
        'Max recovery attempts exceeded',
        undefined,
        this.recoveryState
      );
      return {
        success: false,
        action: 'none',
        message: `Max recovery attempts (${this.MAX_RECOVERY_ATTEMPTS}) exceeded`,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
      };
    }

    // Update recovery state
    this.recoveryState.lastRecoveryAttempt = new Date().toISOString();
    this.recoveryState.recoveryAttemptCount++;

    logger.info('RecoverySystem', 'Starting automated recovery', {
      attempt: this.recoveryState.recoveryAttemptCount,
      maxAttempts: this.MAX_RECOVERY_ATTEMPTS,
    });

    try {
      // Step 1: Verify corruption
      const integrityChecker = getIntegrityChecker();
      const integrityResult = await integrityChecker.runFullCheck();

      if (integrityResult.isHealthy) {
        logger.info('RecoverySystem', 'Database integrity verified - no recovery needed');
        this.resetRecoveryState();
        return {
          success: true,
          action: 'none',
          message: 'Database integrity verified',
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
        };
      }

      // Step 2: Enter read-only mode to prevent further damage
      this.recoveryState.isInReadOnlyMode = true;
      logger.warn('RecoverySystem', 'Database corrupted - entering read-only mode', {
        errors: integrityResult.errors,
      });

      // Step 3: Create emergency backup of corrupted database
      await this.createEmergencyBackup();

      // Step 4: Find most recent verified backup
      const backupScheduler = getBackupScheduler();
      const verifiedBackup = await this.findMostRecentVerifiedBackup();

      if (!verifiedBackup) {
        logger.error('RecoverySystem', 'No verified backup available for recovery');
        return {
          success: false,
          action: 'read_only_mode',
          message: 'No verified backup available - database in read-only mode',
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
        };
      }

      // Step 5: Restore from backup
      const restored = await this.restoreFromBackup(verifiedBackup);

      if (restored) {
        // Verify restored database
        const verifyResult = await integrityChecker.runFullCheck();

        if (verifyResult.isHealthy) {
          logger.info('RecoverySystem', 'Database successfully restored from backup', {
            backup: verifiedBackup.fileName,
          });
          this.resetRecoveryState();
          return {
            success: true,
            action: 'backup_restored',
            message: `Database restored from backup: ${verifiedBackup.fileName}`,
            backupUsed: verifiedBackup,
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime,
          };
        } else {
          logger.error('RecoverySystem', 'Restored database still corrupted', {
            errors: verifyResult.errors,
          });
        }
      }

      // Recovery failed - stay in read-only mode
      return {
        success: false,
        action: 'read_only_mode',
        message: 'Recovery failed - database in read-only mode',
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
      };
    } catch (error) {
      logger.error('RecoverySystem', 'Recovery process failed', error as Error);
      return {
        success: false,
        action: 'read_only_mode',
        message: `Recovery error: ${(error as Error).message}`,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
      };
    } finally {
      // Start cooldown timer
      this.recoveryState.canAttemptRecovery = false;
      setTimeout(() => {
        this.recoveryState.canAttemptRecovery = true;
      }, this.RECOVERY_COOLDOWN);
    }
  }

  /**
   * Find most recent verified backup
   */
  private async findMostRecentVerifiedBackup(): Promise<BackupMetadata | null> {
    try {
      const backupScheduler = getBackupScheduler();
      const manifest = await backupScheduler.getManifest();
      const integrityChecker = getIntegrityChecker();

      // Sort backups by timestamp (most recent first)
      const sortedBackups = manifest.backups.sort((a, b) =>
        b.timestamp.localeCompare(a.timestamp)
      );

      // Find first verified backup
      for (const backup of sortedBackups) {
        if (backup.verified && existsSync(backup.filePath)) {
          logger.info('RecoverySystem', 'Found verified backup', {
            fileName: backup.fileName,
            timestamp: backup.timestamp,
          });
          return backup;
        }

        // If not verified, verify it now
        if (existsSync(backup.filePath)) {
          logger.info('RecoverySystem', 'Verifying backup', { fileName: backup.fileName });
          const verifyResult = await integrityChecker.verifyBackupFile(backup.filePath);

          if (verifyResult.isHealthy) {
            // Update manifest to mark as verified
            await backupScheduler.markBackupVerified(backup.fileName);
            return backup;
          }
        }
      }

      return null;
    } catch (error) {
      logger.error('RecoverySystem', 'Failed to find verified backup', error as Error);
      return null;
    }
  }

  /**
   * Restore database from backup
   */
  private async restoreFromBackup(backup: BackupMetadata): Promise<boolean> {
    try {
      logger.info('RecoverySystem', 'Restoring database from backup', {
        fileName: backup.fileName,
      });

      // Close any open database connections first
      // Note: In production, you'd want to ensure all DB handles are closed

      // Copy backup to main database location
      await fs.copyFile(backup.filePath, this.dbPath);

      logger.info('RecoverySystem', 'Database file restored', {
        source: backup.filePath,
        destination: this.dbPath,
      });

      return true;
    } catch (error) {
      logger.error('RecoverySystem', 'Failed to restore from backup', error as Error, {
        backup: backup.fileName,
      });
      return false;
    }
  }

  /**
   * Create emergency backup of corrupted database
   */
  private async createEmergencyBackup(): Promise<void> {
    try {
      const emergencyDir = join(app.getPath('userData'), 'emergency-backups');
      if (!existsSync(emergencyDir)) {
        await fs.mkdir(emergencyDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const emergencyPath = join(emergencyDir, `corrupted-${timestamp}.db`);

      await fs.copyFile(this.dbPath, emergencyPath);

      logger.info('RecoverySystem', 'Emergency backup created', {
        path: emergencyPath,
      });
    } catch (error) {
      logger.error('RecoverySystem', 'Failed to create emergency backup', error as Error);
    }
  }

  /**
   * Reset recovery state after successful recovery
   */
  private resetRecoveryState(): void {
    this.recoveryState = {
      isInReadOnlyMode: false,
      lastRecoveryAttempt: null,
      recoveryAttemptCount: 0,
      canAttemptRecovery: true,
    };
  }

  /**
   * Manually exit read-only mode
   * Should only be called after manual intervention
   */
  exitReadOnlyMode(): void {
    logger.info('RecoverySystem', 'Exiting read-only mode');
    this.recoveryState.isInReadOnlyMode = false;
  }

  /**
   * Check database health and trigger recovery if needed
   */
  async checkAndRecover(): Promise<RecoveryResult | null> {
    const needsRecovery = await this.checkNeedsRecovery();

    if (!needsRecovery) {
      return null;
    }

    logger.warn('RecoverySystem', 'Database corruption detected - initiating recovery');
    return this.attemptRecovery();
  }

  /**
   * Show recovery dialog to user
   */
  async showRecoveryDialog(result: RecoveryResult): Promise<void> {
    let message = '';
    let type: 'info' | 'warning' | 'error' = 'info';

    if (result.success) {
      if (result.action === 'backup_restored') {
        type = 'warning';
        message = `Database corruption was detected and automatically repaired.\n\nYour database has been restored from backup: ${result.backupUsed?.fileName}\n\nSome recent changes may have been lost.`;
      } else {
        type = 'info';
        message = 'Database health verified successfully.';
      }
    } else {
      type = 'error';
      if (result.action === 'read_only_mode') {
        message = `Database corruption detected. The application is now in read-only mode to prevent further damage.\n\n${result.message}\n\nPlease contact support or restore from a manual backup.`;
      } else {
        message = `Recovery failed: ${result.message}`;
      }
    }

    await dialog.showMessageBox({
      type,
      title: 'Database Recovery',
      message,
      buttons: ['OK'],
    });
  }
}

// Singleton instance
let recoveryInstance: RecoverySystem | null = null;

export function getRecoverySystem(): RecoverySystem {
  if (!recoveryInstance) {
    recoveryInstance = new RecoverySystem();
  }
  return recoveryInstance;
}
