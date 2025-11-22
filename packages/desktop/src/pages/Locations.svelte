<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from '../stores/router';
  import type { Location } from '@au-archive/core';

  let locations = $state<Location[]>([]);
  let searchQuery = $state('');
  let filterState = $state('');
  let filterType = $state('');
  let specialFilter = $state(''); // 'undocumented', 'historical', 'favorites', or ''
  let loading = $state(true);

  // Subscribe to router for query params
  let routeQuery = $state<Record<string, string>>({});
  const unsubscribe = router.subscribe((route) => {
    if (route.query?.filter) {
      specialFilter = route.query.filter;
    }
    routeQuery = route.query || {};
  });

  let filteredLocations = $derived(() => {
    return locations.filter((loc) => {
      const matchesSearch = !searchQuery ||
        loc.locnam.toLowerCase().includes(searchQuery.toLowerCase()) ||
        loc.akanam?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesState = !filterState || loc.address?.state === filterState;
      const matchesType = !filterType || loc.type === filterType;

      // Apply special filters
      let matchesSpecial = true;
      if (specialFilter === 'undocumented') {
        // Locations without documentation status or marked as undocumented
        matchesSpecial = !loc.documentation || loc.documentation === 'No Visit / Keyboard Scout';
      } else if (specialFilter === 'historical') {
        matchesSpecial = loc.historic === true;
      } else if (specialFilter === 'favorites') {
        matchesSpecial = loc.favorite === true;
      }

      return matchesSearch && matchesState && matchesType && matchesSpecial;
    });
  });

  let uniqueStates = $derived(() => {
    const states = new Set(locations.map(l => l.address?.state).filter(Boolean));
    return Array.from(states).sort();
  });

  let uniqueTypes = $derived(() => {
    const types = new Set(locations.map(l => l.type).filter(Boolean));
    return Array.from(types).sort();
  });

  function clearSpecialFilter() {
    specialFilter = '';
    router.navigate('/locations');
  }

  async function loadLocations() {
    try {
      loading = true;
      if (!window.electronAPI?.locations) {
        console.error('Electron API not available - preload script may have failed to load');
        return;
      }
      locations = await window.electronAPI.locations.findAll();
    } catch (error) {
      console.error('Error loading locations:', error);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadLocations();
    return () => unsubscribe();
  });
</script>

<div class="p-8">
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-foreground mb-2">Locations</h1>
    <p class="text-gray-600">Browse and manage abandoned locations</p>
  </div>

  {#if specialFilter}
    <div class="mb-4 p-3 bg-accent/10 border border-accent/20 rounded-lg flex items-center justify-between">
      <span class="text-sm text-foreground">
        Filtering by: <strong class="capitalize">{specialFilter}</strong>
      </span>
      <button
        onclick={clearSpecialFilter}
        class="text-sm text-accent hover:underline"
      >
        Clear filter
      </button>
    </div>
  {/if}

  <div class="bg-white rounded-lg shadow p-6 mb-6">
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div>
        <label for="search" class="block text-sm font-medium text-gray-700 mb-2">Search</label>
        <input
          id="search"
          type="text"
          bind:value={searchQuery}
          placeholder="Search by name..."
          class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      <div>
        <label for="state" class="block text-sm font-medium text-gray-700 mb-2">State</label>
        <select
          id="state"
          bind:value={filterState}
          class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">All States</option>
          {#each uniqueStates() as state}
            <option value={state}>{state}</option>
          {/each}
        </select>
      </div>

      <div>
        <label for="type" class="block text-sm font-medium text-gray-700 mb-2">Type</label>
        <select
          id="type"
          bind:value={filterType}
          class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">All Types</option>
          {#each uniqueTypes() as type}
            <option value={type}>{type}</option>
          {/each}
        </select>
      </div>
    </div>
  </div>

  {#if loading}
    <div class="bg-white rounded-lg shadow p-6 text-center">
      <p class="text-gray-500">Loading locations...</p>
    </div>
  {:else if filteredLocations().length > 0}
    <div class="bg-white rounded-lg shadow overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Name
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Type
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Location
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              GPS
            </th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          {#each filteredLocations() as location}
            <tr class="hover:bg-gray-50 cursor-pointer" onclick={() => router.navigate(`/location/${location.locid}`)}>
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-medium text-gray-900">{location.locnam}</div>
                {#if location.akanam}
                  <div class="text-xs text-gray-500">{location.akanam}</div>
                {/if}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {location.type || '-'}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {#if location.address?.city && location.address?.state}
                  {location.address.city}, {location.address.state}
                {:else if location.address?.state}
                  {location.address.state}
                {:else}
                  -
                {/if}
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                {#if location.gps}
                  <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                    Yes
                  </span>
                {:else}
                  <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                    No
                  </span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <div class="mt-4 text-sm text-gray-600">
      Showing {filteredLocations().length} of {locations.length} locations
    </div>
  {:else}
    <div class="bg-white rounded-lg shadow p-6 text-center text-gray-400">
      <p class="text-lg">No locations found</p>
      <p class="text-sm mt-2">
        {#if locations.length === 0}
          Add your first location from the Atlas page
        {:else}
          Try adjusting your filters
        {/if}
      </p>
    </div>
  {/if}
</div>
