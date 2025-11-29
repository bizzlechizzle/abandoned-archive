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
    SubLocationGrid,
    type MediaImage, type MediaVideo, type MediaDocument, type Bookmark,
    type GpsWarning, type FailedFile
  } from '../components/location';
  import type { Location, LocationInput } from '@au-archive/core';

  interface Props {
    locationId: string;
    subId?: string | null; // If provided, viewing a sub-location
  }
  let { locationId, subId = null }: Props = $props();

  // Sub-location type (Migration 28 + Migration 31 GPS + Migration 32 AKA/Historical)
  interface SubLocation {
    subid: string;
    sub12: string;
    locid: string;
    subnam: string;
    ssubname: string | null;
    type: string | null;
    status: string | null;
    hero_imgsha: string | null;
    is_primary: boolean;
    hero_thumb_path?: string;
    // Migration 31: Sub-location GPS (separate from host location)
    gps_lat: number | null;
    gps_lng: number | null;
    gps_accuracy: number | null;
    gps_source: string | null;
    gps_verified_on_map: boolean;
    gps_captured_at: string | null;
    // Migration 32: AKA and historical name
    akanam: string | null;
    historicalName: string | null;
  }

  // State
  let location = $state<Location | null>(null);
  let sublocations = $state<SubLocation[]>([]);
  let currentSubLocation = $state<SubLocation | null>(null); // When viewing a sub-location
  let images = $state<MediaImage[]>([]);
  let videos = $state<MediaVideo[]>([]);
  let documents = $state<MediaDocument[]>([]);
  // Issue 3: All media for author extraction (includes sub-location media on host view)
  let allImagesForAuthors = $state<MediaImage[]>([]);
  let allVideosForAuthors = $state<MediaVideo[]>([]);
  let allDocumentsForAuthors = $state<MediaDocument[]>([]);
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

  // Derived: Are we viewing a sub-location?
  const isViewingSubLocation = $derived(!!subId && !!currentSubLocation);

  // Campus map: sub-locations with GPS coordinates
  const subLocationsWithGps = $derived(
    sublocations.filter(s => s.gps_lat !== null && s.gps_lng !== null)
  );

  // Migration 26: Import attribution modal
  let showAttributionModal = $state(false);
  let pendingImportPaths = $state<string[]>([]);
  let isSomeoneElse = $state(false); // false = current user, true = someone else
  let selectedAuthor = $state(''); // username of selected author (or 'external')
  let contributionSource = $state(''); // for external contributors
  let users = $state<Array<{user_id: string, username: string, display_name: string | null}>>([]);

  // Migration 28: Add Building modal
  let showAddBuildingModal = $state(false);
  let newBuildingName = $state('');
  let newBuildingIsPrimary = $state(false);
  let addingBuilding = $state(false);

  // Hero title auto-sizing: max 2 lines, never truncate
  let heroTitleEl = $state<HTMLElement | null>(null);
  let heroTitleFontSize = $state(108); // Start at max, shrink as needed
  let heroContainerEl = $state<HTMLElement | null>(null);

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
    // Author tracking (Migration 25/26)
    auth_imp: img.auth_imp ?? null,
    imported_by: img.imported_by ?? null,
    is_contributed: img.is_contributed ?? 0,
    contribution_source: img.contribution_source ?? null,
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
    // Author tracking (Migration 25/26)
    auth_imp: vid.auth_imp ?? null,
    imported_by: vid.imported_by ?? null,
    is_contributed: vid.is_contributed ?? 0,
    contribution_source: vid.contribution_source ?? null,
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

    if (words.length <= 3) return words.join(' ');

    const suffixesToStrip = new Set<string>(LOCATION_SUFFIXES);
    if (type) { suffixesToStrip.add(type.toLowerCase()); suffixesToStrip.add(type.toLowerCase() + 's'); }
    if (subtype) { suffixesToStrip.add(subtype.toLowerCase()); suffixesToStrip.add(subtype.toLowerCase() + 's'); }

    // Keep "School" when name contains "Union" - "Union School" is meaningful
    const lowerName = name.toLowerCase();
    if (lowerName.includes('union')) {
      suffixesToStrip.delete('school');
    }

    const result = [...words];
    while (result.length > 3) {
      const lastWord = result[result.length - 1].toLowerCase();
      if (suffixesToStrip.has(lastWord)) result.pop();
      else break;
    }
    return result.join(' ');
  }

  const heroDisplayName = $derived.by(() => {
    // For sub-locations, show the sub-location name
    if (currentSubLocation) return currentSubLocation.subnam;
    if (!location) return '';
    // Priority: custom short name > auto-generated
    const baseName = location.locnamShort || generateHeroName(location.locnam, location.type, location.stype);
    const prefix = location.locnamUseThe ? 'The ' : '';
    return prefix + baseName;
  });

  // Function to calculate and set title size for max 2 lines
  // RULE: Never cut off titles, always max 2 lines, no exceptions
  function fitTitleToTwoLines() {
    const el = heroTitleEl;
    const container = heroContainerEl;
    if (!el || !container) return;

    const MAX_LINES = 2;
    const maxSize = 128; // Max size cap
    const minSize = 14;
    let size = maxSize;

    // Binary search for optimal size (faster and more accurate)
    let low = minSize;
    let high = maxSize;
    let bestFit = minSize;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      el.style.fontSize = `${mid}px`;

      // Force reflow to get accurate measurements
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || mid * 1.2;
      const maxAllowedHeight = lineHeight * MAX_LINES * 1.05; // 2 lines with 5% tolerance
      const actualHeight = el.scrollHeight;

      if (actualHeight <= maxAllowedHeight) {
        // Fits in 2 lines - try larger
        bestFit = mid;
        low = mid + 1;
      } else {
        // Too many lines - try smaller
        high = mid - 1;
      }
    }

    el.style.fontSize = `${bestFit}px`;
    heroTitleFontSize = bestFit;
  }

  // Effect: Auto-size title to fit max 2 lines (never truncate)
  $effect(() => {
    const name = heroDisplayName; // Track dependency
    const el = heroTitleEl;
    const container = heroContainerEl;
    if (!el || !name) return;

    // Initial fit
    requestAnimationFrame(fitTitleToTwoLines);

    // Refit on resize
    const resizeObserver = new ResizeObserver(() => {
      fitTitleToTwoLines();
    });

    if (container) {
      resizeObserver.observe(container);
    }

    return () => resizeObserver.disconnect();
  });

  // Load functions
  // Migration 28: Check if this is a host location (has sub-locations)
  const isHostLocation = $derived(sublocations.length > 0);

  async function loadLocation() {
    try {
      loading = true; error = null;
      const [loc, media, sublocs] = await Promise.all([
        window.electronAPI.locations.findById(locationId),
        window.electronAPI.media.findByLocation(locationId),
        window.electronAPI.sublocations.findWithHeroImages(locationId),
      ]);
      location = loc;
      if (!location) { error = 'Location not found'; return; }

      // Migration 28: Load sub-locations
      sublocations = sublocs || [];

      // If subId is provided, load the specific sub-location
      if (subId) {
        currentSubLocation = await window.electronAPI.sublocations.findById(subId);
        if (!currentSubLocation) {
          error = 'Sub-location not found';
          return;
        }
      } else {
        currentSubLocation = null;
      }

      if (media) {
        // Issue 3: Store all media for author extraction (used by LocationInfo)
        allImagesForAuthors = (media.images as MediaImage[]) || [];
        allVideosForAuthors = (media.videos as MediaVideo[]) || [];
        allDocumentsForAuthors = (media.documents as MediaDocument[]) || [];

        if (subId) {
          // Viewing a sub-location: filter to only media linked to this sub-location
          images = ((media.images as MediaImage[]) || []).filter(img => img.subid === subId);
          videos = ((media.videos as MediaVideo[]) || []).filter(vid => vid.subid === subId);
          documents = ((media.documents as MediaDocument[]) || []).filter(doc => doc.subid === subId);
        } else if (sublocations.length > 0) {
          // Host location: only show media NOT linked to sub-locations (campus-level)
          images = ((media.images as MediaImage[]) || []).filter(img => !img.subid);
          videos = ((media.videos as MediaVideo[]) || []).filter(vid => !vid.subid);
          documents = ((media.documents as MediaDocument[]) || []).filter(doc => !doc.subid);
        } else {
          // Regular location: show all media
          images = (media.images as MediaImage[]) || [];
          videos = (media.videos as MediaVideo[]) || [];
          documents = (media.documents as MediaDocument[]) || [];
        }
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

  // Migration 32: Dual save handler for sub-location edit (saves to both subloc and host location)
  interface SubLocationUpdates {
    subnam?: string;
    ssubname?: string | null;
    type?: string | null;
    status?: string | null;
    is_primary?: boolean;
    akanam?: string | null;
    historicalName?: string | null;
  }

  async function handleSubLocationSave(subUpdates: SubLocationUpdates, locUpdates: Partial<LocationInput>) {
    if (!currentSubLocation || !location) return;
    try {
      // Save sub-location fields
      await window.electronAPI.sublocations.update(currentSubLocation.subid, subUpdates);
      // Save host location fields (campus-level info)
      if (Object.keys(locUpdates).length > 0) {
        await window.electronAPI.locations.update(location.locid, locUpdates);
      }
      // Reload to get updated data
      await loadLocation();
    } catch (err) {
      console.error('Error saving sub-location:', err);
      throw err;
    }
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
      // Migration 31: If viewing sub-location, verify sub-location GPS (separate from host)
      if (isViewingSubLocation && currentSubLocation) {
        await window.electronAPI.sublocations.verifyGps(currentSubLocation.subid);
        // Refresh sub-location data
        currentSubLocation = await window.electronAPI.sublocations.findById(currentSubLocation.subid);
      } else {
        // Host location GPS
        await window.electronAPI.locations.update(locationId, { gps: { ...location.gps, verifiedOnMap: true } });
        await loadLocation();
      }
    } catch (err) { console.error('Error marking GPS verified:', err); }
    finally { verifyingGps = false; }
  }

  /**
   * Migration 31: Save GPS from map click for sub-location
   * Updates sub-location's own GPS (not the host location)
   */
  async function saveSubLocationGps(lat: number, lng: number) {
    if (!currentSubLocation) return;
    try {
      await window.electronAPI.sublocations.updateGps(currentSubLocation.subid, {
        lat, lng, source: 'user_map_click',
      });
      // Refresh sub-location data
      currentSubLocation = await window.electronAPI.sublocations.findById(currentSubLocation.subid);
      toasts.success('Building GPS updated');
    } catch (err) {
      console.error('Error saving sub-location GPS:', err);
      toasts.error('Failed to save GPS');
    }
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
    if (expandedPaths.length > 0) {
      // Show attribution modal instead of importing directly
      pendingImportPaths = expandedPaths;
      isSomeoneElse = false;
      selectedAuthor = '';
      contributionSource = '';
      showAttributionModal = true;
      importProgress = '';
    }
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
        if (expandedPaths.length > 0) {
          // Show attribution modal instead of importing directly
          pendingImportPaths = expandedPaths;
          isSomeoneElse = false;
          selectedAuthor = '';
          contributionSource = '';
          showAttributionModal = true;
          importProgress = '';
        }
        else { importProgress = 'No supported media files found'; setTimeout(() => importProgress = '', 3000); }
      } else {
        pendingImportPaths = filePaths;
        isSomeoneElse = false;
        selectedAuthor = '';
        contributionSource = '';
        showAttributionModal = true;
      }
    } catch (err) { console.error('Error selecting files:', err); importProgress = 'Error selecting files'; setTimeout(() => importProgress = '', 3000); }
  }

  // Called when user confirms attribution in modal
  function confirmImport() {
    showAttributionModal = false;
    if (pendingImportPaths.length > 0) {
      // Determine author and contribution status
      let author = currentUser;
      let isContributed = 0;
      let source = '';

      if (isSomeoneElse) {
        if (selectedAuthor === 'external') {
          // External contributor
          isContributed = 1;
          source = contributionSource;
          author = currentUser; // Current user is importing on behalf of external
        } else {
          // Another registered user is the author
          author = selectedAuthor;
          isContributed = 0;
        }
      }

      importFilePaths(pendingImportPaths, author, isContributed, source);
      pendingImportPaths = [];
    }
  }

  function cancelImport() {
    showAttributionModal = false;
    pendingImportPaths = [];
    isSomeoneElse = false;
    selectedAuthor = '';
    contributionSource = '';
  }

  async function importFilePaths(filePaths: string[], author: string, contributed: number = 0, source: string = '') {
    if (!location || $isImporting) return;
    const filesForImport = filePaths.map(fp => ({ filePath: fp, originalName: fp.split(/[\\/]/).pop()! }));

    // Import job label varies based on whether viewing sub-location
    const jobLabel = currentSubLocation
      ? `${location.locnam} / ${currentSubLocation.subnam}`
      : location.locnam;
    importStore.startJob(location.locid, jobLabel, filePaths.length);
    importProgress = `Import started (${filePaths.length} files)`;

    window.electronAPI.media.import({
      files: filesForImport,
      locid: location.locid,
      subid: subId || null, // Link to sub-location when viewing one
      auth_imp: author,
      deleteOriginals: false,
      is_contributed: contributed,
      contribution_source: source || null,
    })
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
        loadLocation().then(() => {
          // Scroll to media gallery after successful import
          const mediaSection = document.getElementById('media-gallery');
          if (mediaSection) {
            mediaSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
      })
      .catch((err) => { const msg = err instanceof Error ? err.message : 'Unknown error'; importStore.completeJob(undefined, msg); importProgress = `Import error: ${msg}`; toasts.error(`Import error: ${msg}`); });
    setTimeout(() => importProgress = '', 8000);
  }

  async function retryFailedImports() {
    if (failedFiles.length === 0) return;
    const paths = failedFiles.map(f => f.filePath);
    failedFiles = [];
    // Retry with current user as author
    await importFilePaths(paths, currentUser, 0, '');
  }

  // Bookmark handlers
  // Migration 28: Add Building handlers
  function openAddBuildingModal() {
    newBuildingName = '';
    newBuildingIsPrimary = sublocations.length === 0; // First building is primary by default
    showAddBuildingModal = true;
  }

  // Convert to Host Location - opens Add Building modal (adding first building makes it a host)
  async function handleConvertToHost() {
    openAddBuildingModal();
  }

  function closeAddBuildingModal() {
    showAddBuildingModal = false;
    newBuildingName = '';
    newBuildingIsPrimary = false;
    addingBuilding = false;
  }

  async function handleAddBuilding() {
    if (!newBuildingName.trim() || !location) return;

    try {
      addingBuilding = true;
      await window.electronAPI.sublocations.create({
        locid: location.locid,
        subnam: newBuildingName.trim(),
        type: location.type || null,
        status: null,
        is_primary: newBuildingIsPrimary,
        created_by: currentUser || null,
      });

      closeAddBuildingModal();
      toasts.success(`Building "${newBuildingName.trim()}" added`);

      // Reload sub-locations
      sublocations = await window.electronAPI.sublocations.findWithHeroImages(location.locid);
    } catch (err) {
      console.error('Error adding building:', err);
      toasts.error('Failed to add building');
    } finally {
      addingBuilding = false;
    }
  }

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

    // Migration 33: Track view for Nerd Stats (only for host locations, not sub-locations)
    if (!subId && locationId) {
      window.electronAPI?.locations?.trackView(locationId).catch((err: unknown) => {
        console.warn('[LocationDetail] Failed to track view:', err);
      });
    }

    try {
      const settings = await window.electronAPI.settings.getAll();
      currentUser = settings.current_user || 'default';
      // Load users for attribution modal
      if (window.electronAPI?.users) {
        users = await window.electronAPI.users.findAll();
      }
    }
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
      heroImgsha={currentSubLocation?.hero_imgsha || location.hero_imgsha || null}
      focalX={currentSubLocation ? 0.5 : (location.hero_focal_x ?? 0.5)}
      focalY={currentSubLocation ? 0.5 : (location.hero_focal_y ?? 0.5)}
      onRegeneratePreview={async (imgsha) => {
        // Issue 1: Regenerate preview for low-quality hero image
        const img = images.find(i => i.imgsha === imgsha);
        if (img && window.electronAPI?.media?.regenerateSingleFile) {
          await window.electronAPI.media.regenerateSingleFile(imgsha, img.imgloc);
          await loadLocation(); // Refresh to get new thumbnail paths
        }
      }}
    />

    <!-- Title overlaps hero gradient: centered, premium text fitting - up to 2 lines -->
    <div class="max-w-6xl mx-auto px-8 pb-4 relative z-20 -mt-10">
      <div bind:this={heroContainerEl} class="w-[88%] mx-auto text-center">
        <h1
          bind:this={heroTitleEl}
          class="hero-title font-bold uppercase leading-tight text-center mb-0"
          style="font-size: {heroTitleFontSize}px;"
          title={isViewingSubLocation ? currentSubLocation?.subnam : location.locnam}
        >
          {heroDisplayName}
        </h1>{#if isViewingSubLocation}
          <!-- Host location tagline (sub-location view) -->
          <button
            onclick={() => router.navigate(`/location/${locationId}`)}
            class="host-tagline block w-[90%] mx-auto mt-0 uppercase hover:underline text-center"
          >
            {location.locnam}
          </button>
        {:else if isHostLocation && sublocations.length > 0}
          <!-- Buildings tagline (host location view) - list building names -->
          <div class="host-tagline block w-[90%] mx-auto mt-0 uppercase text-center">
            {#each sublocations as subloc, i}
              {#if i > 0}<span class="mx-2"></span>{/if}
              <button
                onclick={() => router.navigate(`/location/${locationId}/sub/${subloc.subid}`)}
                class="hover:underline"
              >{subloc.subnam}</button>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <div class="max-w-6xl mx-auto px-8 pt-6 pb-8">

      {#if isEditing}
        <LocationEditForm {location} onSave={handleSave} onCancel={() => isEditing = false} />
      {:else}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LocationInfo
            {location}
            {images}
            {videos}
            {documents}
            {allImagesForAuthors}
            {allVideosForAuthors}
            {allDocumentsForAuthors}
            onNavigateFilter={navigateToFilter}
            onSave={handleSave}
            {sublocations}
            isHostLocation={isHostLocation && !isViewingSubLocation}
            onConvertToHost={isViewingSubLocation ? undefined : handleConvertToHost}
            currentSubLocation={isViewingSubLocation ? currentSubLocation : null}
            onSubLocationSave={isViewingSubLocation ? handleSubLocationSave : undefined}
          />
          <div class="location-map-section">
            <!-- DECISION-011: Unified location box with verification checkmarks, edit modal -->
            <!-- Migration 31: Pass sub-location GPS props when viewing a sub-location -->
            <LocationMapSection
              {location}
              onSave={handleLocationSave}
              onNavigateFilter={navigateToFilter}
              isHostLocation={isHostLocation && !isViewingSubLocation}
              subLocation={isViewingSubLocation && currentSubLocation ? {
                subid: currentSubLocation.subid,
                subnam: currentSubLocation.subnam,
                gps_lat: currentSubLocation.gps_lat,
                gps_lng: currentSubLocation.gps_lng,
                gps_verified_on_map: currentSubLocation.gps_verified_on_map,
                gps_source: currentSubLocation.gps_source,
              } : null}
              onSubLocationGpsSave={isViewingSubLocation ? saveSubLocationGps : undefined}
              campusSubLocations={!isViewingSubLocation && isHostLocation ? subLocationsWithGps : []}
              onCampusSubLocationClick={(subid) => router.navigate(`/location/${locationId}/sub/${subid}`)}
            />
          </div>
        </div>

        <!-- Notes scoped to sub-location when viewing one -->
        <NotesSection locid={isViewingSubLocation && currentSubLocation ? currentSubLocation.subid : location.locid} {currentUser} />

        <!-- Migration 28: Sub-Location Grid (only for host locations, hide when viewing a sub-location) -->
        {#if !isViewingSubLocation && isHostLocation}
          <div id="buildings-section">
            <SubLocationGrid
              locid={location.locid}
              {sublocations}
              onAddSubLocation={openAddBuildingModal}
            />
          </div>
        {/if}

        <!-- Import zone - host locations get campus-level media, buildings get building media -->
        <LocationImportZone
          isImporting={$isImporting}
          {importProgress}
          {isDragging}
          {gpsWarnings}
          {failedFiles}
          scopeLabel={isViewingSubLocation ? currentSubLocation?.subnam : (isHostLocation ? 'Campus-Level' : null)}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onSelectFiles={handleSelectFiles}
          onRetryFailed={retryFailedImports}
          onDismissWarning={(i) => gpsWarnings = gpsWarnings.filter((_, idx) => idx !== i)}
          onDismissAllWarnings={() => gpsWarnings = []}
        />

        <LocationBookmarks {bookmarks} onAddBookmark={handleAddBookmark} onDeleteBookmark={handleDeleteBookmark} onOpenBookmark={handleOpenBookmark} />
        <div id="media-gallery">
          <LocationOriginalAssets
            {images}
            {videos}
            {documents}
            heroImgsha={currentSubLocation?.hero_imgsha || location.hero_imgsha || null}
            onOpenImageLightbox={(i) => selectedMediaIndex = i}
            onOpenVideoLightbox={(i) => selectedMediaIndex = images.length + i}
            onOpenDocument={openMediaFile}
          />
        </div>
        <LocationNerdStats {location} imageCount={images.length} videoCount={videos.length} documentCount={documents.length} />
      {/if}
    </div>
  {/if}

  {#if selectedMediaIndex !== null && mediaViewerList.length > 0}
    <MediaViewer
      mediaList={mediaViewerList}
      startIndex={selectedMediaIndex}
      onClose={() => selectedMediaIndex = null}
      heroImgsha={currentSubLocation?.hero_imgsha || location?.hero_imgsha || null}
      focalX={currentSubLocation ? 0.5 : (location?.hero_focal_x ?? 0.5)}
      focalY={currentSubLocation ? 0.5 : (location?.hero_focal_y ?? 0.5)}
      onSetHeroImage={currentSubLocation
        ? async (imgsha, fx, fy) => {
            await window.electronAPI.sublocations.update(currentSubLocation.subid, { hero_imgsha: imgsha });
            await loadLocation();
          }
        : setHeroImageWithFocal}
      onSetHostHeroImage={currentSubLocation ? setHeroImageWithFocal : undefined}
      onHiddenChanged={handleHiddenChanged}
    />
  {/if}

  <!-- Migration 26: Import Attribution Modal -->
  {#if showAttributionModal}
    <div
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[99999]"
      onclick={cancelImport}
      role="dialog"
      aria-modal="true"
      aria-labelledby="attribution-title"
    >
      <div
        class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4"
        onclick={(e) => e.stopPropagation()}
      >
        <div class="p-4 border-b">
          <h2 id="attribution-title" class="text-lg font-semibold text-foreground">
            Import Attribution
          </h2>
          <p class="text-sm text-gray-500 mt-1">
            {pendingImportPaths.length} file{pendingImportPaths.length !== 1 ? 's' : ''} ready to import
          </p>
        </div>

        <div class="p-4 space-y-4">
          <!-- Current user or Someone Else -->
          <div class="space-y-3">
            <label class="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition {!isSomeoneElse ? 'border-accent bg-accent/5' : 'border-gray-200'}">
              <input
                type="radio"
                name="attribution"
                checked={!isSomeoneElse}
                onchange={() => { isSomeoneElse = false; selectedAuthor = ''; contributionSource = ''; }}
                class="w-4 h-4 text-accent"
              />
              <div>
                <p class="font-medium text-foreground">{users.find(u => u.username === currentUser)?.display_name || currentUser}</p>
                <p class="text-sm text-gray-500">I shot these</p>
              </div>
            </label>

            <label class="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition {isSomeoneElse ? 'border-accent bg-accent/5' : 'border-gray-200'}">
              <input
                type="radio"
                name="attribution"
                checked={isSomeoneElse}
                onchange={() => isSomeoneElse = true}
                class="w-4 h-4 text-accent"
              />
              <div>
                <p class="font-medium text-foreground">Someone Else</p>
                <p class="text-sm text-gray-500">Another user or external contributor</p>
              </div>
            </label>
          </div>

          <!-- If Someone Else: show author dropdown -->
          {#if isSomeoneElse}
            <div class="pt-2 space-y-3">
              <div>
                <label for="author-select" class="block text-sm font-medium text-gray-700 mb-1">
                  Who shot these?
                </label>
                <select
                  id="author-select"
                  bind:value={selectedAuthor}
                  class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="">Select...</option>
                  {#each users.filter(u => u.username !== currentUser) as user}
                    <option value={user.username}>{user.display_name || user.username}</option>
                  {/each}
                  <option value="external">External Contributor</option>
                </select>
              </div>

              <!-- If External: show source field -->
              {#if selectedAuthor === 'external'}
                <div>
                  <label for="contribution-source" class="block text-sm font-medium text-gray-700 mb-1">
                    Source
                  </label>
                  <input
                    id="contribution-source"
                    type="text"
                    bind:value={contributionSource}
                    placeholder="e.g., John Smith via text"
                    class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              {/if}
            </div>
          {/if}
        </div>

        <div class="p-4 border-t flex justify-end gap-2">
          <button
            onclick={cancelImport}
            class="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition"
          >
            Cancel
          </button>
          <button
            onclick={confirmImport}
            disabled={isSomeoneElse && !selectedAuthor || (selectedAuthor === 'external' && !contributionSource.trim())}
            class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Import
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Migration 28: Add Building Modal -->
  {#if showAddBuildingModal}
    <div
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[99999]"
      onclick={closeAddBuildingModal}
      role="dialog"
      aria-modal="true"
    >
      <div
        class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4"
        onclick={(e) => e.stopPropagation()}
      >
        <div class="p-4 border-b">
          <h2 class="text-lg font-semibold text-foreground">Add Building</h2>
          <p class="text-sm text-gray-500 mt-1">
            Add a building to {location?.locnam || 'this location'}
          </p>
        </div>

        <div class="p-4 space-y-4">
          <div>
            <label for="building-name" class="block text-sm font-medium text-gray-700 mb-1">
              Building Name <span class="text-red-500">*</span>
            </label>
            <input
              id="building-name"
              type="text"
              bind:value={newBuildingName}
              disabled={addingBuilding}
              placeholder="e.g., Main Building, Powerhouse"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <label class="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              bind:checked={newBuildingIsPrimary}
              disabled={addingBuilding}
              class="h-5 w-5 rounded border-gray-300 text-accent focus:ring-accent"
            />
            <div>
              <span class="text-sm font-medium text-gray-700">Primary Building</span>
              <p class="text-xs text-gray-500">Set as main structure of this campus</p>
            </div>
          </label>
        </div>

        <div class="p-4 border-t flex justify-end gap-2">
          <button
            onclick={closeAddBuildingModal}
            disabled={addingBuilding}
            class="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onclick={handleAddBuilding}
            disabled={addingBuilding || !newBuildingName.trim()}
            class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {addingBuilding ? 'Adding...' : 'Add Building'}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Hero title: auto-sized to fit max 2 lines, never truncate */
  .hero-title {
    color: #454545;
    letter-spacing: 0.02em; /* Tight, premium spacing */
    word-spacing: -0.02em; /* Cohesive word blocks */
    font-weight: 800;
    text-wrap: balance; /* Balances word distribution across lines */
    /* Hand-painted sign style - hard offset shadow, accent gold */
    text-shadow: 3px 3px 0 rgba(185, 151, 92, 0.5);
  }

  /* Host location tagline (cinematic - tiny link under title) */
  .host-tagline {
    color: var(--color-accent, #b9975c); /* Accent color */
    font-size: 18px; /* Taller tagline */
    letter-spacing: 0.08em;
    font-weight: 700; /* Bold */
    white-space: nowrap; /* Single line ALWAYS */
  }
</style>
