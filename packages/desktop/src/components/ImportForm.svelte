<script lang="ts">
  import type { Location } from '@au-archive/core';

  interface Props {
    locations: Location[];
    selectedLocation: string;
    deleteOriginals: boolean;
    isImporting: boolean;
    isDragging: boolean;
    importProgress: string;
    progressCurrent: number;
    progressTotal: number;
    onLocationChange: (locid: string) => void;
    onDeleteOriginalsChange: (value: boolean) => void;
    onBrowse: () => void;
    onDragOver: (event: DragEvent) => void;
    onDragLeave: () => void;
    onDrop: (event: DragEvent) => void;
  }

  let {
    locations,
    selectedLocation,
    deleteOriginals,
    isImporting,
    isDragging,
    importProgress,
    progressCurrent,
    progressTotal,
    onLocationChange,
    onDeleteOriginalsChange,
    onBrowse,
    onDragOver,
    onDragLeave,
    onDrop,
  }: Props = $props();
</script>

<div class="max-w-3xl">
  <!-- Location Selector -->
  <div class="bg-white rounded-lg shadow p-6 mb-6">
    <label class="block text-sm font-medium text-gray-700 mb-2">
      Select Location <span class="text-red-500">*</span>
    </label>
    <select
      value={selectedLocation}
      onchange={(e) => onLocationChange((e.target as HTMLSelectElement).value)}
      disabled={isImporting}
      class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
    >
      <option value="">Choose a location...</option>
      {#each locations as location}
        <option value={location.locid}>
          {location.locnam} {location.address?.state ? `(${location.address.state})` : ''}
        </option>
      {/each}
    </select>
    {#if locations.length === 0}
      <p class="text-xs text-gray-500 mt-2">
        No locations found. Create locations from the Atlas page first.
      </p>
    {/if}

    <div class="mt-4">
      <label class="flex items-center text-sm text-gray-700">
        <input
          type="checkbox"
          checked={deleteOriginals}
          onchange={(e) => onDeleteOriginalsChange((e.target as HTMLInputElement).checked)}
          disabled={isImporting}
          class="mr-2"
        />
        Delete original files after import
      </label>
    </div>
  </div>

  <!-- Browse Button -->
  <button
    onclick={onBrowse}
    disabled={!selectedLocation || isImporting}
    class="w-full mb-4 px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {isImporting ? 'Importing...' : 'Browse Files'}
  </button>

  <!-- Drag & Drop Zone -->
  <div
    class="border-2 border-dashed rounded-lg p-12 text-center transition cursor-pointer {isDragging ? 'border-accent bg-accent bg-opacity-10' : 'border-gray-300'} {!selectedLocation || isImporting ? 'opacity-50 cursor-not-allowed' : 'hover:border-accent'}"
    ondragover={onDragOver}
    ondragleave={onDragLeave}
    ondrop={onDrop}
    onclick={!selectedLocation || isImporting ? undefined : onBrowse}
  >
    <div class="text-gray-400">
      <svg class="mx-auto h-12 w-12 mb-4" stroke="currentColor" fill="none" viewBox="0 0 48 48">
        <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <p class="text-lg mb-2">Drag and drop files here</p>
      <p class="text-sm">or click to browse</p>
      <p class="text-xs mt-4">Supported: Images (JPG, PNG), Videos (MP4, MOV), Documents (PDF, TXT)</p>
    </div>
  </div>

  <!-- Progress Display -->
  {#if importProgress}
    <div class="mt-4 p-4 bg-blue-50 border border-blue-200 rounded">
      <p class="text-sm text-blue-800">{importProgress}</p>
      {#if isImporting && progressTotal > 0}
        <div class="mt-3">
          <div class="w-full bg-gray-200 rounded-full h-2.5">
            <div
              class="bg-accent h-2.5 rounded-full transition-all duration-300"
              style="width: {(progressCurrent / progressTotal) * 100}%"
            ></div>
          </div>
          <p class="text-xs text-gray-600 mt-1 text-right">
            {progressCurrent} / {progressTotal} files ({Math.round((progressCurrent / progressTotal) * 100)}%)
          </p>
        </div>
      {/if}
    </div>
  {/if}
</div>
