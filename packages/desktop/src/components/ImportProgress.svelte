<script lang="ts">
  import { importProgress, isImporting, importStore } from '../stores/import-store';

  // Estimate time remaining based on progress rate
  function formatTimeRemaining(startedAt: Date, current: number, total: number): string {
    if (current === 0) return '';
    const elapsedMs = Date.now() - startedAt.getTime();
    const msPerItem = elapsedMs / current;
    const remainingItems = total - current;
    const remainingMs = msPerItem * remainingItems;
    const remainingSeconds = Math.ceil(remainingMs / 1000);

    if (remainingSeconds < 60) return `${remainingSeconds}s left`;
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    return `${minutes}m ${seconds}s left`;
  }

  // Get the active job for time calculation
  let activeJob = $derived($importStore.activeJob);
</script>

{#if $isImporting && $importProgress}
  <!-- Top center, thin horizontal bar, z-60 to stay above MediaViewer -->
  <div class="fixed top-4 left-1/2 -translate-x-1/2 bg-white rounded border border-braun-300 px-4 py-2 z-[60] flex items-center gap-4">
    <!-- Static indicator + count (Braun: no animation) -->
    <div class="flex items-center gap-2 shrink-0">
      <div class="w-2 h-2 bg-braun-900 rounded-full"></div>
      <span class="text-sm font-medium text-braun-700">
        Importing...
      </span>
    </div>

    <!-- Progress bar -->
    <div class="w-32 bg-braun-200 rounded-full h-2 shrink-0">
      <div
        class="bg-braun-900 h-2 rounded-full transition-all duration-300 ease-out"
        style="width: {$importProgress.percent}%"
      ></div>
    </div>

    <!-- Percentage + time remaining -->
    <span class="text-xs text-braun-500 shrink-0">
      {$importProgress.percent}%
      {#if activeJob}
        <span class="text-braun-400 ml-1">
          {formatTimeRemaining(activeJob.startedAt, $importProgress.current, $importProgress.total)}
        </span>
      {/if}
    </span>

    <!-- Location name (truncated) -->
    <span class="text-xs text-braun-500 truncate max-w-[150px]" title={$importProgress.locationName}>
      {$importProgress.locationName}
    </span>

    <!-- Cancel button -->
    <button
      onclick={() => importStore.cancelImport()}
      class="text-xs text-braun-900 hover:text-error hover:underline shrink-0 ml-2"
    >
      Cancel
    </button>
  </div>
{/if}
