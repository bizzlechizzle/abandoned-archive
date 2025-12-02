/**
 * Health IPC Handlers
 * Handles health:* IPC channels
 */
import { ipcMain } from 'electron';
import { getHealthMonitor } from '../../services/health-monitor';
import { getBackupScheduler } from '../../services/backup-scheduler';
import { getIntegrityChecker } from '../../services/integrity-checker';
import { getDiskSpaceMonitor } from '../../services/disk-space-monitor';
import { getMaintenanceScheduler } from '../../services/maintenance-scheduler';
import { getRecoverySystem } from '../../services/recovery-system';

export function registerHealthHandlers() {
  ipcMain.handle('health:getDashboard', async () => {
    try {
      const healthMonitor = getHealthMonitor();
      return await healthMonitor.getDashboardData();
    } catch (error) {
      console.error('Error getting health dashboard:', error);
      throw error;
    }
  });

  ipcMain.handle('health:getStatus', async () => {
    try {
      const healthMonitor = getHealthMonitor();
      return await healthMonitor.getHealthStatus();
    } catch (error) {
      console.error('Error getting health status:', error);
      throw error;
    }
  });

  ipcMain.handle('health:runCheck', async () => {
    try {
      const healthMonitor = getHealthMonitor();
      return await healthMonitor.runHealthCheck();
    } catch (error) {
      console.error('Error running health check:', error);
      throw error;
    }
  });

  ipcMain.handle('health:createBackup', async () => {
    try {
      const backupScheduler = getBackupScheduler();
      const result = await backupScheduler.createBackup();
      return result;
    } catch (error) {
      console.error('Error creating backup:', error);
      throw error;
    }
  });

  ipcMain.handle('health:getBackupStats', async () => {
    try {
      const backupScheduler = getBackupScheduler();
      return await backupScheduler.getBackupStats();
    } catch (error) {
      console.error('Error getting backup stats:', error);
      throw error;
    }
  });

  ipcMain.handle('health:getDiskSpace', async () => {
    try {
      const diskSpaceMonitor = getDiskSpaceMonitor();
      return await diskSpaceMonitor.checkDiskSpace();
    } catch (error) {
      console.error('Error checking disk space:', error);
      throw error;
    }
  });

  ipcMain.handle('health:checkIntegrity', async () => {
    try {
      const integrityChecker = getIntegrityChecker();
      return await integrityChecker.runFullCheck();
    } catch (error) {
      console.error('Error checking database integrity:', error);
      throw error;
    }
  });

  /**
   * Check for locations with GPS but missing region fields.
   * Returns a list of locations that need region data backfilled.
   * Use this to find "silent enrichment failures" where GPS was applied
   * but geocoding/region calculation failed.
   */
  ipcMain.handle('health:checkLocationDataIntegrity', async () => {
    try {
      const integrityChecker = getIntegrityChecker();
      return await integrityChecker.checkLocationDataIntegrity();
    } catch (error) {
      console.error('Error checking location data integrity:', error);
      throw error;
    }
  });

  ipcMain.handle('health:runMaintenance', async () => {
    try {
      const maintenanceScheduler = getMaintenanceScheduler();
      return await maintenanceScheduler.runFullMaintenance('manual');
    } catch (error) {
      console.error('Error running maintenance:', error);
      throw error;
    }
  });

  ipcMain.handle('health:getMaintenanceSchedule', async () => {
    try {
      const maintenanceScheduler = getMaintenanceScheduler();
      return maintenanceScheduler.getSchedule();
    } catch (error) {
      console.error('Error getting maintenance schedule:', error);
      throw error;
    }
  });

  ipcMain.handle('health:getRecoveryState', async () => {
    try {
      const recoverySystem = getRecoverySystem();
      return recoverySystem.getState();
    } catch (error) {
      console.error('Error getting recovery state:', error);
      throw error;
    }
  });

  ipcMain.handle('health:attemptRecovery', async () => {
    try {
      const recoverySystem = getRecoverySystem();
      return await recoverySystem.attemptRecovery();
    } catch (error) {
      console.error('Error attempting recovery:', error);
      throw error;
    }
  });
}
