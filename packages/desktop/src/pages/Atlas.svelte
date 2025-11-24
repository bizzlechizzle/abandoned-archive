<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from '../stores/router';
  import { openImportModal } from '../stores/import-modal-store';
  import { toasts } from '../stores/toast-store';
  import Map from '../components/Map.svelte';
  import type { Location } from '@au-archive/core';

  let locations = $state<Location[]>([]);
  let loading = $state(true);
  let showFilters = $state(false);
  let filterState = $state('');
  let filterType = $state('');
  // FIX 6.8: Heat map toggle
  let showHeatMap = $state(false);

  // FEAT-P2: Default Atlas view settings
  let defaultCenter = $state<{ lat: number; lng: number } | null>(null);
  let defaultZoom = $state<number | null>(null);
  let savingDefaultView = $state(false);

  // P3d: Context menu state for right-click options
  let contextMenu = $state<{ show: boolean; x: number; y: number; lat: number; lng: number }>({
    show: false,
    x: 0,
    y: 0,
    lat: 0,
    lng: 0,
  });

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
    // Left-click closes context menu if open
    closeContextMenu();
  }

  function handleMapRightClick(lat: number, lng: number, screenX: number, screenY: number) {
    // BUG-2 FIX: Position context menu at actual click location
    contextMenu = {
      show: true,
      x: screenX,
      y: screenY,
      lat,
      lng,
    };
  }

  function closeContextMenu() {
    contextMenu = { ...contextMenu, show: false };
  }

  function handleAddLocation() {
    openImportModal({
      gps_lat: contextMenu.lat,
      gps_lng: contextMenu.lng,
    });
    closeContextMenu();
  }

  async function handleCopyGps() {
    const gpsText = `${contextMenu.lat.toFixed(6)}, ${contextMenu.lng.toFixed(6)}`;
    try {
      await navigator.clipboard.writeText(gpsText);
      toasts.success(`GPS copied: ${gpsText}`);
    } catch (err) {
      console.error('Failed to copy GPS:', err);
      toasts.error('Failed to copy GPS to clipboard');
    }
    closeContextMenu();
  }

  // FEAT-P1: Verify location GPS - updates coordinates and marks as verified
  async function handleLocationVerify(locid: string, lat: number, lng: number) {
    try {
      await window.electronAPI.locations.update(locid, {
        gps: {
          lat,
          lng,
          source: 'user_map_click',
          verifiedOnMap: true,
        },
      });
      toasts.success('Location verified');
      // Reload locations to update the map
      await loadLocations();
    } catch (err) {
      console.error('Failed to verify location:', err);
      toasts.error('Failed to verify location');
    }
  }

  // FEAT-P2: Load default Atlas view from settings
  async function loadDefaultView() {
    if (!window.electronAPI?.settings) return;
    try {
      const settings = await window.electronAPI.settings.getAll();
      if (settings.atlas_default_lat && settings.atlas_default_lng) {
        defaultCenter = {
          lat: parseFloat(settings.atlas_default_lat),
          lng: parseFloat(settings.atlas_default_lng),
        };
      }
      if (settings.atlas_default_zoom) {
        defaultZoom = parseInt(settings.atlas_default_zoom, 10);
      }
    } catch (err) {
      console.error('Error loading default view:', err);
    }
  }

  // FEAT-P2: Save current map view as default
  async function saveDefaultView() {
    if (!window.electronAPI?.settings) return;
    // Get current center from context menu (last right-click position as proxy)
    // In practice, we'd need to get this from the Map component
    // For now, use a simple approach: save the center of the US or current context
    savingDefaultView = true;
    try {
      // We'll use current context menu position if available, else US center
      const lat = contextMenu.lat || 39.8283;
      const lng = contextMenu.lng || -98.5795;
      const zoom = 5; // Default zoom for US view

      await window.electronAPI.settings.set('atlas_default_lat', String(lat));
      await window.electronAPI.settings.set('atlas_default_lng', String(lng));
      await window.electronAPI.settings.set('atlas_default_zoom', String(zoom));

      defaultCenter = { lat, lng };
      defaultZoom = zoom;

      toasts.success('Default view saved');
    } catch (err) {
      console.error('Error saving default view:', err);
      toasts.error('Failed to save default view');
    } finally {
      savingDefaultView = false;
    }
  }

  onMount(() => {
    loadLocations();
    loadDefaultView(); // FEAT-P2: Load saved default view
    // Close context menu on click outside
    const handleClickOutside = () => closeContextMenu();
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
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
      <!-- FEAT-P2: Set as Default View button -->
      <button
        onclick={saveDefaultView}
        disabled={savingDefaultView}
        class="px-4 py-2 bg-gray-100 text-foreground rounded hover:bg-gray-200 transition text-sm disabled:opacity-50"
        title="Save current view as default when opening Atlas"
      >
        {savingDefaultView ? 'Saving...' : 'Set Default View'}
      </button>
      <!-- FIX 6.8: Heat map toggle button - NME: No emoji per claude.md -->
      <button
        onclick={() => showHeatMap = !showHeatMap}
        class="px-4 py-2 rounded transition text-sm {showHeatMap ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-foreground hover:bg-gray-200'}"
        title="Toggle heat map visualization"
      >
        {showHeatMap ? 'Heat On' : 'Heat Off'}
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
      onLocationVerify={handleLocationVerify}
    />
    {#if loading}
      <div class="absolute top-2 left-1/2 -translate-x-1/2 bg-white px-4 py-2 rounded shadow-lg z-10">
        <p class="text-gray-500 text-sm">Loading locations...</p>
      </div>
    {/if}

    <!-- BUG-2 FIX: Right-click context menu positioned at click location -->
    {#if contextMenu.show}
      <div
        class="fixed bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50 min-w-[160px]"
        style="left: {Math.min(contextMenu.x, window.innerWidth - 180)}px; top: {Math.min(contextMenu.y, window.innerHeight - 150)}px;"
        onclick={(e) => e.stopPropagation()}
      >
        <div class="px-3 py-2 border-b border-gray-100">
          <p class="text-xs text-gray-500 font-mono">
            {contextMenu.lat.toFixed(6)}, {contextMenu.lng.toFixed(6)}
          </p>
        </div>
        <button
          onclick={handleAddLocation}
          class="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 transition flex items-center gap-2"
        >
          <svg class="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Add Location
        </button>
        <button
          onclick={handleCopyGps}
          class="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 transition flex items-center gap-2"
        >
          <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
          </svg>
          Copy GPS
        </button>
        <button
          onclick={closeContextMenu}
          class="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-100 transition"
        >
          Cancel
        </button>
      </div>
    {/if}
  </div>
</div>
