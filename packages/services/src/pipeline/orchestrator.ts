/**
 * Pipeline Orchestrator
 *
 * Manages spawning and coordination of pipeline tools:
 * - wake-n-blake (hashing, import, provenance)
 * - shoemaker (thumbnails, video proxies)
 * - visual-buffet (ML tagging)
 * - national-treasure (web archiving)
 *
 * Features:
 * - Progress socket communication
 * - Concurrent job management
 * - Pause/resume/cancel support
 * - Timeout handling
 * - Error aggregation
 */

import { spawn, type ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import { ProgressServer, createProgressServer } from './progress-server';
import type {
  PipelineTool,
  PipelineStatus,
  PipelineConfig,
  PipelineJobConfig,
  PipelineJobResult,
  ProgressMessage,
  DEFAULT_PIPELINE_CONFIG,
} from './types';

/**
 * Active job tracking
 */
interface ActiveJob {
  sessionId: string;
  tool: PipelineTool;
  process: ChildProcess;
  startTime: number;
  status: PipelineStatus;
  lastProgress?: ProgressMessage;
  stdout: string[];
  stderr: string[];
  resolve: (result: PipelineJobResult) => void;
  reject: (error: Error) => void;
  timeoutId?: NodeJS.Timeout;
}

/**
 * Pipeline Orchestrator
 *
 * Coordinates pipeline tools with progress tracking and control.
 */
export class PipelineOrchestrator {
  private progressServer: ProgressServer;
  private activeJobs: Map<string, ActiveJob> = new Map();
  private config: PipelineConfig;
  private isStarted = false;

  constructor(config?: Partial<PipelineConfig>) {
    this.config = {
      tools: {
        'wake-n-blake': { executable: 'wnb' },
        shoemaker: { executable: 'shoemaker' },
        'visual-buffet': { executable: 'visual-buffet' },
        'national-treasure': { executable: 'nt' },
      },
      socketPath: '/tmp/aa-pipeline.sock',
      defaultTimeout: 300000,
      maxConcurrency: 4,
      ...config,
    };
    this.progressServer = createProgressServer(this.config.socketPath);
  }

  /**
   * Start the orchestrator
   */
  async start(): Promise<void> {
    if (this.isStarted) return;

    await this.progressServer.start();

    // Listen for progress messages
    this.progressServer.addListener((sessionId, message) => {
      this.handleProgress(sessionId, message);
    });

    this.isStarted = true;
    console.log('[Orchestrator] Started');
  }

  /**
   * Stop the orchestrator
   */
  async stop(): Promise<void> {
    if (!this.isStarted) return;

    // Cancel all active jobs
    for (const sessionId of this.activeJobs.keys()) {
      await this.cancel(sessionId, 'Orchestrator stopping');
    }

    await this.progressServer.stop();
    this.isStarted = false;
    console.log('[Orchestrator] Stopped');
  }

  /**
   * Run a pipeline job
   */
  async run(jobConfig: PipelineJobConfig): Promise<PipelineJobResult> {
    if (!this.isStarted) {
      await this.start();
    }

    // Check concurrency limit
    if (this.activeJobs.size >= this.config.maxConcurrency) {
      return {
        sessionId: '',
        tool: jobConfig.tool,
        status: 'failed',
        exitCode: null,
        error: `Maximum concurrency (${this.config.maxConcurrency}) reached`,
        durationMs: 0,
      };
    }

    const sessionId = randomUUID();
    const toolConfig = this.config.tools[jobConfig.tool];

    if (!toolConfig) {
      return {
        sessionId,
        tool: jobConfig.tool,
        status: 'failed',
        exitCode: null,
        error: `Unknown tool: ${jobConfig.tool}`,
        durationMs: 0,
      };
    }

    const executable = toolConfig.executable;
    const args = [...(toolConfig.defaultArgs || []), ...jobConfig.args];

    // Build environment with progress socket
    const env = {
      ...process.env,
      ...toolConfig.env,
      ...jobConfig.env,
      PROGRESS_SOCKET: this.config.socketPath,
      PROGRESS_SESSION_ID: sessionId,
    };

    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      try {
        const proc = spawn(executable, args, {
          cwd: jobConfig.cwd,
          env,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        const job: ActiveJob = {
          sessionId,
          tool: jobConfig.tool,
          process: proc,
          startTime,
          status: 'running',
          stdout: [],
          stderr: [],
          resolve,
          reject,
        };

        this.activeJobs.set(sessionId, job);

        // Capture stdout/stderr
        proc.stdout?.on('data', (data) => {
          job.stdout.push(data.toString());
        });

        proc.stderr?.on('data', (data) => {
          job.stderr.push(data.toString());
        });

        // Handle process exit
        proc.on('close', (exitCode) => {
          this.handleProcessExit(sessionId, exitCode);
        });

        proc.on('error', (err) => {
          this.handleProcessError(sessionId, err);
        });

        // Setup timeout
        const timeout = jobConfig.timeout ?? this.config.defaultTimeout;
        if (timeout > 0) {
          job.timeoutId = setTimeout(() => {
            this.handleTimeout(sessionId);
          }, timeout);
        }

        // Handle abort signal
        if (jobConfig.signal) {
          jobConfig.signal.addEventListener('abort', () => {
            this.cancel(sessionId, 'Aborted by signal');
          });
        }

        // Forward progress to caller
        if (jobConfig.onProgress) {
          const originalListener = jobConfig.onProgress;
          this.progressServer.addListener((sid, msg) => {
            if (sid === sessionId) {
              originalListener(msg);
            }
          });
        }

        console.log(`[Orchestrator] Started job ${sessionId}: ${executable} ${args.join(' ')}`);

      } catch (err) {
        resolve({
          sessionId,
          tool: jobConfig.tool,
          status: 'failed',
          exitCode: null,
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - startTime,
        });
      }
    });
  }

  /**
   * Cancel a running job
   */
  async cancel(sessionId: string, reason?: string): Promise<boolean> {
    const job = this.activeJobs.get(sessionId);
    if (!job) return false;

    // Send cancel command via socket
    this.progressServer.cancel(sessionId, reason);

    // Kill process after grace period
    setTimeout(() => {
      if (job.process && !job.process.killed) {
        job.process.kill('SIGTERM');

        // Force kill after 5 seconds
        setTimeout(() => {
          if (job.process && !job.process.killed) {
            job.process.kill('SIGKILL');
          }
        }, 5000);
      }
    }, 1000);

    job.status = 'cancelled';
    return true;
  }

  /**
   * Pause a running job
   */
  pause(sessionId: string, reason?: string): boolean {
    const job = this.activeJobs.get(sessionId);
    if (!job || job.status !== 'running') return false;

    const sent = this.progressServer.pause(sessionId, reason);
    if (sent) {
      job.status = 'paused';
    }
    return sent;
  }

  /**
   * Resume a paused job
   */
  resume(sessionId: string): boolean {
    const job = this.activeJobs.get(sessionId);
    if (!job || job.status !== 'paused') return false;

    const sent = this.progressServer.resume(sessionId);
    if (sent) {
      job.status = 'running';
    }
    return sent;
  }

  /**
   * Get job status
   */
  getStatus(sessionId: string): PipelineStatus | null {
    const job = this.activeJobs.get(sessionId);
    return job?.status ?? null;
  }

  /**
   * Get last progress for a job
   */
  getProgress(sessionId: string): ProgressMessage | null {
    const job = this.activeJobs.get(sessionId);
    return job?.lastProgress ?? null;
  }

  /**
   * Get all active job IDs
   */
  getActiveJobs(): string[] {
    return Array.from(this.activeJobs.keys());
  }

  /**
   * Handle progress message from child
   */
  private handleProgress(sessionId: string, message: ProgressMessage): void {
    const job = this.activeJobs.get(sessionId);
    if (!job) return;

    job.lastProgress = message;

    if (message.type === 'complete') {
      job.status = 'completed';
    } else if (message.type === 'error') {
      job.status = 'failed';
    }
  }

  /**
   * Handle process exit
   */
  private handleProcessExit(sessionId: string, exitCode: number | null): void {
    const job = this.activeJobs.get(sessionId);
    if (!job) return;

    // Clear timeout
    if (job.timeoutId) {
      clearTimeout(job.timeoutId);
    }

    const durationMs = Date.now() - job.startTime;
    const status: PipelineStatus =
      exitCode === 0 ? 'completed' :
      job.status === 'cancelled' ? 'cancelled' : 'failed';

    const result: PipelineJobResult = {
      sessionId,
      tool: job.tool,
      status,
      exitCode,
      durationMs,
      stdout: job.stdout.join(''),
      stderr: job.stderr.join(''),
      error: status === 'failed' ? job.stderr.join('').trim() || `Exit code ${exitCode}` : undefined,
    };

    this.activeJobs.delete(sessionId);
    job.resolve(result);

    console.log(`[Orchestrator] Job ${sessionId} ${status} (exit ${exitCode}, ${durationMs}ms)`);
  }

  /**
   * Handle process error
   */
  private handleProcessError(sessionId: string, error: Error): void {
    const job = this.activeJobs.get(sessionId);
    if (!job) return;

    // Clear timeout
    if (job.timeoutId) {
      clearTimeout(job.timeoutId);
    }

    const durationMs = Date.now() - job.startTime;

    const result: PipelineJobResult = {
      sessionId,
      tool: job.tool,
      status: 'failed',
      exitCode: null,
      durationMs,
      stdout: job.stdout.join(''),
      stderr: job.stderr.join(''),
      error: error.message,
    };

    this.activeJobs.delete(sessionId);
    job.resolve(result);

    console.log(`[Orchestrator] Job ${sessionId} error: ${error.message}`);
  }

  /**
   * Handle job timeout
   */
  private handleTimeout(sessionId: string): void {
    const job = this.activeJobs.get(sessionId);
    if (!job) return;

    console.log(`[Orchestrator] Job ${sessionId} timed out`);

    job.status = 'failed';

    // Kill the process
    if (job.process && !job.process.killed) {
      job.process.kill('SIGTERM');

      setTimeout(() => {
        if (job.process && !job.process.killed) {
          job.process.kill('SIGKILL');
        }
      }, 5000);
    }
  }

  /**
   * Get socket path for manual configuration
   */
  getSocketPath(): string {
    return this.config.socketPath;
  }
}

/**
 * Create pipeline orchestrator
 */
export function createPipelineOrchestrator(
  config?: Partial<PipelineConfig>
): PipelineOrchestrator {
  return new PipelineOrchestrator(config);
}

/**
 * Convenience methods for common pipeline operations
 */
export const PipelineHelpers = {
  /**
   * Run wake-n-blake import
   */
  async import(
    orchestrator: PipelineOrchestrator,
    source: string,
    dest: string,
    options?: {
      sidecar?: boolean;
      dedup?: boolean;
      detectDevice?: boolean;
      batch?: string;
      onProgress?: (progress: ProgressMessage) => void;
      signal?: AbortSignal;
    }
  ): Promise<PipelineJobResult> {
    const args = ['import', source, dest];
    if (options?.sidecar) args.push('--sidecar');
    if (options?.dedup) args.push('--dedup');
    if (options?.detectDevice) args.push('--detect-device');
    if (options?.batch) args.push('--batch', options.batch);

    return orchestrator.run({
      tool: 'wake-n-blake',
      args,
      onProgress: options?.onProgress,
      signal: options?.signal,
    });
  },

  /**
   * Run shoemaker thumbnail generation
   */
  async thumbnail(
    orchestrator: PipelineOrchestrator,
    path: string,
    options?: {
      preset?: 'fast' | 'quality' | 'portable';
      recursive?: boolean;
      proxy?: boolean;
      onProgress?: (progress: ProgressMessage) => void;
      signal?: AbortSignal;
    }
  ): Promise<PipelineJobResult> {
    const args = ['thumb', path];
    if (options?.preset) args.push('--preset', options.preset);
    if (options?.recursive) args.push('-r');
    if (options?.proxy) args.push('--proxy');

    return orchestrator.run({
      tool: 'shoemaker',
      args,
      onProgress: options?.onProgress,
      signal: options?.signal,
    });
  },

  /**
   * Run visual-buffet tagging
   */
  async tag(
    orchestrator: PipelineOrchestrator,
    path: string,
    options?: {
      size?: 'little' | 'small' | 'large' | 'huge';
      plugins?: string[];
      recursive?: boolean;
      onProgress?: (progress: ProgressMessage) => void;
      signal?: AbortSignal;
    }
  ): Promise<PipelineJobResult> {
    const args = ['tag', path];
    if (options?.size) args.push('--size', options.size);
    if (options?.plugins) {
      for (const plugin of options.plugins) {
        args.push('--plugin', plugin);
      }
    }
    if (options?.recursive) args.push('-r');

    return orchestrator.run({
      tool: 'visual-buffet',
      args,
      onProgress: options?.onProgress,
      signal: options?.signal,
    });
  },

  /**
   * Run national-treasure capture
   */
  async capture(
    orchestrator: PipelineOrchestrator,
    url: string,
    options?: {
      formats?: ('screenshot' | 'pdf' | 'html' | 'warc')[];
      output?: string;
      visible?: boolean;
      onProgress?: (progress: ProgressMessage) => void;
      signal?: AbortSignal;
    }
  ): Promise<PipelineJobResult> {
    const args = ['capture', 'url', url];
    if (options?.formats) args.push('--formats', options.formats.join(','));
    if (options?.output) args.push('--output', options.output);
    if (options?.visible) args.push('--visible');

    return orchestrator.run({
      tool: 'national-treasure',
      args,
      onProgress: options?.onProgress,
      signal: options?.signal,
    });
  },
};
