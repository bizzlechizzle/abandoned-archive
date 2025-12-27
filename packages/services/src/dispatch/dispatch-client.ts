/**
 * Dispatch Client Service
 *
 * Handles all communication with the dispatch hub:
 * - Authentication (login, logout, token refresh)
 * - Socket.IO connection for real-time updates
 * - Job submission and tracking
 * - Offline queue management
 *
 * Platform-agnostic - uses injected TokenStorage.
 */

import { io, Socket } from 'socket.io-client';
import { EventEmitter } from 'events';
import { FileStorage } from './token-storage.js';
import type { OfflineQueue } from './offline-queue.js';
import type {
  DispatchConfig,
  TokenStorage,
  JobSubmission,
  JobProgress,
  JobUpdate,
  DispatchStatus,
  QueuedJob,
  Worker,
} from './types.js';

export interface DispatchClientOptions {
  config: DispatchConfig;
  tokenStorage?: TokenStorage;
}

export class DispatchClient extends EventEmitter {
  private socket: Socket | null = null;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private config: DispatchConfig;
  private tokenStorage: TokenStorage;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pendingJobs: Map<string, JobSubmission> = new Map();
  private _offlineQueue: OfflineQueue | null = null;
  private isOnline: boolean = false;

  constructor(options: DispatchClientOptions) {
    super();
    this.config = options.config;
    this.tokenStorage = options.tokenStorage || new FileStorage(options.config.dataDir);
    // OfflineQueue is lazy-loaded to avoid importing better-sqlite3 until needed
    this.loadStoredTokens();
  }

  /**
   * Lazy-load the offline queue to avoid importing better-sqlite3 at startup.
   * This allows the CLI to work without native module conflicts when only
   * using hub-only operations (status, workers, etc).
   *
   * Returns null if SQLite fails to load (e.g., native module version mismatch
   * when running CLI with different Node version than Electron).
   */
  private async getOfflineQueue(): Promise<OfflineQueue | null> {
    if (!this._offlineQueue) {
      try {
        const { OfflineQueue } = await import('./offline-queue.js');
        this._offlineQueue = new OfflineQueue(this.config.dataDir);
      } catch (error) {
        // SQLite native module likely has ABI mismatch (Electron vs Node.js)
        // This is expected when running CLI outside of Electron
        console.warn('[DispatchClient] Offline queue unavailable (SQLite native module issue)');
        return null;
      }
    }
    return this._offlineQueue;
  }

  // ============================================
  // Token Management
  // ============================================

  private loadStoredTokens(): void {
    try {
      const tokens = this.tokenStorage.load();
      if (tokens) {
        this.accessToken = tokens.accessToken;
        this.refreshToken = tokens.refreshToken;
      }
    } catch (error) {
      console.error('[DispatchClient] Failed to load stored tokens:', error);
      this.clearTokens();
    }
  }

  private saveTokens(accessToken: string, refreshToken: string): void {
    try {
      this.tokenStorage.save({ accessToken, refreshToken });
      this.accessToken = accessToken;
      this.refreshToken = refreshToken;
    } catch (error) {
      console.error('[DispatchClient] Failed to save tokens:', error);
    }
  }

  private clearTokens(): void {
    try {
      this.tokenStorage.clear();
    } catch (error) {
      // Ignore
    }
    this.accessToken = null;
    this.refreshToken = null;
  }

  // ============================================
  // Authentication
  // ============================================

  async login(username: string, password: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.hubUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { message?: string };
        throw new Error(errorData.message || 'Login failed');
      }

      const data = (await response.json()) as { accessToken: string; refreshToken: string };
      this.saveTokens(data.accessToken, data.refreshToken);

      // Connect socket after successful login
      this.connectSocket();

      return true;
    } catch (error) {
      this.emit('error', { type: 'auth', error });
      throw error;
    }
  }

  async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshToken) {
      return false;
    }

    try {
      const response = await fetch(`${this.config.hubUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });

      if (!response.ok) {
        this.clearTokens();
        this.emit('auth:required');
        return false;
      }

      const data = (await response.json()) as { accessToken: string; refreshToken: string };
      this.saveTokens(data.accessToken, data.refreshToken);
      return true;
    } catch (error) {
      this.clearTokens();
      this.emit('auth:required');
      return false;
    }
  }

  async logout(): Promise<void> {
    if (this.accessToken) {
      try {
        await fetch(`${this.config.hubUrl}/api/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.accessToken}` },
        });
      } catch (error) {
        // Ignore logout errors
      }
    }

    this.clearTokens();
    this.disconnectSocket();
    this.emit('auth:logout');
  }

  isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  // ============================================
  // Socket.IO Connection
  // ============================================

  private connectSocket(): void {
    if (this.socket?.connected) {
      return;
    }

    this.socket = io(this.config.hubUrl, {
      auth: { token: this.accessToken },
      reconnection: this.config.autoReconnect,
      reconnectionDelay: this.config.reconnectInterval,
      reconnectionAttempts: 10,
    });

    this.socket.on('connect', () => {
      this.isOnline = true;
      this.emit('connected');
      this.syncOfflineQueue();
    });

    this.socket.on('disconnect', (reason) => {
      this.isOnline = false;
      this.emit('disconnected', reason);
    });

    this.socket.on('connect_error', async (error) => {
      if (error.message.includes('unauthorized')) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed && this.socket) {
          this.socket.auth = { token: this.accessToken };
          this.socket.connect();
        }
      }
    });

    // Job events
    this.socket.on('job:progress', (data: JobProgress) => {
      this.emit('job:progress', data);
    });

    this.socket.on('job:updated', (data: JobUpdate) => {
      this.emit('job:updated', data);

      // Remove from pending if completed/failed
      if (['completed', 'failed', 'cancelled'].includes(data.status)) {
        this.pendingJobs.delete(data.jobId);
      }
    });
  }

  private disconnectSocket(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isOnline = false;
  }

  // ============================================
  // Offline Queue Sync
  // ============================================

  private async syncOfflineQueue(): Promise<void> {
    const offlineQueue = await this.getOfflineQueue();
    if (!offlineQueue) return; // Queue unavailable (CLI mode)

    const queued = offlineQueue.getAll();

    for (const item of queued) {
      if (item.attempts >= 3) {
        this.emit('job:queueFailed', { id: item.id, job: item.job });
        offlineQueue.remove(item.id);
        continue;
      }

      try {
        offlineQueue.incrementAttempts(item.id);
        const jobId = await this.submitJobOnline(item.job);
        offlineQueue.remove(item.id);
        this.emit('job:queueSynced', { queueId: item.id, jobId });
      } catch (error) {
        console.error(`[DispatchClient] Failed to sync queued job ${item.id}:`, error);
      }
    }
  }

  // ============================================
  // Job Operations
  // ============================================

  private async apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.config.hubUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${this.accessToken}`;
        const retryResponse = await fetch(url, { ...options, headers });
        if (!retryResponse.ok) {
          throw new Error(`API request failed: ${retryResponse.statusText}`);
        }
        return (await retryResponse.json()) as T;
      }
      throw new Error('Authentication required');
    }

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(errorData.message || `API request failed: ${response.statusText}`);
    }

    return (await response.json()) as T;
  }

  private async submitJobOnline(job: JobSubmission): Promise<string> {
    const result = await this.apiRequest<{ id: string }>('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        type: job.type,
        plugin: job.plugin,
        priority: job.priority || 'NORMAL',
        data: job.data,
      }),
    });

    // Track pending job for offline resilience
    this.pendingJobs.set(result.id, job);

    return result.id;
  }

  async submitJob(job: JobSubmission): Promise<string> {
    if (!this.isOnline) {
      // Queue for later
      const offlineQueue = await this.getOfflineQueue();
      if (!offlineQueue) {
        throw new Error('Cannot queue job: offline queue unavailable and hub is not reachable');
      }
      const queueId = offlineQueue.add(job);
      this.emit('job:queued', { queueId, job });
      return `queued:${queueId}`;
    }

    return this.submitJobOnline(job);
  }

  async getJob(jobId: string): Promise<JobUpdate | null> {
    try {
      const result = await this.apiRequest<{ job: JobUpdate }>(`/api/jobs/${jobId}`);
      return result.job;
    } catch (error) {
      return null;
    }
  }

  async cancelJob(jobId: string): Promise<void> {
    await this.apiRequest(`/api/jobs/${jobId}/cancel`, { method: 'POST' });
    this.pendingJobs.delete(jobId);
  }

  async listJobs(filter?: { status?: string; limit?: number }): Promise<JobUpdate[]> {
    const params = new URLSearchParams();
    if (filter?.status) params.set('status', filter.status);
    if (filter?.limit) params.set('limit', String(filter.limit));

    const query = params.toString();
    const result = await this.apiRequest<{ jobs: JobUpdate[] }>(
      `/api/jobs${query ? `?${query}` : ''}`
    );
    return result.jobs;
  }

  // ============================================
  // Worker Operations
  // ============================================

  async listWorkers(): Promise<Worker[]> {
    const result = await this.apiRequest<{ workers: Worker[] }>('/api/workers');
    return result.workers;
  }

  // ============================================
  // Connection Status
  // ============================================

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  async checkConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.hubUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  getStatus(): DispatchStatus {
    return {
      connected: this.isOnline,
      authenticated: this.isAuthenticated(),
      hubUrl: this.config.hubUrl,
      // Return 0 if queue not loaded - avoids importing better-sqlite3 for status checks
      queuedJobsCount: this._offlineQueue?.getCount() ?? 0,
    };
  }

  async getQueuedJobs(): Promise<QueuedJob[]> {
    const offlineQueue = await this.getOfflineQueue();
    if (!offlineQueue) {
      // Queue unavailable (CLI mode with native module mismatch)
      return [];
    }
    return offlineQueue.getAll();
  }

  // ============================================
  // Configuration
  // ============================================

  setHubUrl(url: string): void {
    this.config.hubUrl = url;
    // Reconnect if authenticated
    if (this.isAuthenticated()) {
      this.disconnectSocket();
      this.connectSocket();
    }
  }

  getHubUrl(): string {
    return this.config.hubUrl;
  }

  // ============================================
  // Lifecycle
  // ============================================

  async initialize(): Promise<void> {
    if (this.accessToken) {
      // Validate existing token
      const valid = await this.refreshAccessToken();
      if (valid) {
        this.connectSocket();
      } else {
        this.emit('auth:required');
      }
    } else {
      this.emit('auth:required');
    }
  }

  destroy(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.disconnectSocket();
    // Only close if it was initialized
    this._offlineQueue?.close();
    this.removeAllListeners();
  }
}

// ============================================
// Singleton Factory
// ============================================

let dispatchClientInstance: DispatchClient | null = null;

export interface CreateDispatchClientOptions {
  hubUrl?: string;
  dataDir?: string;
  tokenStorage?: TokenStorage;
}

/**
 * Get or create the dispatch client singleton.
 */
export function getDispatchClient(options?: CreateDispatchClientOptions): DispatchClient {
  if (!dispatchClientInstance) {
    const hubUrl = options?.hubUrl || process.env.DISPATCH_HUB_URL || 'http://192.168.1.199:3000';
    const dataDir = options?.dataDir || process.env.DISPATCH_DATA_DIR;

    dispatchClientInstance = new DispatchClient({
      config: {
        hubUrl,
        autoReconnect: true,
        reconnectInterval: 5000,
        dataDir: dataDir || '',
      },
      tokenStorage: options?.tokenStorage,
    });
  }
  return dispatchClientInstance;
}

/**
 * Destroy the dispatch client singleton.
 */
export function destroyDispatchClient(): void {
  if (dispatchClientInstance) {
    dispatchClientInstance.destroy();
    dispatchClientInstance = null;
  }
}
