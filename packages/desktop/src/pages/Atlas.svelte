<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from '../stores/router';
  import { openImportModal } from '../stores/import-modal-store';
  import Map from '../components/Map.svelte';
  import type { Location } from '@au-archive/core';

  let locations = $state<Location[]>([]);
  let loading = $state(true);
  let showFilters = $state(false);
  let filterState = $state('');
  let filterType = $state('');
  // FIX 6.8: Heat map toggle
  let showHeatMap = $state(false);

  // Show locations that are mappable: has GPS OR has address (city+state, zipcode)
  function isMappable(loc: Location): boolean {
    // Has GPS coordinates
    if (loc.gps?.lat && loc.gps?.lng) return true;
    // Has city + state (can be geocoded)
    if (loc.address?.city && loc.address?.state) return true;
    // Has zipcode (can be geocoded)
    if (loc.address?.zipcode) return true;
    return false;
  }

  let filteredLocations = $derived(() => {
    return locations.filter((loc) => {
      const matchesState = !filterState || loc.address?.state === filterState;
      const matchesType = !filterType || loc.type === filterType;
      // Show all mappable locations, not just those with GPS
      return matchesState && matchesType && isMappable(loc);
    });
  });

  let uniqueStates = $derived(() => {
    const states = new Set(locations.filter(isMappable).map(l => l.address?.state).filter(Boolean));
    return Array.from(states).sort();
  });

  let uniqueTypes = $derived(() => {
    const types = new Set(locations.filter(isMappable).map(l => l.type).filter(Boolean));
    return Array.from(types).sort();
  });

  async function loadLocations() {
    try {
      loading = true;
      if (!window.electronAPI?.locations) {
        console.error('Electron API not available - preload script may have failed to load');
        return;
      }
      // Load ALL locations - filtering for mappable ones happens in filteredLocations
      const allLocations = await window.electronAPI.locations.findAll();
      locations = allLocations;
    } catch (error) {
      console.error('Error loading locations:', error);
    } finally {
      loading = false;
    }
  }

  function handleLocationClick(location: Location) {
    router.navigate(`/location/${location.locid}`);
  }

  function handleMapClick(lat: number, lng: number) {
    // Left-click just logs for now
  }

  function handleMapRightClick(lat: number, lng: number) {
    // P3d: Right-click opens global import modal with GPS pre-filled
    openImportModal({
      gps_lat: lat,
      gps_lng: lng,
    });
  }

  onMount(() => {
    loadLocations();
  });
</script>

<div class="h-full flex flex-col">
  <div class="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
    <div>
      <h1 class="text-xl font-semibold text-foreground">Atlas</h1>
      <p class="text-xs text-gray-500">
        {#if !loading}
          Showing {filteredLocations().length} of {locations.length} mappable locations
        {/if}
      </p>
    </div>
    <div class="flex items-center gap-2">
      <!-- FIX 6.8: Heat map toggle button -->
      <button
        onclick={() => showHeatMap = !showHeatMap}
        class="px-4 py-2 rounded transition text-sm {showHeatMap ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-foreground hover:bg-gray-200'}"
        title="Toggle heat map visualization"
      >
        {showHeatMap ? '🔥 Heat On' : '🔥 Heat Off'}
      </button>
      <button
        onclick={() => showFilters = !showFilters}
        class="px-4 py-2 bg-gray-100 text-foreground rounded hover:bg-gray-200 transition text-sm"
      >
        {showFilters ? 'Hide' : 'Show'} Filters
      </button>
    </div>
  </div>

  {#if showFilters}
    <div class="bg-gray-50 border-b border-gray-200 px-6 py-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label for="atlas-state" class="block text-xs font-medium text-gray-700 mb-1">State</label>
          <select
            id="atlas-state"
            bind:value={filterState}
            class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">All States</option>
            {#each uniqueStates() as state}
              <option value={state}>{state}</option>
            {/each}
          </select>
        </div>

        <div>
          <label for="atlas-type" class="block text-xs font-medium text-gray-700 mb-1">Type</label>
          <select
            id="atlas-type"
            bind:value={filterType}
            class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">All Types</option>
            {#each uniqueTypes() as type}
              <option value={type}>{type}</option>
            {/each}
          </select>
        </div>
      </div>
    </div>
  {/if}

  <div class="flex-1 relative">
    <!-- ALWAYS show the map - it's an atlas, not a placeholder -->
    <Map
      locations={filteredLocations()}
      onLocationClick={handleLocationClick}
      onMapClick={handleMapClick}
      onMapRightClick={handleMapRightClick}
      showHeatMap={showHeatMap}
    />
    {#if loading}
      <div class="absolute top-2 left-1/2 -translate-x-1/2 bg-white px-4 py-2 rounded shadow-lg z-10">
        <p class="text-gray-500 text-sm">Loading locations...</p>
      </div>
    {/if}
  </div>
</div>
