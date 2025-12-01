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
     * FIX 4.1: Now includes filename being processed
     * FIX 4.3: Now includes importId for cancellation
     */
    updateProgress(current: number, total: number, filename?: string, importId?: string) {
      update(state => {
        if (state.activeJob) {
          return {
            ...state,
            activeJob: {
              ...state.activeJob,
              processedFiles: current,
              totalFiles: total,
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

export const importProgress = derived(importStore, $store => {
  if (!$store.activeJob) return null;
  const job = $store.activeJob;
  const percent = job.totalFiles > 0
    ? Math.round((job.processedFiles / job.totalFiles) * 100)
    : 0;
  return {
    current: job.processedFiles,
    total: job.totalFiles,
    percent,
    locationName: job.locationName,
    locid: job.locid,
    // FIX 4.1: Include current filename
    currentFilename: job.currentFilename,
  };
});

// Derived store for recent completed jobs
export const recentImports = derived(importStore, $store => $store.recentJobs);
