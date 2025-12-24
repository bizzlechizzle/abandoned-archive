/**
 * Pipeline types for orchestrating external tools
 *
 * Defines the progress protocol and configuration for spawning
 * wake-n-blake, shoemaker, visual-buffet, and national-treasure.
 */

/**
 * Pipeline tool identifiers
 */
export type PipelineTool =
  | 'wake-n-blake'
  | 'shoemaker'
  | 'visual-buffet'
  | 'national-treasure';

/**
 * Pipeline status
 */
export type PipelineStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Progress message from child process
 * Matches the protocol used by all pipeline tools
 */
export interface ProgressMessage {
  type: 'progress' | 'ack' | 'complete' | 'error';
  timestamp: string;
  session_id: string;
  app: PipelineTool;
  app_version: string;
  stage?: {
    name: string;
    display_name: string;
    number: number;
    total_stages: number;
  };
  items?: {
    total: number;
    completed: number;
  };
  current?: {
    item?: string;
  };
  percent_complete: number;
  timing?: {
    eta_ms?: number;
    elapsed_ms?: number;
  };
  error?: string;
}

/**
 * Control message to child process
 */
export interface ControlMessage {
  type: 'control';
  command: 'pause' | 'resume' | 'cancel';
  reason?: string;
}

/**
 * Pipeline job configuration
 */
export interface PipelineJobConfig {
  /**
   * Tool to run
   */
  tool: PipelineTool;

  /**
   * Command arguments
   */
  args: string[];

  /**
   * Working directory
   */
  cwd?: string;

  /**
   * Environment variables (merged with process.env)
   */
  env?: Record<string, string>;

  /**
   * Timeout in milliseconds (0 = no timeout)
   */
  timeout?: number;

  /**
   * Progress callback
   */
  onProgress?: (progress: ProgressMessage) => void;

  /**
   * Abort signal
   */
  signal?: AbortSignal;
}

/**
 * Pipeline job result
 */
export interface PipelineJobResult {
  /**
   * Job session ID
   */
  sessionId: string;

  /**
   * Tool that was run
   */
  tool: PipelineTool;

  /**
   * Exit status
   */
  status: PipelineStatus;

  /**
   * Exit code (0 = success)
   */
  exitCode: number | null;

  /**
   * Error message if failed
   */
  error?: string;

  /**
   * Duration in milliseconds
   */
  durationMs: number;

  /**
   * Stdout output
   */
  stdout?: string;

  /**
   * Stderr output
   */
  stderr?: string;
}

/**
 * Tool configuration
 */
export interface ToolConfig {
  /**
   * Path to executable
   */
  executable: string;

  /**
   * Default arguments
   */
  defaultArgs?: string[];

  /**
   * Environment variables
   */
  env?: Record<string, string>;
}

/**
 * Pipeline orchestrator configuration
 */
export interface PipelineConfig {
  /**
   * Tool configurations
   */
  tools: Partial<Record<PipelineTool, ToolConfig>>;

  /**
   * Progress socket path
   */
  socketPath: string;

  /**
   * Default timeout for jobs (ms)
   */
  defaultTimeout: number;

  /**
   * Maximum concurrent jobs
   */
  maxConcurrency: number;
}

/**
 * Default pipeline configuration
 */
export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  tools: {
    'wake-n-blake': {
      executable: 'wnb',
      defaultArgs: [],
    },
    shoemaker: {
      executable: 'shoemaker',
      defaultArgs: [],
    },
    'visual-buffet': {
      executable: 'visual-buffet',
      defaultArgs: [],
    },
    'national-treasure': {
      executable: 'nt',
      defaultArgs: [],
    },
  },
  socketPath: '/tmp/aa-pipeline.sock',
  defaultTimeout: 300000, // 5 minutes
  maxConcurrency: 4,
};
