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

  // New location form state
  let showNewLocationForm = $state(false);
  let newLocName = $state('');
  let newLocState = $state('');
  let newLocCity = $state('');
  let newLocType = $state('');
  let creatingLocation = $state(false);
  let createError = $state('');
  let createSuccess = $state('');

  async function handleCreateLocation() {
    if (!newLocName.trim()) {
      createError = 'Location name is required';
      return;
    }

    try {
      creatingLocation = true;
      createError = '';
      createSuccess = '';

      const newLocation = await window.electronAPI.locations.create({
        locnam: newLocName.trim(),
        type: newLocType.trim() || undefined,
        address: {
          state: newLocState.trim() || undefined,
          city: newLocCity.trim() || undefined,
        },
      });

      // Reset form
      newLocName = '';
      newLocState = '';
      newLocCity = '';
      newLocType = '';
      showNewLocationForm = false;
      createSuccess = 'Location created successfully!';

      // Refresh dashboard data
      const [locations, count] = await Promise.all([
        window.electronAPI.locations.findAll(),
        window.electronAPI.locations.count(),
      ]);
      recentLocations = locations.slice(0, 5);
      totalCount = count;

      // Clear success message after 3 seconds
      setTimeout(() => {
        createSuccess = '';
      }, 3000);

      // Navigate to the new location
      router.navigate(`/location/${newLocation.locid}`);
    } catch (error) {
      console.error('Error creating location:', error);
      createError = error instanceof Error ? error.message : 'Failed to create location';
    } finally {
      creatingLocation = false;
    }
  }

  function cancelNewLocation() {
    showNewLocationForm = false;
    newLocName = '';
    newLocState = '';
    newLocCity = '';
    newLocType = '';
    createError = '';
  }

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
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-foreground mb-2">Dashboard</h1>
    <p class="text-gray-600">Overview of your abandoned location archive</p>
    {#if !loading}
      <p class="text-sm text-gray-500 mt-1">Total Locations: {totalCount}</p>
    {/if}
  </div>

  {#if loading}
    <div class="text-center py-12">
      <p class="text-gray-500">Loading...</p>
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
      <!-- Per spec: "projects" means pinned/favorite items - show top 5 [column], show all -->
      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex justify-between items-start mb-4">
          <div>
            <h3 class="text-lg font-semibold text-foreground">Pinned</h3>
            <p class="text-gray-500 text-sm">Favorite locations</p>
          </div>
          <button onclick={() => router.navigate('/locations')} class="text-xs text-accent hover:underline">
            show all
          </button>
        </div>
        {#if pinnedLocations.length > 0}
          <ul class="space-y-2">
            {#each pinnedLocations as location}
              <li class="text-sm">
                <button
                  onclick={() => router.navigate(`/location/${location.locid}`)}
                  class="text-accent hover:underline"
                >
                  {location.locnam}
                </button>
                {#if location.address?.state}
                  <span class="text-xs text-gray-400 ml-2">{location.address.state}</span>
                {/if}
              </li>
            {/each}
          </ul>
        {:else}
          <p class="text-sm text-gray-400">No pinned locations yet</p>
        {/if}
      </div>

      <!-- Per spec: imports - show top 5 recent imports[column], show all -->
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

      <!-- Per spec: recents - show top 5 recently interacted with[rows], show all -->
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

      <!-- Per spec: states - show top 5 states by locations [column], show all -->
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
                <span>{stat.state}</span>
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

      <!-- Per spec: types - show top 5 types [column], show all -->
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
                <span>{stat.type}</span>
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
  {/if}

  <div class="mt-8">
    <h2 class="text-xl font-semibold mb-4 text-foreground">Special Filters</h2>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <button
        onclick={async () => {
          if (!window.electronAPI?.locations) return;
          const loc = await window.electronAPI.locations.random();
          if (loc) router.navigate(`/location/${loc.locid}`);
        }}
        class="px-4 py-3 bg-white rounded-lg shadow hover:shadow-lg transition text-left"
      >
        <div class="text-sm text-gray-500">Random</div>
        <div class="text-lg font-semibold text-foreground">Surprise Me</div>
      </button>

      <button
        onclick={() => router.navigate('/locations', undefined, { filter: 'undocumented' })}
        class="px-4 py-3 bg-white rounded-lg shadow hover:shadow-lg transition text-left"
      >
        <div class="text-sm text-gray-500">Undocumented</div>
        <div class="text-lg font-semibold text-foreground">Need Visits</div>
      </button>

      <button
        onclick={() => router.navigate('/locations', undefined, { filter: 'historical' })}
        class="px-4 py-3 bg-white rounded-lg shadow hover:shadow-lg transition text-left"
      >
        <div class="text-sm text-gray-500">Historical</div>
        <div class="text-lg font-semibold text-foreground">Landmarks</div>
      </button>

      <button
        onclick={() => router.navigate('/locations', undefined, { filter: 'favorites' })}
        class="px-4 py-3 bg-white rounded-lg shadow hover:shadow-lg transition text-left"
      >
        <div class="text-sm text-gray-500">Favorites</div>
        <div class="text-lg font-semibold text-foreground">Starred</div>
      </button>
    </div>
  </div>

  <div class="mt-8">
    <h2 class="text-xl font-semibold mb-4 text-foreground">Quick Actions</h2>

    {#if createSuccess}
      <div class="mb-4 p-3 bg-green-50 border border-green-200 rounded text-green-700 text-sm">
        {createSuccess}
      </div>
    {/if}

    <div class="flex gap-4 flex-wrap">
      <button
        onclick={() => (showNewLocationForm = !showNewLocationForm)}
        class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition"
      >
        {showNewLocationForm ? 'Cancel' : '+ New Location'}
      </button>
      <button
        onclick={() => router.navigate('/atlas')}
        class="px-4 py-2 bg-gray-200 text-foreground rounded hover:bg-gray-300 transition"
      >
        Open Atlas
      </button>
      <button
        onclick={() => router.navigate('/locations')}
        class="px-4 py-2 bg-gray-200 text-foreground rounded hover:bg-gray-300 transition"
      >
        View All Locations
      </button>
      <button
        onclick={() => router.navigate('/imports')}
        class="px-4 py-2 bg-gray-200 text-foreground rounded hover:bg-gray-300 transition"
      >
        Import Media
      </button>
    </div>

    {#if showNewLocationForm}
      <div class="mt-4 max-w-xl bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-semibold text-foreground mb-4">Create New Location</h3>

        {#if createError}
          <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {createError}
          </div>
        {/if}

        <div class="space-y-4">
          <div>
            <label for="new-loc-name" class="block text-sm font-medium text-gray-700 mb-1">
              Location Name <span class="text-red-500">*</span>
            </label>
            <input
              id="new-loc-name"
              type="text"
              bind:value={newLocName}
              placeholder="e.g., Smith Farm, Downtown Mill"
              disabled={creatingLocation}
              class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
            />
          </div>

          <div>
            <label for="new-loc-type" class="block text-sm font-medium text-gray-700 mb-1">
              Type
            </label>
            <input
              id="new-loc-type"
              type="text"
              bind:value={newLocType}
              placeholder="e.g., Factory, School, Hospital"
              disabled={creatingLocation}
              class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
            />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="new-loc-city" class="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input
                id="new-loc-city"
                type="text"
                bind:value={newLocCity}
                placeholder="City (optional)"
                disabled={creatingLocation}
                class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
              />
            </div>
            <div>
              <label for="new-loc-state" class="block text-sm font-medium text-gray-700 mb-1">State</label>
              <input
                id="new-loc-state"
                type="text"
                bind:value={newLocState}
                placeholder="e.g., TX, CA"
                disabled={creatingLocation}
                class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
              />
            </div>
          </div>

          <div class="flex gap-3 pt-2">
            <button
              type="button"
              onclick={handleCreateLocation}
              disabled={creatingLocation || !newLocName.trim()}
              class="flex-1 px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50"
            >
              {creatingLocation ? 'Creating...' : 'Create Location'}
            </button>
            <button
              type="button"
              onclick={cancelNewLocation}
              disabled={creatingLocation}
              class="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>
