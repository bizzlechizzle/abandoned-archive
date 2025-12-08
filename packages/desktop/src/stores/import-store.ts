/**
 * Global import state management
 * Tracks active and recent import jobs across the app
 */
import { writable, derived } from 'svelte/store';

export interface ImportJob {
  id: string;
  locid: string;
  locationName: string;
  totalFiles: number;
  processedFiles: number;
  // OPT-088: Percent from orchestrator (weighted by step, not just file count)
  percent: number;
  // FIX 4.1: Track current filename being processed
  currentFilename?: string;
  // FIX 4.3: Track import ID for cancellation
  importId?: string;
  status: 'pending' | 'running' | 'completed' | 'error' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  imported?: number;
  duplicates?: number;
  errors?: number;
}

interface ImportState {
  activeJob: ImportJob | null;
  recentJobs: ImportJob[];
}

function createImportStore() {
  const { subscribe, set, update } = writable<ImportState>({
    activeJob: null,
    recentJobs: [],
  });

  return {
    subscribe,

    /**
     * Start a new import job
     */
    startJob(locid: string, locationName: string, totalFiles: number): string {
      const job: ImportJob = {
        id: crypto.randomUUID(),
        locid,
        locationName,
        totalFiles,
        processedFiles: 0,
        percent: 0,  // OPT-088: Initialize at 0, will be updated by orchestrator
        status: 'running',
        startedAt: new Date(),
      };
      update(state => ({ ...state, activeJob: job }));
      return job.id;
    },

    /**
     * Set the importId for the active job (called immediately when import starts)
     * FIX: This ensures cancel works before any progress events arrive
     */
    setImportId(importId: string) {
      update(state => {
        if (state.activeJob) {
          return {
            ...state,
            activeJob: {
              ...state.activeJob,
              importId,
            },
          };
        }
        return state;
      });
    },

    /**
     * Update progress of active job
     * OPT-088: Now accepts percent from orchestrator (weighted by step)
     * FIX 4.1: Now includes filename being processed
     * FIX 4.3: Now includes importId for cancellation
     */
    updateProgress(current: number, total: number, percent: number, filename?: string, importId?: string) {
      update(state => {
        if (state.activeJob) {
          return {
            ...state,
            activeJob: {
              ...state.activeJob,
              processedFiles: current,
              totalFiles: total,
              percent,  // OPT-088: Use orchestrator's weighted percent
              currentFilename: filename,
              importId: importId || state.activeJob.importId,
            },
          };
        }
        return state;
      });
    },

    /**
     * FIX 4.3: Cancel active import
     * Returns true if cancel was successful, false if no importId available
     */
    async cancelImport(): Promise<boolean> {
      let importId: string | undefined;
      update(state => {
        importId = state.activeJob?.importId;
        if (state.activeJob) {
          return {
            ...state,
            activeJob: {
              ...state.activeJob,
              status: 'cancelled' as const,
            },
          };
        }
        return state;
      });

      if (!importId) {
        console.warn('[importStore] Cannot cancel: no importId available yet');
        return false;
      }

      if (window.electronAPI?.media?.cancelImport) {
        try {
          await window.electronAPI.media.cancelImport(importId);
          return true;
        } catch (e) {
          console.error('Failed to cancel import:', e);
          return false;
        }
      }
      return false;
    },

    /**
     * Mark job as complete (success or error)
     */
    completeJob(results?: { imported: number; duplicates: number; errors: number }, error?: string) {
      update(state => {
        if (state.activeJob) {
          const completedJob: ImportJob = {
            ...state.activeJob,
            status: error ? 'error' : 'completed',
            completedAt: new Date(),
            processedFiles: state.activeJob.totalFiles,
            error,
            imported: results?.imported,
            duplicates: results?.duplicates,
            errors: results?.errors,
          };
          return {
            activeJob: null,
            recentJobs: [completedJob, ...state.recentJobs.slice(0, 9)],
          };
        }
        return state;
      });
    },

    /**
     * Clear all import history
     */
    clear() {
      set({ activeJob: null, recentJobs: [] });
    },

    /**
     * Clear just the recent jobs
     */
    clearRecent() {
      update(state => ({ ...state, recentJobs: [] }));
    },
  };
}

export const importStore = createImportStore();

// Derived store for quick checks
export const isImporting = derived(importStore, $store => $store.activeJob !== null);

/**
 * OPT-104: Sandbagged progress display
 *
 * Problem: Backend emits chunky progress (step-weighted percent, filesProcessed stays 0 until end)
 * Solution: Interpolate display values for smooth, premium feel
 *
 * Rules:
 * - displayPercent increments by exactly 1 at a time (no jumps, shows every number 0-100)
 * - Creeps toward targetPercent (real + small buffer) at steady pace
 * - displayCurrent = interpolated from displayPercent
 */
interface SandbaggingState {
  targetPercent: number;    // Where we're heading (real percent from backend)
  displayPercent: number;   // What we show (increments by 1, never jumps)
  intervalId: ReturnType<typeof setInterval> | null;
}

const sandbagging: SandbaggingState = {
  targetPercent: 0,
  displayPercent: 0,
  intervalId: null,
};

// Writable store to trigger UI updates from interval
const sandbaggingTrigger = writable(0);

// Start/stop sandbagging interval based on import state
importStore.subscribe($store => {
  if ($store.activeJob && !sandbagging.intervalId) {
    // Start sandbagging at 0
    sandbagging.targetPercent = 0;
    sandbagging.displayPercent = 0;
    sandbagging.intervalId = setInterval(() => {
      // Calculate target: real percent + 2% buffer (but cap at 99 until truly done)
      const realPercent = Math.round($store.activeJob?.percent ?? 0);
      sandbagging.targetPercent = Math.min(realPercent + 2, 99);

      // Increment display by exactly 1 toward target (no jumps)
      if (sandbagging.displayPercent < sandbagging.targetPercent) {
        sandbagging.displayPercent += 1;
        sandbaggingTrigger.update(n => n + 1);
      }
    }, 150); // Update every 150ms = ~6-7 seconds to go 0→100 if unthrottled
  } else if (!$store.activeJob && sandbagging.intervalId) {
    // Stop sandbagging interval
    clearInterval(sandbagging.intervalId);
    sandbagging.intervalId = null;
    sandbagging.targetPercent = 0;
    sandbagging.displayPercent = 0;
  }
});

export const importProgress = derived([importStore, sandbaggingTrigger], ([$store]) => {
  if (!$store.activeJob) return null;
  const job = $store.activeJob;

  // If job completed (100%), snap to 100
  const realPercent = Math.round(job.percent);
  const displayPercent = realPercent >= 100 ? 100 : sandbagging.displayPercent;

  // Interpolate current from display percent
  const displayCurrent = Math.round((displayPercent / 100) * job.totalFiles);

  return {
    current: displayCurrent,
    total: job.totalFiles,
    percent: displayPercent,
    locationName: job.locationName,
    locid: job.locid,
    currentFilename: job.currentFilename,
  };
});

// Derived store for recent completed jobs
export const recentImports = derived(importStore, $store => $store.recentJobs);
