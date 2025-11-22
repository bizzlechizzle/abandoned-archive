<script lang="ts">
  import { importProgress, isImporting, importStore } from '../stores/import-store';

  // Format time elapsed
  function formatElapsed(startedAt: Date): string {
    const seconds = Math.floor((Date.now() - startedAt.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  // Get the active job for elapsed time (Svelte 5 runes syntax)
  let activeJob = $derived($importStore.activeJob);
</script>

{#if $isImporting && $importProgress}
  <div class="fixed bottom-4 right-4 bg-white rounded-lg shadow-lg border border-gray-200 p-4 w-80 z-50">
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center gap-2">
        <div class="w-2 h-2 bg-accent rounded-full animate-pulse"></div>
        <span class="text-sm font-medium text-gray-700">Importing Files</span>
      </div>
      <span class="text-xs text-gray-500">
        {$importProgress.current}/{$importProgress.total}
      </span>
    </div>

    <div class="w-full bg-gray-200 rounded-full h-2.5 mb-2">
      <div
        class="bg-accent h-2.5 rounded-full transition-all duration-300 ease-out"
        style="width: {$importProgress.percent}%"
      ></div>
    </div>

    <div class="flex items-center justify-between text-xs text-gray-500">
      <span class="truncate max-w-[180px]" title={$importProgress.locationName}>
        {$importProgress.locationName}
      </span>
      <span>
        {$importProgress.percent}%
        {#if activeJob}
          - {formatElapsed(activeJob.startedAt)}
        {/if}
      </span>
    </div>

    <p class="text-xs text-gray-400 mt-2">
      You can continue using the app while files import
    </p>
  </div>
{/if}
