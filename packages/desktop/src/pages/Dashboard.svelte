<script lang="ts">
  /**
   * Dashboard.svelte - Main dashboard per page_dashboard.md spec
   *
   * Per spec:
   * - projects - recents (means pinned/favorites and recents sections)
   * - imports (show top 5 recent imports)
   * - recents (show top 5 recently interacted with)
   * - states - types (show top 5 states and types by locations)
   * - recents rows/buttons: favorites, random, un-documented, historical
   */
  import { onMount } from 'svelte';
  import { router } from '../stores/router';
  import { importStore, isImporting, importProgress, recentImports as storeRecentImports } from '../stores/import-store';
  import { openImportModal } from '../stores/import-modal-store';
  import type { Location } from '@au-archive/core';

  interface ImportRecord {
    import_id: string;
    locid: string | null;
    import_date: string;
    auth_imp: string | null;
    img_count: number;
    vid_count: number;
    doc_count: number;
    map_count: number;
    notes: string | null;
    locnam?: string;
    address_state?: string;
  }

  let recentLocations = $state<Location[]>([]);
  let recentImports = $state<ImportRecord[]>([]);
  // Per spec: "projects" means pinned/favorite items
  let pinnedLocations = $state<Location[]>([]);
  let topStates = $state<Array<{ state: string; count: number }>>([]);
  let topTypes = $state<Array<{ type: string; count: number }>>([]);
  let totalCount = $state(0);
  let loading = $state(true);

  // Removed duplicate location form - Dashboard "New Location" navigates to /imports

  onMount(async () => {
    try {
      if (!window.electronAPI?.locations) {
        console.error('Electron API not available - preload script may have failed to load');
        return;
      }
      // Per spec: projects means favorites/pinned, not a separate projects entity
      const [locations, imports, favorites, states, types, count] = await Promise.all([
        window.electronAPI.locations.findAll(),
        window.electronAPI.imports.findRecent(5) as Promise<ImportRecord[]>,
        window.electronAPI.locations.favorites(),
        window.electronAPI.stats.topStates(5),
        window.electronAPI.stats.topTypes(5),
        window.electronAPI.locations.count(),
      ]);

      recentLocations = locations.slice(0, 5);
      recentImports = imports;
      pinnedLocations = favorites.slice(0, 5);
      topStates = states;
      topTypes = types;
      totalCount = count;
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      loading = false;
    }
  });

  function formatDate(isoDate: string): string {
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
</script>

<div class="p-8">
  <!-- Header with Add Location button on the right -->
  <div class="flex justify-between items-center mb-8">
    <h1 class="text-3xl font-bold text-foreground">Dashboard</h1>
    <button
      onclick={() => openImportModal()}
      class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition"
    >
      + New Location
    </button>
  </div>

  {#if loading}
    <div class="text-center py-12">
      <p class="text-gray-500">Loading...</p>
    </div>
  {:else}

    <!-- Active Import Status -->
    {#if $isImporting && $importProgress}
      <div class="mb-6">
        <div class="bg-white rounded-lg shadow p-6 border-l-4 border-accent">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 bg-accent rounded-full animate-pulse"></div>
              <h3 class="text-lg font-semibold text-foreground">Import In Progress</h3>
            </div>
            <span class="text-sm text-gray-500">
              {$importProgress.current} of {$importProgress.total} files
            </span>
          </div>
          <p class="text-sm text-gray-600 mb-2">
            Importing to <button onclick={() => router.navigate(`/location/${$importProgress.locid}`)} class="text-accent hover:underline font-medium">{$importProgress.locationName}</button>
          </p>
          {#if $importProgress.currentFilename}
            <p class="text-xs text-gray-500 mb-2 truncate" title={$importProgress.currentFilename}>
              Processing: {$importProgress.currentFilename}
            </p>
          {/if}
          <div class="w-full bg-gray-200 rounded-full h-3">
            <div
              class="bg-accent h-3 rounded-full transition-all duration-300 ease-out"
              style="width: {$importProgress.percent}%"
            ></div>
          </div>
          <p class="text-xs text-gray-500 mt-2">
            {$importProgress.percent}% complete - You can continue using the app
          </p>
        </div>
      </div>
    {/if}

    <!-- Recent Background Imports (from store) -->
    {#if $storeRecentImports.length > 0}
      <div class="mb-6">
        <div class="bg-white rounded-lg shadow p-6">
          <h3 class="text-lg font-semibold text-foreground mb-3">Recent Background Imports</h3>
          <div class="space-y-2">
            {#each $storeRecentImports.slice(0, 3) as job}
              <div class="flex items-center justify-between text-sm py-2 border-b border-gray-100 last:border-0">
                <div class="flex items-center gap-2">
                  <span class={job.status === 'completed' ? 'text-green-500' : 'text-red-500'}>
                    {job.status === 'completed' ? '✓' : '!'}
                  </span>
                  <button onclick={() => router.navigate(`/location/${job.locid}`)} class="text-accent hover:underline">
                    {job.locationName}
                  </button>
                </div>
                <div class="text-gray-500 text-xs">
                  {#if job.status === 'completed'}
                    {job.imported} imported, {job.duplicates} duplicates
                  {:else}
                    <span class="text-red-500">{job.error || 'Failed'}</span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/if}

    <!-- Row 2: Pinned (full width) -->
    <div class="mb-6">
      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex justify-between items-start mb-4">
          <div>
            <h3 class="text-lg font-semibold text-foreground">Pinned Locations</h3>
            <p class="text-gray-500 text-sm">Your favorite locations</p>
          </div>
          <button onclick={() => router.navigate('/locations', undefined, { filter: 'favorites' })} class="text-xs text-accent hover:underline">
            show all
          </button>
        </div>
        {#if pinnedLocations.length > 0}
          <div class="flex flex-wrap gap-3">
            {#each pinnedLocations as location}
              <button
                onclick={() => router.navigate(`/location/${location.locid}`)}
                class="px-3 py-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition text-left"
              >
                <span class="text-sm text-accent font-medium">{location.locnam}</span>
                {#if location.address?.state}
                  <span class="text-xs text-gray-400 ml-2">{location.address.state}</span>
                {/if}
              </button>
            {/each}
          </div>
        {:else}
          <p class="text-sm text-gray-400">No pinned locations yet. Star locations to see them here.</p>
        {/if}
      </div>
    </div>

    <!-- Row 3: Recent Imports + Recent Locations -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
      <!-- Recent Imports -->
      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex justify-between items-start mb-4">
          <div>
            <h3 class="text-lg font-semibold text-foreground">Recent Imports</h3>
            <p class="text-gray-500 text-sm">Latest media imports</p>
          </div>
          <button onclick={() => router.navigate('/imports')} class="text-xs text-accent hover:underline">
            show all
          </button>
        </div>
        {#if recentImports.length > 0}
          <ul class="space-y-2">
            {#each recentImports as importRecord}
              <li class="text-sm">
                {#if importRecord.locid && importRecord.locnam}
                  <button
                    onclick={() => router.navigate(`/location/${importRecord.locid}`)}
                    class="text-accent hover:underline"
                  >
                    {importRecord.locnam}
                  </button>
                {:else}
                  <span class="text-gray-600">Import #{importRecord.import_id.slice(0, 8)}</span>
                {/if}
                <div class="text-xs text-gray-400 mt-1">
                  <span>{formatDate(importRecord.import_date)}</span>
                  {#if importRecord.img_count > 0}
                    <span class="ml-2">{importRecord.img_count} img</span>
                  {/if}
                  {#if importRecord.vid_count > 0}
                    <span class="ml-2">{importRecord.vid_count} vid</span>
                  {/if}
                  {#if importRecord.doc_count > 0}
                    <span class="ml-2">{importRecord.doc_count} doc</span>
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
        {:else}
          <div class="text-center text-gray-400 py-4">
            <p class="text-sm">No imports yet</p>
            <button
              onclick={() => router.navigate('/imports')}
              class="mt-2 text-xs text-accent hover:underline"
            >
              Import Media
            </button>
          </div>
        {/if}
      </div>

      <!-- Recent Locations -->
      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex justify-between items-start mb-4">
          <div>
            <h3 class="text-lg font-semibold text-foreground">Recent Locations</h3>
            <p class="text-gray-500 text-sm">Last 5 added</p>
          </div>
          <button onclick={() => router.navigate('/locations')} class="text-xs text-accent hover:underline">
            show all
          </button>
        </div>
        {#if recentLocations.length > 0}
          <ul class="space-y-2">
            {#each recentLocations as location}
              <li class="text-sm">
                <button
                  onclick={() => router.navigate(`/location/${location.locid}`)}
                  class="text-accent hover:underline"
                >
                  {location.locnam}
                </button>
                {#if location.address?.state}
                  <span class="text-gray-400 text-xs ml-2">{location.address.state}</span>
                {/if}
              </li>
            {/each}
          </ul>
        {:else}
          <div class="mt-4 text-center text-gray-400">
            No locations yet
          </div>
        {/if}
      </div>
    </div>

    <!-- Row 4: Top Types + Top States -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
      <!-- Top Types -->
      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex justify-between items-start mb-4">
          <div>
            <h3 class="text-lg font-semibold text-foreground">Top Types</h3>
            <p class="text-gray-500 text-sm">By location count</p>
          </div>
          <button onclick={() => router.navigate('/locations')} class="text-xs text-accent hover:underline">
            show all
          </button>
        </div>
        {#if topTypes.length > 0}
          <ul class="space-y-2">
            {#each topTypes as stat}
              <li class="flex justify-between text-sm">
                <button
                  onclick={() => router.navigate('/locations', undefined, { type: stat.type })}
                  class="text-accent hover:underline"
                  title="View all {stat.type} locations"
                >
                  {stat.type}
                </button>
                <span class="text-gray-500">{stat.count}</span>
              </li>
            {/each}
          </ul>
        {:else}
          <div class="mt-4 text-center text-gray-400">
            No data yet
          </div>
        {/if}
      </div>

      <!-- Top States -->
      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex justify-between items-start mb-4">
          <div>
            <h3 class="text-lg font-semibold text-foreground">Top States</h3>
            <p class="text-gray-500 text-sm">By location count</p>
          </div>
          <button onclick={() => router.navigate('/locations')} class="text-xs text-accent hover:underline">
            show all
          </button>
        </div>
        {#if topStates.length > 0}
          <ul class="space-y-2">
            {#each topStates as stat}
              <li class="flex justify-between text-sm">
                <button
                  onclick={() => router.navigate('/locations', undefined, { state: stat.state })}
                  class="text-accent hover:underline"
                  title="View all locations in {stat.state}"
                >
                  {stat.state}
                </button>
                <span class="text-gray-500">{stat.count}</span>
              </li>
            {/each}
          </ul>
        {:else}
          <div class="mt-4 text-center text-gray-400">
            No data yet
          </div>
        {/if}
      </div>
    </div>

    <!-- Stats Box -->
    <div class="bg-white rounded-lg shadow p-6">
      <h2 class="text-xl font-semibold mb-4 text-foreground">Archive Stats</h2>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div class="text-center">
          <div class="text-3xl font-bold text-accent">{totalCount}</div>
          <div class="text-sm text-gray-500">Total Locations</div>
        </div>
        <div class="text-center">
          <div class="text-3xl font-bold text-accent">{topStates.length > 0 ? topStates.reduce((sum, s) => sum + s.count, 0) : 0}</div>
          <div class="text-sm text-gray-500">With GPS Data</div>
        </div>
        <div class="text-center">
          <div class="text-3xl font-bold text-accent">{pinnedLocations.length}</div>
          <div class="text-sm text-gray-500">Pinned</div>
        </div>
        <div class="text-center">
          <div class="text-3xl font-bold text-accent">{recentImports.length}</div>
          <div class="text-sm text-gray-500">Recent Imports</div>
        </div>
      </div>
    </div>
  {/if}
</div>
