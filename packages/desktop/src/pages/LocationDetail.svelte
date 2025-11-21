<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from '../stores/router';
  import Map from '../components/Map.svelte';
  import LocationEditForm from '../components/LocationEditForm.svelte';
  import NotesSection from '../components/NotesSection.svelte';
  import type { Location, LocationInput } from '@au-archive/core';

  interface Props {
    locationId: string;
  }

  let { locationId }: Props = $props();

  interface MediaImage {
    imgsha: string;
    imgnam: string;
    imgloc: string;
    meta_width: number | null;
    meta_height: number | null;
    meta_date_taken: string | null;
  }

  interface MediaVideo {
    vidsha: string;
    vidnam: string;
    vidloc: string;
    meta_duration: number | null;
    meta_width: number | null;
    meta_height: number | null;
    meta_codec: string | null;
  }

  interface MediaDocument {
    docsha: string;
    docnam: string;
    docloc: string;
  }

  let location = $state<Location | null>(null);
  let images = $state<MediaImage[]>([]);
  let videos = $state<MediaVideo[]>([]);
  let documents = $state<MediaDocument[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let isEditing = $state(false);
  let selectedImage = $state<string | null>(null);
  let currentUser = $state('default');
  let showAllImages = $state(false);
  let showAllVideos = $state(false);
  let showAllDocuments = $state(false);

  const IMAGE_LIMIT = 6;
  const VIDEO_LIMIT = 3;
  const DOCUMENT_LIMIT = 3;

  let displayedImages = $derived(showAllImages ? images : images.slice(0, IMAGE_LIMIT));
  let displayedVideos = $derived(showAllVideos ? videos : videos.slice(0, VIDEO_LIMIT));
  let displayedDocuments = $derived(showAllDocuments ? documents : documents.slice(0, DOCUMENT_LIMIT));

  async function loadLocation() {
    try {
      loading = true;
      error = null;

      const [loc, media] = await Promise.all([
        window.electronAPI.locations.findById(locationId),
        window.electronAPI.media.findByLocation(locationId),
      ]);

      location = loc;
      if (!location) {
        error = 'Location not found';
      }

      // Load media
      if (media) {
        images = (media.images as MediaImage[]) || [];
        videos = (media.videos as MediaVideo[]) || [];
        documents = (media.documents as MediaDocument[]) || [];
      }
    } catch (err) {
      console.error('Error loading location:', err);
      error = 'Failed to load location';
    } finally {
      loading = false;
    }
  }

  async function handleSave(updates: Partial<LocationInput>) {
    if (!location) return;

    await window.electronAPI.locations.update(location.locid, updates);
    await loadLocation();
    isEditing = false;
  }

  function handleCancelEdit() {
    isEditing = false;
  }

  async function openMediaFile(filePath: string) {
    try {
      await window.electronAPI.media.openFile(filePath);
    } catch (error) {
      console.error('Error opening file:', error);
    }
  }

  function openLightbox(imagePath: string) {
    selectedImage = imagePath;
  }

  function closeLightbox() {
    selectedImage = null;
  }

  function formatDuration(seconds: number | null): string {
    if (!seconds) return 'Unknown';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function formatResolution(width: number | null, height: number | null): string {
    if (!width || !height) return 'Unknown';
    return `${width}x${height}`;
  }

  onMount(async () => {
    loadLocation();

    // Load current user from settings
    try {
      const settings = await window.electronAPI.settings.getAll();
      currentUser = settings.current_user || 'default';
    } catch (error) {
      console.error('Error loading user settings:', error);
    }
  });
</script>

<div class="h-full overflow-auto">
  {#if loading}
    <div class="flex items-center justify-center h-full">
      <p class="text-gray-500">Loading location...</p>
    </div>
  {:else if error || !location}
    <div class="flex items-center justify-center h-full">
      <div class="text-center">
        <p class="text-red-500 text-lg">{error || 'Location not found'}</p>
        <button
          onclick={() => router.navigate('/locations')}
          class="mt-4 px-4 py-2 bg-accent text-white rounded hover:opacity-90"
        >
          Back to Locations
        </button>
      </div>
    </div>
  {:else}
    <div class="max-w-6xl mx-auto p-8">
      <!-- Hero Image -->
      {#if images.length > 0}
        <div class="mb-6 -mx-8 -mt-8">
          <button
            onclick={() => openLightbox(images[0].imgloc)}
            class="relative w-full h-64 md:h-96 bg-gray-100 overflow-hidden group cursor-pointer"
          >
            <div class="absolute inset-0 flex items-center justify-center text-gray-400">
              <svg class="w-24 h-24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-6">
              <div class="flex items-center justify-between text-white">
                <div>
                  <p class="text-xs opacity-80">Hero Image</p>
                  {#if images[0].meta_width && images[0].meta_height}
                    <p class="text-sm">{formatResolution(images[0].meta_width, images[0].meta_height)}</p>
                  {/if}
                </div>
                <div class="opacity-0 group-hover:opacity-100 transition">
                  <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                  </svg>
                </div>
              </div>
            </div>
          </button>
        </div>
      {:else}
        <div class="mb-6 -mx-8 -mt-8 h-64 md:h-96 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
          <div class="text-center text-gray-400">
            <svg class="w-24 h-24 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p class="text-lg">No Hero Image</p>
            <p class="text-sm mt-1">Import images to set a hero image</p>
          </div>
        </div>
      {/if}

      <div class="mb-6 flex justify-between items-start">
        <div>
          <button
            onclick={() => router.navigate('/locations')}
            class="text-sm text-accent hover:underline mb-2"
          >
            &larr; Back to Locations
          </button>
          <h1 class="text-3xl font-bold text-foreground">{location.locnam}</h1>
          {#if location.akanam}
            <p class="text-gray-500">Also Known As: {location.akanam}</p>
          {/if}
        </div>
        <button
          onclick={() => isEditing = !isEditing}
          class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition"
        >
          {isEditing ? 'Cancel Edit' : 'Edit'}
        </button>
      </div>

      {#if isEditing}
        <LocationEditForm
          location={location}
          onSave={handleSave}
          onCancel={handleCancelEdit}
        />
      {:else}

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-xl font-semibold mb-4 text-foreground">Information</h2>
          <dl class="space-y-3">
            {#if location.type}
              <div>
                <dt class="text-sm font-medium text-gray-500">Type</dt>
                <dd class="text-base text-gray-900">{location.type}</dd>
              </div>
            {/if}

            {#if location.stype}
              <div>
                <dt class="text-sm font-medium text-gray-500">Sub-Type</dt>
                <dd class="text-base text-gray-900">{location.stype}</dd>
              </div>
            {/if}

            {#if location.condition}
              <div>
                <dt class="text-sm font-medium text-gray-500">Condition</dt>
                <dd class="text-base text-gray-900">{location.condition}</dd>
              </div>
            {/if}

            {#if location.status}
              <div>
                <dt class="text-sm font-medium text-gray-500">Status</dt>
                <dd class="text-base text-gray-900">{location.status}</dd>
              </div>
            {/if}

            {#if location.documentation}
              <div>
                <dt class="text-sm font-medium text-gray-500">Documentation</dt>
                <dd class="text-base text-gray-900">{location.documentation}</dd>
              </div>
            {/if}

            {#if location.access}
              <div>
                <dt class="text-sm font-medium text-gray-500">Access</dt>
                <dd class="text-base text-gray-900">{location.access}</dd>
              </div>
            {/if}

            {#if location.historic}
              <div>
                <dt class="text-sm font-medium text-gray-500">Historic Landmark</dt>
                <dd class="text-base text-gray-900">Yes</dd>
              </div>
            {/if}
          </dl>
        </div>

        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-xl font-semibold mb-4 text-foreground">Location</h2>

          {#if location.address}
            <div class="mb-4">
              <h3 class="text-sm font-medium text-gray-500 mb-2">Address</h3>
              <p class="text-base text-gray-900">
                {#if location.address.street}{location.address.street}<br/>{/if}
                {#if location.address.city}{location.address.city}, {/if}
                {#if location.address.state}{location.address.state} {/if}
                {#if location.address.zipcode}{location.address.zipcode}{/if}
              </p>
            </div>
          {/if}

          {#if location.gps}
            <div class="mb-4">
              <h3 class="text-sm font-medium text-gray-500 mb-2">GPS Coordinates</h3>
              <p class="text-base text-gray-900 font-mono text-sm">
                {location.gps.lat.toFixed(6)}, {location.gps.lng.toFixed(6)}
              </p>
              {#if location.gps.source}
                <p class="text-xs text-gray-500 mt-1">Source: {location.gps.source}</p>
              {/if}
              {#if location.gps.verifiedOnMap}
                <p class="text-xs text-green-600 mt-1">Verified on map</p>
              {/if}
            </div>

            <div class="h-64 rounded overflow-hidden">
              <Map locations={[location]} />
            </div>
          {:else}
            <p class="text-gray-500">No GPS coordinates available</p>
          {/if}
        </div>
      </div>

      {#if location.sublocs && location.sublocs.length > 0}
        <div class="mt-6 bg-white rounded-lg shadow p-6">
          <h2 class="text-xl font-semibold mb-4 text-foreground">Sub-Locations ({location.sublocs.length})</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            {#each location.sublocs as sublocId}
              <div class="p-4 bg-gray-50 rounded border border-gray-200">
                <p class="text-sm text-gray-600">Sub-location: {sublocId.slice(0, 12)}</p>
                <p class="text-xs text-gray-400 mt-1">Full backend integration pending</p>
              </div>
            {/each}
          </div>
          <p class="text-xs text-gray-500 mt-4">
            Note: Sub-location details will be fully implemented in the backend.
          </p>
        </div>
      {/if}

      {#if location.sub12}
        <div class="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div class="flex items-center gap-2 mb-2">
            <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 class="text-sm font-semibold text-blue-900">Sub-Location</h3>
          </div>
          <p class="text-sm text-blue-800">This is a sub-location of a larger location.</p>
          <p class="text-xs text-blue-600 mt-2">Parent location ID: {location.sub12}</p>
        </div>
      {/if}

      <div class="mt-6 bg-white rounded-lg shadow p-6">
        <h2 class="text-xl font-semibold mb-4 text-foreground">Media</h2>

        <!-- Images -->
        <div class="mb-6">
          <h3 class="text-sm font-medium text-gray-500 mb-3">Images ({images.length})</h3>
          {#if images.length > 0}
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
              {#each displayedImages as image}
                <button
                  onclick={() => openLightbox(image.imgloc)}
                  class="aspect-square bg-gray-100 rounded overflow-hidden hover:opacity-90 transition relative group"
                >
                  <div class="absolute inset-0 flex items-center justify-center text-gray-400">
                    <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div class="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-2 opacity-0 group-hover:opacity-100 transition">
                    {#if image.meta_width && image.meta_height}
                      {formatResolution(image.meta_width, image.meta_height)}
                    {/if}
                  </div>
                </button>
              {/each}
            </div>
            {#if images.length > IMAGE_LIMIT}
              <div class="mt-3 text-center">
                <button
                  onclick={() => (showAllImages = !showAllImages)}
                  class="text-sm text-accent hover:underline"
                >
                  {showAllImages ? `Show Less` : `Show All (${images.length - IMAGE_LIMIT} more)`}
                </button>
              </div>
            {/if}
          {:else}
            <div class="text-center text-gray-400 py-8 border-2 border-dashed border-gray-200 rounded">
              <p class="text-sm">No images</p>
            </div>
          {/if}
        </div>

        <!-- Videos -->
        <div class="mb-6">
          <h3 class="text-sm font-medium text-gray-500 mb-3">Videos ({videos.length})</h3>
          {#if videos.length > 0}
            <div class="space-y-2">
              {#each displayedVideos as video}
                <button
                  onclick={() => openMediaFile(video.vidloc)}
                  class="w-full flex items-center justify-between p-3 bg-gray-50 rounded hover:bg-gray-100 transition text-left"
                >
                  <div class="flex items-center gap-3">
                    <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <div>
                      <p class="text-sm font-medium text-gray-900">{video.vidnam}</p>
                      <p class="text-xs text-gray-500">
                        {formatDuration(video.meta_duration)}
                        {#if video.meta_width && video.meta_height}
                          · {formatResolution(video.meta_width, video.meta_height)}
                        {/if}
                        {#if video.meta_codec}
                          · {video.meta_codec}
                        {/if}
                      </p>
                    </div>
                  </div>
                  <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>
              {/each}
            </div>
            {#if videos.length > VIDEO_LIMIT}
              <div class="mt-3 text-center">
                <button
                  onclick={() => (showAllVideos = !showAllVideos)}
                  class="text-sm text-accent hover:underline"
                >
                  {showAllVideos ? `Show Less` : `Show All (${videos.length - VIDEO_LIMIT} more)`}
                </button>
              </div>
            {/if}
          {:else}
            <div class="text-center text-gray-400 py-8 border-2 border-dashed border-gray-200 rounded">
              <p class="text-sm">No videos</p>
            </div>
          {/if}
        </div>

        <!-- Documents -->
        <div>
          <h3 class="text-sm font-medium text-gray-500 mb-3">Documents ({documents.length})</h3>
          {#if documents.length > 0}
            <div class="space-y-2">
              {#each displayedDocuments as doc}
                <button
                  onclick={() => openMediaFile(doc.docloc)}
                  class="w-full flex items-center justify-between p-3 bg-gray-50 rounded hover:bg-gray-100 transition text-left"
                >
                  <div class="flex items-center gap-3">
                    <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p class="text-sm font-medium text-gray-900">{doc.docnam}</p>
                  </div>
                  <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>
              {/each}
            </div>
            {#if documents.length > DOCUMENT_LIMIT}
              <div class="mt-3 text-center">
                <button
                  onclick={() => (showAllDocuments = !showAllDocuments)}
                  class="text-sm text-accent hover:underline"
                >
                  {showAllDocuments ? `Show Less` : `Show All (${documents.length - DOCUMENT_LIMIT} more)`}
                </button>
              </div>
            {/if}
          {:else}
            <div class="text-center text-gray-400 py-8 border-2 border-dashed border-gray-200 rounded">
              <p class="text-sm">No documents</p>
            </div>
          {/if}
        </div>
      </div>

      <!-- Notes Section -->
      <div class="mt-6">
        <NotesSection locid={location.locid} currentUser={currentUser} />
      </div>

      <div class="mt-6 bg-white rounded-lg shadow p-6">
        <div class="flex items-center gap-2 mb-4">
          <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
          </svg>
          <h2 class="text-xl font-semibold text-foreground">Nerd Stats</h2>
        </div>
        <p class="text-sm text-gray-500 mb-4">Technical metadata and statistics</p>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <!-- IDs -->
          <div class="col-span-full border-b pb-3 mb-2">
            <p class="text-xs font-semibold text-gray-400 uppercase mb-2">Identifiers</p>
          </div>
          <div>
            <span class="text-gray-500">Full Location ID:</span>
            <button
              onclick={() => navigator.clipboard.writeText(location.locid)}
              class="ml-2 font-mono text-xs text-accent hover:underline"
              title="Click to copy"
            >
              {location.locid}
            </button>
          </div>
          <div>
            <span class="text-gray-500">Short ID (loc12):</span>
            <button
              onclick={() => navigator.clipboard.writeText(location.loc12)}
              class="ml-2 font-mono text-xs text-accent hover:underline"
              title="Click to copy"
            >
              {location.loc12}
            </button>
          </div>
          {#if location.slocnam}
            <div>
              <span class="text-gray-500">Short Name:</span>
              <span class="ml-2 font-mono text-xs">{location.slocnam}</span>
            </div>
          {/if}

          <!-- Timestamps -->
          <div class="col-span-full border-b pb-3 mb-2 mt-2">
            <p class="text-xs font-semibold text-gray-400 uppercase mb-2">Timestamps</p>
          </div>
          {#if location.locadd}
            <div>
              <span class="text-gray-500">Created:</span>
              <span class="ml-2">{new Date(location.locadd).toLocaleString()}</span>
            </div>
          {/if}
          {#if location.locup}
            <div>
              <span class="text-gray-500">Last Updated:</span>
              <span class="ml-2">{new Date(location.locup).toLocaleString()}</span>
            </div>
          {/if}
          {#if location.auth_imp}
            <div>
              <span class="text-gray-500">Author:</span>
              <span class="ml-2">{location.auth_imp}</span>
            </div>
          {/if}

          <!-- GPS Details -->
          {#if location.gps}
            <div class="col-span-full border-b pb-3 mb-2 mt-2">
              <p class="text-xs font-semibold text-gray-400 uppercase mb-2">GPS Details</p>
            </div>
            <div>
              <span class="text-gray-500">GPS Source:</span>
              <span class="ml-2 capitalize">{location.gps.source?.replace(/_/g, ' ')}</span>
            </div>
            <div>
              <span class="text-gray-500">Map Verified:</span>
              <span class="ml-2">{location.gps.verifiedOnMap ? 'Yes' : 'No'}</span>
            </div>
            {#if location.gps.accuracy}
              <div>
                <span class="text-gray-500">GPS Accuracy:</span>
                <span class="ml-2">{location.gps.accuracy}m</span>
              </div>
            {/if}
            {#if location.gps.capturedAt}
              <div>
                <span class="text-gray-500">GPS Captured:</span>
                <span class="ml-2">{new Date(location.gps.capturedAt).toLocaleString()}</span>
              </div>
            {/if}
          {/if}

          <!-- Media Counts -->
          <div class="col-span-full border-b pb-3 mb-2 mt-2">
            <p class="text-xs font-semibold text-gray-400 uppercase mb-2">Media Statistics</p>
          </div>
          <div>
            <span class="text-gray-500">Images:</span>
            <span class="ml-2 font-semibold">{images.length}</span>
          </div>
          <div>
            <span class="text-gray-500">Videos:</span>
            <span class="ml-2 font-semibold">{videos.length}</span>
          </div>
          <div>
            <span class="text-gray-500">Documents:</span>
            <span class="ml-2 font-semibold">{documents.length}</span>
          </div>
          <div>
            <span class="text-gray-500">Total Media:</span>
            <span class="ml-2 font-semibold">{images.length + videos.length + documents.length}</span>
          </div>

          <!-- Additional Metadata -->
          {#if location.regions && location.regions.length > 0}
            <div class="col-span-full border-b pb-3 mb-2 mt-2">
              <p class="text-xs font-semibold text-gray-400 uppercase mb-2">Classification</p>
            </div>
            <div class="col-span-full">
              <span class="text-gray-500">Regions:</span>
              <span class="ml-2">{location.regions.join(', ')}</span>
            </div>
          {/if}
        </div>
      </div>
      {/if}
    </div>
  {/if}

  <!-- Image Lightbox -->
  {#if selectedImage}
    <div
      class="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4"
      onclick={closeLightbox}
    >
      <button
        onclick={closeLightbox}
        class="absolute top-4 right-4 text-white hover:text-gray-300 transition"
      >
        <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <button
        onclick={(e) => { e.stopPropagation(); openMediaFile(selectedImage); }}
        class="absolute top-4 left-4 px-4 py-2 bg-white bg-opacity-20 text-white rounded hover:bg-opacity-30 transition text-sm"
      >
        Open in System Viewer
      </button>
      <div class="max-w-7xl max-h-full flex items-center justify-center">
        <p class="text-white text-center">
          Image preview not available<br/>
          <span class="text-sm text-gray-400">Click "Open in System Viewer" to view the image</span>
        </p>
      </div>
    </div>
  {/if}
</div>
