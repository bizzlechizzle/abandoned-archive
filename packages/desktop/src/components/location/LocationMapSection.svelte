<script lang="ts">
  /**
   * LocationMapSection - Unified location display with edit modal and golden ratio map
   * DECISION-014: Removed verification checkmarks per user request
   */
  import { router } from '../../stores/router';
  import Map from '../Map.svelte';
  import LocationEditModal from './LocationEditModal.svelte';
  import SubLocationGpsModal from './SubLocationGpsModal.svelte';
  import type { Location, LocationInput } from '@au-archive/core';
  import { GPS_ZOOM_LEVELS, GPS_GEOCODE_TIER_ZOOM } from '../../lib/constants';
  import { getDisplayCity } from '../../lib/display-helpers';

  /**
   * Migration 31: Sub-location GPS interface
   * When provided, displays and edits sub-location GPS separately from host location
   */
  interface SubLocationGps {
    subid: string;
    subnam: string;
    gps_lat: number | null;
    gps_lng: number | null;
    gps_verified_on_map: boolean;
    gps_source: string | null;
  }

  /**
   * Campus map: Sub-location with GPS for campus mini map
   */
  interface CampusSubLocation {
    subid: string;
    subnam: string;
    gps_lat: number;
    gps_lng: number;
  }

  interface Props {
    location: Location;
    onSave: (updates: Partial<LocationInput>, addressVerified: boolean, gpsVerified: boolean, culturalRegion: string | null) => Promise<void>;
    onNavigateFilter: (type: string, value: string, additionalFilters?: Record<string, string>) => void;
    /** When true, zooms out 1 level more and allows extra zoom-out capability */
    isHostLocation?: boolean;
    /** Migration 31: When viewing sub-location, use its GPS (separate from host) */
    subLocation?: SubLocationGps | null;
    /** Migration 31: Callback to save sub-location GPS */
    onSubLocationGpsSave?: (lat: number, lng: number) => Promise<void>;
    /** Campus map: Sub-locations with GPS to show on mini map */
    campusSubLocations?: CampusSubLocation[];
    /** Campus map: Callback when clicking a sub-location marker */
    onCampusSubLocationClick?: (subid: string) => void;
  }

  let { location, onSave, onNavigateFilter, isHostLocation = false, subLocation = null, onSubLocationGpsSave, campusSubLocations = [], onCampusSubLocationClick }: Props = $props();

  // Edit modal state
  let showEditModal = $state(false);
  // Migration 31: Sub-location GPS modal (separate from host location edit)
  let showSubLocationGpsModal = $state(false);

  // Migration 31: Handle edit button click - show correct modal based on context
  function handleEditClick() {
    if (subLocation && onSubLocationGpsSave) {
      // Viewing sub-location: show GPS-only modal for building
      showSubLocationGpsModal = true;
    } else {
      // Viewing host location: show full edit modal
      showEditModal = true;
    }
  }

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

  // STATE_NAMES: Convert state abbreviations to full names
  const STATE_NAMES: Record<string, string> = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
    CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
    HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
    KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
    MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
    MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
    NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
    OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
    SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
    VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
    DC: 'District of Columbia', PR: 'Puerto Rico', VI: 'Virgin Islands', GU: 'Guam'
  };

  // Extract just the direction from stateDirection (e.g., "Central NY" → "Central")
  const directionOnly = $derived(
    stateDirection ? stateDirection.replace(/\s+[A-Z]{2}$/, '') : null
  );

  // Full state name from abbreviation
  const fullStateName = $derived(
    location.address?.state ? STATE_NAMES[location.address.state] || location.address.state : null
  );

  // GPS helpers - Migration 31: Use sub-location GPS when viewing sub-location
  const effectiveGpsLat = $derived(subLocation ? subLocation.gps_lat : location.gps?.lat);
  const effectiveGpsLng = $derived(subLocation ? subLocation.gps_lng : location.gps?.lng);
  const hasGps = $derived(effectiveGpsLat && effectiveGpsLng);

  // DECISION-016: Verification states for colored dots (must check actual verified flags, not just data existence)
  const isAddressVerified = $derived(location.address?.verified === true);
  // Migration 31: GPS verification uses sub-location's verified status when applicable
  const isGpsVerified = $derived(subLocation ? subLocation.gps_verified_on_map : (location.gps?.verifiedOnMap === true));
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

  // Copy GPS with notification - Migration 31: Uses effective GPS (sub-location or host)
  function copyGPS() {
    if (effectiveGpsLat && effectiveGpsLng) {
      navigator.clipboard.writeText(`${effectiveGpsLat.toFixed(6)}, ${effectiveGpsLng.toFixed(6)}`);
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
  // Migration 31: Uses effective GPS (sub-location or host)
  function openOnAtlas() {
    if (effectiveGpsLat && effectiveGpsLng) {
      router.navigate(`/atlas?lat=${effectiveGpsLat}&lng=${effectiveGpsLng}&zoom=${mapZoom}&locid=${location.locid}&layer=satellite-labels`);
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

  // Migration 31: Create location object for map that uses sub-location GPS when available
  const mapLocation = $derived(subLocation && subLocation.gps_lat && subLocation.gps_lng
    ? {
        ...location,
        gps: {
          lat: subLocation.gps_lat,
          lng: subLocation.gps_lng,
          verifiedOnMap: subLocation.gps_verified_on_map,
          source: subLocation.gps_source || 'user_map_click',
        }
      }
    : location
  );

  // Calculate base zoom, then subtract 1 for host locations to show more area
  // Uses mapLocation.gps so sub-locations use their own GPS verification status
  const baseZoom = $derived(getZoomLevel(mapLocation.gps, !!location.address?.state));
  const mapZoom = $derived(isHostLocation ? Math.max(1, baseZoom - 1) : baseZoom);
</script>

<div class="bg-white rounded-lg shadow-md">
  <!-- Header: Location with verification status and edit button (DECISION-013: No border) -->
  <div class="flex items-start justify-between px-8 pt-6 pb-4">
    <h2 class="text-2xl font-semibold text-foreground leading-none">Location</h2>
    <button
      onclick={handleEditClick}
      class="text-sm text-accent hover:underline leading-none mt-1"
      title={subLocation ? 'Edit building GPS' : 'Edit location'}
    >
      edit
    </button>
  </div>

  <!-- SECTION 1: GPS (stacked first) - Migration 31: Shows sub-location GPS when viewing building -->
  <div class="px-8">
    <h3 class="section-title mb-2">
      GPS
      {#if subLocation}
        <span class="text-xs font-normal text-gray-400 ml-1">(Building)</span>
      {/if}
    </h3>

    {#if hasGps}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="relative" onmouseup={handleGpsSelection} oncontextmenu={handleGpsContextMenu}>
        <button
          onclick={openOnAtlas}
          class="text-accent hover:underline font-mono text-sm text-left"
          title="View on Atlas"
        >
          {effectiveGpsLat!.toFixed(6)}, {effectiveGpsLng!.toFixed(6)}
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

  <!-- SECTION 3: Mini Map (full width, smaller) - Hidden when no GPS -->
  <!-- Campus map shows host location + all sub-locations with GPS -->
  <div class="px-8 mt-5">
    {#if hasGps}
      <div class="relative rounded-lg overflow-hidden border border-gray-200 group" style="aspect-ratio: 2 / 1;">
        <Map
          locations={[mapLocation]}
          zoom={mapZoom}
          limitedInteraction={true}
          allowFullZoomIn={campusSubLocations.length > 0}
          hideAttribution={true}
          defaultLayer="satellite-labels"
          extraZoomOut={isHostLocation}
          {campusSubLocations}
          {onCampusSubLocationClick}
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
    {:else}
      <!-- No GPS - Show state-only placeholder -->
      <div class="relative rounded-lg overflow-hidden border border-gray-200 bg-gray-100 flex items-center justify-center" style="aspect-ratio: 2 / 1;">
        <div class="text-center text-gray-500">
          <svg class="w-8 h-8 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p class="text-sm font-medium">No GPS coordinates</p>
          {#if location.address?.state}
            <p class="text-xs text-gray-400 mt-1">Location in {fullStateName || location.address.state}</p>
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <!-- SECTION 4: Local (DECISION-018: Horizontal dash-separated format) -->
  <div class="px-8 mt-5">
    <h3 class="section-title mb-2">Local</h3>

    {#if hasLocalData}
      <p class="text-sm">
        {#if location.address?.county}
          <button
            onclick={() => onNavigateFilter('county', location.address!.county!, location.address?.state ? { state: location.address.state } : undefined)}
            class="text-accent hover:underline"
            title="View all locations in {location.address.county} County"
          >{location.address.county} County</button>
        {/if}
        {#if culturalRegion}
          {#if location.address?.county}<span class="text-gray-400"> - </span>{/if}
          <button
            onclick={() => onNavigateFilter('culturalRegion', culturalRegion)}
            class="text-accent hover:underline"
            title="View all locations in {culturalRegion}"
          >{culturalRegion}</button>
          {#if localCulturalRegionVerified}<span class="text-verified ml-1 text-xs" title="Verified">(verified)</span>{/if}
        {/if}
        {#if directionOnly}
          {#if location.address?.county || culturalRegion}<span class="text-gray-400"> - </span>{/if}
          <button
            onclick={() => onNavigateFilter('stateDirection', stateDirection)}
            class="text-accent hover:underline"
            title="View all locations in {stateDirection}"
          >{directionOnly}</button>
        {/if}
        {#if fullStateName}
          {#if location.address?.county || culturalRegion || directionOnly}<span class="text-gray-400"> - </span>{/if}
          <button
            onclick={() => onNavigateFilter('state', location.address!.state!)}
            class="text-accent hover:underline"
            title="View all locations in {fullStateName}"
          >{fullStateName}</button>
        {/if}
      </p>
    {:else}
      <p class="text-sm text-gray-400 italic">No local information available</p>
    {/if}
  </div>

  <!-- SECTION 5: Region (DECISION-018: Horizontal dash-separated format) -->
  <div class="px-8 mt-5 pb-6">
    <h3 class="section-title mb-2">Region</h3>

    {#if hasRegionData}
      <p class="text-sm">
        {#if countryCulturalRegion}
          <button
            onclick={() => onNavigateFilter('countryCulturalRegion', countryCulturalRegion)}
            class="text-accent hover:underline"
            title="View all locations in {countryCulturalRegion}"
          >{countryCulturalRegion}</button>
          {#if countryCulturalRegionVerified}<span class="text-verified ml-1 text-xs" title="Verified">(verified)</span>{/if}
        {/if}
        {#if censusRegion}
          {#if countryCulturalRegion}<span class="text-gray-400"> - </span>{/if}
          <button
            onclick={() => onNavigateFilter('censusRegion', censusRegion)}
            class="text-accent hover:underline"
            title="View all locations in {censusRegion}"
          >{censusRegion}</button>
        {/if}
        {#if country}
          {#if countryCulturalRegion || censusRegion}<span class="text-gray-400"> - </span>{/if}
          <button
            onclick={() => onNavigateFilter('country', country)}
            class="text-accent hover:underline"
            title="View all locations in {country}"
          >{country}</button>
        {/if}
        {#if continent}
          {#if countryCulturalRegion || censusRegion || country}<span class="text-gray-400"> - </span>{/if}
          <button
            onclick={() => onNavigateFilter('continent', continent)}
            class="text-accent hover:underline"
            title="View all locations in {continent}"
          >{continent}</button>
        {/if}
      </p>
    {:else}
      <p class="text-sm text-gray-400 italic">No region information available</p>
    {/if}
  </div>
</div>

<!-- Edit Modal (Host Location) -->
{#if showEditModal}
  <LocationEditModal
    {location}
    {onSave}
    onClose={() => showEditModal = false}
  />
{/if}

<!-- Migration 31: Sub-Location GPS Modal (Building GPS - separate from host) -->
{#if showSubLocationGpsModal && subLocation && onSubLocationGpsSave}
  <SubLocationGpsModal
    subLocationName={subLocation.subnam}
    initialLat={subLocation.gps_lat}
    initialLng={subLocation.gps_lng}
    initialVerified={subLocation.gps_verified_on_map}
    onSave={onSubLocationGpsSave}
    onClose={() => showSubLocationGpsModal = false}
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
