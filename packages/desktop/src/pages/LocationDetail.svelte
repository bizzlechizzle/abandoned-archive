<script lang="ts">
  /**
   * LocationDetail - Master orchestrator for location detail page
   * Per LILBITS: ~250 lines (orchestrator coordinating child components)
   * Per PUEA: Show only sections with data
   * Per AAA: Import shows results immediately
   * DECISION-014: Removed auto-geocoding from onMount (GPS from EXIF/user action only)
   */
  import { onMount } from 'svelte';
  import { router } from '../stores/router';
  import { importStore, isImporting } from '../stores/import-store';
  import { toasts } from '../stores/toast-store';
  import LocationEditForm from '../components/LocationEditForm.svelte';
  import NotesSection from '../components/NotesSection.svelte';
  import MediaViewer from '../components/MediaViewer.svelte';
  import {
    LocationHero, LocationInfo,
    LocationMapSection, LocationOriginalAssets,
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
  let selectedMediaIndex = $state<number | null>(null);
  let currentUser = $state('default');
  let isDragging = $state(false);
  let importProgress = $state('');
  let verifyingGps = $state(false);
  let togglingFavorite = $state(false);

  // Hero title text fitting - premium single-line scaling
  let titleContainer: HTMLDivElement | undefined = $state();
  let titleElement: HTMLHeadingElement | undefined = $state();
  let titleFontSize = $state(60);

  // Derived: Combined media list for MediaViewer (images first, then videos)
  const imageMediaList = $derived(images.map(img => ({
    hash: img.imgsha, path: img.imgloc,
    thumbPath: img.thumb_path_sm || img.thumb_path || null,
    previewPath: img.preview_path || null, type: 'image' as const,
    name: img.imgnam, width: img.meta_width, height: img.meta_height,
    dateTaken: img.meta_date_taken, cameraMake: img.meta_camera_make || null,
    cameraModel: img.meta_camera_model || null,
    gpsLat: img.meta_gps_lat || null, gpsLng: img.meta_gps_lng || null,
    // Hidden status (Migration 23)
    hidden: img.hidden ?? 0,
    hidden_reason: img.hidden_reason ?? null,
    is_live_photo: img.is_live_photo ?? 0,
  })));

  const videoMediaList = $derived(videos.map(vid => ({
    hash: vid.vidsha, path: vid.vidloc,
    thumbPath: vid.thumb_path_sm || vid.thumb_path || null,
    previewPath: vid.preview_path || null, type: 'video' as const,
    name: vid.vidnam, width: vid.meta_width, height: vid.meta_height,
    dateTaken: null, cameraMake: null, cameraModel: null,
    gpsLat: vid.meta_gps_lat || null, gpsLng: vid.meta_gps_lng || null,
    // Hidden status (Migration 23)
    hidden: vid.hidden ?? 0,
    hidden_reason: vid.hidden_reason ?? null,
    is_live_photo: vid.is_live_photo ?? 0,
  })));

  // Combined list: images first, then videos
  const mediaViewerList = $derived([...imageMediaList, ...videoMediaList]);

  // Hero display name: uses custom short name or auto-generates from locnam
  const LOCATION_SUFFIXES = new Set([
    'church', 'hospital', 'factory', 'mill', 'school', 'building',
    'house', 'mansion', 'hotel', 'motel', 'inn', 'theater', 'theatre',
    'station', 'depot', 'warehouse', 'plant', 'complex', 'center',
    'centre', 'asylum', 'sanitarium', 'sanatorium', 'prison', 'jail',
    'penitentiary', 'cemetery', 'memorial', 'monument', 'cathedral',
    'chapel', 'temple', 'synagogue', 'mosque', 'abbey', 'monastery',
    'convent', 'rectory', 'parsonage', 'vicarage', 'catholic'
  ]);

  function generateHeroName(name: string, type?: string, subtype?: string): string {
    let words = name.split(/\s+/).filter(w => w.length > 0);

    // Strip leading "The" - the toggle can add it back
    if (words.length > 0 && words[0].toLowerCase() === 'the') {
      words = words.slice(1);
    }

    if (words.length <= 2) return words.join(' ');

    const suffixesToStrip = new Set<string>(LOCATION_SUFFIXES);
    if (type) { suffixesToStrip.add(type.toLowerCase()); suffixesToStrip.add(type.toLowerCase() + 's'); }
    if (subtype) { suffixesToStrip.add(subtype.toLowerCase()); suffixesToStrip.add(subtype.toLowerCase() + 's'); }

    // Keep "School" when name contains "Union" - "Union School" is meaningful
    const lowerName = name.toLowerCase();
    if (lowerName.includes('union')) {
      suffixesToStrip.delete('school');
    }

    const result = [...words];
    while (result.length > 2) {
      const lastWord = result[result.length - 1].toLowerCase();
      if (suffixesToStrip.has(lastWord)) result.pop();
      else break;
    }
    return result.join(' ');
  }

  const heroDisplayName = $derived.by(() => {
    if (!location) return '';
    // Priority: custom short name > auto-generated
    const baseName = location.locnamShort || generateHeroName(location.locnam, location.type, location.stype);
    const prefix = location.locnamUseThe ? 'The ' : '';
    return prefix + baseName;
  });

  // Text fitting effect - scales font to fit container width
  function fitTitleText() {
    if (!titleContainer || !titleElement) return;

    const maxSize = 60;
    const minSize = 16;
    let size = maxSize;

    // Reset to max size first
    titleElement.style.fontSize = `${size}px`;

    // Shrink until it fits
    while (titleElement.scrollWidth > titleContainer.clientWidth && size > minSize) {
      size -= 2;
      titleElement.style.fontSize = `${size}px`;
    }

    titleFontSize = size;
  }

  // Re-fit when heroDisplayName changes or elements mount
  $effect(() => {
    if (heroDisplayName && titleContainer && titleElement) {
      // Small delay to ensure DOM is ready
      requestAnimationFrame(() => fitTitleText());
    }
  });

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

  /**
   * DECISION-011 & DECISION-017: Handle location save from edit modal
   * Saves address, GPS, verification status, and cultural regions
   */
  interface RegionSaveData {
    culturalRegion: string | null;
    localCulturalRegionVerified: boolean;
    countryCulturalRegion: string | null;
    countryCulturalRegionVerified: boolean;
  }

  async function handleLocationSave(
    updates: Partial<LocationInput>,
    addressVerified: boolean,
    gpsVerified: boolean,
    regionData: RegionSaveData
  ) {
    if (!location) return;

    // Build full update object
    const fullUpdates: any = { ...updates };

    // Set address verification
    if (updates.address) {
      fullUpdates.address = {
        ...updates.address,
        verified: addressVerified,
      };
    }

    // Set GPS verification
    if (updates.gps) {
      fullUpdates.gps = {
        ...updates.gps,
        verifiedOnMap: gpsVerified,
      };
    }

    // Update location via API
    await window.electronAPI.locations.update(location.locid, fullUpdates);

    // DECISION-017: Update cultural regions and verification status
    if (window.electronAPI.locations.updateRegionData) {
      await window.electronAPI.locations.updateRegionData(location.locid, regionData);
    } else if (window.electronAPI.locations.updateCulturalRegion) {
      // Fallback: use legacy API for local cultural region only
      await window.electronAPI.locations.updateCulturalRegion(location.locid, regionData.culturalRegion);
    }

    await loadLocation();
  }

  /** Kanye6 + Migration 22: Set hero image with focal point */
  async function setHeroImageWithFocal(imgsha: string, fx: number, fy: number) {
    if (!location) return;
    try {
      await window.electronAPI.locations.update(locationId, {
        hero_imgsha: imgsha,
        hero_focal_x: fx,
        hero_focal_y: fy,
      });
      await loadLocation();
    } catch (err) { console.error('Error setting hero image:', err); }
  }

  /** Migration 23: Handle hidden status changes from MediaViewer */
  function handleHiddenChanged(hash: string, hidden: boolean) {
    // Update local state immediately for responsive UI
    const imgIndex = images.findIndex(i => i.imgsha === hash);
    if (imgIndex >= 0) {
      images[imgIndex] = { ...images[imgIndex], hidden: hidden ? 1 : 0, hidden_reason: hidden ? 'user' : null };
      images = [...images]; // Trigger reactivity
      return;
    }
    const vidIndex = videos.findIndex(v => v.vidsha === hash);
    if (vidIndex >= 0) {
      videos[vidIndex] = { ...videos[vidIndex], hidden: hidden ? 1 : 0, hidden_reason: hidden ? 'user' : null };
      videos = [...videos]; // Trigger reactivity
    }
  }

  function navigateToFilter(type: string, value: string, additionalFilters?: Record<string, string>) {
    // DECISION-013: Support multiple filters (e.g., county + state to avoid duplicates)
    const filters: Record<string, string> = { [type]: value, ...additionalFilters };
    router.navigate('/locations', undefined, filters);
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
    // DECISION-014: Removed ensureGpsFromAddress() - GPS should only come from EXIF or user action
    try { const settings = await window.electronAPI.settings.getAll(); currentUser = settings.current_user || 'default'; }
    catch (err) { console.error('Error loading user settings:', err); }

    // Auto-open file browser if navigated from "Add Media" button on Import form
    const hash = window.location.hash;
    if (hash.includes('autoImport=true')) {
      // Small delay to ensure UI is ready, then open file browser
      setTimeout(() => handleSelectFiles(), 100);
      // Clear the query param to prevent re-triggering on refresh
      router.navigate(`/location/${locationId}`);
    }
  });
</script>

<!-- Resize handler for title text fitting -->
<svelte:window onresize={fitTitleText} />

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
    <!-- Hero outside max-w container for full-width stretch -->
    <LocationHero
      {images}
      heroImgsha={location.hero_imgsha || null}
      focalX={location.hero_focal_x ?? 0.5}
      focalY={location.hero_focal_y ?? 0.5}
    />

    <!-- Title below hero: left-anchored, premium text fitting - always one line -->
    <div class="max-w-6xl mx-auto px-8 pt-2 pb-2">
      <div
        bind:this={titleContainer}
        class="w-full lg:w-[70%] text-left"
      >
        <h1
          bind:this={titleElement}
          class="font-bold leading-tight whitespace-nowrap text-left"
          style="color: #454545; font-size: {titleFontSize}px;"
          title={location.locnam}
        >
          {heroDisplayName}
        </h1>
      </div>
    </div>

    <div class="max-w-6xl mx-auto px-8 pb-8">

      {#if isEditing}
        <LocationEditForm {location} onSave={handleSave} onCancel={() => isEditing = false} />
      {:else}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LocationInfo {location} onNavigateFilter={navigateToFilter} onSave={handleSave} />
          <div class="location-map-section">
            <!-- DECISION-011: Unified location box with verification checkmarks, edit modal -->
            <LocationMapSection {location} onSave={handleLocationSave} onNavigateFilter={navigateToFilter} />
          </div>
        </div>

        <NotesSection locid={location.locid} {currentUser} />

        <LocationImportZone isImporting={$isImporting} {importProgress} {isDragging} {gpsWarnings} {failedFiles}
          onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
          onSelectFiles={handleSelectFiles} onRetryFailed={retryFailedImports}
          onDismissWarning={(i) => gpsWarnings = gpsWarnings.filter((_, idx) => idx !== i)}
          onDismissAllWarnings={() => gpsWarnings = []} />

        <LocationBookmarks {bookmarks} onAddBookmark={handleAddBookmark} onDeleteBookmark={handleDeleteBookmark} onOpenBookmark={handleOpenBookmark} />
        <LocationOriginalAssets
          {images}
          {videos}
          {documents}
          heroImgsha={location.hero_imgsha || null}
          onOpenImageLightbox={(i) => selectedMediaIndex = i}
          onOpenVideoLightbox={(i) => selectedMediaIndex = images.length + i}
          onOpenDocument={openMediaFile}
        />
        <LocationNerdStats {location} imageCount={images.length} videoCount={videos.length} documentCount={documents.length} />
      {/if}
    </div>
  {/if}

  {#if selectedMediaIndex !== null && mediaViewerList.length > 0}
    <MediaViewer
      mediaList={mediaViewerList}
      startIndex={selectedMediaIndex}
      onClose={() => selectedMediaIndex = null}
      heroImgsha={location?.hero_imgsha || null}
      focalX={location?.hero_focal_x ?? 0.5}
      focalY={location?.hero_focal_y ?? 0.5}
      onSetHeroImage={setHeroImageWithFocal}
      onHiddenChanged={handleHiddenChanged}
    />
  {/if}
</div>
