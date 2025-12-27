<script lang="ts">
  /**
   * DispatchStatus.svelte
   *
   * Shows dispatch hub connection status with:
   * - Connection indicator (dot + text)
   * - Worker count
   * - Queued job count (if offline)
   *
   * Adapted from: dispatch/sme/electron-integration-guide.md
   */

  import {
    dispatchStore,
    dispatchConnectionStatus,
    onlineWorkers,
    queuedJobCount,
  } from '../stores/dispatch-store';

  // Status colors
  const statusColors: Record<string, string> = {
    authenticated: 'bg-green-500',
    connected: 'bg-amber-500',
    disconnected: 'bg-red-500',
  };

  const statusText: Record<string, string> = {
    authenticated: 'Connected',
    connected: 'Not authenticated',
    disconnected: 'Disconnected',
  };
</script>

<div class="dispatch-status flex items-center gap-2 text-sm">
  <!-- Connection dot -->
  <span
    class="w-2 h-2 rounded-full {statusColors[$dispatchConnectionStatus]}"
    title="Dispatch Hub: {statusText[$dispatchConnectionStatus]}"
  ></span>

  <!-- Status text -->
  <span class="text-surface-600 dark:text-surface-400">
    {statusText[$dispatchConnectionStatus]}
  </span>

  <!-- Worker count if connected -->
  {#if $dispatchConnectionStatus === 'authenticated'}
    <span class="text-surface-400 dark:text-surface-500">
      ({$onlineWorkers.length} worker{$onlineWorkers.length !== 1 ? 's' : ''})
    </span>
  {/if}

  <!-- Queued jobs if any -->
  {#if $queuedJobCount > 0}
    <span class="text-amber-600 dark:text-amber-400" title="Jobs queued for later sync">
      ({$queuedJobCount} queued)
    </span>
  {/if}
</div>
