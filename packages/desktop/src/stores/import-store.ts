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
  status: 'pending' | 'running' | 'completed' | 'error';
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
     * Update progress of active job
     */
    updateProgress(current: number, total: number) {
      update(state => {
        if (state.activeJob) {
          return {
            ...state,
            activeJob: {
              ...state.activeJob,
              processedFiles: current,
              totalFiles: total,
            },
          };
        }
        return state;
      });
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
  };
});

// Derived store for recent completed jobs
export const recentImports = derived(importStore, $store => $store.recentJobs);
