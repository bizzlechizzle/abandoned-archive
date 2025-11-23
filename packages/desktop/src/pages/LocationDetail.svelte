<script lang="ts">
  /**
   * LocationDetail - Master orchestrator for location detail page
   * Per LILBITS: ~250 lines (orchestrator coordinating child components)
   * Per PUEA: Show only sections with data
   * Per AAA: Import shows results immediately
   * Kanye6: All original fixes preserved (ensureGpsFromAddress, setHeroImage, etc.)
   */
  import { onMount } from 'svelte';
  import { router } from '../stores/router';
  import { importStore, isImporting } from '../stores/import-store';
  import { toasts } from '../stores/toast-store';
  import LocationEditForm from '../components/LocationEditForm.svelte';
  import NotesSection from '../components/NotesSection.svelte';
  import MediaViewer from '../components/MediaViewer.svelte';
  import {
    LocationHero, LocationHeader, LocationInfo, LocationAddress,
    LocationMapSection, LocationGallery, LocationVideos, LocationDocuments,
    LocationImportZone, LocationBookmarks, LocationNerdStats,
    type MediaImage, type MediaVideo, type MediaDocument, type Bookmark,
    type GpsWarning, type FailedFile
  } from '../components/location';
  import type { Location, LocationInput } from '@au-archive/core';

  interface Props { locationId: string; }
  let { locationId }: Props = $props();

  // State
  let location = $state<Location | null>(null);
  let images = $state<MediaImage[]>([]);
  let videos = $state<MediaVideo[]>([]);
  let documents = $state<MediaDocument[]>([]);
  let bookmarks = $state<Bookmark[]>([]);
  let failedFiles = $state<FailedFile[]>([]);
  let gpsWarnings = $state<GpsWarning[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let isEditing = $state(false);
  let selectedImageIndex = $state<number | null>(null);
  let currentUser = $state('default');
  let isDragging = $state(false);
  let importProgress = $state('');
  let verifyingGps = $state(false);
  let togglingFavorite = $state(false);

  // Derived
  const mediaViewerList = $derived(images.map(img => ({
    hash: img.imgsha, path: img.imgloc,
    thumbPath: img.thumb_path_sm || img.thumb_path || null,
    previewPath: img.preview_path || null, type: 'image' as const,
    name: img.imgnam, width: img.meta_width, height: img.meta_height,
    dateTaken: img.meta_date_taken, cameraMake: img.meta_camera_make || null,
    cameraModel: img.meta_camera_model || null,
    gpsLat: img.meta_gps_lat || null, gpsLng: img.meta_gps_lng || null,
  })));

  // Load functions
  async function loadLocation() {
    try {
      loading = true; error = null;
      const [loc, media] = await Promise.all([
        window.electronAPI.locations.findById(locationId),
        window.electronAPI.media.findByLocation(locationId),
      ]);
      location = loc;
      if (!location) { error = 'Location not found'; return; }
      if (media) {
        images = (media.images as MediaImage[]) || [];
        videos = (media.videos as MediaVideo[]) || [];
        documents = (media.documents as MediaDocument[]) || [];
      }
    } catch (err) {
      console.error('Error loading location:', err);
      error = 'Failed to load location';
    } finally { loading = false; }
  }

  async function loadBookmarks() {
    if (!window.electronAPI?.bookmarks) return;
    try {
      bookmarks = await window.electronAPI.bookmarks.findByLocation(locationId) || [];
    } catch (err) { console.error('Error loading bookmarks:', err); }
  }

  /**
   * Kanye9: Auto forward geocode using cascade strategy
   * Tries: full address → city+state → zipcode → county+state → state only
   */
  async function ensureGpsFromAddress(): Promise<void> {
    console.log('[Kanye9] ensureGpsFromAddress called');
    if (!location) { console.log('[Kanye9] No location, skipping'); return; }
    if (location.gps?.lat && location.gps?.lng) { console.log('[Kanye9] Already has GPS:', location.gps); return; }

    const addr = location.address;
    // Need at least one geocodable field
    const hasGeocodeData = addr?.street || addr?.city || addr?.zipcode || addr?.county || addr?.state;
    if (!hasGeocodeData) { console.log('[Kanye9] No address to geocode'); return; }

    console.log('[Kanye9] Using cascade geocoding for address:', addr);
    try {
      // Use cascade geocoding - tries multiple strategies until one succeeds
      const result = await window.electronAPI.geocode.forwardCascade({
        street: addr?.street || null,
        city: addr?.city || null,
        county: addr?.county || null,
        state: addr?.state || null,
        zipcode: addr?.zipcode || null,
      });

      console.log('[Kanye9] Cascade geocode result:', result);
      if (result?.lat && result?.lng) {
        console.log(`[Kanye9] Cascade success: tier ${result.cascadeTier} (${result.cascadeDescription})`);
        // Kanye11 FIX: Use nested gps object per LocationInputSchema, NOT flat gps_lat/gps_lng fields
        await window.electronAPI.locations.update(location.locid, {
          gps: {
            lat: result.lat,
            lng: result.lng,
            source: 'geocoded_address',
            verifiedOnMap: false,
            // Kanye9: Store tier for accurate map zoom
            geocodeTier: result.cascadeTier,
            geocodeQuery: result.cascadeQuery,
          }
        });
        console.log('[Kanye9] Reloading location to trigger map re-zoom...');
        await loadLocation();
        console.log('[Kanye9] Cascade geocoding complete!');
      } else {
        console.warn('[Kanye9] Cascade geocode returned no coordinates');
      }
    } catch (err) {
      console.error('[Kanye9] Cascade geocoding failed:', err);
    }
  }

  // Action handlers
  async function handleSave(updates: Partial<LocationInput>) {
    if (!location) return;
    await window.electronAPI.locations.update(location.locid, updates);
    await loadLocation();
    isEditing = false;
  }

  async function toggleFavorite() {
    if (!location || togglingFavorite) return;
    try {
      togglingFavorite = true;
      await window.electronAPI.locations.toggleFavorite(location.locid);
      await loadLocation();
    } catch (err) { console.error('Error toggling favorite:', err); }
    finally { togglingFavorite = false; }
  }

  async function markGpsVerified() {
    if (!location) return;
    try {
      verifyingGps = true;
      await window.electronAPI.locations.update(locationId, { gps: { ...location.gps, verifiedOnMap: true } });
      await loadLocation();
    } catch (err) { console.error('Error marking GPS verified:', err); }
    finally { verifyingGps = false; }
  }

  /** Kanye6: Set hero image */
  async function setHeroImage(imgsha: string) {
    if (!location) return;
    try {
      await window.electronAPI.locations.update(locationId, { hero_imgsha: imgsha });
      await loadLocation();
    } catch (err) { console.error('Error setting hero image:', err); }
  }

  function navigateToFilter(type: string, value: string) {
    router.navigate('/locations', undefined, { [type]: value });
  }

  async function openMediaFile(filePath: string) {
    try { await window.electronAPI.media.openFile(filePath); }
    catch (err) { console.error('Error opening file:', err); }
  }

  // Import handlers
  function handleDragOver(e: DragEvent) { e.preventDefault(); isDragging = true; }
  function handleDragLeave() { isDragging = false; }

  async function handleDrop(e: DragEvent) {
    e.preventDefault(); isDragging = false;
    if (!e.dataTransfer?.files || e.dataTransfer.files.length === 0 || !location) return;
    await new Promise(r => setTimeout(r, 10));
    const droppedPaths = window.getDroppedFilePaths?.() || [];
    if (droppedPaths.length === 0) { importProgress = 'No valid files found'; setTimeout(() => importProgress = '', 3000); return; }
    if (!window.electronAPI?.media?.expandPaths) { importProgress = 'API not available'; setTimeout(() => importProgress = '', 3000); return; }
    importProgress = 'Scanning files...';
    const expandedPaths = await window.electronAPI.media.expandPaths(droppedPaths);
    if (expandedPaths.length > 0) await importFilePaths(expandedPaths);
    else { importProgress = 'No supported media files found'; setTimeout(() => importProgress = '', 3000); }
  }

  async function handleSelectFiles() {
    if (!location || !window.electronAPI?.media?.selectFiles) return;
    try {
      const filePaths = await window.electronAPI.media.selectFiles();
      if (!filePaths || filePaths.length === 0) return;
      if (window.electronAPI.media.expandPaths) {
        importProgress = 'Scanning files...';
        const expandedPaths = await window.electronAPI.media.expandPaths(filePaths);
        if (expandedPaths.length > 0) await importFilePaths(expandedPaths);
        else { importProgress = 'No supported media files found'; setTimeout(() => importProgress = '', 3000); }
      } else await importFilePaths(filePaths);
    } catch (err) { console.error('Error selecting files:', err); importProgress = 'Error selecting files'; setTimeout(() => importProgress = '', 3000); }
  }

  async function importFilePaths(filePaths: string[]) {
    if (!location || $isImporting) return;
    const filesForImport = filePaths.map(fp => ({ filePath: fp, originalName: fp.split(/[\\/]/).pop()! }));
    importStore.startJob(location.locid, location.locnam, filePaths.length);
    importProgress = `Import started (${filePaths.length} files)`;

    window.electronAPI.media.import({ files: filesForImport, locid: location.locid, auth_imp: currentUser, deleteOriginals: false })
      .then((result) => {
        if (result.results) {
          const newFailed = result.results.map((r: any, i: number) => ({ filePath: filesForImport[i]?.filePath || '', originalName: filesForImport[i]?.originalName || '', error: r.error || 'Unknown', success: r.success })).filter((f: any) => !f.success && f.filePath);
          if (newFailed.length > 0) failedFiles = newFailed;
          const newGpsWarnings = result.results.filter((r: any) => r.gpsWarning).map((r: any, i: number) => ({ filename: filesForImport[i]?.originalName || 'Unknown', message: r.gpsWarning.message, distance: r.gpsWarning.distance, severity: r.gpsWarning.severity, mediaGPS: r.gpsWarning.mediaGPS }));
          if (newGpsWarnings.length > 0) { gpsWarnings = [...gpsWarnings, ...newGpsWarnings]; toasts.warning(`${newGpsWarnings.length} file(s) have GPS mismatch`); }
        }
        if (result.imported === 0 && result.errors > 0) {
          const errorMsg = `Import failed: ${result.errors} files could not be imported`;
          importStore.completeJob(undefined, errorMsg); importProgress = errorMsg; toasts.error(errorMsg);
        } else {
          importStore.completeJob({ imported: result.imported, duplicates: result.duplicates, errors: result.errors });
          if (result.errors > 0) { importProgress = `Imported ${result.imported} files (${result.errors} failed)`; toasts.warning(`Imported ${result.imported} files. ${result.errors} failed.`); }
          else if (result.imported > 0) { importProgress = `Imported ${result.imported} files successfully`; toasts.success(`Successfully imported ${result.imported} files`); failedFiles = []; }
          else if (result.duplicates > 0) { importProgress = `${result.duplicates} files were already in archive`; toasts.info(`${result.duplicates} files were already in archive`); }
        }
        loadLocation(); // AAA: Reload to show new imports immediately
      })
      .catch((err) => { const msg = err instanceof Error ? err.message : 'Unknown error'; importStore.completeJob(undefined, msg); importProgress = `Import error: ${msg}`; toasts.error(`Import error: ${msg}`); });
    setTimeout(() => importProgress = '', 8000);
  }

  async function retryFailedImports() {
    if (failedFiles.length === 0) return;
    const paths = failedFiles.map(f => f.filePath);
    failedFiles = [];
    await importFilePaths(paths);
  }

  // Bookmark handlers
  async function handleAddBookmark(data: { url: string; title: string; description: string; type: string }) {
    if (!window.electronAPI?.bookmarks) return;
    await window.electronAPI.bookmarks.create({ locid: locationId, url: data.url, url_title: data.title || null, url_description: data.description || null, url_type: data.type || null, auth_imp: currentUser });
    await loadBookmarks();
  }

  async function handleDeleteBookmark(urlid: string) {
    if (!window.electronAPI?.bookmarks) return;
    await window.electronAPI.bookmarks.delete(urlid);
    await loadBookmarks();
  }

  function handleOpenBookmark(url: string) { window.electronAPI?.shell?.openExternal(url); }

  onMount(async () => {
    await loadLocation();
    loadBookmarks();
    await ensureGpsFromAddress(); // Kanye6
    try { const settings = await window.electronAPI.settings.getAll(); currentUser = settings.current_user || 'default'; }
    catch (err) { console.error('Error loading user settings:', err); }
  });
</script>

<div class="h-full overflow-auto">
  {#if loading}
    <div class="flex items-center justify-center h-full"><p class="text-gray-500">Loading location...</p></div>
  {:else if error || !location}
    <div class="flex items-center justify-center h-full">
      <div class="text-center">
        <p class="text-red-500 text-lg">{error || 'Location not found'}</p>
        <button onclick={() => router.navigate('/locations')} class="mt-4 px-4 py-2 bg-accent text-white rounded hover:opacity-90">Back to Locations</button>
      </div>
    </div>
  {:else}
    <div class="max-w-6xl mx-auto p-8">
      <LocationHero {images} heroImgsha={location.hero_imgsha || null} onOpenLightbox={(i) => selectedImageIndex = i} />
      <LocationHeader {location} {isEditing} {togglingFavorite} onToggleFavorite={toggleFavorite} onEditToggle={() => isEditing = !isEditing} />

      {#if isEditing}
        <LocationEditForm {location} onSave={handleSave} onCancel={() => isEditing = false} />
      {:else}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LocationInfo {location} onNavigateFilter={navigateToFilter} />
          <div>
            <LocationAddress address={location.address} onNavigateFilter={navigateToFilter} onOpenOnMap={() => {
              // Scroll to map section
              document.querySelector('.location-map-section')?.scrollIntoView({ behavior: 'smooth' });
            }} />
            <div class="location-map-section">
              <LocationMapSection {location} onMarkVerified={markGpsVerified} verifying={verifyingGps} />
            </div>
          </div>
        </div>

        <LocationImportZone isImporting={$isImporting} {importProgress} {isDragging} {gpsWarnings} {failedFiles}
          onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
          onSelectFiles={handleSelectFiles} onRetryFailed={retryFailedImports}
          onDismissWarning={(i) => gpsWarnings = gpsWarnings.filter((_, idx) => idx !== i)}
          onDismissAllWarnings={() => gpsWarnings = []} />

        <div class="mt-6 bg-white rounded-lg shadow p-6">
          <LocationGallery {images} heroImgsha={location.hero_imgsha || null}
            onOpenLightbox={(i) => selectedImageIndex = i} onSetHeroImage={setHeroImage} />
          <LocationVideos {videos} onOpenFile={openMediaFile} />
          <LocationDocuments {documents} onOpenFile={openMediaFile} />
        </div>

        <NotesSection locid={location.locid} {currentUser} />
        <LocationBookmarks {bookmarks} onAddBookmark={handleAddBookmark} onDeleteBookmark={handleDeleteBookmark} onOpenBookmark={handleOpenBookmark} />
        <LocationNerdStats {location} imageCount={images.length} videoCount={videos.length} documentCount={documents.length} />
      {/if}
    </div>
  {/if}

  {#if selectedImageIndex !== null && mediaViewerList.length > 0}
    <MediaViewer mediaList={mediaViewerList} startIndex={selectedImageIndex} onClose={() => selectedImageIndex = null} />
  {/if}
</div>
