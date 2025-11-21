import { getLogger } from './logger-service';
import { getBackupScheduler } from './backup-scheduler';
import { getIntegrityChecker } from './integrity-checker';
import { getDiskSpaceMonitor } from './disk-space-monitor';
import { getWalCheckpointScheduler } from './wal-checkpoint-scheduler';
import { getMetricsCollector } from './metrics-collector';
import { getMaintenanceScheduler } from './maintenance-scheduler';
import type { BackupManifest } from './backup-scheduler';
import type { IntegrityResult } from './integrity-checker';
import type { DiskSpaceInfo } from './disk-space-monitor';
import type { WalStats } from './wal-checkpoint-scheduler';
import type { SystemMetrics } from './metrics-collector';
import type { MaintenanceSchedule } from './maintenance-scheduler';

const logger = getLogger();

export interface HealthStatus {
  overall: 'healthy' | 'warning' | 'critical' | 'error';
  components: {
    database: ComponentHealth;
    backups: ComponentHealth;
    diskSpace: ComponentHealth;
    performance: ComponentHealth;
    maintenance: ComponentHealth;
  };
  lastCheck: string;
  recommendations: string[];
}

export interface ComponentHealth {
  status: 'healthy' | 'warning' | 'critical' | 'error';
  message: string;
  details?: Record<string, unknown>;
}

export interface HealthDashboardData {
  status: HealthStatus;
  backupManifest: BackupManifest;
  diskSpace: DiskSpaceInfo;
  walStats: WalStats;
  metrics: SystemMetrics;
  maintenanceSchedule: MaintenanceSchedule;
  lastIntegrityCheck: IntegrityResult | null;
}

/**
 * Health Monitor
 * Coordinates all monitoring systems and provides unified health status
 */
export class HealthMonitor {
  private lastIntegrityCheck: IntegrityResult | null = null;
  private isInitialized = false;
  private checkInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize all monitoring systems
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('HealthMonitor', 'Already initialized');
      return;
    }

    logger.info('HealthMonitor', 'Initializing all monitoring systems');
    const startTime = Date.now();

    try {
      // Initialize all subsystems
      const logger = getLogger();
      await logger.initialize();

      const metricsCollector = getMetricsCollector();
      await metricsCollector.initialize();

      const diskSpaceMonitor = getDiskSpaceMonitor();
      // Disk space monitor doesn't need initialization

      const walCheckpointScheduler = getWalCheckpointScheduler();
      await walCheckpointScheduler.initialize();

      const maintenanceScheduler = getMaintenanceScheduler();
      await maintenanceScheduler.initialize();

      const backupScheduler = getBackupScheduler();
      await backupScheduler.initialize();

      const integrityChecker = getIntegrityChecker();
      // Run initial quick check
      const quickCheck = await integrityChecker.runQuickCheck();
      this.lastIntegrityCheck = quickCheck;

      if (!quickCheck.isHealthy) {
        logger.error('HealthMonitor', 'Database integrity check failed on startup', undefined, {
          errors: quickCheck.errors,
        });
      }

      // Start periodic health checks
      this.startPeriodicChecks();

      const duration = Date.now() - startTime;
      metricsCollector.recordStartup(duration);

      this.isInitialized = true;
      logger.info('HealthMonitor', 'All monitoring systems initialized', { duration });
    } catch (error) {
      logger.error('HealthMonitor', 'Failed to initialize monitoring systems', error as Error);
      throw error;
    }
  }

  /**
   * Start periodic health checks
   */
  private startPeriodicChecks(): void {
    // Run health check every 5 minutes
    this.checkInterval = setInterval(async () => {
      await this.performPeriodicCheck();
    }, 5 * 60 * 1000);
  }

  /**
   * Perform periodic health check
   */
  private async performPeriodicCheck(): Promise<void> {
    try {
      // Check disk space
      const diskSpaceMonitor = getDiskSpaceMonitor();
      const diskSpace = await diskSpaceMonitor.checkDiskSpace();

      if (diskSpace.status === 'critical' || diskSpace.status === 'emergency') {
        logger.error('HealthMonitor', 'Critical disk space situation', undefined, {
          available: diskSpaceMonitor.formatSize(diskSpace.available),
          status: diskSpace.status,
        });
      }

      // Check if backup is needed
      const backupScheduler = getBackupScheduler();
      const needsBackup = await backupScheduler.needsBackup();
      if (needsBackup) {
        logger.info('HealthMonitor', 'Scheduled backup needed, triggering');
        await backupScheduler.createBackup();
      }

      // Persist metrics daily at midnight
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() < 5) {
        const metricsCollector = getMetricsCollector();
        await metricsCollector.persistDailyMetrics();
      }

      // Run integrity check every 6 hours
      const sixHoursMs = 6 * 60 * 60 * 1000;
      if (
        !this.lastIntegrityCheck ||
        Date.now() - new Date(this.lastIntegrityCheck.timestamp).getTime() > sixHoursMs
      ) {
        logger.info('HealthMonitor', 'Running scheduled integrity check');
        const integrityChecker = getIntegrityChecker();
        this.lastIntegrityCheck = await integrityChecker.runQuickCheck();

        if (!this.lastIntegrityCheck.isHealthy) {
          logger.error(
            'HealthMonitor',
            'Integrity check detected issues',
            undefined,
            this.lastIntegrityCheck
          );
        }
      }
    } catch (error) {
      logger.error('HealthMonitor', 'Error during periodic health check', error as Error);
    }
  }

  /**
   * Get current health status
   */
  async getHealthStatus(): Promise<HealthStatus> {
    const recommendations: string[] = [];

    // Check database integrity
    const integrityChecker = getIntegrityChecker();
    const integrityResult = this.lastIntegrityCheck || (await integrityChecker.runQuickCheck());
    const databaseHealth: ComponentHealth = {
      status: integrityResult.isHealthy ? 'healthy' : 'critical',
      message: integrityResult.isHealthy
        ? 'Database integrity verified'
        : `Database has ${integrityResult.errors.length} integrity issues`,
      details: {
        errors: integrityResult.errors,
        warnings: integrityResult.warnings,
        lastCheck: integrityResult.timestamp,
      },
    };

    if (!integrityResult.isHealthy) {
      recommendations.push('Database integrity issues detected - consider restoring from backup');
    }

    // Check backups
    const backupScheduler = getBackupScheduler();
    const manifest = await backupScheduler.getManifest();
    const needsBackup = await backupScheduler.needsBackup();
    let backupStatus: ComponentHealth['status'] = 'healthy';
    let backupMessage = `${manifest.backups.length} backups available`;

    if (manifest.backups.length === 0) {
      backupStatus = 'critical';
      backupMessage = 'No backups available';
      recommendations.push('Create your first backup immediately');
    } else if (needsBackup) {
      backupStatus = 'warning';
      backupMessage = 'Backup overdue';
      recommendations.push('Backup is overdue - will be created automatically');
    }

    const backupsHealth: ComponentHealth = {
      status: backupStatus,
      message: backupMessage,
      details: {
        count: manifest.backups.length,
        lastBackup: manifest.lastBackup,
        needsBackup,
      },
    };

    // Check disk space
    const diskSpaceMonitor = getDiskSpaceMonitor();
    const diskSpace = await diskSpaceMonitor.checkDiskSpace();
    const diskSpaceHealth: ComponentHealth = {
      status: diskSpace.status === 'healthy' ? 'healthy' : diskSpace.status === 'warning' ? 'warning' : 'critical',
      message: `${diskSpaceMonitor.formatSize(diskSpace.available)} available`,
      details: {
        available: diskSpace.available,
        total: diskSpace.total,
        percentUsed: diskSpace.percentUsed,
      },
    };

    if (diskSpace.status === 'warning') {
      recommendations.push('Disk space is low - consider freeing up space');
    } else if (diskSpace.status === 'critical') {
      recommendations.push('Critical disk space - some operations may be blocked');
    } else if (diskSpace.status === 'emergency') {
      recommendations.push('Emergency disk space - most operations are blocked');
    }

    // Check performance metrics
    const metricsCollector = getMetricsCollector();
    const systemMetrics = metricsCollector.getSystemMetrics();
    let performanceStatus: ComponentHealth['status'] = 'healthy';
    let performanceMessage = 'Performance normal';

    if (systemMetrics.slowQueryCount > 10) {
      performanceStatus = 'warning';
      performanceMessage = `${systemMetrics.slowQueryCount} slow queries detected`;
      recommendations.push('Multiple slow queries detected - consider running ANALYZE');
    }

    if (systemMetrics.avgQueryDuration > 1000) {
      performanceStatus = 'warning';
      performanceMessage = 'High average query duration';
      recommendations.push('Query performance is degraded - consider database maintenance');
    }

    const performanceHealth: ComponentHealth = {
      status: performanceStatus,
      message: performanceMessage,
      details: systemMetrics,
    };

    // Check maintenance status
    const maintenanceScheduler = getMaintenanceScheduler();
    const schedule = maintenanceScheduler.getSchedule();
    const needsVacuum = maintenanceScheduler.needsVacuum();
    const needsAnalyze = maintenanceScheduler.needsAnalyze();

    let maintenanceStatus: ComponentHealth['status'] = 'healthy';
    let maintenanceMessage = 'Maintenance up to date';

    if (needsVacuum || needsAnalyze) {
      maintenanceStatus = 'warning';
      const needed = [];
      if (needsVacuum) needed.push('VACUUM');
      if (needsAnalyze) needed.push('ANALYZE');
      maintenanceMessage = `${needed.join(' and ')} needed`;
      recommendations.push(`Database maintenance needed: ${needed.join(' and ')}`);
    }

    const maintenanceHealth: ComponentHealth = {
      status: maintenanceStatus,
      message: maintenanceMessage,
      details: schedule,
    };

    // Determine overall status
    const statuses = [
      databaseHealth.status,
      backupsHealth.status,
      diskSpaceHealth.status,
      performanceHealth.status,
      maintenanceHealth.status,
    ];

    let overall: HealthStatus['overall'] = 'healthy';
    if (statuses.includes('critical')) {
      overall = 'critical';
    } else if (statuses.includes('warning')) {
      overall = 'warning';
    } else if (statuses.includes('error')) {
      overall = 'error';
    }

    return {
      overall,
      components: {
        database: databaseHealth,
        backups: backupsHealth,
        diskSpace: diskSpaceHealth,
        performance: performanceHealth,
        maintenance: maintenanceHealth,
      },
      lastCheck: new Date().toISOString(),
      recommendations,
    };
  }

  /**
   * Get complete dashboard data
   */
  async getDashboardData(): Promise<HealthDashboardData> {
    const backupScheduler = getBackupScheduler();
    const diskSpaceMonitor = getDiskSpaceMonitor();
    const walCheckpointScheduler = getWalCheckpointScheduler();
    const metricsCollector = getMetricsCollector();
    const maintenanceScheduler = getMaintenanceScheduler();

    return {
      status: await this.getHealthStatus(),
      backupManifest: await backupScheduler.getManifest(),
      diskSpace: await diskSpaceMonitor.checkDiskSpace(),
      walStats: await walCheckpointScheduler.getWalStats(),
      metrics: metricsCollector.getSystemMetrics(),
      maintenanceSchedule: maintenanceScheduler.getSchedule(),
      lastIntegrityCheck: this.lastIntegrityCheck,
    };
  }

  /**
   * Run manual health check
   */
  async runHealthCheck(): Promise<HealthStatus> {
    logger.info('HealthMonitor', 'Running manual health check');

    // Run fresh integrity check
    const integrityChecker = getIntegrityChecker();
    this.lastIntegrityCheck = await integrityChecker.runFullCheck();

    return this.getHealthStatus();
  }

  /**
   * Shutdown monitoring systems
   */
  async shutdown(): Promise<void> {
    logger.info('HealthMonitor', 'Shutting down monitoring systems');

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Persist final metrics
    const metricsCollector = getMetricsCollector();
    await metricsCollector.persistDailyMetrics();

    // Stop WAL checkpoint monitoring
    const walCheckpointScheduler = getWalCheckpointScheduler();
    walCheckpointScheduler.stopIdleMonitoring();

    this.isInitialized = false;
  }
}

// Singleton instance
let monitorInstance: HealthMonitor | null = null;

export function getHealthMonitor(): HealthMonitor {
  if (!monitorInstance) {
    monitorInstance = new HealthMonitor();
  }
  return monitorInstance;
}
