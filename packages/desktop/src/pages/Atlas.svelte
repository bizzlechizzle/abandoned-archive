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

  // Quick create modal state
  let showCreateModal = $state(false);
  let createLat = $state(0);
  let createLng = $state(0);
  let createName = $state('');
  let createType = $state('');
  let createState = $state('');
  let createCity = $state('');
  let creating = $state(false);

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
      if (!window.electronAPI?.locations) {
        console.error('Electron API not available - preload script may have failed to load');
        return;
      }
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
    // Left-click just logs for now
  }

  function handleMapRightClick(lat: number, lng: number) {
    // Right-click opens quick create modal
    createLat = lat;
    createLng = lng;
    createName = '';
    createType = '';
    createState = '';
    createCity = '';
    showCreateModal = true;
  }

  function closeCreateModal() {
    showCreateModal = false;
    createName = '';
    createType = '';
    createState = '';
    createCity = '';
  }

  async function quickCreateLocation() {
    if (!createName.trim()) return;
    if (!window.electronAPI?.locations) return;

    try {
      creating = true;
      const currentUser = await window.electronAPI.settings?.get('current_user') || 'default';

      const newLocation = await window.electronAPI.locations.create({
        locnam: createName.trim(),
        type: createType || undefined,
        gps: {
          lat: createLat,
          lng: createLng,
          source: 'user_map_click',
        },
        address: {
          city: createCity || undefined,
          state: createState || undefined,
        },
        auth_imp: currentUser,
      });

      // Close modal and refresh
      closeCreateModal();
      await loadLocations();

      // Navigate to the new location
      if (newLocation?.locid) {
        router.navigate(`/location/${newLocation.locid}`);
      }
    } catch (error) {
      console.error('Error creating location:', error);
    } finally {
      creating = false;
    }
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
        onMapRightClick={handleMapRightClick}
      />
    {/if}
  </div>
</div>

<!-- Quick Create Modal -->
{#if showCreateModal}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
      <div class="px-6 py-4 border-b border-gray-200">
        <h2 class="text-lg font-semibold text-foreground">Quick Create Location</h2>
        <p class="text-sm text-gray-500">
          GPS: {createLat.toFixed(6)}, {createLng.toFixed(6)}
        </p>
      </div>

      <div class="px-6 py-4 space-y-4">
        <div>
          <label for="create-name" class="block text-sm font-medium text-gray-700 mb-1">
            Location Name *
          </label>
          <input
            id="create-name"
            type="text"
            bind:value={createName}
            placeholder="Enter location name"
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label for="create-type" class="block text-sm font-medium text-gray-700 mb-1">
              Type
            </label>
            <select
              id="create-type"
              bind:value={createType}
              class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">Select type...</option>
              {#each uniqueTypes() as type}
                <option value={type}>{type}</option>
              {/each}
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label for="create-state" class="block text-sm font-medium text-gray-700 mb-1">
              State
            </label>
            <select
              id="create-state"
              bind:value={createState}
              class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">Select state...</option>
              {#each uniqueStates() as state}
                <option value={state}>{state}</option>
              {/each}
            </select>
          </div>
        </div>

        <div>
          <label for="create-city" class="block text-sm font-medium text-gray-700 mb-1">
            City
          </label>
          <input
            id="create-city"
            type="text"
            bind:value={createCity}
            placeholder="Enter city"
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>

      <div class="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
        <button
          onclick={closeCreateModal}
          class="px-4 py-2 text-gray-700 hover:text-gray-900 transition"
        >
          Cancel
        </button>
        <button
          onclick={quickCreateLocation}
          disabled={creating || !createName.trim()}
          class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50"
        >
          {creating ? 'Creating...' : 'Create Location'}
        </button>
      </div>
    </div>
  </div>
{/if}
