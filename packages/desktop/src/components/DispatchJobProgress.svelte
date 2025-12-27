<script lang="ts">
  /**
   * DispatchJobProgress.svelte
   *
   * Shows progress for dispatch jobs with:
   * - Job type and plugin
   * - Progress bar with percentage
   * - Current stage
   * - Cancel button for running jobs
   *
   * Adapted from: dispatch/sme/electron-integration-guide.md
   */

  import { dispatchStore, activeJobs, type DispatchJob } from '../stores/dispatch-store';

  // Status icons
  const statusIcons: Record<string, string> = {
    pending: '○',
    queued: '◌',
    running: '↻',
    completed: '✓',
    failed: '✗',
    cancelled: '−',
  };

  // Status colors
  const statusColors: Record<string, string> = {
    pending: 'text-surface-500',
    queued: 'text-amber-500',
    running: 'text-blue-500',
    completed: 'text-green-500',
    failed: 'text-red-500',
    cancelled: 'text-surface-400',
  };

  // Progress bar colors
  const progressColors: Record<string, string> = {
    pending: 'bg-surface-300',
    queued: 'bg-amber-400',
    running: 'bg-blue-500',
    completed: 'bg-green-500',
    failed: 'bg-red-500',
    cancelled: 'bg-surface-400',
  };

  function formatJobType(type: string): string {
    return type.charAt(0).toUpperCase() + type.slice(1);
  }

  async function handleCancel(jobId: string) {
    await dispatchStore.cancelJob(jobId);
  }
</script>

{#if $activeJobs.length > 0}
  <div class="dispatch-jobs space-y-3">
    {#each $activeJobs as job (job.jobId)}
      <div
        class="job-card rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-50 dark:bg-surface-800 p-3"
      >
        <!-- Header -->
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <span class="text-lg {statusColors[job.status]}">
              {statusIcons[job.status]}
            </span>
            <span class="font-medium text-surface-900 dark:text-surface-100">
              {formatJobType(job.type)}
            </span>
            <span class="text-sm text-surface-500 dark:text-surface-400">
              ({job.plugin})
            </span>
          </div>

          {#if job.status === 'running' || job.status === 'pending'}
            <button
              class="text-sm text-surface-500 hover:text-red-500 transition-colors"
              on:click={() => handleCancel(job.jobId)}
              title="Cancel job"
            >
              Cancel
            </button>
          {/if}
        </div>

        <!-- Progress bar -->
        <div class="h-2 bg-surface-200 dark:bg-surface-700 rounded-full overflow-hidden mb-1">
          <div
            class="h-full {progressColors[job.status]} transition-all duration-300"
            style="width: {job.progress}%"
          ></div>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-between text-xs text-surface-500 dark:text-surface-400">
          <span>
            {#if job.stage}
              {job.stage}
            {:else if job.status === 'queued'}
              Waiting for connection...
            {:else if job.status === 'pending'}
              Waiting for worker...
            {:else}
              {job.status}
            {/if}
          </span>
          <span>{job.progress}%</span>
        </div>

        <!-- Error message -->
        {#if job.error}
          <div class="mt-2 p-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700">
            <p class="text-xs text-red-700 dark:text-red-300">
              {job.error}
            </p>
          </div>
        {/if}

        <!-- Worker info -->
        {#if job.workerId}
          <div class="mt-1 text-xs text-surface-400 dark:text-surface-500">
            Worker: {job.workerId.slice(0, 8)}
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .dispatch-jobs {
    max-width: 400px;
  }

  .job-card {
    animation: fadeIn 200ms ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
