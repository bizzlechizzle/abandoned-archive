<script lang="ts">
  /**
   * LocationImportZone - Drag-drop zone, progress, GPS warnings
   * Per LILBITS: ~200 lines, single responsibility
   */
  import type { GpsWarning, FailedFile } from './types';

  interface Props {
    isImporting: boolean;
    importProgress: string;
    isDragging: boolean;
    gpsWarnings: GpsWarning[];
    failedFiles: FailedFile[];
    onDragOver: (e: DragEvent) => void;
    onDragLeave: () => void;
    onDrop: (e: DragEvent) => void;
    onSelectFiles: () => void;
    onRetryFailed: () => void;
    onDismissWarning: (index: number) => void;
    onDismissAllWarnings: () => void;
  }

  let {
    isImporting, importProgress, isDragging, gpsWarnings, failedFiles,
    onDragOver, onDragLeave, onDrop, onSelectFiles, onRetryFailed,
    onDismissWarning, onDismissAllWarnings
  }: Props = $props();
</script>

<div
  class="mt-6 bg-white rounded-lg shadow p-6"
  ondragover={onDragOver}
  ondragleave={onDragLeave}
  ondrop={onDrop}
  role="region"
  aria-label="Media import zone"
>
  <div class="flex items-center justify-between mb-3">
    <h2 class="text-xl font-semibold text-foreground">Media</h2>
    {#if importProgress}
      <span class="text-sm text-accent">{importProgress}</span>
    {/if}
    {#if failedFiles.length > 0}
      <button
        onclick={onRetryFailed}
        class="ml-2 text-sm text-red-600 hover:text-red-800 hover:underline"
      >
        Retry {failedFiles.length} failed
      </button>
    {/if}
  </div>

  <!-- GPS Mismatch Warnings -->
  {#if gpsWarnings.length > 0}
    <div class="mb-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
      <div class="flex items-start gap-3">
        <svg class="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div class="flex-1">
          <h4 class="text-sm font-semibold text-yellow-800 mb-2">GPS Mismatch Detected</h4>
          <p class="text-xs text-yellow-700 mb-3">
            Some imported files have GPS coordinates that differ from this location.
          </p>
          <div class="space-y-2">
            {#each gpsWarnings as warning, index}
              <div class="flex items-center justify-between bg-white/50 rounded p-2 text-xs">
                <div>
                  <span class="font-medium text-yellow-900">{warning.filename}</span>
                  <span class="text-yellow-700 ml-2">
                    {warning.message}
                    <span class="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium
                      {warning.severity === 'major' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}">
                      {warning.severity}
                    </span>
                  </span>
                </div>
                <button
                  onclick={() => onDismissWarning(index)}
                  class="p-1 text-yellow-600 hover:text-yellow-800"
                  title="Dismiss warning"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            {/each}
          </div>
          <button
            onclick={onDismissAllWarnings}
            class="mt-2 text-xs text-yellow-700 hover:text-yellow-900 underline"
          >
            Dismiss all warnings
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Drag-drop zone -->
  <div
    class="p-6 border-2 border-dashed rounded-lg text-center transition-colors {isDragging ? 'border-accent bg-accent/10' : 'border-gray-300 hover:border-gray-400'}"
  >
    {#if isImporting}
      <div class="text-gray-500">
        <svg class="w-10 h-10 mx-auto mb-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <p class="text-sm">{importProgress}</p>
      </div>
    {:else}
      <svg class="w-10 h-10 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
      <p class="text-sm text-gray-500">
        {isDragging ? 'Drop files or folders here' : 'Drag & drop files or folders to import'}
      </p>
      <p class="text-xs text-gray-400 mt-1">Supports images, videos, and documents</p>
      <button
        onclick={onSelectFiles}
        class="mt-3 px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition text-sm"
      >
        Select Files
      </button>
    {/if}
  </div>
</div>
