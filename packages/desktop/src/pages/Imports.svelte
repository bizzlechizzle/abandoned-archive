<script lang="ts">
  import { onMount } from 'svelte';
  import path from 'path-browserify';
  import type { Location } from '@au-archive/core';

  interface ImportResult {
    success: boolean;
    hash: string;
    type: 'image' | 'video' | 'document' | 'unknown';
    duplicate: boolean;
    archivePath?: string;
    error?: string;
    gpsWarning?: string;
  }

  interface ImportSessionResult {
    total: number;
    imported: number;
    duplicates: number;
    errors: number;
    results: ImportResult[];
    importId: string;
  }

  interface ImportRecord {
    import_id: string;
    locid: string | null;
    import_date: string;
    auth_imp: string | null;
    img_count: number;
    vid_count: number;
    doc_count: number;
    locnam?: string;
    address_state?: string;
  }

  let locations = $state<Location[]>([]);
  let selectedLocation = $state('');
  let isDragging = $state(false);
  let isImporting = $state(false);
  let importProgress = $state('');
  let importResult = $state<ImportSessionResult | null>(null);
  let recentImports = $state<ImportRecord[]>([]);
  let currentUser = $state('default');
  let deleteOriginals = $state(false);
  let loading = $state(true);

  onMount(async () => {
    try {
      const [locs, imports, settings] = await Promise.all([
        window.electronAPI.locations.findAll(),
        window.electronAPI.imports.findRecent(10) as Promise<ImportRecord[]>,
        window.electronAPI.settings.getAll(),
      ]);

      locations = locs;
      recentImports = imports;
      currentUser = settings.current_user || 'default';
      deleteOriginals = settings.delete_on_import === 'true';
    } catch (error) {
      console.error('Error loading imports page:', error);
    } finally {
      loading = false;
    }
  });

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    isDragging = true;
  }

  function handleDragLeave() {
    isDragging = false;
  }

  async function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragging = false;

    if (!event.dataTransfer?.files || event.dataTransfer.files.length === 0) {
      return;
    }

    const files = Array.from(event.dataTransfer.files);
    await importFiles(files);
  }

  async function handleBrowse() {
    try {
      const filePaths = await window.electronAPI.media.selectFiles();
      if (!filePaths || filePaths.length === 0) {
        return;
      }

      // Convert file paths to File-like objects (we only have paths in Electron)
      await importFilePaths(filePaths);
    } catch (error) {
      console.error('Error selecting files:', error);
      importProgress = 'Error selecting files';
    }
  }

  async function importFiles(files: File[]) {
    if (!selectedLocation) {
      importProgress = 'Please select a location first';
      return;
    }

    try {
      isImporting = true;
      importProgress = `Preparing to import ${files.length} file(s)...`;

      const filesForImport = files.map((file) => ({
        filePath: (file as any).path, // Electron adds path property
        originalName: file.name,
      }));

      importProgress = 'Importing files...';
      const result = (await window.electronAPI.media.import({
        files: filesForImport,
        locid: selectedLocation,
        auth_imp: currentUser,
        deleteOriginals,
      })) as ImportSessionResult;

      importResult = result;
      importProgress = `Import complete! ${result.imported} imported, ${result.duplicates} duplicates, ${result.errors} errors`;

      // Refresh recent imports
      const imports = (await window.electronAPI.imports.findRecent(10)) as ImportRecord[];
      recentImports = imports;

      // Clear result after 5 seconds
      setTimeout(() => {
        importResult = null;
        importProgress = '';
      }, 5000);
    } catch (error) {
      console.error('Error importing files:', error);
      importProgress = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    } finally {
      isImporting = false;
    }
  }

  async function importFilePaths(filePaths: string[]) {
    if (!selectedLocation) {
      importProgress = 'Please select a location first';
      return;
    }

    try {
      isImporting = true;
      importProgress = `Preparing to import ${filePaths.length} file(s)...`;

      const filesForImport = filePaths.map((filePath) => {
        // Get filename from path
        const parts = filePath.split(/[\\/]/);
        const fileName = parts[parts.length - 1];

        return {
          filePath,
          originalName: fileName,
        };
      });

      importProgress = 'Importing files...';
      const result = (await window.electronAPI.media.import({
        files: filesForImport,
        locid: selectedLocation,
        auth_imp: currentUser,
        deleteOriginals,
      })) as ImportSessionResult;

      importResult = result;
      importProgress = `Import complete! ${result.imported} imported, ${result.duplicates} duplicates, ${result.errors} errors`;

      // Refresh recent imports
      const imports = (await window.electronAPI.imports.findRecent(10)) as ImportRecord[];
      recentImports = imports;

      // Clear result after 5 seconds
      setTimeout(() => {
        importResult = null;
        importProgress = '';
      }, 5000);
    } catch (error) {
      console.error('Error importing files:', error);
      importProgress = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    } finally {
      isImporting = false;
    }
  }

  function formatDate(isoDate: string): string {
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
</script>

<div class="p-8">
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-foreground mb-2">Imports</h1>
    <p class="text-gray-600">Import media files for your locations</p>
  </div>

  {#if loading}
    <p class="text-gray-500">Loading...</p>
  {:else}
    <div class="max-w-3xl">
      <div class="bg-white rounded-lg shadow p-6 mb-6">
        <label class="block text-sm font-medium text-gray-700 mb-2">
          Select Location <span class="text-red-500">*</span>
        </label>
        <select
          bind:value={selectedLocation}
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
              bind:checked={deleteOriginals}
              disabled={isImporting}
              class="mr-2"
            />
            Delete original files after import
          </label>
        </div>
      </div>

      <button
        onclick={handleBrowse}
        disabled={!selectedLocation || isImporting}
        class="w-full mb-4 px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isImporting ? 'Importing...' : 'Browse Files'}
      </button>

      <div
        class="border-2 border-dashed rounded-lg p-12 text-center transition cursor-pointer {isDragging ? 'border-accent bg-accent bg-opacity-10' : 'border-gray-300'} {!selectedLocation || isImporting ? 'opacity-50 cursor-not-allowed' : 'hover:border-accent'}"
        ondragover={handleDragOver}
        ondragleave={handleDragLeave}
        ondrop={handleDrop}
        onclick={!selectedLocation || isImporting ? undefined : handleBrowse}
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

      {#if importProgress}
        <div class="mt-4 p-4 bg-blue-50 border border-blue-200 rounded">
          <p class="text-sm text-blue-800">{importProgress}</p>
        </div>
      {/if}

      {#if importResult}
        <div class="mt-4 p-4 bg-green-50 border border-green-200 rounded">
          <h3 class="font-semibold text-green-800 mb-2">Import Summary</h3>
          <div class="text-sm text-green-700 space-y-1">
            <p>Total files: {importResult.total}</p>
            <p>Successfully imported: {importResult.imported}</p>
            <p>Duplicates skipped: {importResult.duplicates}</p>
            {#if importResult.errors > 0}
              <p class="text-red-600">Errors: {importResult.errors}</p>
            {/if}
          </div>
        </div>
      {/if}

      <div class="mt-8">
        <h2 class="text-lg font-semibold mb-4 text-foreground">Recent Imports</h2>
        {#if recentImports.length > 0}
          <div class="bg-white rounded-lg shadow">
            <ul class="divide-y divide-gray-200">
              {#each recentImports as importRecord}
                <li class="p-4 hover:bg-gray-50">
                  <div class="flex justify-between items-start">
                    <div>
                      {#if importRecord.locnam}
                        <p class="font-medium text-foreground">{importRecord.locnam}</p>
                      {:else}
                        <p class="font-medium text-gray-500">Import #{importRecord.import_id.slice(0, 8)}</p>
                      {/if}
                      <p class="text-sm text-gray-500 mt-1">
                        {formatDate(importRecord.import_date)}
                        {#if importRecord.auth_imp}
                          · by {importRecord.auth_imp}
                        {/if}
                      </p>
                    </div>
                    <div class="text-sm text-gray-600">
                      {#if importRecord.img_count > 0}
                        <span class="block">{importRecord.img_count} images</span>
                      {/if}
                      {#if importRecord.vid_count > 0}
                        <span class="block">{importRecord.vid_count} videos</span>
                      {/if}
                      {#if importRecord.doc_count > 0}
                        <span class="block">{importRecord.doc_count} documents</span>
                      {/if}
                    </div>
                  </div>
                </li>
              {/each}
            </ul>
          </div>
        {:else}
          <div class="bg-white rounded-lg shadow p-6 text-center text-gray-400">
            No recent imports
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
