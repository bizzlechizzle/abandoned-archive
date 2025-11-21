<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from '../stores/router';
  import Map from '../components/Map.svelte';
  import type { Location } from '@au-archive/core';

  let locations = $state<Location[]>([]);
  let loading = $state(true);
  let showFilters = $state(false);
  let filterState = $state('');
  let filterType = $state('');

  let filteredLocations = $derived(() => {
    return locations.filter((loc) => {
      const matchesState = !filterState || loc.address?.state === filterState;
      const matchesType = !filterType || loc.type === filterType;
      return matchesState && matchesType && loc.gps;
    });
  });

  let uniqueStates = $derived(() => {
    const states = new Set(locations.filter(l => l.gps).map(l => l.address?.state).filter(Boolean));
    return Array.from(states).sort();
  });

  let uniqueTypes = $derived(() => {
    const types = new Set(locations.filter(l => l.gps).map(l => l.type).filter(Boolean));
    return Array.from(types).sort();
  });

  async function loadLocations() {
    try {
      loading = true;
      const allLocations = await window.electronAPI.locations.findAll();
      locations = allLocations.filter(l => l.gps);
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
    console.log('Map clicked at:', lat, lng);
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
          Showing {filteredLocations().length} of {locations.length} locations with GPS
        {/if}
      </p>
    </div>
    <button
      onclick={() => showFilters = !showFilters}
      class="px-4 py-2 bg-gray-100 text-foreground rounded hover:bg-gray-200 transition text-sm"
    >
      {showFilters ? 'Hide' : 'Show'} Filters
    </button>
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
    {#if loading}
      <div class="absolute inset-0 flex items-center justify-center bg-gray-100">
        <p class="text-gray-500">Loading map...</p>
      </div>
    {:else if filteredLocations().length === 0}
      <div class="absolute inset-0 flex items-center justify-center bg-gray-100">
        <div class="text-center">
          <p class="text-gray-500 text-lg">No locations with GPS coordinates</p>
          <p class="text-gray-400 text-sm mt-2">Add locations with GPS data to see them on the map</p>
        </div>
      </div>
    {:else}
      <Map
        locations={filteredLocations()}
        onLocationClick={handleLocationClick}
        onMapClick={handleMapClick}
      />
    {/if}
  </div>
</div>
