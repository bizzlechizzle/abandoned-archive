<script lang="ts">
  /**
   * LocationMapSection - GPS coordinates, map embed, verify button
   * Per LILBITS: ~150 lines, single responsibility
   * Kanye6: GPS confidence badge including 'geocoded_address' source
   * Kanye9: Dynamic zoom based on GPS confidence
   */
  import { router } from '../../stores/router';
  import Map from '../Map.svelte';
  import type { Location } from '@au-archive/core';
  import { GPS_ZOOM_LEVELS, GPS_GEOCODE_TIER_ZOOM } from '../../lib/constants';

  interface Props {
    location: Location;
    onMarkVerified: () => void;
    verifying: boolean;
  }

  let { location, onMarkVerified, verifying }: Props = $props();

  // Kanye6: GPS confidence indicator with 'geocoded_address' support
  function getGpsConfidence(gps: Location['gps']): { level: 'high' | 'medium' | 'low'; color: string; label: string } {
    if (!gps) return { level: 'low', color: 'gray', label: 'No GPS' };

    if (gps.verifiedOnMap) {
      return { level: 'high', color: 'green', label: 'Verified' };
    }

    if (gps.source === 'exif' || gps.source === 'media_gps') {
      return { level: 'medium', color: 'blue', label: 'From Media' };
    }

    if (gps.source === 'geocoding' || gps.source === 'reverse_geocode') {
      return { level: 'medium', color: 'blue', label: 'Geocoded' };
    }

    // Kanye6: Forward geocoded from address
    if (gps.source === 'geocoded_address') {
      return { level: 'medium', color: 'blue', label: 'From Address' };
    }

    if (gps.source === 'manual' || gps.source === 'user_input') {
      return { level: 'low', color: 'yellow', label: 'Manual Entry' };
    }

    return { level: 'low', color: 'gray', label: 'Unverified' };
  }

  // Kanye9: Calculate zoom level based on GPS source/confidence and geocode tier
  function getZoomLevel(gps: Location['gps'], hasState: boolean): number {
    if (!gps) {
      return hasState ? GPS_ZOOM_LEVELS.STATE_CAPITAL : GPS_ZOOM_LEVELS.US_CENTER;
    }

    if (gps.verifiedOnMap) return GPS_ZOOM_LEVELS.VERIFIED;
    if (gps.source === 'exif' || gps.source === 'media_gps') return GPS_ZOOM_LEVELS.EXIF;

    // Kanye9: Use tier-based zoom for geocoded addresses
    if (gps.source === 'geocoded_address') {
      if (gps.geocodeTier && gps.geocodeTier >= 1 && gps.geocodeTier <= 5) {
        return GPS_GEOCODE_TIER_ZOOM[gps.geocodeTier as keyof typeof GPS_GEOCODE_TIER_ZOOM];
      }
      return GPS_ZOOM_LEVELS.GEOCODED_ADDRESS; // Fallback if no tier stored
    }

    if (gps.source === 'geocoding' || gps.source === 'reverse_geocode') return GPS_ZOOM_LEVELS.REVERSE_GEOCODE;
    if (gps.source === 'manual' || gps.source === 'user_input') return GPS_ZOOM_LEVELS.MANUAL;

    return GPS_ZOOM_LEVELS.MANUAL; // Default for unknown source with GPS
  }

  // Derived zoom level for map
  const mapZoom = $derived(getZoomLevel(location.gps, !!location.address?.state));
</script>

<div class="bg-white rounded-lg shadow p-6">
  <h2 class="text-xl font-semibold mb-4 text-foreground">Location</h2>

  {#if location.gps}
    {@const confidence = getGpsConfidence(location.gps)}
    <div class="mb-4">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-sm font-medium text-gray-500">GPS Coordinates</h3>
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium
          {confidence.color === 'green' ? 'bg-green-100 text-green-800' :
           confidence.color === 'blue' ? 'bg-blue-100 text-blue-800' :
           confidence.color === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
           'bg-gray-100 text-gray-600'}">
          {#if confidence.level === 'high'}
            <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
            </svg>
          {:else if confidence.level === 'medium'}
            <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
            </svg>
          {:else}
            <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
            </svg>
          {/if}
          {confidence.label}
        </span>
      </div>
      <p class="text-base text-gray-900 font-mono text-sm">
        {location.gps.lat.toFixed(6)}, {location.gps.lng.toFixed(6)}
      </p>

      <!-- Kanye9: GPS accuracy warning for low-tier geocoding -->
      {#if location.gps.source === 'geocoded_address' && location.gps.geocodeTier && location.gps.geocodeTier > 1}
        <div class="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
          <span class="font-medium">Approximate location</span> -
          {#if location.gps.geocodeTier === 2}
            Based on city center. Click map to set exact location.
          {:else if location.gps.geocodeTier === 3}
            Based on zipcode area. Click map to set exact location.
          {:else if location.gps.geocodeTier === 4}
            Based on county center. Click map to set exact location.
          {:else}
            Based on state center. Click map to set exact location.
          {/if}
        </div>
      {/if}
    </div>

    <div class="h-64 rounded overflow-hidden mb-3">
      <Map locations={[location]} zoom={mapZoom} />
    </div>

    <div class="flex flex-wrap items-center gap-3 text-xs">
      {#if location.gps.source}
        <span class="text-gray-500">Source: {location.gps.source}</span>
      {/if}
      {#if location.gps.verifiedOnMap}
        <div class="flex items-center gap-1">
          <svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          <span class="text-green-600">Verified on map</span>
        </div>
      {:else}
        <button
          onclick={onMarkVerified}
          disabled={verifying}
          class="px-3 py-1 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50"
        >
          {verifying ? 'Saving...' : 'Mark as Verified'}
        </button>
      {/if}
    </div>
  {:else if location.address?.state}
    <!-- PUEA: Show approximate map based on state capital -->
    <div class="mb-4">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-sm font-medium text-gray-500">Location</h3>
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
          <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
          </svg>
          Approximate (State Capital)
        </span>
      </div>
      <p class="text-sm text-gray-600">
        Showing {location.address.state} state capital area
      </p>
    </div>

    <div class="h-64 rounded overflow-hidden mb-3">
      <Map locations={[location]} zoom={mapZoom} />
    </div>

    <div class="flex items-center gap-2 text-xs text-yellow-600 bg-yellow-50 p-2 rounded">
      <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>No exact GPS. Map shows approximate area based on address.</span>
    </div>
  {:else}
    <!-- PUEA: No GPS and no state - prompt to add -->
    <div class="text-center py-6 bg-gray-50 rounded">
      <svg class="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      <p class="text-gray-500 mb-3">No location data available</p>
      <button
        onclick={() => router.navigate('/atlas')}
        class="px-4 py-2 text-sm bg-accent text-white rounded hover:opacity-90 transition"
      >
        Add GPS on Atlas
      </button>
    </div>
  {/if}
</div>
