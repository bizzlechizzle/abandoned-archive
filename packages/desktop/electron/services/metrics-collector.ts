import { app } from 'electron';
import { join } from 'path';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import { getLogger } from './logger-service';

const logger = getLogger();

export interface OperationMetric {
  operation: string;
  duration: number;
  timestamp: string;
  success: boolean;
  metadata?: Record<string, unknown>;
}

export interface MetricsSummary {
  operation: string;
  count: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  successRate: number;
  lastRun: string | null;
}

export interface DailyMetrics {
  date: string;
  summaries: MetricsSummary[];
  alerts: string[];
}

export interface SystemMetrics {
  startupTime: number | null;
  lastStartup: string | null;
  totalOperations: number;
  avgQueryDuration: number;
  slowQueryCount: number;
  errorCount: number;
}

/**
 * Metrics Collector
 * Tracks performance metrics for database operations and system health
 */
export class MetricsCollector {
  private readonly ROLLING_WINDOW_SIZE = 100; // Keep last 100 operations in memory
  private readonly SLOW_QUERY_THRESHOLD = 5000; // 5 seconds
  private readonly METRICS_FILE = 'metrics.json';

  private metricsDir: string;
  private metricsFilePath: string;
  private recentMetrics: Map<string, OperationMetric[]> = new Map();
  private startupTime: number | null = null;
  private startupTimestamp: string | null = null;

  constructor() {
    this.metricsDir = join(app.getPath('userData'), 'metrics');
    this.metricsFilePath = join(this.metricsDir, this.METRICS_FILE);
  }

  /**
   * Initialize metrics collector
   */
  async initialize(): Promise<void> {
    logger.info('MetricsCollector', 'Initializing metrics collector');

    // Create metrics directory if it doesn't exist
    if (!existsSync(this.metricsDir)) {
      await fs.mkdir(this.metricsDir, { recursive: true });
    }

    // Record startup time
    this.startupTime = Date.now();
    this.startupTimestamp = new Date().toISOString();
  }

  /**
   * Record startup completion
   * @param duration Startup duration in milliseconds
   */
  recordStartup(duration: number): void {
    this.startupTime = duration;
    this.recordMetric('startup', duration, true, {
      timestamp: this.startupTimestamp,
    });

    if (duration > 3000) {
      logger.warn('MetricsCollector', 'Slow startup detected', {
        duration,
        threshold: 3000,
      });
    }
  }

  /**
   * Record an operation metric
   */
  recordMetric(
    operation: string,
    duration: number,
    success: boolean,
    metadata?: Record<string, unknown>
  ): void {
    const metric: OperationMetric = {
      operation,
      duration,
      timestamp: new Date().toISOString(),
      success,
      metadata,
    };

    // Add to rolling window
    if (!this.recentMetrics.has(operation)) {
      this.recentMetrics.set(operation, []);
    }

    const metrics = this.recentMetrics.get(operation)!;
    metrics.push(metric);

    // Trim to rolling window size
    if (metrics.length > this.ROLLING_WINDOW_SIZE) {
      metrics.shift();
    }

    // Alert on slow queries
    if (duration > this.SLOW_QUERY_THRESHOLD) {
      logger.warn('MetricsCollector', 'Slow operation detected', {
        operation,
        duration,
        threshold: this.SLOW_QUERY_THRESHOLD,
        metadata,
      });
    }
  }

  /**
   * Track a timed operation
   * @returns A function to call when the operation completes
   */
  startTimer(operation: string, metadata?: Record<string, unknown>): () => void {
    const startTime = Date.now();
    return (success: boolean = true) => {
      const duration = Date.now() - startTime;
      this.recordMetric(operation, duration, success, metadata);
    };
  }

  /**
   * Get summary for a specific operation
   */
  getSummary(operation: string): MetricsSummary | null {
    const metrics = this.recentMetrics.get(operation);
    if (!metrics || metrics.length === 0) {
      return null;
    }

    const durations = metrics.map((m) => m.duration);
    const successCount = metrics.filter((m) => m.success).length;

    return {
      operation,
      count: metrics.length,
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      successRate: (successCount / metrics.length) * 100,
      lastRun: metrics[metrics.length - 1].timestamp,
    };
  }

  /**
   * Get summaries for all operations
   */
  getAllSummaries(): MetricsSummary[] {
    const summaries: MetricsSummary[] = [];

    for (const operation of this.recentMetrics.keys()) {
      const summary = this.getSummary(operation);
      if (summary) {
        summaries.push(summary);
      }
    }

    return summaries.sort((a, b) => b.count - a.count);
  }

  /**
   * Get system-wide metrics
   */
  getSystemMetrics(): SystemMetrics {
    const allMetrics: OperationMetric[] = [];
    let errorCount = 0;
    let slowQueryCount = 0;

    for (const metrics of this.recentMetrics.values()) {
      allMetrics.push(...metrics);
      errorCount += metrics.filter((m) => !m.success).length;
      slowQueryCount += metrics.filter((m) => m.duration > this.SLOW_QUERY_THRESHOLD).length;
    }

    const queryMetrics = allMetrics.filter(
      (m) =>
        m.operation.includes('query') ||
        m.operation.includes('find') ||
        m.operation.includes('get')
    );
    const avgQueryDuration =
      queryMetrics.length > 0
        ? queryMetrics.reduce((sum, m) => sum + m.duration, 0) / queryMetrics.length
        : 0;

    return {
      startupTime: this.startupTime,
      lastStartup: this.startupTimestamp,
      totalOperations: allMetrics.length,
      avgQueryDuration,
      slowQueryCount,
      errorCount,
    };
  }

  /**
   * Persist daily metrics to disk
   */
  async persistDailyMetrics(): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const summaries = this.getAllSummaries();
      const systemMetrics = this.getSystemMetrics();

      // Check for alerts
      const alerts: string[] = [];
      if (systemMetrics.slowQueryCount > 10) {
        alerts.push(`${systemMetrics.slowQueryCount} slow queries detected`);
      }
      if (systemMetrics.errorCount > 5) {
        alerts.push(`${systemMetrics.errorCount} errors detected`);
      }
      if (systemMetrics.avgQueryDuration > 1000) {
        alerts.push(
          `High average query duration: ${systemMetrics.avgQueryDuration.toFixed(0)}ms`
        );
      }

      const dailyMetrics: DailyMetrics = {
        date: today,
        summaries,
        alerts,
      };

      // Load existing metrics file
      let allMetrics: DailyMetrics[] = [];
      if (existsSync(this.metricsFilePath)) {
        const content = await fs.readFile(this.metricsFilePath, 'utf-8');
        allMetrics = JSON.parse(content);
      }

      // Update or add today's metrics
      const existingIndex = allMetrics.findIndex((m) => m.date === today);
      if (existingIndex >= 0) {
        allMetrics[existingIndex] = dailyMetrics;
      } else {
        allMetrics.push(dailyMetrics);
      }

      // Keep only last 30 days
      allMetrics = allMetrics.slice(-30);

      // Write back to file
      await fs.writeFile(this.metricsFilePath, JSON.stringify(allMetrics, null, 2), 'utf-8');

      logger.info('MetricsCollector', 'Daily metrics persisted', {
        date: today,
        operationCount: summaries.length,
        alertCount: alerts.length,
      });
    } catch (error) {
      logger.error('MetricsCollector', 'Failed to persist daily metrics', error as Error);
    }
  }

  /**
   * Load historical metrics
   */
  async loadHistoricalMetrics(): Promise<DailyMetrics[]> {
    try {
      if (!existsSync(this.metricsFilePath)) {
        return [];
      }

      const content = await fs.readFile(this.metricsFilePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      logger.error('MetricsCollector', 'Failed to load historical metrics', error as Error);
      return [];
    }
  }

  /**
   * Get metrics for a specific date
   */
  async getMetricsForDate(date: string): Promise<DailyMetrics | null> {
    const historicalMetrics = await this.loadHistoricalMetrics();
    return historicalMetrics.find((m) => m.date === date) || null;
  }

  /**
   * Clear in-memory metrics
   */
  clearMetrics(): void {
    this.recentMetrics.clear();
    logger.info('MetricsCollector', 'In-memory metrics cleared');
  }

  /**
   * Get recent slow operations
   */
  getRecentSlowOperations(limit: number = 10): OperationMetric[] {
    const allMetrics: OperationMetric[] = [];

    for (const metrics of this.recentMetrics.values()) {
      allMetrics.push(...metrics.filter((m) => m.duration > this.SLOW_QUERY_THRESHOLD));
    }

    return allMetrics
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit: number = 10): OperationMetric[] {
    const allMetrics: OperationMetric[] = [];

    for (const metrics of this.recentMetrics.values()) {
      allMetrics.push(...metrics.filter((m) => !m.success));
    }

    return allMetrics
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }
}

// Singleton instance
let collectorInstance: MetricsCollector | null = null;

export function getMetricsCollector(): MetricsCollector {
  if (!collectorInstance) {
    collectorInstance = new MetricsCollector();
  }
  return collectorInstance;
}
