<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from '../stores/router';
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
  let archiveFolderConfigured = $state(false);
  let archiveFolder = $state('');

  // Migration 26: Import attribution modal
  let showAttributionModal = $state(false);
  let pendingImportPaths = $state<string[]>([]);
  let isSomeoneElse = $state(false); // false = current user, true = someone else
  let selectedAuthor = $state(''); // username of selected author (or 'external')
  let contributionSource = $state(''); // for external contributors
  let users = $state<Array<{user_id: string, username: string, display_name: string | null}>>([]);

  onMount(async () => {
    try {
      if (!window.electronAPI?.locations) {
        console.error('Electron API not available - preload script may have failed to load');
        return;
      }
      const [locs, imports, settings] = await Promise.all([
        window.electronAPI.locations.findAll(),
        window.electronAPI.imports.findRecent(10) as Promise<ImportRecord[]>,
        window.electronAPI.settings.getAll(),
      ]);

      locations = locs;
      recentImports = imports;
      currentUser = settings.current_user || 'default';
      deleteOriginals = settings.delete_on_import === 'true';

      // Check if archive folder is configured
      archiveFolder = settings.archive_folder || '';
      archiveFolderConfigured = !!archiveFolder;

      // Load users for attribution modal
      if (window.electronAPI?.users) {
        users = await window.electronAPI.users.findAll();
      }

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

    // Small delay to ensure preload's drop handler has processed the files
    await new Promise(resolve => setTimeout(resolve, 10));

    // Get paths extracted by preload's drop event handler
    // The preload captures drop events and extracts paths using webUtils.getPathForFile()
    const droppedPaths = window.getDroppedFilePaths?.() || [];

    if (droppedPaths.length === 0) {
      importProgress = 'No valid files found in dropped items';
      return;
    }

    // Use main process to expand paths (handles directories recursively)
    if (!window.electronAPI?.media?.expandPaths) {
      importProgress = 'API not available';
      return;
    }

    importProgress = 'Scanning files...';
    const expandedPaths = await window.electronAPI.media.expandPaths(droppedPaths);

    if (expandedPaths.length > 0) {
      // Show attribution modal instead of importing directly
      pendingImportPaths = expandedPaths;
      isSomeoneElse = false;
      selectedAuthor = '';
      contributionSource = '';
      showAttributionModal = true;
      importProgress = '';
    } else {
      importProgress = 'No supported media files found';
    }
  }

  async function handleBrowse() {
    if (!window.electronAPI?.media) return;
    try {
      const filePaths = await window.electronAPI.media.selectFiles();
      if (!filePaths || filePaths.length === 0) {
        return;
      }

      // Show attribution modal instead of importing directly
      pendingImportPaths = filePaths;
      isSomeoneElse = false;
      selectedAuthor = '';
      contributionSource = '';
      showAttributionModal = true;
    } catch (error) {
      console.error('Error selecting files:', error);
      importProgress = 'Error selecting files';
    }
  }

  // Called when user confirms attribution in modal
  function confirmImport() {
    showAttributionModal = false;
    if (pendingImportPaths.length > 0) {
      // Determine author and contribution status
      let author = currentUser;
      let isContributed = 0;
      let source = '';

      if (isSomeoneElse) {
        if (selectedAuthor === 'external') {
          // External contributor
          isContributed = 1;
          source = contributionSource;
          author = currentUser; // Current user is importing on behalf of external
        } else {
          // Another registered user is the author
          author = selectedAuthor;
          isContributed = 0;
        }
      }

      importFilePaths(pendingImportPaths, author, isContributed, source);
      pendingImportPaths = [];
    }
  }

  function cancelImport() {
    showAttributionModal = false;
    pendingImportPaths = [];
    isSomeoneElse = false;
    selectedAuthor = '';
    contributionSource = '';
  }

  async function importFiles(files: File[]) {
    if (!selectedLocation) {
      importProgress = 'Please select a location first';
      return;
    }
    if (!window.electronAPI?.media) return;

    try {
      isImporting = true;
      importProgress = `Preparing to import ${files.length} file(s)...`;

      // Note: This function is called with File objects from file input, not drag-drop
      // For file input, we need paths. Since File objects lose native backing through contextBridge,
      // this path should only be used from file dialog (which returns paths directly from main process)
      const filesForImport = files.map((file) => ({
        filePath: '', // File objects from input don't have paths in sandbox mode - use selectFiles dialog instead
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

  // OPT-034b: Chunked import configuration for memory-bounded processing
  const IMPORT_CHUNK_SIZE = 50;    // Files per IPC call (prevents timeout and OOM)
  const IMPORT_CHUNK_DELAY = 100;  // ms between chunks (GC breathing room)

  async function importFilePaths(filePaths: string[], author: string, contributed: number = 0, source: string = '') {
    if (!selectedLocation) {
      importProgress = 'Please select a location first';
      return;
    }
    if (!window.electronAPI?.media) return;

    try {
      isImporting = true;

      // OPT-034b: Chunk files for memory-bounded processing
      const chunks: string[][] = [];
      for (let i = 0; i < filePaths.length; i += IMPORT_CHUNK_SIZE) {
        chunks.push(filePaths.slice(i, i + IMPORT_CHUNK_SIZE));
      }

      // Aggregate results across all chunks
      let totalImported = 0;
      let totalDuplicates = 0;
      let totalErrors = 0;
      let processedFiles = 0;

      // Process chunks sequentially to bound memory usage
      for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
        const chunk = chunks[chunkIdx];

        // Update progress with chunk info for large imports
        if (chunks.length > 1) {
          importProgress = `Chunk ${chunkIdx + 1}/${chunks.length}: importing ${chunk.length} files...`;
        } else {
          importProgress = `Importing ${chunk.length} files...`;
        }

        const filesForImport = chunk.map((filePath) => {
          const parts = filePath.split(/[\\/]/);
          return { filePath, originalName: parts[parts.length - 1] };
        });

        try {
          const result = (await window.electronAPI.media.import({
            files: filesForImport,
            locid: selectedLocation,
            auth_imp: author,
            deleteOriginals,
            is_contributed: contributed,
            contribution_source: source || null,
          })) as ImportSessionResult;

          // Aggregate chunk results
          totalImported += result.imported;
          totalDuplicates += result.duplicates;
          totalErrors += result.errors;
          processedFiles += chunk.length;

          // Update progress bar with aggregate values
          progressCurrent = processedFiles;
          progressTotal = filePaths.length;

        } catch (chunkError) {
          console.error(`[Import] Chunk ${chunkIdx + 1} failed:`, chunkError);
          // Count all files in failed chunk as errors, continue with next chunk
          totalErrors += chunk.length;
          processedFiles += chunk.length;
        }

        // Brief pause between chunks for GC and UI responsiveness
        if (chunkIdx < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, IMPORT_CHUNK_DELAY));
        }
      }

      // Build final aggregated result
      importResult = {
        total: filePaths.length,
        imported: totalImported,
        duplicates: totalDuplicates,
        errors: totalErrors,
        results: [], // Don't accumulate detailed results in memory for large imports
        importId: `chunked-${Date.now()}`,
      };

      importProgress = `Import complete! ${totalImported} imported, ${totalDuplicates} duplicates, ${totalErrors} errors`;

      // Refresh recent imports list
      const imports = (await window.electronAPI.imports.findRecent(10)) as ImportRecord[];
      recentImports = imports;

      // Clear result display after delay
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
  {:else if !archiveFolderConfigured}
    <!-- Archive folder not configured - block imports -->
    <div class="max-w-3xl bg-yellow-50 border-2 border-yellow-300 rounded-lg p-6">
      <div class="flex items-start gap-4">
        <div class="flex-shrink-0">
          <svg class="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div class="flex-1">
          <h3 class="text-lg font-semibold text-yellow-800">Archive Folder Not Configured</h3>
          <p class="text-yellow-700 mt-1">
            Before you can import media files, you need to set up an archive folder where your files will be organized and stored.
          </p>
          <div class="mt-4 flex gap-3">
            <button
              onclick={() => router.navigate('/settings')}
              class="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 transition font-medium"
            >
              Go to Settings
            </button>
          </div>
        </div>
      </div>
    </div>
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
      onLocationCreated={async (newLoc) => {
        // Refresh locations list and select the new one
        if (window.electronAPI?.locations) {
          locations = await window.electronAPI.locations.findAll();
          selectedLocation = newLoc.locid;
        }
      }}
      onNavigateToLocation={(locid) => router.navigate(`/location/${locid}?autoImport=true`)}
      defaultAuthor={currentUser}
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

  <!-- Migration 26: Import Attribution Modal -->
  {#if showAttributionModal}
    <div
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[99999]"
      onclick={cancelImport}
      role="dialog"
      aria-modal="true"
      aria-labelledby="attribution-title"
    >
      <div
        class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4"
        onclick={(e) => e.stopPropagation()}
      >
        <div class="p-4 border-b">
          <h2 id="attribution-title" class="text-lg font-semibold text-foreground">
            Import Attribution
          </h2>
          <p class="text-sm text-gray-500 mt-1">
            {pendingImportPaths.length} file{pendingImportPaths.length !== 1 ? 's' : ''} ready to import
          </p>
        </div>

        <div class="p-4 space-y-4">
          <!-- Step 1: Current user or someone else? -->
          <div class="space-y-3">
            <label class="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition {!isSomeoneElse ? 'border-accent bg-accent/5' : 'border-gray-200'}">
              <input
                type="radio"
                name="author-type"
                checked={!isSomeoneElse}
                onchange={() => { isSomeoneElse = false; selectedAuthor = ''; contributionSource = ''; }}
                class="w-4 h-4 text-accent"
              />
              <div>
                <p class="font-medium text-foreground">{currentUser}</p>
                <p class="text-sm text-gray-500">I shot these photos/videos</p>
              </div>
            </label>

            <label class="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition {isSomeoneElse ? 'border-accent bg-accent/5' : 'border-gray-200'}">
              <input
                type="radio"
                name="author-type"
                checked={isSomeoneElse}
                onchange={() => isSomeoneElse = true}
                class="w-4 h-4 text-accent"
              />
              <div>
                <p class="font-medium text-foreground">Someone Else</p>
                <p class="text-sm text-gray-500">Another user or external contributor</p>
              </div>
            </label>
          </div>

          <!-- Step 2: If someone else, who? -->
          {#if isSomeoneElse}
            <div class="pt-2 space-y-3">
              <label for="author-select" class="block text-sm font-medium text-gray-700">
                Who shot these?
              </label>
              <select
                id="author-select"
                bind:value={selectedAuthor}
                class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="">Select...</option>
                {#each users.filter(u => u.username !== currentUser) as user}
                  <option value={user.username}>{user.display_name || user.username}</option>
                {/each}
                <option value="external">External Contributor</option>
              </select>

              <!-- If external contributor, show source field -->
              {#if selectedAuthor === 'external'}
                <div class="pt-2">
                  <label for="contribution-source" class="block text-sm font-medium text-gray-700 mb-1">
                    Source
                  </label>
                  <input
                    id="contribution-source"
                    type="text"
                    bind:value={contributionSource}
                    placeholder="e.g., John Smith via text, Facebook group"
                    class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <p class="text-xs text-gray-500 mt-1">Who contributed these or where they came from</p>
                </div>
              {/if}
            </div>
          {/if}
        </div>

        <div class="p-4 border-t flex justify-end gap-2">
          <button
            onclick={cancelImport}
            class="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition"
          >
            Cancel
          </button>
          <button
            onclick={confirmImport}
            disabled={isSomeoneElse && !selectedAuthor || (selectedAuthor === 'external' && !contributionSource.trim())}
            class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Import
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
