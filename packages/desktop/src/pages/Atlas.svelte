<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { router } from '../stores/router';
  import { openImportModal } from '../stores/import-modal-store';
  import { toasts } from '../stores/toast-store';
  import Map from '../components/Map.svelte';
  import LinkLocationModal from '../components/LinkLocationModal.svelte';
  import type { Location } from '@au-archive/core';

  // Reference map point interface
  interface RefMapPoint {
    pointId: string;
    mapId: string;
    name: string | null;
    description: string | null;
    lat: number;
    lng: number;
    state: string | null;
    category: string | null;
  }

  // OPT-037: Viewport bounds type for spatial queries
  interface ViewportBounds {
    north: number;
    south: number;
    east: number;
    west: number;
  }

  let locations = $state<Location[]>([]);
  let loading = $state(true);
  let showFilters = $state(false);
  let filterState = $state('');
  let filterType = $state('');
  // Reference map layer toggle
  let showRefMapLayer = $state(false);
  let refMapPoints = $state<RefMapPoint[]>([]);
  // OPT-037: Current viewport bounds for spatial queries
  let currentBounds = $state<ViewportBounds | null>(null);
  let boundsDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  const BOUNDS_DEBOUNCE_MS = 300; // Debounce viewport changes to avoid spam
  // Link modal state
  let showLinkModal = $state(false);
  let linkingPoint = $state<{ pointId: string; name: string; lat: number; lng: number } | null>(null);

  // DECISION-016: Read URL params from router store (hash-based routing)
  let routeQuery = $state<Record<string, string>>({});

  // OPT-016: Subscribe to router and store unsubscribe for cleanup
  const unsubscribeRouter = router.subscribe(route => {
    routeQuery = route.query || {};
  });

  // OPT-016: Clean up router subscription on component destroy
  // OPT-037: Clean up bounds debounce timer
  onDestroy(() => {
    unsubscribeRouter();
    if (boundsDebounceTimer) {
      clearTimeout(boundsDebounceTimer);
    }
  });

  const highlightLocid = $derived(routeQuery.locid || null);

  const urlLayer = $derived.by(() => {
    const layer = routeQuery.layer;
    const validLayers = ['satellite', 'street', 'topo', 'light', 'dark', 'satellite-labels'];
    if (layer && validLayers.includes(layer)) {
      return layer as 'satellite' | 'street' | 'topo' | 'light' | 'dark' | 'satellite-labels';
    }
    return null;
  });

  // P3d: Context menu state for right-click options
  let contextMenu = $state<{ show: boolean; x: number; y: number; lat: number; lng: number }>({
    show: false,
    x: 0,
    y: 0,
    lat: 0,
    lng: 0,
  });

  // DECISION-015: KISS - Only show locations with actual GPS coordinates
  // Removes "ghost points" that appeared when locations had city/state but no GPS
  function isMappable(loc: Location): boolean {
    return !!(loc.gps?.lat && loc.gps?.lng);
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

  /**
   * OPT-037: Load locations within current viewport bounds
   * Uses spatial SQL query instead of loading all locations
   */
  async function loadLocationsInBounds(bounds: ViewportBounds) {
    try {
      loading = true;
      if (!window.electronAPI?.locations?.findInBounds) {
        // Fallback to old behavior if API not available
        console.warn('findInBounds API not available, falling back to findAll');
        const allLocations = await window.electronAPI.locations.findAll();
        locations = allLocations;
        return;
      }
      const boundsLocations = await window.electronAPI.locations.findInBounds(bounds);
      locations = boundsLocations;
    } catch (error) {
      console.error('Error loading locations in bounds:', error);
    } finally {
      loading = false;
    }
  }

  /**
   * OPT-037: Load reference points within current viewport bounds
   */
  async function loadRefPointsInBounds(bounds: ViewportBounds) {
    if (!window.electronAPI?.refMaps?.getPointsInBounds) {
      // Fallback to old behavior
      await loadRefMapPoints();
      return;
    }
    try {
      const points = await window.electronAPI.refMaps.getPointsInBounds(bounds);
      refMapPoints = points;
    } catch (err) {
      console.error('Error loading reference points in bounds:', err);
    }
  }

  /**
   * OPT-037: Handle viewport bounds change from Map component
   * Debounced to avoid excessive queries during pan/zoom
   */
  function handleBoundsChange(bounds: ViewportBounds) {
    currentBounds = bounds;

    // Clear existing debounce timer
    if (boundsDebounceTimer) {
      clearTimeout(boundsDebounceTimer);
    }

    // Debounce the actual data loading
    boundsDebounceTimer = setTimeout(() => {
      loadLocationsInBounds(bounds);
      if (showRefMapLayer) {
        loadRefPointsInBounds(bounds);
      }
    }, BOUNDS_DEBOUNCE_MS);
  }

  // Legacy function for initial load (before bounds are known)
  async function loadLocations() {
    try {
      loading = true;
      if (!window.electronAPI?.locations) {
        console.error('Electron API not available - preload script may have failed to load');
        return;
      }
      // Initial load - will be replaced by viewport query once bounds are available
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

  // Load reference map points from imported maps
  async function loadRefMapPoints() {
    if (!window.electronAPI?.refMaps) return;
    try {
      const points = await window.electronAPI.refMaps.getAllPoints();
      refMapPoints = points;
    } catch (err) {
      console.error('Error loading reference map points:', err);
    }
  }

  // Handle creating a new location from a reference point popup
  // Migration 38: Include refPointId for deletion after location creation
  function handleCreateFromRefPoint(data: { pointId: string; name: string; lat: number; lng: number; state: string | null }) {
    openImportModal({
      name: data.name,
      gps_lat: data.lat,
      gps_lng: data.lng,
      state: data.state || undefined,
      refPointId: data.pointId,
    });
  }

  // Handle deleting a reference point from popup
  async function handleDeleteRefPoint(pointId: string, name: string) {
    // Show confirmation dialog
    const confirmed = confirm(`Delete reference point "${name}"?\n\nThis cannot be undone.`);
    if (!confirmed) return;

    try {
      const result = await window.electronAPI.refMaps.deletePoint(pointId);
      if (result.success) {
        toasts.success(`Deleted "${name}"`);
        // Refresh reference points to update map
        await loadRefMapPoints();
      } else {
        toasts.error(result.error || 'Failed to delete point');
      }
    } catch (err) {
      console.error('Error deleting reference point:', err);
      toasts.error('Failed to delete reference point');
    }
  }

  // Handle clicking the Link button on a reference point popup
  function handleLinkRefPoint(data: { pointId: string; name: string; lat: number; lng: number }) {
    linkingPoint = data;
    showLinkModal = true;
  }

  // Handle confirming the link to a location
  async function handleConfirmLink(locationId: string) {
    if (!linkingPoint) return;

    try {
      const result = await window.electronAPI.refMaps.linkToLocation(linkingPoint.pointId, locationId);
      if (result.success) {
        toasts.success(`Linked "${linkingPoint.name}" to location`);
        // Refresh reference points to update map (linked points are filtered out)
        await loadRefMapPoints();
      } else {
        toasts.error(result.error || 'Failed to link');
      }
    } catch (err) {
      console.error('Error linking reference point:', err);
      toasts.error('Failed to link reference point');
    } finally {
      showLinkModal = false;
      linkingPoint = null;
    }
  }

  // Close the link modal
  function closeLinkModal() {
    showLinkModal = false;
    linkingPoint = null;
  }

  onMount(() => {
    // OPT-038: Don't call loadLocations() here - viewport-based loading handles it
    // The Map component emits onBoundsChange when initialized, triggering loadLocationsInBounds
    // This prevents double-loading (previously loaded ALL then reloaded in viewport)

    // Load ref map points (small dataset, OK to load all)
    loadRefMapPoints();

    // Safety fallback: if no bounds received within 3s, load all locations
    // This handles edge case where Map fails to emit initial bounds
    const fallbackTimer = setTimeout(() => {
      if (locations.length === 0 && !currentBounds) {
        console.warn('[Atlas] No bounds received from Map, falling back to full load');
        loadLocations();
      }
    }, 3000);

    // Close context menu on click outside
    const handleClickOutside = () => closeContextMenu();
    document.addEventListener('click', handleClickOutside);

    return () => {
      clearTimeout(fallbackTimer);
      document.removeEventListener('click', handleClickOutside);
    };
  });
</script>

<div class="h-full flex flex-col">
  <div class="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
    <h1 class="text-xl font-semibold text-foreground">Atlas</h1>
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
      <!-- Reference Pins checkbox for reference map points -->
      <div class="flex items-center gap-2 pt-3 mt-3 border-t border-gray-200">
        <input
          type="checkbox"
          id="ref-pins"
          bind:checked={showRefMapLayer}
          class="w-4 h-4 accent-accent rounded"
        />
        <label for="ref-pins" class="text-sm text-gray-700 cursor-pointer">
          Reference Pins
          {#if refMapPoints.length > 0}
            <span class="text-gray-400">({refMapPoints.length})</span>
          {/if}
        </label>
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
      popupMode="minimal"
      defaultLayer={urlLayer ?? 'satellite-labels'}
      refMapPoints={refMapPoints}
      showRefMapLayer={showRefMapLayer}
      onCreateFromRefPoint={handleCreateFromRefPoint}
      onLinkRefPoint={handleLinkRefPoint}
      onDeleteRefPoint={handleDeleteRefPoint}
      hideAttribution={true}
      fitBounds={true}
      onBoundsChange={handleBoundsChange}
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

<!-- Link Location Modal -->
{#if showLinkModal && linkingPoint}
  <LinkLocationModal
    pointName={linkingPoint.name}
    onClose={closeLinkModal}
    onLink={handleConfirmLink}
  />
{/if}
