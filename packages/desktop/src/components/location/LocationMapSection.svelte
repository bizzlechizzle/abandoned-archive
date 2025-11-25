<script lang="ts">
  /**
   * LocationMapSection - Unified location display with edit modal and golden ratio map
   * DECISION-014: Removed verification checkmarks per user request
   */
  import { router } from '../../stores/router';
  import Map from '../Map.svelte';
  import LocationEditModal from './LocationEditModal.svelte';
  import type { Location, LocationInput } from '@au-archive/core';
  import { GPS_ZOOM_LEVELS, GPS_GEOCODE_TIER_ZOOM } from '../../lib/constants';
  import { getDisplayCity } from '../../lib/display-helpers';

  interface Props {
    location: Location;
    onSave: (updates: Partial<LocationInput>, addressVerified: boolean, gpsVerified: boolean, culturalRegion: string | null) => Promise<void>;
    onNavigateFilter: (type: string, value: string, additionalFilters?: Record<string, string>) => void;
  }

  let { location, onSave, onNavigateFilter }: Props = $props();

  // Edit modal state
  let showEditModal = $state(false);

  // Copy notification state
  let copiedAddress = $state(false);
  let copiedGps = $state(false);

  // DECISION-014: Verification checkmarks removed per user request
  // Keeping gpsVerified for map zoom calculation

  // Address helpers
  const hasAddress = $derived(location.address?.street || location.address?.city || location.address?.state);
  const displayCity = $derived(getDisplayCity(location.address?.city));

  // Area helpers (DECISION-012/017: Include Census region fields and Country Cultural Region)
  const culturalRegion = $derived((location as any).culturalRegion);
  const censusRegion = $derived((location as any).censusRegion);
  const stateDirection = $derived((location as any).stateDirection);
  // DECISION-017: Country Cultural Region and geographic hierarchy
  const countryCulturalRegion = $derived((location as any).countryCulturalRegion);
  const countryCulturalRegionVerified = $derived((location as any).countryCulturalRegionVerified === true);
  const localCulturalRegionVerified = $derived((location as any).localCulturalRegionVerified === true);
  const country = $derived((location as any).country || 'United States');
  const continent = $derived((location as any).continent || 'North America');
  // Check if we have Local section data
  const hasLocalData = $derived(
    location.address?.county ||
    culturalRegion ||
    stateDirection ||
    location.address?.state
  );
  // Check if we have Region section data
  const hasRegionData = $derived(
    countryCulturalRegion ||
    censusRegion ||
    country ||
    continent
  );

  // GPS helpers
  const hasGps = $derived(location.gps?.lat && location.gps?.lng);

  // DECISION-016: Verification states for colored dots (must check actual verified flags, not just data existence)
  const isAddressVerified = $derived(location.address?.verified === true);
  const isGpsVerified = $derived(location.gps?.verifiedOnMap === true);
  const isAreaVerified = $derived(!!(location.address?.county || culturalRegion));

  // Copy address with notification
  function copyAddress() {
    const addr = [
      location.address?.street,
      displayCity,
      location.address?.state,
      location.address?.zipcode
    ].filter(Boolean).join(', ');
    navigator.clipboard.writeText(addr);
    copiedAddress = true;
    setTimeout(() => copiedAddress = false, 2000);
  }

  // Copy GPS with notification
  function copyGPS() {
    if (location.gps?.lat && location.gps?.lng) {
      navigator.clipboard.writeText(`${location.gps.lat.toFixed(6)}, ${location.gps.lng.toFixed(6)}`);
      copiedGps = true;
      setTimeout(() => copiedGps = false, 2000);
    }
  }

  // Auto-copy on text selection (with small delay for back-to-front selection)
  function handleAddressSelection() {
    // Small timeout ensures selection is registered regardless of direction
    setTimeout(() => {
      const selection = window.getSelection();
      if (selection && selection.toString().trim().length > 0) {
        copyAddress();
        selection.removeAllRanges();
      }
    }, 10);
  }

  function handleGpsSelection() {
    setTimeout(() => {
      const selection = window.getSelection();
      if (selection && selection.toString().trim().length > 0) {
        copyGPS();
        selection.removeAllRanges();
      }
    }, 10);
  }

  // Right-click backup: copy if text is selected
  function handleAddressContextMenu(e: MouseEvent) {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      e.preventDefault();
      copyAddress();
      selection.removeAllRanges();
    }
  }

  function handleGpsContextMenu(e: MouseEvent) {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      e.preventDefault();
      copyGPS();
      selection.removeAllRanges();
    }
  }

  // Navigate to Atlas centered on this location (satellite view for seamless transition)
  function openOnAtlas() {
    if (location.gps?.lat && location.gps?.lng) {
      router.navigate(`/atlas?lat=${location.gps.lat}&lng=${location.gps.lng}&zoom=${mapZoom}&locid=${location.locid}&layer=satellite-labels`);
    } else {
      router.navigate('/atlas');
    }
  }

  // Calculate zoom level based on GPS source/confidence
  function getZoomLevel(gps: Location['gps'], hasState: boolean): number {
    if (!gps || !gps.lat || !gps.lng) {
      return hasState ? GPS_ZOOM_LEVELS.STATE_CAPITAL : GPS_ZOOM_LEVELS.US_CENTER;
    }
    if (gps.verifiedOnMap) return GPS_ZOOM_LEVELS.VERIFIED;
    if (gps.source === 'exif' || gps.source === 'media_gps' || gps.source === 'photo_exif') return GPS_ZOOM_LEVELS.EXIF;
    if (gps.source === 'geocoded_address') {
      if (gps.geocodeTier && gps.geocodeTier >= 1 && gps.geocodeTier <= 5) {
        return GPS_GEOCODE_TIER_ZOOM[gps.geocodeTier as keyof typeof GPS_GEOCODE_TIER_ZOOM];
      }
      return GPS_ZOOM_LEVELS.GEOCODED_ADDRESS;
    }
    if (gps.source === 'geocoding' || gps.source === 'reverse_geocode') return GPS_ZOOM_LEVELS.REVERSE_GEOCODE;
    return GPS_ZOOM_LEVELS.MANUAL;
  }

  const mapZoom = $derived(getZoomLevel(location.gps, !!location.address?.state));
</script>

<div class="bg-white rounded-lg shadow">
  <!-- Header: Location with verification status and edit button (DECISION-013: No border) -->
  <div class="flex items-start justify-between px-8 pt-6 pb-4">
    <h2 class="text-2xl font-semibold text-foreground leading-none">Location</h2>
    <button
      onclick={() => showEditModal = true}
      class="text-sm text-accent hover:underline leading-none mt-1"
      title="Edit location"
    >
      edit
    </button>
  </div>

  <!-- SECTION 1: GPS (stacked first) -->
  <div class="px-8">
    <h3 class="section-title mb-2">GPS</h3>

    {#if hasGps}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="relative" onmouseup={handleGpsSelection} oncontextmenu={handleGpsContextMenu}>
        <button
          onclick={openOnAtlas}
          class="text-accent hover:underline font-mono text-sm text-left"
          title="View on Atlas"
        >
          {location.gps!.lat.toFixed(6)}, {location.gps!.lng.toFixed(6)}
        </button>
        {#if copiedGps}
          <span class="absolute -right-2 top-0 text-xs text-verified animate-pulse">Copied!</span>
        {/if}
      </div>
    {:else}
      <p class="text-sm text-gray-400 italic">No coordinates available</p>
    {/if}
  </div>

  <!-- SECTION 2: Address (stacked second, single line) -->
  <div class="px-8 mt-5">
    <h3 class="section-title mb-2">Address</h3>

    {#if hasAddress}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="text-base text-gray-900 relative" onmouseup={handleAddressSelection} oncontextmenu={handleAddressContextMenu}>
        <p>
          {#if location.address?.street}
            <button
              onclick={openOnAtlas}
              class="text-accent hover:underline text-left"
              title="View on Atlas"
            >{location.address.street}</button>{displayCity || location.address?.state || location.address?.zipcode ? ', ' : ''}
          {/if}
          {#if displayCity}
            <button
              onclick={() => onNavigateFilter('city', displayCity)}
              class="text-accent hover:underline"
              title="View all locations in {displayCity}"
            >{displayCity}</button>{location.address?.state || location.address?.zipcode ? ', ' : ''}
          {/if}
          {#if location.address?.state}
            <button
              onclick={() => onNavigateFilter('state', location.address!.state!)}
              class="text-accent hover:underline"
              title="View all locations in {location.address.state}"
            >{location.address.state}</button>{' '}
          {/if}
          {#if location.address?.zipcode}
            <button
              onclick={() => onNavigateFilter('zipcode', location.address!.zipcode!)}
              class="text-accent hover:underline"
              title="View all locations with zipcode {location.address.zipcode}"
            >{location.address.zipcode}</button>
          {/if}
        </p>
        {#if copiedAddress}
          <span class="absolute -right-2 top-0 text-xs text-verified animate-pulse">Copied!</span>
        {/if}
      </div>
    {:else}
      <p class="text-sm text-gray-400 italic">No address set</p>
    {/if}
  </div>

  <!-- SECTION 3: Mini Map (full width, smaller) -->
  <div class="px-8 mt-5">
    <div class="relative rounded-lg overflow-hidden border border-gray-200 group" style="aspect-ratio: 2 / 1;">
      <Map
        locations={[location]}
        zoom={mapZoom}
        limitedInteraction={true}
        hideAttribution={true}
        defaultLayer="satellite-labels"
      />

      <!-- Expand to Atlas button -->
      <button
        onclick={openOnAtlas}
        class="absolute bottom-2 right-2 z-[1000] px-2 py-1 bg-white/90 rounded shadow text-xs font-medium text-gray-700 hover:bg-white transition flex items-center gap-1 opacity-0 group-hover:opacity-100"
        title="Open in Atlas"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
        Expand to Atlas
      </button>
    </div>
  </div>

  <!-- SECTION 4: Local (DECISION-017: County + Local Cultural Region + State Directional + State) -->
  <div class="px-8 mt-5">
    <h3 class="section-title mb-2">Local</h3>

    {#if hasLocalData}
      <div class="space-y-1 text-sm text-gray-700">
        <!-- County -->
        {#if location.address?.county}
          <p>
            <span class="text-gray-500">County:</span>{' '}
            <button
              onclick={() => onNavigateFilter('county', location.address!.county!, location.address?.state ? { state: location.address.state } : undefined)}
              class="text-accent hover:underline"
              title="View all locations in {location.address.county} County, {location.address?.state || ''}"
            >{location.address.county}</button>
          </p>
        {/if}

        <!-- Local Cultural Region (with verify indicator) -->
        {#if culturalRegion}
          <p>
            <span class="text-gray-500">Local Cultural Region:</span>{' '}
            <button
              onclick={() => onNavigateFilter('culturalRegion', culturalRegion)}
              class="text-accent hover:underline"
              title="View all locations in {culturalRegion}"
            >{culturalRegion}</button>
            {#if localCulturalRegionVerified}
              <span class="text-verified ml-1" title="Verified">✓</span>
            {/if}
          </p>
        {/if}

        <!-- State Directional -->
        {#if stateDirection}
          <p>
            <span class="text-gray-500">State Directional:</span>{' '}
            <button
              onclick={() => onNavigateFilter('stateDirection', stateDirection)}
              class="text-accent hover:underline"
              title="View all locations in {stateDirection}"
            >{stateDirection}</button>
          </p>
        {/if}

        <!-- State -->
        {#if location.address?.state}
          <p>
            <span class="text-gray-500">State:</span>{' '}
            <button
              onclick={() => onNavigateFilter('state', location.address!.state!)}
              class="text-accent hover:underline"
              title="View all locations in {location.address.state}"
            >{location.address.state}</button>
          </p>
        {/if}
      </div>
    {:else}
      <p class="text-sm text-gray-400 italic">No local information available</p>
    {/if}
  </div>

  <!-- SECTION 5: Region (DECISION-017: Country Cultural Region + Census + Country + Continent) -->
  <div class="px-8 mt-5 pb-6">
    <h3 class="section-title mb-2">Region</h3>

    {#if hasRegionData}
      <div class="space-y-1 text-sm text-gray-700">
        <!-- Country Cultural Region (with verify indicator) -->
        {#if countryCulturalRegion}
          <p>
            <span class="text-gray-500">Country Cultural Region:</span>{' '}
            <button
              onclick={() => onNavigateFilter('countryCulturalRegion', countryCulturalRegion)}
              class="text-accent hover:underline"
              title="View all locations in {countryCulturalRegion}"
            >{countryCulturalRegion}</button>
            {#if countryCulturalRegionVerified}
              <span class="text-verified ml-1" title="Verified">✓</span>
            {/if}
          </p>
        {/if}

        <!-- 4-Region Census Model -->
        {#if censusRegion}
          <p>
            <span class="text-gray-500">Census:</span>{' '}
            <button
              onclick={() => onNavigateFilter('censusRegion', censusRegion)}
              class="text-accent hover:underline"
              title="View all locations in {censusRegion}"
            >{censusRegion}</button>
          </p>
        {/if}

        <!-- Country -->
        {#if country}
          <p>
            <span class="text-gray-500">Country:</span>{' '}
            <span class="text-gray-700">{country}</span>
          </p>
        {/if}

        <!-- Continent -->
        {#if continent}
          <p>
            <span class="text-gray-500">Continent:</span>{' '}
            <span class="text-gray-700">{continent}</span>
          </p>
        {/if}
      </div>
    {:else}
      <p class="text-sm text-gray-400 italic">No region information available</p>
    {/if}
  </div>
</div>

<!-- Edit Modal -->
{#if showEditModal}
  <LocationEditModal
    {location}
    {onSave}
    onClose={() => showEditModal = false}
  />
{/if}

<style>
  /* Pulse animation for "Copied!" notification */
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  .animate-pulse {
    animation: pulse 1s ease-in-out infinite;
  }

  /* DECISION-011: Section titles - slightly larger for better hierarchy */
  .section-title {
    font-size: 0.9rem;
    font-weight: 500;
    color: rgb(107, 114, 128); /* text-gray-500 */
    line-height: 1.25;
  }

  /* DECISION-014: Removed verification label styles - checkmarks removed per user request */
</style>
