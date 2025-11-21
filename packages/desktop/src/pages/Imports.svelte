<script lang="ts">
  import { onMount } from 'svelte';
  import type { Location } from '@au-archive/core';
  import ImportForm from '../components/ImportForm.svelte';
  import RecentImports from '../components/RecentImports.svelte';

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
  let progressCurrent = $state(0);
  let progressTotal = $state(0);

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

      // Set up progress listener
      const unsubscribe = window.electronAPI.media.onImportProgress((progress) => {
        progressCurrent = progress.current;
        progressTotal = progress.total;
        importProgress = `Importing ${progress.current} of ${progress.total} files...`;
      });

      // Clean up listener on unmount
      return () => {
        unsubscribe();
      };
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
        progressCurrent = 0;
        progressTotal = 0;
      }, 5000);
    } catch (error) {
      console.error('Error importing files:', error);
      importProgress = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      progressCurrent = 0;
      progressTotal = 0;
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
        progressCurrent = 0;
        progressTotal = 0;
      }, 5000);
    } catch (error) {
      console.error('Error importing files:', error);
      importProgress = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      progressCurrent = 0;
      progressTotal = 0;
    } finally {
      isImporting = false;
    }
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
    <ImportForm
      {locations}
      {selectedLocation}
      {deleteOriginals}
      {isImporting}
      {isDragging}
      {importProgress}
      {progressCurrent}
      {progressTotal}
      onLocationChange={(locid) => (selectedLocation = locid)}
      onDeleteOriginalsChange={(value) => (deleteOriginals = value)}
      onBrowse={handleBrowse}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    />

    {#if importResult}
      <div class="max-w-3xl mt-4 p-4 bg-green-50 border border-green-200 rounded">
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

    <RecentImports imports={recentImports} />
  {/if}
</div>
