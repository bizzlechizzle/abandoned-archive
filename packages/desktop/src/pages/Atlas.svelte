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

  // Right-click add location modal state per page_atlas.md spec
  let showAddModal = $state(false);
  let clickedLat = $state(0);
  let clickedLng = $state(0);
  let newLocationName = $state('');
  let newLocationType = $state('');
  let saving = $state(false);

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
    console.log('Map clicked at:', lat, lng);
  }

  // Per page_atlas.md: right click to add new location with GPS autofill
  function handleMapRightClick(lat: number, lng: number) {
    clickedLat = lat;
    clickedLng = lng;
    newLocationName = '';
    newLocationType = '';
    showAddModal = true;
  }

  async function createLocationFromMap() {
    if (!newLocationName.trim() || !window.electronAPI?.locations) return;

    try {
      saving = true;
      // Per page_atlas.md spec autofill values
      const newLocation = await window.electronAPI.locations.create({
        locnam: newLocationName.trim(),
        type: newLocationType || 'unknown',
        gps: { lat: clickedLat, lng: clickedLng },
        condition: 'unknown',
        status: 'unknown',
        documentation: 'No Visit / Keyboard Scout',
        access: 'unknown',
        map_verified: true,
      });

      // Reload locations and close modal
      await loadLocations();
      showAddModal = false;

      // Navigate to the new location
      router.navigate(`/location/${newLocation.locid}`);
    } catch (error) {
      console.error('Error creating location:', error);
    } finally {
      saving = false;
    }
  }

  function closeAddModal() {
    showAddModal = false;
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
    {:else}
      <!-- Always show map - right-click to add locations per page_atlas.md -->
      <Map
        locations={filteredLocations()}
        onLocationClick={handleLocationClick}
        onMapClick={handleMapClick}
        onMapRightClick={handleMapRightClick}
      />
      {#if filteredLocations().length === 0}
        <div class="absolute top-4 left-1/2 transform -translate-x-1/2 bg-white bg-opacity-90 px-4 py-2 rounded shadow text-sm text-gray-600">
          Right-click on map to add a location
        </div>
      {/if}
    {/if}
  </div>
</div>

<!-- Add Location Modal - per page_atlas.md right-click spec -->
{#if showAddModal}
  <div
    class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
  >
    <div class="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
      <h2 class="text-lg font-semibold text-foreground mb-4">Add New Location</h2>

      <div class="space-y-4">
        <div>
          <label for="new-loc-name" class="block text-sm font-medium text-gray-700 mb-1">
            Location Name <span class="text-red-500">*</span>
          </label>
          <input
            id="new-loc-name"
            type="text"
            bind:value={newLocationName}
            placeholder="Enter location name"
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <div>
          <label for="new-loc-type" class="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <input
            id="new-loc-type"
            type="text"
            bind:value={newLocationType}
            placeholder="e.g., Factory, Hospital, School"
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <div class="bg-gray-50 rounded p-3">
          <p class="text-sm font-medium text-gray-700 mb-1">GPS Coordinates</p>
          <p class="text-sm text-gray-600 font-mono">
            {clickedLat.toFixed(6)}, {clickedLng.toFixed(6)}
          </p>
        </div>

        <div class="bg-blue-50 rounded p-3 text-sm text-blue-800">
          <p class="font-medium">Auto-filled values:</p>
          <ul class="mt-1 text-xs space-y-0.5">
            <li>Condition: unknown</li>
            <li>Status: unknown</li>
            <li>Documentation: No Visit / Keyboard Scout</li>
            <li>Access: unknown</li>
            <li>Map Verified: true</li>
          </ul>
        </div>
      </div>

      <div class="flex gap-3 mt-6">
        <button
          onclick={createLocationFromMap}
          disabled={!newLocationName.trim() || saving}
          class="flex-1 px-4 py-2 bg-accent text-white rounded hover:opacity-90 disabled:opacity-50 transition"
        >
          {saving ? 'Creating...' : 'Create Location'}
        </button>
        <button
          onclick={closeAddModal}
          class="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}
