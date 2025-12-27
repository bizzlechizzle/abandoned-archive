/**
 * Dispatch Hub Integration Store
 *
 * Manages connection to dispatch hub for distributed job processing:
 * - Connection state and authentication
 * - Job submission and tracking
 * - Worker status monitoring
 * - Offline queue management
 *
 * Adapted from: dispatch/sme/electron-integration-guide.md
 */
import { writable, derived } from 'svelte/store';
import { toasts } from './toast-store';

// ============================================
// Types
// ============================================

export interface DispatchJob {
  jobId: string;
  type: 'import' | 'thumbnail' | 'tag' | 'capture';
  plugin: string;
  status: 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  stage?: string;
  result?: unknown;
  error?: string;
  workerId?: string;
  retryCount?: number;
  movedToDLQ?: boolean;
  submittedAt: Date;
  completedAt?: Date;
}

export interface DispatchWorker {
  id: string;
  name: string;
  status: string;
  capabilities: string[];
  plugins: string[];
}

export interface QueuedJob {
  id: string;
  job: {
    type: 'import' | 'thumbnail' | 'tag' | 'capture';
    plugin: string;
    priority?: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW' | 'BULK';
    data: {
      source: string;
      destination?: string;
      options?: Record<string, unknown>;
    };
  };
  createdAt: number;
  attempts: number;
}

interface DispatchState {
  connected: boolean;
  authenticated: boolean;
  hubUrl: string;
  jobs: Map<string, DispatchJob>;
  workers: DispatchWorker[];
  queuedJobs: QueuedJob[];
  isLoading: boolean;
  error: string | null;
}

// ============================================
// Store Creation
// ============================================

function createDispatchStore() {
  const initialState: DispatchState = {
    connected: false,
    authenticated: false,
    hubUrl: 'http://192.168.1.199:3000',
    jobs: new Map(),
    workers: [],
    queuedJobs: [],
    isLoading: false,
    error: null,
  };

  const { subscribe, set, update } = writable<DispatchState>(initialState);

  // Track cleanup functions for event listeners
  let cleanupFunctions: Array<() => void> = [];

  return {
    subscribe,

    /**
     * Initialize the store and set up event listeners
     */
    async initialize(): Promise<void> {
      if (!window.electronAPI?.dispatch) {
        console.warn('[DispatchStore] Dispatch API not available');
        return;
      }

      const api = window.electronAPI.dispatch;

      // Get initial status
      try {
        const status = await api.getStatus();
        update(state => ({
          ...state,
          connected: status.connected,
          authenticated: status.authenticated,
          hubUrl: status.hubUrl,
        }));

        // Load queued jobs
        const queued = await api.getQueuedJobs();
        update(state => ({ ...state, queuedJobs: queued }));

        // If connected, load workers
        if (status.connected && status.authenticated) {
          await this.refreshWorkers();
        }
      } catch (error) {
        console.error('[DispatchStore] Failed to get initial status:', error);
      }

      // Set up event listeners
      cleanupFunctions.push(
        api.onConnectionChange((connected) => {
          update(state => ({ ...state, connected }));
          if (connected) {
            toasts.success('Connected to Dispatch Hub');
            this.refreshWorkers();
          } else {
            toasts.warning('Disconnected from Dispatch Hub');
          }
        })
      );

      cleanupFunctions.push(
        api.onAuthRequired(() => {
          update(state => ({ ...state, authenticated: false }));
          toasts.info('Dispatch Hub authentication required');
        })
      );

      cleanupFunctions.push(
        api.onJobProgress((data) => {
          update(state => {
            const jobs = new Map(state.jobs);
            const existing = jobs.get(data.jobId);
            if (existing) {
              jobs.set(data.jobId, {
                ...existing,
                progress: data.progress,
                stage: data.stage,
              });
            }
            return { ...state, jobs };
          });
        })
      );

      cleanupFunctions.push(
        api.onJobUpdated((data) => {
          update(state => {
            const jobs = new Map(state.jobs);
            const existing = jobs.get(data.jobId);
            if (existing) {
              jobs.set(data.jobId, {
                ...existing,
                status: data.status,
                result: data.result,
                error: data.error,
                workerId: data.workerId,
                retryCount: data.retryCount,
                movedToDLQ: data.movedToDLQ,
                completedAt: ['completed', 'failed', 'cancelled'].includes(data.status)
                  ? new Date()
                  : undefined,
              });

              // Show toast for terminal states
              if (data.status === 'completed') {
                toasts.success(`Job ${data.jobId.slice(0, 8)} completed`);
              } else if (data.status === 'failed') {
                toasts.error(`Job ${data.jobId.slice(0, 8)} failed: ${data.error || 'Unknown error'}`);
              }
            }
            return { ...state, jobs };
          });
        })
      );

      cleanupFunctions.push(
        api.onJobQueued((data) => {
          toasts.info('Job queued for later (offline mode)');
          this.refreshQueuedJobs();
        })
      );

      cleanupFunctions.push(
        api.onJobQueueSynced((data) => {
          toasts.success(`Queued job synced as ${data.jobId.slice(0, 8)}`);
          this.refreshQueuedJobs();
        })
      );

      cleanupFunctions.push(
        api.onJobQueueFailed((data) => {
          toasts.error('Failed to sync queued job after 3 attempts');
          this.refreshQueuedJobs();
        })
      );
    },

    /**
     * Cleanup event listeners
     */
    destroy(): void {
      cleanupFunctions.forEach(fn => fn());
      cleanupFunctions = [];
    },

    // ============================================
    // Authentication
    // ============================================

    async login(username: string, password: string): Promise<boolean> {
      if (!window.electronAPI?.dispatch) return false;

      update(state => ({ ...state, isLoading: true, error: null }));

      try {
        const success = await window.electronAPI.dispatch.login(username, password);
        update(state => ({
          ...state,
          authenticated: success,
          isLoading: false,
        }));

        if (success) {
          toasts.success('Logged in to Dispatch Hub');
          await this.refreshWorkers();
        }

        return success;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Login failed';
        update(state => ({ ...state, isLoading: false, error: message }));
        toasts.error(message);
        return false;
      }
    },

    async logout(): Promise<void> {
      if (!window.electronAPI?.dispatch) return;

      await window.electronAPI.dispatch.logout();
      update(state => ({
        ...state,
        authenticated: false,
        connected: false,
        workers: [],
        jobs: new Map(),
      }));
      toasts.info('Logged out from Dispatch Hub');
    },

    // ============================================
    // Job Operations
    // ============================================

    async submitJob(job: {
      type: 'import' | 'thumbnail' | 'tag' | 'capture';
      plugin: string;
      priority?: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW' | 'BULK';
      data: {
        source: string;
        destination?: string;
        options?: Record<string, unknown>;
      };
    }): Promise<string | null> {
      if (!window.electronAPI?.dispatch) return null;

      try {
        const jobId = await window.electronAPI.dispatch.submitJob(job);

        // Track the job locally
        const isQueued = jobId.startsWith('queued:');
        const dispatchJob: DispatchJob = {
          jobId,
          type: job.type,
          plugin: job.plugin,
          status: isQueued ? 'queued' : 'pending',
          progress: 0,
          submittedAt: new Date(),
        };

        update(state => {
          const jobs = new Map(state.jobs);
          jobs.set(jobId, dispatchJob);
          return { ...state, jobs };
        });

        return jobId;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to submit job';
        toasts.error(message);
        return null;
      }
    },

    async cancelJob(jobId: string): Promise<void> {
      if (!window.electronAPI?.dispatch) return;

      try {
        await window.electronAPI.dispatch.cancelJob(jobId);
        update(state => {
          const jobs = new Map(state.jobs);
          const existing = jobs.get(jobId);
          if (existing) {
            jobs.set(jobId, { ...existing, status: 'cancelled' });
          }
          return { ...state, jobs };
        });
        toasts.info(`Job ${jobId.slice(0, 8)} cancelled`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to cancel job';
        toasts.error(message);
      }
    },

    async getJob(jobId: string): Promise<DispatchJob | null> {
      if (!window.electronAPI?.dispatch) return null;

      const result = await window.electronAPI.dispatch.getJob(jobId);
      if (!result) return null;

      // Update local state
      update(state => {
        const jobs = new Map(state.jobs);
        const existing = jobs.get(jobId);
        jobs.set(jobId, {
          jobId: result.jobId,
          type: existing?.type || 'import',
          plugin: existing?.plugin || 'unknown',
          status: result.status,
          progress: existing?.progress || 0,
          result: result.result,
          error: result.error,
          workerId: result.workerId,
          retryCount: result.retryCount,
          movedToDLQ: result.movedToDLQ,
          submittedAt: existing?.submittedAt || new Date(),
          completedAt: existing?.completedAt,
        });
        return { ...state, jobs };
      });

      return null;
    },

    // ============================================
    // Worker Operations
    // ============================================

    async refreshWorkers(): Promise<void> {
      if (!window.electronAPI?.dispatch) return;

      try {
        const workers = await window.electronAPI.dispatch.listWorkers();
        update(state => ({ ...state, workers }));
      } catch (error) {
        console.error('[DispatchStore] Failed to refresh workers:', error);
      }
    },

    // ============================================
    // Queue Operations
    // ============================================

    async refreshQueuedJobs(): Promise<void> {
      if (!window.electronAPI?.dispatch) return;

      try {
        const queuedJobs = await window.electronAPI.dispatch.getQueuedJobs();
        update(state => ({ ...state, queuedJobs }));
      } catch (error) {
        console.error('[DispatchStore] Failed to refresh queued jobs:', error);
      }
    },

    // ============================================
    // Configuration
    // ============================================

    async setHubUrl(url: string): Promise<void> {
      if (!window.electronAPI?.dispatch) return;

      await window.electronAPI.dispatch.setHubUrl(url);
      update(state => ({ ...state, hubUrl: url }));
    },

    async checkConnection(): Promise<boolean> {
      if (!window.electronAPI?.dispatch) return false;

      try {
        return await window.electronAPI.dispatch.checkConnection();
      } catch {
        return false;
      }
    },

    /**
     * Clear error state
     */
    clearError(): void {
      update(state => ({ ...state, error: null }));
    },
  };
}

// ============================================
// Export Store Instance
// ============================================

export const dispatchStore = createDispatchStore();

// ============================================
// Derived Stores
// ============================================

/** Whether connected to dispatch hub */
export const isDispatchConnected = derived(
  dispatchStore,
  $store => $store.connected
);

/** Whether authenticated with dispatch hub */
export const isDispatchAuthenticated = derived(
  dispatchStore,
  $store => $store.authenticated
);

/** Connection status: 'connected' | 'authenticated' | 'disconnected' */
export const dispatchConnectionStatus = derived(
  dispatchStore,
  $store => {
    if ($store.connected && $store.authenticated) return 'authenticated';
    if ($store.connected) return 'connected';
    return 'disconnected';
  }
);

/** Number of active (running) jobs */
export const activeJobCount = derived(
  dispatchStore,
  $store => Array.from($store.jobs.values()).filter(j => j.status === 'running').length
);

/** Number of jobs in offline queue */
export const queuedJobCount = derived(
  dispatchStore,
  $store => $store.queuedJobs.length
);

/** All workers */
export const dispatchWorkers = derived(
  dispatchStore,
  $store => $store.workers
);

/** Online workers only */
export const onlineWorkers = derived(
  dispatchStore,
  $store => $store.workers.filter(w => w.status === 'online')
);

/** Active jobs list */
export const activeJobs = derived(
  dispatchStore,
  $store => Array.from($store.jobs.values()).filter(
    j => ['pending', 'running', 'queued'].includes(j.status)
  )
);

/** Recent completed jobs (last 10) */
export const recentJobs = derived(
  dispatchStore,
  $store => Array.from($store.jobs.values())
    .filter(j => ['completed', 'failed', 'cancelled'].includes(j.status))
    .sort((a, b) => (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0))
    .slice(0, 10)
);
