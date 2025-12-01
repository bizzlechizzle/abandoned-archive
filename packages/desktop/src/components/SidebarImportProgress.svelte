<script lang="ts">
  import { importProgress, isImporting, importStore } from '../stores/import-store';
</script>

{#if $isImporting && $importProgress}
  <!-- Minimal sidebar import progress - premium clean design -->
  <div class="px-4 py-3 border-b border-gray-200">
    <!-- Header row: indicator + count -->
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center gap-2">
        <div class="w-2 h-2 bg-accent rounded-full"></div>
        <span class="text-sm font-medium text-gray-700">
          Importing...
        </span>
      </div>
      <span class="text-xs text-gray-500">
        {$importProgress.current}/{$importProgress.total}
      </span>
    </div>

    <!-- Progress bar -->
    <div class="w-full bg-gray-200 rounded-full h-1.5 mb-2">
      <div
        class="bg-accent h-1.5 rounded-full transition-all duration-300 ease-out"
        style="width: {$importProgress.percent}%"
      ></div>
    </div>

    <!-- Footer row: percentage + cancel -->
    <div class="flex items-center justify-between">
      <span class="text-xs text-gray-500">
        {$importProgress.percent}%
      </span>
      <button
        onclick={() => importStore.cancelImport()}
        class="text-xs text-red-600 hover:text-red-800 hover:underline"
      >
        Cancel
      </button>
    </div>
  </div>
{/if}
