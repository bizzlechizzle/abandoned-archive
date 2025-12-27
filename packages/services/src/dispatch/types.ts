/**
 * Dispatch Types
 *
 * Shared type definitions for dispatch hub integration.
 * Used by both CLI and Electron implementations.
 */

// Import shared types to avoid conflicts
import type { JobType, JobStatus } from '../shared/types.js';

// Re-export for convenience
export type { JobType, JobStatus };

// ============================================
// Configuration
// ============================================

export interface DispatchConfig {
  hubUrl: string;
  autoReconnect: boolean;
  reconnectInterval: number;
  dataDir: string;
}

// ============================================
// Token Storage
// ============================================

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface TokenStorage {
  save(tokens: TokenPair): void;
  load(): TokenPair | null;
  clear(): void;
}

// ============================================
// Jobs
// ============================================

export type JobPriority = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW' | 'BULK';

export interface JobSubmission {
  type: JobType;
  plugin: string;
  priority?: JobPriority;
  data: {
    source: string;
    destination?: string;
    options?: Record<string, unknown>;
  };
}

export interface JobProgress {
  jobId: string;
  progress: number;
  stage?: string;
}

export interface JobUpdate {
  jobId: string;
  status: JobStatus;
  result?: unknown;
  error?: string;
  workerId?: string;
  retryCount?: number;
  movedToDLQ?: boolean;
}

// ============================================
// Workers
// ============================================

export interface Worker {
  id: string;
  name: string;
  status: 'online' | 'busy' | 'offline';
  capabilities: string[];
  plugins: string[];
}

// ============================================
// Status
// ============================================

export interface DispatchStatus {
  connected: boolean;
  authenticated: boolean;
  hubUrl: string;
}

// ============================================
// Events
// ============================================

export interface DispatchClientEvents {
  connected: () => void;
  disconnected: (reason?: string) => void;
  'auth:required': () => void;
  'auth:logout': () => void;
  'job:progress': (data: JobProgress) => void;
  'job:updated': (data: JobUpdate) => void;
  error: (data: { type: string; error: unknown }) => void;
}
