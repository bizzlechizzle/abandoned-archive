<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from '../stores/router';
  import { importStore, isImporting } from '../stores/import-store';
  // FIX 4.6: Toast notifications
  import { toasts } from '../stores/toast-store';
  import Map from '../components/Map.svelte';
  import LocationEditForm from '../components/LocationEditForm.svelte';
  import NotesSection from '../components/NotesSection.svelte';
  import MediaViewer from '../components/MediaViewer.svelte';
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

  interface Bookmark {
    urlid: string;
    url: string;
    url_title: string | null;
    url_description: string | null;
    url_type: string | null;
    urladd: string | null;
  }

  let location = $state<Location | null>(null);
  let images = $state<MediaImage[]>([]);
  let videos = $state<MediaVideo[]>([]);
  let documents = $state<MediaDocument[]>([]);
  // FIX 4.4: Track failed files for retry
  let failedFiles = $state<Array<{ filePath: string; originalName: string; error: string }>>([]);
  // FIX 6.6: Track GPS mismatch warnings from import
  let gpsWarnings = $state<Array<{
    filename: string;
    message: string;
    distance: number;
    severity: 'minor' | 'major';
    mediaGPS: { lat: number; lng: number };
  }>>([]);
  let bookmarks = $state<Bookmark[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let isEditing = $state(false);
  let selectedImageIndex = $state<number | null>(null);
  let currentUser = $state('default');

  // Transform images for MediaViewer component
  const mediaViewerList = $derived(images.map(img => ({
    hash: img.imgsha,
    path: img.imgloc,
    thumbPath: (img as any).thumb_path || null,
    previewPath: (img as any).preview_path || null,
    type: 'image' as const,
    name: img.imgnam,
    width: img.meta_width,
    height: img.meta_height,
    dateTaken: img.meta_date_taken,
    cameraMake: (img as any).meta_camera_make || null,
    cameraModel: (img as any).meta_camera_model || null,
    gpsLat: (img as any).meta_gps_lat || null,
    gpsLng: (img as any).meta_gps_lng || null,
  })));
  let showAllImages = $state(false);
  let showAllVideos = $state(false);
  let showAllDocuments = $state(false);

  // Bookmark form state
  let showAddBookmark = $state(false);
  let newBookmarkUrl = $state('');
  let newBookmarkTitle = $state('');
  let newBookmarkDescription = $state('');
  let newBookmarkType = $state('');
  let addingBookmark = $state(false);

  // Import drag-drop state
  let isDragging = $state(false);
  // isImporting is now tracked globally via import-store
  let importProgress = $state('');

  // GPS verification state
  let verifyingGps = $state(false);
  let togglingFavorite = $state(false);

  async function toggleFavorite() {
    if (!location || togglingFavorite) return;
    try {
      togglingFavorite = true;
      await window.electronAPI.locations.toggleFavorite(location.locid);
      await loadLocation();
    } catch (err) {
      console.error('Error toggling favorite:', err);
    } finally {
      togglingFavorite = false;
    }
  }

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

  function openLightbox(index: number) {
    selectedImageIndex = index;
  }

  function closeLightbox() {
    selectedImageIndex = null;
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

  async function loadBookmarks() {
    if (!window.electronAPI?.bookmarks) return;
    try {
      const urls = await window.electronAPI.bookmarks.findByLocation(locationId);
      bookmarks = urls || [];
    } catch (err) {
      console.error('Error loading bookmarks:', err);
    }
  }

  async function addBookmark() {
    if (!newBookmarkUrl.trim() || !window.electronAPI?.bookmarks) return;

    try {
      addingBookmark = true;
      await window.electronAPI.bookmarks.create({
        locid: locationId,
        url: newBookmarkUrl.trim(),
        url_title: newBookmarkTitle.trim() || null,
        url_description: newBookmarkDescription.trim() || null,
        url_type: newBookmarkType.trim() || null,
        auth_imp: currentUser,
      });

      // Reset form and reload
      newBookmarkUrl = '';
      newBookmarkTitle = '';
      newBookmarkDescription = '';
      newBookmarkType = '';
      showAddBookmark = false;
      await loadBookmarks();
    } catch (err) {
      console.error('Error adding bookmark:', err);
    } finally {
      addingBookmark = false;
    }
  }

  async function deleteBookmark(urlid: string) {
    if (!window.electronAPI?.bookmarks) return;

    try {
      await window.electronAPI.bookmarks.delete(urlid);
      await loadBookmarks();
    } catch (err) {
      console.error('Error deleting bookmark:', err);
    }
  }

  function openBookmark(url: string) {
    window.electronAPI?.shell?.openExternal(url);
  }

  // Cross-link navigation helpers
  function navigateToFilter(filterType: string, value: string) {
    router.navigate('/locations', undefined, { [filterType]: value });
  }

  // FIX 6.1: GPS confidence indicator
  function getGpsConfidence(gps: Location['gps']): { level: 'high' | 'medium' | 'low'; color: string; label: string } {
    if (!gps) return { level: 'low', color: 'gray', label: 'No GPS' };

    // High confidence: verified on map or from EXIF with verification
    if (gps.verifiedOnMap) {
      return { level: 'high', color: 'green', label: 'Verified' };
    }

    // Medium confidence: from EXIF or geocoding
    if (gps.source === 'exif' || gps.source === 'media_gps') {
      return { level: 'medium', color: 'blue', label: 'From Media' };
    }

    if (gps.source === 'geocoding' || gps.source === 'reverse_geocode') {
      return { level: 'medium', color: 'blue', label: 'Geocoded' };
    }

    // Lower confidence: manual entry or unknown source
    if (gps.source === 'manual' || gps.source === 'user_input') {
      return { level: 'low', color: 'yellow', label: 'Manual Entry' };
    }

    return { level: 'low', color: 'gray', label: 'Unverified' };
  }

  // FIX 6.6: Dismiss GPS warning
  function dismissGpsWarning(index: number) {
    gpsWarnings = gpsWarnings.filter((_, i) => i !== index);
  }

  // Mark GPS as verified on map
  async function markGpsVerified() {
    if (!location || !window.electronAPI?.locations) return;

    try {
      verifyingGps = true;
      await window.electronAPI.locations.update(locationId, {
        gps: {
          ...location.gps,
          verifiedOnMap: true,
        },
      });

      // Reload location to reflect changes
      await loadLocation();
    } catch (err) {
      console.error('Error marking GPS as verified:', err);
    } finally {
      verifyingGps = false;
    }
  }

  // Drag-drop handlers for media import
  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    isDragging = true;
  }

  function handleDragLeave() {
    isDragging = false;
  }

  async function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragging = false;

    if (!event.dataTransfer?.files || event.dataTransfer.files.length === 0 || !location) {
      return;
    }

    // Small delay to ensure preload's drop handler has processed the files
    await new Promise(resolve => setTimeout(resolve, 10));

    // Get paths extracted by preload's drop event handler
    // The preload captures drop events and extracts paths using webUtils.getPathForFile()
    const droppedPaths = window.getDroppedFilePaths?.() || [];
    console.log('[LocationDetail] Got dropped paths from preload:', droppedPaths);

    if (droppedPaths.length === 0) {
      importProgress = 'No valid files found';
      setTimeout(() => { importProgress = ''; }, 3000);
      return;
    }

    // Use main process to expand paths (handles directories recursively)
    if (!window.electronAPI?.media?.expandPaths) {
      importProgress = 'API not available';
      setTimeout(() => { importProgress = ''; }, 3000);
      return;
    }

    importProgress = 'Scanning files...';
    const expandedPaths = await window.electronAPI.media.expandPaths(droppedPaths);

    if (expandedPaths.length > 0) {
      await importFilePaths(expandedPaths);
    } else {
      importProgress = 'No supported media files found';
      setTimeout(() => { importProgress = ''; }, 3000);
    }
  }

  async function handleSelectFiles() {
    if (!location || !window.electronAPI?.media?.selectFiles) {
      importProgress = 'File selection not available';
      setTimeout(() => { importProgress = ''; }, 3000);
      return;
    }

    try {
      const filePaths = await window.electronAPI.media.selectFiles();
      if (!filePaths || filePaths.length === 0) {
        return; // User cancelled
      }

      console.log('[LocationDetail] Selected files via dialog:', filePaths.length);

      // Use main process to expand paths (handles directories recursively)
      if (window.electronAPI.media.expandPaths) {
        importProgress = 'Scanning files...';
        const expandedPaths = await window.electronAPI.media.expandPaths(filePaths);
        if (expandedPaths.length > 0) {
          await importFilePaths(expandedPaths);
        } else {
          importProgress = 'No supported media files found';
          setTimeout(() => { importProgress = ''; }, 3000);
        }
      } else {
        // Fallback: import directly without expansion
        await importFilePaths(filePaths);
      }
    } catch (error) {
      console.error('[LocationDetail] Error selecting files:', error);
      importProgress = 'Error selecting files';
      setTimeout(() => { importProgress = ''; }, 3000);
    }
  }

  async function importFilePaths(filePaths: string[]) {
    if (!location || !window.electronAPI?.media) return;

    // Check if already importing
    if ($isImporting) {
      importProgress = 'An import is already in progress';
      setTimeout(() => { importProgress = ''; }, 3000);
      return;
    }

    const filesForImport = filePaths.map((filePath) => {
      const parts = filePath.split(/[\\/]/);
      const fileName = parts[parts.length - 1];
      return { filePath, originalName: fileName };
    });

    // Start tracking in global store (non-blocking)
    importStore.startJob(location.locid, location.locnam, filePaths.length);
    importProgress = `Import started (${filePaths.length} files)`;

    // Fire-and-forget: Start import but don't await it
    // User can continue using the app while import runs
    window.electronAPI.media.import({
      files: filesForImport,
      locid: location.locid,
      auth_imp: currentUser,
      deleteOriginals: false,
    }).then((result) => {
      // FIX 4.4: Track failed files for retry
      if (result.results) {
        const newFailedFiles = result.results
          .map((r: any, idx: number) => ({
            filePath: filesForImport[idx]?.filePath || '',
            originalName: filesForImport[idx]?.originalName || '',
            error: r.error || 'Unknown error',
            success: r.success,
          }))
          .filter((f: any) => !f.success && f.filePath);
        if (newFailedFiles.length > 0) {
          failedFiles = newFailedFiles;
        }

        // FIX 6.6: Extract GPS mismatch warnings from results
        const newGpsWarnings = result.results
          .filter((r: any) => r.gpsWarning)
          .map((r: any, idx: number) => ({
            filename: filesForImport[idx]?.originalName || 'Unknown file',
            message: r.gpsWarning.message,
            distance: r.gpsWarning.distance,
            severity: r.gpsWarning.severity,
            mediaGPS: r.gpsWarning.mediaGPS,
          }));
        if (newGpsWarnings.length > 0) {
          gpsWarnings = [...gpsWarnings, ...newGpsWarnings];
          toasts.warning(`${newGpsWarnings.length} file(s) have GPS mismatch with location`);
        }
      }

      // FIX 1.3 & 1.5: Check for total failure and show error details
      if (result.imported === 0 && result.errors > 0) {
        // All files failed - this is an error condition, not success
        const failedMsgs = result.results
          ?.filter((r: any) => !r.success && r.error)
          .map((r: any) => r.error)
          .slice(0, 3);  // Show first 3 errors
        const errorMsg = failedMsgs?.length
          ? `Import failed: ${failedMsgs.join('; ')}${result.errors > 3 ? ` (+${result.errors - 3} more)` : ''}`
          : `Import failed: ${result.errors} files could not be imported`;

        importStore.completeJob(undefined, errorMsg);
        importProgress = errorMsg;
        // FIX 4.6: Toast notification for total failure
        toasts.error(errorMsg);
      } else {
        // Import completed with at least some successes
        importStore.completeJob({
          imported: result.imported,
          duplicates: result.duplicates,
          errors: result.errors,
        });

        // FIX 1.5 & 4.6: Show visible message with error count if any
        if (result.errors > 0) {
          importProgress = `Imported ${result.imported} files (${result.errors} failed)`;
          toasts.warning(`Imported ${result.imported} files. ${result.errors} failed.`);
        } else if (result.imported > 0) {
          importProgress = `Imported ${result.imported} files successfully`;
          toasts.success(`Successfully imported ${result.imported} files`);
          // FIX 4.4: Clear failed files on success
          failedFiles = [];
        } else if (result.duplicates > 0) {
          importProgress = `${result.duplicates} files were already in archive`;
          toasts.info(`${result.duplicates} files were already in archive`);
        }
      }
      // Reload location data to show new files
      loadLocation();
    }).catch((error) => {
      // Import failed completely
      console.error('Error importing files:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      importStore.completeJob(undefined, errorMsg);
      importProgress = `Import error: ${errorMsg}`;
      // FIX 4.6: Toast notification for errors
      toasts.error(`Import error: ${errorMsg}`);
    });

    // Clear the local progress message after longer delay so user can read it
    setTimeout(() => { importProgress = ''; }, 8000);
  }

  // FIX 4.4: Retry failed imports
  async function retryFailedImports() {
    if (failedFiles.length === 0) return;
    const pathsToRetry = failedFiles.map(f => f.filePath);
    failedFiles = []; // Clear before retry
    await importFilePaths(pathsToRetry);
  }

  onMount(async () => {
    loadLocation();
    loadBookmarks();

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
            onclick={() => openLightbox(0)}
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

      <div class="mb-6">
        <button
          onclick={() => router.navigate('/locations')}
          class="text-sm text-accent hover:underline mb-2"
        >
          &larr; Back to Locations
        </button>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <h1 class="text-3xl font-bold text-foreground">{location.locnam}</h1>
            <button
              onclick={toggleFavorite}
              disabled={togglingFavorite}
              class="p-1 hover:bg-gray-100 rounded transition disabled:opacity-50"
              title={location.favorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              {#if location.favorite}
                <svg class="w-6 h-6 text-yellow-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              {:else}
                <svg class="w-6 h-6 text-gray-400 hover:text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              {/if}
            </button>
          </div>
          <button
            onclick={() => isEditing = !isEditing}
            class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition"
          >
            {isEditing ? 'Cancel Edit' : 'Edit'}
          </button>
        </div>
        {#if location.akanam}
          <p class="text-gray-500 mt-1">Also Known As: {location.akanam}</p>
        {/if}
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
                <dd class="text-base">
                  <button
                    onclick={() => navigateToFilter('type', location.type!)}
                    class="text-accent hover:underline"
                    title="View all {location.type} locations"
                  >
                    {location.type}
                  </button>
                </dd>
              </div>
            {/if}

            {#if location.stype}
              <div>
                <dt class="text-sm font-medium text-gray-500">Sub-Type</dt>
                <dd class="text-base">
                  <button
                    onclick={() => navigateToFilter('stype', location.stype!)}
                    class="text-accent hover:underline"
                    title="View all {location.stype} locations"
                  >
                    {location.stype}
                  </button>
                </dd>
              </div>
            {/if}

            {#if location.condition}
              <div>
                <dt class="text-sm font-medium text-gray-500">Condition</dt>
                <dd class="text-base">
                  <button
                    onclick={() => navigateToFilter('condition', location.condition!)}
                    class="text-accent hover:underline"
                    title="View all locations with this condition"
                  >
                    {location.condition}
                  </button>
                </dd>
              </div>
            {/if}

            {#if location.status}
              <div>
                <dt class="text-sm font-medium text-gray-500">Status</dt>
                <dd class="text-base">
                  <button
                    onclick={() => navigateToFilter('status', location.status!)}
                    class="text-accent hover:underline"
                    title="View all locations with this status"
                  >
                    {location.status}
                  </button>
                </dd>
              </div>
            {/if}

            {#if location.documentation}
              <div>
                <dt class="text-sm font-medium text-gray-500">Documentation</dt>
                <dd class="text-base">
                  <button
                    onclick={() => navigateToFilter('documentation', location.documentation!)}
                    class="text-accent hover:underline"
                    title="View all locations with this documentation level"
                  >
                    {location.documentation}
                  </button>
                </dd>
              </div>
            {/if}

            {#if location.access}
              <div>
                <dt class="text-sm font-medium text-gray-500">Access</dt>
                <dd class="text-base">
                  <button
                    onclick={() => navigateToFilter('access', location.access!)}
                    class="text-accent hover:underline"
                    title="View all locations with this access level"
                  >
                    {location.access}
                  </button>
                </dd>
              </div>
            {/if}

            {#if location.historic}
              <div>
                <dt class="text-sm font-medium text-gray-500">Historic Landmark</dt>
                <dd class="text-base">
                  <button
                    onclick={() => router.navigate('/locations', undefined, { filter: 'historical' })}
                    class="text-accent hover:underline"
                    title="View all historic landmarks"
                  >
                    Yes
                  </button>
                </dd>
              </div>
            {/if}
          </dl>
        </div>

        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-xl font-semibold mb-4 text-foreground">Location</h2>

          {#if location.address}
            <!-- Kanye3: Clean address display with copy button -->
            <div class="mb-4">
              <div class="flex items-center justify-between mb-2">
                <h3 class="text-sm font-medium text-gray-500">Address</h3>
                <button
                  onclick={() => {
                    const addr = [
                      location.address?.street,
                      location.address?.city,
                      location.address?.state,
                      location.address?.zipcode
                    ].filter(Boolean).join(', ');
                    navigator.clipboard.writeText(addr);
                  }}
                  class="text-xs text-accent hover:underline flex items-center gap-1"
                  title="Copy address to clipboard"
                >
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                  Copy
                </button>
              </div>

              <div class="text-base text-gray-900 space-y-1">
                {#if location.address.street}
                  <p class="font-medium">{location.address.street}</p>
                {/if}

                <p>
                  {#if location.address.city}
                    <button
                      onclick={() => navigateToFilter('city', location.address!.city!)}
                      class="text-accent hover:underline"
                      title="View all locations in {location.address.city}"
                    >{location.address.city}</button>{location.address.state || location.address.zipcode ? ', ' : ''}
                  {/if}
                  {#if location.address.state}
                    <button
                      onclick={() => navigateToFilter('state', location.address!.state!)}
                      class="text-accent hover:underline"
                      title="View all locations in {location.address.state}"
                    >{location.address.state}</button>{' '}
                  {/if}
                  {#if location.address.zipcode}
                    <span>{location.address.zipcode}</span>
                  {/if}
                </p>

                {#if location.address.county}
                  <p class="text-sm text-gray-500">
                    <button
                      onclick={() => navigateToFilter('county', location.address!.county!)}
                      class="hover:underline"
                      title="View all locations in {location.address.county} County"
                    >{location.address.county} County</button>
                  </p>
                {/if}
              </div>
            </div>
          {/if}

          <!-- Kanye3: ALWAYS show map - use cascading fallbacks -->
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
            </div>

            <div class="h-64 rounded overflow-hidden mb-3">
              <Map locations={[location]} />
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
                  onclick={markGpsVerified}
                  disabled={verifyingGps}
                  class="px-3 py-1 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50"
                >
                  {verifyingGps ? 'Saving...' : 'Mark as Verified'}
                </button>
              {/if}
            </div>
          {:else if location.address?.state}
            <!-- Kanye3: Show approximate map based on state capital -->
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
              <Map locations={[location]} />
            </div>

            <div class="flex items-center gap-2 text-xs text-yellow-600 bg-yellow-50 p-2 rounded">
              <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>No exact GPS. Map shows approximate area based on address.</span>
            </div>
          {:else}
            <!-- No GPS and no state - prompt to add -->
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

      <div
        class="mt-6 bg-white rounded-lg shadow p-6"
        ondragover={handleDragOver}
        ondragleave={handleDragLeave}
        ondrop={handleDrop}
      >
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-semibold text-foreground">Media</h2>
          {#if importProgress}
            <span class="text-sm text-accent">{importProgress}</span>
          {/if}
          <!-- FIX 4.4: Retry failed imports button -->
          {#if failedFiles.length > 0}
            <button
              onclick={retryFailedImports}
              class="ml-2 text-sm text-red-600 hover:text-red-800 hover:underline"
            >
              Retry {failedFiles.length} failed
            </button>
          {/if}
        </div>

        <!-- FIX 6.6: GPS Mismatch Warnings -->
        {#if gpsWarnings.length > 0}
          <div class="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div class="flex items-start gap-3">
              <svg class="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div class="flex-1">
                <h4 class="text-sm font-semibold text-yellow-800 mb-2">GPS Mismatch Detected</h4>
                <p class="text-xs text-yellow-700 mb-3">
                  Some imported files have GPS coordinates that differ from this location.
                </p>
                <div class="space-y-2">
                  {#each gpsWarnings as warning, index}
                    <div class="flex items-center justify-between bg-white/50 rounded p-2 text-xs">
                      <div>
                        <span class="font-medium text-yellow-900">{warning.filename}</span>
                        <span class="text-yellow-700 ml-2">
                          {warning.message}
                          <span class="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium
                            {warning.severity === 'major' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}">
                            {warning.severity}
                          </span>
                        </span>
                      </div>
                      <button
                        onclick={() => dismissGpsWarning(index)}
                        class="p-1 text-yellow-600 hover:text-yellow-800"
                        title="Dismiss warning"
                      >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  {/each}
                </div>
                <button
                  onclick={() => gpsWarnings = []}
                  class="mt-2 text-xs text-yellow-700 hover:text-yellow-900 underline"
                >
                  Dismiss all warnings
                </button>
              </div>
            </div>
          </div>
        {/if}

        <!-- Drag-drop zone -->
        <div
          class="mb-6 p-6 border-2 border-dashed rounded-lg text-center transition-colors {isDragging ? 'border-accent bg-accent/10' : 'border-gray-300 hover:border-gray-400'}"
        >
          {#if $isImporting}
            <div class="text-gray-500">
              <svg class="w-10 h-10 mx-auto mb-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <p class="text-sm">{importProgress}</p>
            </div>
          {:else}
            <svg class="w-10 h-10 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p class="text-sm text-gray-500">
              {isDragging ? 'Drop files or folders here' : 'Drag & drop files or folders to import'}
            </p>
            <p class="text-xs text-gray-400 mt-1">Supports images, videos, and documents</p>
            <button
              onclick={handleSelectFiles}
              class="mt-3 px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition text-sm"
            >
              Select Files
            </button>
          {/if}
        </div>

        <!-- Images -->
        <div class="mb-6">
          <h3 class="text-sm font-medium text-gray-500 mb-3">Images ({images.length})</h3>
          {#if images.length > 0}
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
              {#each displayedImages as image, displayIndex}
                {@const actualIndex = images.findIndex(img => img.imgsha === image.imgsha)}
                <button
                  onclick={() => openLightbox(actualIndex)}
                  class="aspect-square bg-gray-100 rounded overflow-hidden hover:opacity-90 transition relative group"
                >
                  {#if (image as any).thumb_path_sm || (image as any).thumb_path}
                    <!-- Kanye3: Multi-tier thumbnail with HiDPI support -->
                    <img
                      src={`media://${(image as any).thumb_path_sm || (image as any).thumb_path}`}
                      srcset={`
                        media://${(image as any).thumb_path_sm || (image as any).thumb_path} 1x
                        ${(image as any).thumb_path_lg ? `, media://${(image as any).thumb_path_lg} 2x` : ''}
                      `}
                      alt={image.imgnam}
                      loading="lazy"
                      class="w-full h-full object-cover"
                    />
                  {:else}
                    <!-- Fallback placeholder when no thumbnail exists -->
                    <div class="absolute inset-0 flex items-center justify-center text-gray-400">
                      <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  {/if}
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

      <!-- Bookmarks Section -->
      <div class="mt-6 bg-white rounded-lg shadow p-6">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            <h2 class="text-xl font-semibold text-foreground">Bookmarks ({bookmarks.length})</h2>
          </div>
          <button
            onclick={() => showAddBookmark = !showAddBookmark}
            class="text-sm text-accent hover:underline"
          >
            {showAddBookmark ? 'Cancel' : '+ Add Bookmark'}
          </button>
        </div>

        {#if showAddBookmark}
          <div class="mb-4 p-4 bg-gray-50 rounded-lg">
            <div class="space-y-3">
              <div>
                <label for="bookmark-url" class="block text-sm font-medium text-gray-700 mb-1">URL *</label>
                <input
                  id="bookmark-url"
                  type="url"
                  bind:value={newBookmarkUrl}
                  placeholder="https://..."
                  class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label for="bookmark-title" class="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input
                    id="bookmark-title"
                    type="text"
                    bind:value={newBookmarkTitle}
                    placeholder="Link title"
                    class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div>
                  <label for="bookmark-type" class="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    id="bookmark-type"
                    bind:value={newBookmarkType}
                    class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="">Select type...</option>
                    <option value="article">Article</option>
                    <option value="news">News</option>
                    <option value="history">History</option>
                    <option value="photo">Photo Gallery</option>
                    <option value="video">Video</option>
                    <option value="map">Map</option>
                    <option value="forum">Forum</option>
                    <option value="social">Social Media</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div>
                <label for="bookmark-desc" class="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  id="bookmark-desc"
                  bind:value={newBookmarkDescription}
                  placeholder="Optional description"
                  rows="2"
                  class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                ></textarea>
              </div>
              <button
                onclick={addBookmark}
                disabled={addingBookmark || !newBookmarkUrl.trim()}
                class="w-full px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50"
              >
                {addingBookmark ? 'Adding...' : 'Add Bookmark'}
              </button>
            </div>
          </div>
        {/if}

        {#if bookmarks.length > 0}
          <div class="space-y-2">
            {#each bookmarks as bookmark}
              <div class="flex items-start justify-between p-3 bg-gray-50 rounded hover:bg-gray-100 transition">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <button
                      onclick={() => openBookmark(bookmark.url)}
                      class="text-accent hover:underline font-medium truncate"
                    >
                      {bookmark.url_title || bookmark.url}
                    </button>
                    {#if bookmark.url_type}
                      <span class="px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded capitalize">
                        {bookmark.url_type}
                      </span>
                    {/if}
                  </div>
                  {#if bookmark.url_title}
                    <p class="text-xs text-gray-400 truncate">{bookmark.url}</p>
                  {/if}
                  {#if bookmark.url_description}
                    <p class="text-sm text-gray-600 mt-1">{bookmark.url_description}</p>
                  {/if}
                </div>
                <button
                  onclick={() => deleteBookmark(bookmark.urlid)}
                  class="ml-2 p-1 text-gray-400 hover:text-red-500 transition"
                  title="Delete bookmark"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            {/each}
          </div>
        {:else}
          <div class="text-center text-gray-400 py-8 border-2 border-dashed border-gray-200 rounded">
            <svg class="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            <p class="text-sm">No bookmarks yet</p>
            <p class="text-xs mt-1">Add links to articles, photos, and resources</p>
          </div>
        {/if}
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

  <!-- Media Viewer -->
  {#if selectedImageIndex !== null && mediaViewerList.length > 0}
    <MediaViewer
      mediaList={mediaViewerList}
      startIndex={selectedImageIndex}
      onClose={closeLightbox}
    />
  {/if}
</div>
