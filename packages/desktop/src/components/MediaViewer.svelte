<script lang="ts">
  /**
   * MediaViewer - Full-screen lightbox for viewing images and videos
   *
   * Features:
   * - Displays images via native <img> (standard formats)
   * - Displays RAW previews extracted by ExifTool
   * - Keyboard navigation (arrow keys, Escape to close)
   * - Two-tier metadata panel: Summary + All Fields
   * - Hero image selection with focal point editor
   */
  import { thumbnailCache } from '../stores/thumbnail-cache-store';

  interface Props {
    mediaList: Array<{
      hash: string;
      path: string;
      thumbPath?: string | null;
      previewPath?: string | null;
      type: 'image' | 'video' | 'document';
      name?: string;
      width?: number | null;
      height?: number | null;
      dateTaken?: string | null;
      cameraMake?: string | null;
      cameraModel?: string | null;
      gpsLat?: number | null;
      gpsLng?: number | null;
      // Hidden status (Migration 23)
      hidden?: number;
      hidden_reason?: string | null;
      is_live_photo?: number;
      // Author tracking (Migration 25/26)
      auth_imp?: string | null;
      imported_by?: string | null;
      is_contributed?: number;
      contribution_source?: string | null;
    }>;
    startIndex?: number;
    onClose: () => void;
    // Hero image props
    heroImgsha?: string | null;
    focalX?: number;
    focalY?: number;
    onSetHeroImage?: (imgsha: string, focalX: number, focalY: number) => void;
    // Issue 7: Callback for setting host location hero from sub-location view
    onSetHostHeroImage?: (imgsha: string, focalX: number, focalY: number) => void;
    // Hidden status callback
    onHiddenChanged?: (hash: string, hidden: boolean) => void;
    // Delete and Move callbacks
    onDeleted?: (hash: string, type: 'image' | 'video' | 'document') => void;
    onMoved?: (hash: string, type: 'image' | 'video' | 'document', subid: string | null) => void;
    // Sub-locations for move modal (optional - if not provided, move button is hidden)
    sublocations?: Array<{ subid: string; subnam: string }>;
    // Current sub-location ID (for pre-selecting in move modal)
    currentSubid?: string | null;
    // Location ID for creating new sub-locations
    locid?: string;
  }

  let { mediaList, startIndex = 0, onClose, heroImgsha, focalX = 0.5, focalY = 0.5, onSetHeroImage, onSetHostHeroImage, onHiddenChanged, onDeleted, onMoved, sublocations = [], currentSubid = null, locid }: Props = $props();

  let currentIndex = $state(startIndex);
  let showExif = $state(false);
  let imageError = $state(false);
  let regenerating = $state(false);
  let regenerateError = $state<string | null>(null);

  // Video proxy state (Migration 36)
  let proxyPath = $state<string | null>(null);
  let generatingProxy = $state(false);
  let proxyError = $state<string | null>(null);
  let playOriginal = $state(false); // Fallback to original when proxy fails

  // Full metadata state (lazy-loaded)
  let fullMetadata = $state<Record<string, unknown> | null>(null);
  let ffmpegMetadata = $state<Record<string, unknown> | null>(null);
  let loadingMetadata = $state(false);
  let metadataError = $state<string | null>(null);
  let showAllFields = $state(false);
  let lastLoadedHash = $state<string | null>(null);

  // Hero focal point editor state
  let isEditingFocal = $state(false);
  let pendingFocalX = $state(focalX);
  let pendingFocalY = $state(focalY);

  const currentMedia = $derived(mediaList[currentIndex]);
  const isCurrentHero = $derived(currentMedia?.hash === heroImgsha);
  const canBeHero = $derived(currentMedia?.type === 'image');

  // Hidden status
  const isCurrentHidden = $derived(currentMedia?.hidden === 1);
  const hiddenReason = $derived(currentMedia?.hidden_reason);
  const isLivePhoto = $derived(currentMedia?.is_live_photo === 1);
  let togglingHidden = $state(false);

  // Delete confirmation state
  let showDeleteConfirm = $state(false);
  let deleting = $state(false);

  // Move to sub-location modal state
  let showMoveModal = $state(false);
  let selectedSubid = $state<string | null>(currentSubid);
  let moving = $state(false);
  let newSubName = $state('');
  let creatingNewSub = $state(false);

  // Cache version for busting browser cache after thumbnail regeneration
  const cacheVersion = $derived($thumbnailCache);

  // Get the best available image source
  // Uses custom media:// protocol registered in main process to bypass file:// restrictions
  const imageSrc = $derived(() => {
    if (!currentMedia) return '';
    // Priority: preview (for RAW) -> original path
    // Append cache version to force reload after regeneration
    if (currentMedia.previewPath) {
      return `media://${currentMedia.previewPath}?v=${cacheVersion}`;
    }
    return `media://${currentMedia.path}?v=${cacheVersion}`;
  });

  function handleKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case 'Escape':
        if (isEditingFocal) {
          cancelFocalEdit();
        } else {
          onClose();
        }
        break;
      case 'ArrowLeft':
        goToPrevious();
        break;
      case 'ArrowRight':
        goToNext();
        break;
      case 'i':
        toggleInfo();
        break;
    }
  }

  function goToPrevious() {
    if (currentIndex > 0) {
      currentIndex--;
      imageError = false;
      showAllFields = false;
      isEditingFocal = false;
      // Reset proxy state (effect will load new proxy if needed)
      proxyPath = null;
      proxyError = null;
      playOriginal = false;
      triggerPreload();
      if (showExif) loadFullMetadata();
    }
  }

  function goToNext() {
    if (currentIndex < mediaList.length - 1) {
      currentIndex++;
      imageError = false;
      showAllFields = false;
      isEditingFocal = false;
      // Reset proxy state (effect will load new proxy if needed)
      proxyPath = null;
      proxyError = null;
      playOriginal = false;
      triggerPreload();
      if (showExif) loadFullMetadata();
    }
  }

  function triggerPreload() {
    // Notify main process to preload adjacent images
    const simpleList = mediaList.map(m => ({ hash: m.hash, path: m.path }));
    window.electronAPI?.media?.preload(simpleList, currentIndex);
  }

  function handleImageError() {
    imageError = true;
  }

  async function showInFinder() {
    if (currentMedia) {
      await window.electronAPI?.media?.showInFolder(currentMedia.path);
    }
  }

  // Toggle hidden status for current media
  async function toggleHidden() {
    if (!currentMedia || togglingHidden) return;

    togglingHidden = true;
    const newHiddenState = !isCurrentHidden;

    try {
      await window.electronAPI?.media?.setHidden({
        hash: currentMedia.hash,
        type: currentMedia.type,
        hidden: newHiddenState,
        reason: newHiddenState ? 'user' : undefined,
      });

      // Update local state in mediaList
      mediaList[currentIndex] = {
        ...currentMedia,
        hidden: newHiddenState ? 1 : 0,
        hidden_reason: newHiddenState ? 'user' : null,
      };

      // Notify parent component
      onHiddenChanged?.(currentMedia.hash, newHiddenState);
    } catch (err) {
      console.error('Failed to toggle hidden status:', err);
    } finally {
      togglingHidden = false;
    }
  }

  // Delete current media item
  async function handleDelete() {
    if (!currentMedia || deleting) return;

    deleting = true;
    try {
      const result = await window.electronAPI?.media?.delete({
        hash: currentMedia.hash,
        type: currentMedia.type,
      });

      if (result?.success) {
        // Notify parent and close or move to next
        onDeleted?.(currentMedia.hash, currentMedia.type);

        // Remove from local list and adjust index
        const removedIndex = currentIndex;
        mediaList.splice(removedIndex, 1);

        if (mediaList.length === 0) {
          // No more media, close lightbox
          onClose();
        } else if (currentIndex >= mediaList.length) {
          // Was at end, go to new last item
          currentIndex = mediaList.length - 1;
        }
        // Otherwise currentIndex now points to next item (same index, new content)
      }
    } catch (err) {
      console.error('Failed to delete media:', err);
    } finally {
      deleting = false;
      showDeleteConfirm = false;
    }
  }

  // Move current media to a different sub-location
  async function handleMove() {
    if (!currentMedia || moving) return;

    // If creating new sub-location
    if (creatingNewSub && newSubName.trim() && locid) {
      try {
        const newSub = await window.electronAPI?.sublocations?.create({
          locid,
          subnam: newSubName.trim(),
        });
        if (newSub?.subid) {
          selectedSubid = newSub.subid;
        }
      } catch (err) {
        console.error('Failed to create sub-location:', err);
        return;
      }
    }

    moving = true;
    try {
      const result = await window.electronAPI?.media?.moveToSubLocation({
        hash: currentMedia.hash,
        type: currentMedia.type,
        subid: selectedSubid,
      });

      if (result?.success) {
        onMoved?.(currentMedia.hash, currentMedia.type, selectedSubid);
        showMoveModal = false;
        newSubName = '';
        creatingNewSub = false;
      }
    } catch (err) {
      console.error('Failed to move media:', err);
    } finally {
      moving = false;
    }
  }

  function openMoveModal() {
    selectedSubid = currentSubid;
    newSubName = '';
    creatingNewSub = false;
    showMoveModal = true;
  }

  // Load full metadata when panel opens (lazy-load)
  async function loadFullMetadata() {
    if (!currentMedia || lastLoadedHash === currentMedia.hash) return;

    loadingMetadata = true;
    metadataError = null;

    try {
      const result = await window.electronAPI?.media?.getFullMetadata(
        currentMedia.hash,
        currentMedia.type
      );

      if (result?.success) {
        fullMetadata = result.exiftool || null;
        ffmpegMetadata = result.ffmpeg || null;
        lastLoadedHash = currentMedia.hash;
      } else {
        metadataError = result?.error || 'Failed to load metadata';
      }
    } catch (err) {
      metadataError = err instanceof Error ? err.message : 'Unknown error';
    } finally {
      loadingMetadata = false;
    }
  }

  // Toggle info panel and load metadata on first open
  async function toggleInfo() {
    showExif = !showExif;
    if (showExif && lastLoadedHash !== currentMedia?.hash) {
      await loadFullMetadata();
    }
  }

  // Hero focal point editing
  let isDraggingFocal = $state(false);
  let focalPreviewEl: HTMLDivElement | null = $state(null);

  // Issue 7: Track which hero type we're setting (building or campus)
  let settingHeroFor = $state<'building' | 'campus' | null>(null);
  // Track if Dashboard is selected as save target (two-click save)
  let dashboardSelected = $state(false);
  // Track if Host-Location is selected as save target (two-click save, like Dashboard)
  let hostLocationSelected = $state(false);

  function startFocalEdit(heroType: 'building' | 'campus' = 'building') {
    pendingFocalX = isCurrentHero ? focalX : 0.5;
    pendingFocalY = isCurrentHero ? focalY : 0.5;
    settingHeroFor = heroType;
    isEditingFocal = true;
  }

  function updateFocalFromEvent(e: MouseEvent) {
    if (!focalPreviewEl) return;
    const rect = focalPreviewEl.getBoundingClientRect();
    pendingFocalX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    pendingFocalY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
  }

  // Preview click: start drag and update position
  function handleFocalMouseDown(e: MouseEvent) {
    isDraggingFocal = true;
    updateFocalFromEvent(e);
  }

  // Pin grab: start drag without updating position (grab where pin is)
  function handlePinMouseDown(e: MouseEvent) {
    e.stopPropagation(); // Don't trigger preview mousedown
    e.preventDefault();
    isDraggingFocal = true;
  }

  function handleFocalMouseMove(e: MouseEvent) {
    if (isDraggingFocal) {
      updateFocalFromEvent(e);
    }
  }

  function handleFocalMouseUp() {
    isDraggingFocal = false;
  }

  // Global mouse tracking for smooth drag outside preview bounds
  function handleGlobalMouseMove(e: MouseEvent) {
    if (isDraggingFocal && focalPreviewEl) {
      updateFocalFromEvent(e);
    }
  }

  function handleGlobalMouseUp() {
    isDraggingFocal = false;
  }

  function saveFocalEdit() {
    if (currentMedia) {
      // Issue 7: Call appropriate callback based on which hero type is being set
      if (settingHeroFor === 'campus' && onSetHostHeroImage) {
        onSetHostHeroImage(currentMedia.hash, pendingFocalX, pendingFocalY);
      } else if (onSetHeroImage) {
        onSetHeroImage(currentMedia.hash, pendingFocalX, pendingFocalY);
      }
    }
    settingHeroFor = null;
    dashboardSelected = false;
    isEditingFocal = false;
  }

  function cancelFocalEdit() {
    settingHeroFor = null;
    dashboardSelected = false;
    hostLocationSelected = false;
    isEditingFocal = false;
  }

  /** Toggle Dashboard selection or save if already selected */
  async function handleDashboardClick() {
    if (dashboardSelected) {
      // Second click: save to dashboard
      if (!currentMedia) return;
      try {
        await window.electronAPI.settings.set('dashboard_hero_imgsha', currentMedia.hash);
        await window.electronAPI.settings.set('dashboard_hero_focal_x', String(pendingFocalX));
        await window.electronAPI.settings.set('dashboard_hero_focal_y', String(pendingFocalY));
        isEditingFocal = false;
        settingHeroFor = null;
        dashboardSelected = false;
        hostLocationSelected = false;
      } catch (err) {
        console.error('Error setting dashboard hero:', err);
      }
    } else {
      // First click: select Dashboard as target
      dashboardSelected = true;
      hostLocationSelected = false; // Deselect Host-Location if it was selected
    }
  }

  /** Toggle Host-Location selection or save if already selected (two-click pattern like Dashboard) */
  function handleHostLocationClick() {
    if (!currentMedia || !onSetHostHeroImage) return;

    if (hostLocationSelected) {
      // Second click: save to host location
      onSetHostHeroImage(currentMedia.hash, pendingFocalX, pendingFocalY);
      isEditingFocal = false;
      settingHeroFor = null;
      dashboardSelected = false;
      hostLocationSelected = false;
    } else {
      // First click: select Host-Location as target
      hostLocationSelected = true;
      dashboardSelected = false; // Deselect Dashboard if it was selected
    }
  }

  // Handle escape key in focal editor
  function handleFocalKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      cancelFocalEdit();
    }
  }

  // Helper: Format file size
  function formatFileSize(size: string | number | undefined): string {
    if (!size) return '';
    if (typeof size === 'string') return size;
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  // Helper: Format exposure time
  function formatExposure(val: string | number | undefined): string {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (val >= 1) return `${val}s`;
    return `1/${Math.round(1 / val)}`;
  }

  // Helper: Format date from ExifTool object or string
  function formatDate(val: unknown): string {
    if (!val) return '';
    if (typeof val === 'string') {
      const d = new Date(val);
      return isNaN(d.getTime()) ? val : d.toLocaleString();
    }
    if (typeof val === 'object' && val !== null && '_ctor' in val) {
      const exifDate = val as { year?: number; month?: number; day?: number; hour?: number; minute?: number; second?: number };
      if (exifDate.year && exifDate.month && exifDate.day) {
        const d = new Date(exifDate.year, (exifDate.month || 1) - 1, exifDate.day, exifDate.hour || 0, exifDate.minute || 0, exifDate.second || 0);
        return d.toLocaleString();
      }
    }
    return String(val);
  }

  // Helper: Get nested value from object
  function getVal(obj: Record<string, unknown> | null, ...keys: string[]): unknown {
    if (!obj) return undefined;
    for (const key of keys) {
      if (obj[key] !== undefined && obj[key] !== null) return obj[key];
    }
    return undefined;
  }

  // Kanye11: Regenerate preview for RAW files that couldn't be displayed
  async function regeneratePreview() {
    if (!currentMedia) return;

    regenerating = true;
    regenerateError = null;

    try {
      const result = await window.electronAPI?.media?.regenerateSingleFile(
        currentMedia.hash,
        currentMedia.path
      );

      if (result?.success) {
        // Update the current media item with the new preview path
        // This will trigger a re-render with the new image source
        if (result.previewPath) {
          // Force a reload by temporarily clearing the error state
          imageError = false;
          // Update the mediaList item (this mutates the parent's array)
          mediaList[currentIndex] = {
            ...currentMedia,
            previewPath: result.previewPath,
            thumbPath: result.thumbPathSm || currentMedia.thumbPath,
          };
        }
      } else {
        regenerateError = result?.error || 'Failed to regenerate preview';
      }
    } catch (err) {
      regenerateError = err instanceof Error ? err.message : 'Unknown error';
    } finally {
      regenerating = false;
    }
  }

  // OPT-053 Immich Model: Video proxies generated at import, stored alongside originals
  // Most videos should have proxy ready (instant playback)
  // Fallback to on-demand generation for old imports without proxy
  async function loadVideoProxy(video: {
    hash: string;
    path: string;
    width?: number | null;
    height?: number | null;
  }) {
    proxyPath = null;
    proxyError = null;
    generatingProxy = false;

    // OPT-053: Fast filesystem check - proxy should exist for new imports
    const exists = await window.electronAPI?.media?.proxyExists(video.path, video.hash);

    if (exists) {
      // Compute expected proxy path (hidden file alongside original)
      // Pattern: dirname(video.path) + '.' + hash + '.proxy.mp4'
      const dirPath = video.path.substring(0, video.path.lastIndexOf('/'));
      proxyPath = `${dirPath}/.${video.hash}.proxy.mp4`;
      return;
    }

    // Fallback: Check DB (may have old-style proxy in cache)
    const existingProxy = await window.electronAPI?.media?.getProxyPath(video.hash);
    if (existingProxy) {
      proxyPath = existingProxy;
      return;
    }

    // No proxy exists - generate on-demand (old import without proxy)
    generatingProxy = true;
    const result = await window.electronAPI?.media?.generateProxy(
      video.hash,
      video.path,
      { width: video.width || 1920, height: video.height || 1080 }
    );
    generatingProxy = false;

    if (result?.success && result.proxyPath) {
      proxyPath = result.proxyPath;
    } else {
      proxyError = result?.error || 'Failed to generate preview';
    }
  }

  // Auto-load proxy when switching to a video
  // Track currentIndex explicitly to ensure effect re-runs on navigation
  $effect(() => {
    const _index = currentIndex; // Force dependency on index
    const media = currentMedia;

    if (media?.type === 'video') {
      playOriginal = false; // Reset fallback
      loadVideoProxy(media);
    } else {
      proxyPath = null;
      proxyError = null;
      generatingProxy = false;
      playOriginal = false;
    }
  });

  // Initialize preload on mount
  $effect(() => {
    triggerPreload();
  });
</script>

<svelte:window on:keydown={handleKeydown} />

<div
  class="fixed inset-0 bg-background/95 z-50 flex items-center justify-center"
  role="dialog"
  aria-modal="true"
>
  <!-- Close button -->
  <button
    onclick={onClose}
    class="absolute top-4 right-4 text-foreground hover:text-gray-600 transition z-10"
    aria-label="Close viewer"
  >
    <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
    </svg>
  </button>

  <!-- Navigation buttons -->
  {#if currentIndex > 0}
    <button
      onclick={goToPrevious}
      class="absolute top-1/2 -translate-y-1/2 text-foreground hover:text-gray-600 transition p-2 {showExif ? 'left-[25rem]' : 'left-4'}"
      aria-label="Previous image"
    >
      <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  {/if}

  {#if currentIndex < mediaList.length - 1}
    <button
      onclick={goToNext}
      class="absolute right-4 top-1/2 -translate-y-1/2 text-foreground hover:text-gray-600 transition p-2"
      aria-label="Next image"
    >
      <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  {/if}

  <!-- Main content area -->
  <div class="flex-1 flex items-center justify-center p-16 max-h-full">
    {#if currentMedia}
      {#if currentMedia.type === 'video'}
        <!-- Video player with proxy support (Migration 36) -->
        {#if playOriginal}
          <!-- Fallback: Play original video (slower but works) -->
          <div class="flex flex-col items-center gap-2">
            <video
              src={`media://${currentMedia.path}`}
              controls
              autoplay
              class="max-w-full max-h-full object-contain"
            >
              <track kind="captions" />
            </video>
            <p class="text-xs text-gray-500">Playing original (may be slower)</p>
          </div>
        {:else if generatingProxy}
          <!-- Generating proxy indicator -->
          <div class="flex flex-col items-center gap-4 text-foreground">
            <div class="animate-spin w-12 h-12 border-4 border-accent border-t-transparent rounded-full"></div>
            <p class="text-lg">Preparing preview...</p>
            <p class="text-sm text-gray-500">Optimizing video for smooth playback</p>
          </div>
        {:else if proxyError}
          <!-- Proxy generation failed, offer fallback -->
          <div class="flex flex-col items-center gap-4 text-foreground text-center">
            <svg class="w-16 h-16 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p class="text-lg">Preview generation failed</p>
            <p class="text-sm text-gray-500 max-w-md">{proxyError}</p>
            <div class="flex gap-3 mt-2">
              <button
                onclick={() => loadVideoProxy(currentMedia)}
                class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition"
              >
                Retry
              </button>
              <button
                onclick={() => playOriginal = true}
                class="px-4 py-2 bg-gray-600 text-white rounded hover:opacity-90 transition"
              >
                Play Original
              </button>
            </div>
          </div>
        {:else if proxyPath}
          <!-- Proxy ready - smooth playback with scrubbing -->
          <video
            src={`media://${proxyPath}`}
            controls
            autoplay
            class="max-w-full max-h-full object-contain"
          >
            <track kind="captions" />
          </video>
        {:else}
          <!-- Fallback: loading state before proxy check completes -->
          <div class="flex flex-col items-center gap-4 text-foreground">
            <div class="animate-pulse w-12 h-12 bg-gray-300 rounded-full"></div>
            <p class="text-sm text-gray-500">Loading video...</p>
          </div>
        {/if}
      {:else if imageError}
        <!-- Error state - show extract preview prompt -->
        <div class="text-center text-foreground">
          <p class="text-xl mb-4">Cannot display this file format</p>
          <p class="text-gray-500 mb-4">{currentMedia.name || currentMedia.path}</p>

          {#if regenerateError}
            <p class="text-red-500 mb-4">{regenerateError}</p>
          {/if}

          <div class="flex gap-4 justify-center">
            <!-- Kanye11: Regenerate preview button for RAW files -->
            <button
              onclick={regeneratePreview}
              disabled={regenerating}
              class="px-6 py-3 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {regenerating ? 'Extracting Preview...' : 'Extract Preview'}
            </button>
          </div>

          <p class="text-gray-500 text-sm mt-4">
            RAW files require preview extraction to display
          </p>
        </div>
      {:else}
        <!-- Image display -->
        <img
          src={imageSrc()}
          alt={currentMedia.name || 'Image'}
          class="max-w-full max-h-full object-contain"
          onerror={handleImageError}
          decoding="async"
        />
      {/if}
    {/if}
  </div>

  <!-- Metadata Panel (Two-tier: Summary + All Fields + Hero Editor) -->
  {#if showExif && currentMedia}
    <div class="absolute left-0 top-1/2 -translate-y-1/2 w-96 max-h-[80vh] bg-white/95 text-foreground overflow-y-auto shadow-lg border-r border-gray-200 rounded-r-lg z-[5]">
      <div class="p-4">
        <h3 class="text-lg font-semibold mb-4">Metadata</h3>

        {#if loadingMetadata}
          <div class="text-gray-500 text-sm">Loading metadata...</div>
        {:else if metadataError}
          <div class="text-red-500 text-sm">{metadataError}</div>
        {:else}
          <!-- Hero Image Section (Images only) -->
          {#if canBeHero && onSetHeroImage}
            <div class="pb-4 mb-4 border-b border-gray-200">
              <div class="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Hero Image</div>

              {#if !isEditingFocal}
                <!-- Issue 6 & 7: Hero Preview + Action Buttons -->
                <div class="space-y-3">
                  <!-- Preview thumbnail with current focal point -->
                  <div class="relative w-full aspect-[2.35/1] bg-gray-100 rounded-lg overflow-hidden">
                    <img
                      src={imageSrc()}
                      alt="Hero preview"
                      class="w-full h-full object-cover opacity-80"
                      style="object-position: {(focalX ?? 0.5) * 100}% {(focalY ?? 0.5) * 100}%;"
                    />
                    <!-- Semi-transparent overlay -->
                    <div class="absolute inset-0 bg-background/40"></div>
                    <!-- Status badge -->
                    {#if isCurrentHero}
                      <div class="absolute top-2 left-2">
                        <span class="inline-flex items-center px-2 py-1 bg-accent text-white text-xs font-medium rounded shadow-sm">
                          Current Hero
                        </span>
                      </div>
                    {/if}
                  </div>
                  <!-- Single button to open focal editor - Host-Location is an option inside the modal -->
                  <button
                    onclick={() => startFocalEdit('building')}
                    class="w-full px-4 py-2.5 text-sm font-medium {isCurrentHero ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-accent text-white hover:bg-accent/90'} rounded-lg transition"
                  >
                    Hero Image
                  </button>
                </div>
              {/if}
            </div>
          {/if}

          <!-- Summary Section -->
          <div class="space-y-3 text-sm">
            <!-- File Info -->
            <div class="pb-3 border-b border-gray-100">
              <div class="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">File</div>
              {#if currentMedia.name}
                <div class="flex justify-between">
                  <span class="text-gray-500">Name</span>
                  <span class="text-right truncate ml-2 max-w-[200px]" title={currentMedia.name}>{currentMedia.name}</span>
                </div>
              {/if}
              {#if fullMetadata}
                {@const fileSize = getVal(fullMetadata, 'FileSize')}
                {@const fileType = getVal(fullMetadata, 'FileType', 'MIMEType')}
                {#if fileSize}
                  <div class="flex justify-between">
                    <span class="text-gray-500">Size</span>
                    <span>{formatFileSize(fileSize as string | number)}</span>
                  </div>
                {/if}
                {#if fileType}
                  <div class="flex justify-between">
                    <span class="text-gray-500">Format</span>
                    <span>{fileType}</span>
                  </div>
                {/if}
              {/if}
            </div>

            <!-- Dimensions / Duration -->
            <div class="pb-3 border-b border-gray-100">
              <div class="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                {currentMedia.type === 'video' ? 'Video' : 'Image'}
              </div>
              {#if currentMedia.width && currentMedia.height}
                <div class="flex justify-between">
                  <span class="text-gray-500">Dimensions</span>
                  <span>{currentMedia.width} × {currentMedia.height}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-500">Megapixels</span>
                  <span>{((currentMedia.width * currentMedia.height) / 1000000).toFixed(1)} MP</span>
                </div>
              {/if}
              {#if currentMedia.type === 'video' && ffmpegMetadata}
                {@const duration = getVal(ffmpegMetadata, 'format', 'duration') as number | undefined}
                {@const streams = (ffmpegMetadata.streams || []) as Array<Record<string, unknown>>}
                {@const videoStream = streams.find((s: Record<string, unknown>) => s.codec_type === 'video')}
                {@const audioStream = streams.find((s: Record<string, unknown>) => s.codec_type === 'audio')}
                {#if duration}
                  <div class="flex justify-between">
                    <span class="text-gray-500">Duration</span>
                    <span>{Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')}</span>
                  </div>
                {/if}
                {#if videoStream}
                  <div class="flex justify-between">
                    <span class="text-gray-500">Codec</span>
                    <span>{videoStream.codec_name}</span>
                  </div>
                  {#if videoStream.r_frame_rate}
                    {@const fps = videoStream.r_frame_rate as string}
                    {@const [num, den] = fps.split('/').map(Number)}
                    <div class="flex justify-between">
                      <span class="text-gray-500">Frame Rate</span>
                      <span>{den ? (num / den).toFixed(2) : num} fps</span>
                    </div>
                  {/if}
                {/if}
                {#if audioStream}
                  <div class="flex justify-between">
                    <span class="text-gray-500">Audio</span>
                    <span>{audioStream.codec_name}{audioStream.channels ? ` (${audioStream.channels}ch)` : ''}</span>
                  </div>
                {/if}
              {/if}
            </div>

            <!-- Camera/Device -->
            {#if fullMetadata}
              {@const make = getVal(fullMetadata, 'Make')}
              {@const model = getVal(fullMetadata, 'Model')}
              {@const lens = getVal(fullMetadata, 'LensModel', 'Lens')}
              {@const focalLength = getVal(fullMetadata, 'FocalLength')}
              {@const software = getVal(fullMetadata, 'Software')}
              {#if make || model || lens}
                <div class="pb-3 border-b border-gray-100">
                  <div class="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Camera</div>
                  {#if make || model}
                    <div class="flex justify-between">
                      <span class="text-gray-500">Device</span>
                      <span>{[make, model].filter(Boolean).join(' ')}</span>
                    </div>
                  {/if}
                  {#if lens}
                    <div class="flex justify-between">
                      <span class="text-gray-500">Lens</span>
                      <span class="text-right truncate ml-2 max-w-[180px]" title={String(lens)}>{lens}</span>
                    </div>
                  {/if}
                  {#if focalLength}
                    <div class="flex justify-between">
                      <span class="text-gray-500">Focal Length</span>
                      <span>{focalLength}</span>
                    </div>
                  {/if}
                  {#if software}
                    <div class="flex justify-between">
                      <span class="text-gray-500">Software</span>
                      <span>{software}</span>
                    </div>
                  {/if}
                </div>
              {/if}
            {/if}

            <!-- Exposure (Images only) -->
            {#if fullMetadata && currentMedia.type === 'image'}
              {@const exposure = getVal(fullMetadata, 'ExposureTime', 'ShutterSpeedValue')}
              {@const aperture = getVal(fullMetadata, 'FNumber', 'ApertureValue')}
              {@const iso = getVal(fullMetadata, 'ISO')}
              {@const exposureComp = getVal(fullMetadata, 'ExposureCompensation')}
              {@const metering = getVal(fullMetadata, 'MeteringMode')}
              {@const flash = getVal(fullMetadata, 'Flash')}
              {#if exposure || aperture || iso}
                <div class="pb-3 border-b border-gray-100">
                  <div class="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Exposure</div>
                  {#if exposure}
                    <div class="flex justify-between">
                      <span class="text-gray-500">Shutter</span>
                      <span>{formatExposure(exposure as string | number)}</span>
                    </div>
                  {/if}
                  {#if aperture}
                    <div class="flex justify-between">
                      <span class="text-gray-500">Aperture</span>
                      <span>f/{aperture}</span>
                    </div>
                  {/if}
                  {#if iso}
                    <div class="flex justify-between">
                      <span class="text-gray-500">ISO</span>
                      <span>{iso}</span>
                    </div>
                  {/if}
                  {#if exposureComp !== undefined && exposureComp !== 0}
                    <div class="flex justify-between">
                      <span class="text-gray-500">Compensation</span>
                      <span>{exposureComp > 0 ? '+' : ''}{exposureComp} EV</span>
                    </div>
                  {/if}
                  {#if metering}
                    <div class="flex justify-between">
                      <span class="text-gray-500">Metering</span>
                      <span>{metering}</span>
                    </div>
                  {/if}
                  {#if flash}
                    <div class="flex justify-between">
                      <span class="text-gray-500">Flash</span>
                      <span class="text-right truncate ml-2 max-w-[150px]" title={String(flash)}>{flash}</span>
                    </div>
                  {/if}
                </div>
              {/if}
            {/if}

            <!-- Date/Time -->
            {#if fullMetadata}
              {@const dateTaken = getVal(fullMetadata, 'DateTimeOriginal', 'CreateDate')}
              {@const timezone = getVal(fullMetadata, 'OffsetTimeOriginal', 'OffsetTime', 'zone')}
              {#if dateTaken}
                <div class="pb-3 border-b border-gray-100">
                  <div class="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Date & Time</div>
                  <div class="flex justify-between">
                    <span class="text-gray-500">Captured</span>
                    <span>{formatDate(dateTaken)}</span>
                  </div>
                  {#if timezone}
                    <div class="flex justify-between">
                      <span class="text-gray-500">Timezone</span>
                      <span>{timezone}</span>
                    </div>
                  {/if}
                </div>
              {/if}
            {/if}

            <!-- GPS -->
            {#if currentMedia.gpsLat && currentMedia.gpsLng}
              <div class="pb-3 border-b border-gray-100">
                <div class="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Location</div>
                <div class="flex justify-between">
                  <span class="text-gray-500">Coordinates</span>
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${currentMedia.gpsLat}&mlon=${currentMedia.gpsLng}&zoom=15`}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-accent hover:underline"
                  >
                    {currentMedia.gpsLat.toFixed(6)}, {currentMedia.gpsLng.toFixed(6)}
                  </a>
                </div>
                {#if fullMetadata}
                  {@const altitude = getVal(fullMetadata, 'GPSAltitude')}
                  {#if altitude}
                    <div class="flex justify-between">
                      <span class="text-gray-500">Altitude</span>
                      <span>{typeof altitude === 'number' ? `${altitude.toFixed(1)} m` : altitude}</span>
                    </div>
                  {/if}
                {/if}
              </div>
            {/if}

            <!-- Author / Attribution -->
            {#if currentMedia.auth_imp || currentMedia.imported_by || currentMedia.is_contributed}
              <div class="pb-3 border-b border-gray-100">
                <div class="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Attribution</div>
                {#if currentMedia.auth_imp}
                  <div class="flex justify-between">
                    <span class="text-gray-500">Photographer</span>
                    <span class="text-accent">{currentMedia.auth_imp}</span>
                  </div>
                {/if}
                {#if currentMedia.imported_by && currentMedia.imported_by !== currentMedia.auth_imp}
                  <div class="flex justify-between">
                    <span class="text-gray-500">Imported by</span>
                    <span>{currentMedia.imported_by}</span>
                  </div>
                {/if}
                {#if currentMedia.is_contributed === 1}
                  <div class="flex justify-between items-center">
                    <span class="text-gray-500">Contributed</span>
                    <span class="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">
                      {currentMedia.contribution_source || 'External'}
                    </span>
                  </div>
                {/if}
              </div>
            {/if}

            <!-- All Fields (Expandable) -->
            {#if fullMetadata}
              <div class="pt-2">
                <button
                  onclick={() => showAllFields = !showAllFields}
                  class="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                >
                  <svg
                    class="w-3 h-3 transition-transform {showAllFields ? 'rotate-90' : ''}"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                  </svg>
                  All Fields ({Object.keys(fullMetadata).length})
                </button>

                {#if showAllFields}
                  <div class="mt-3 bg-gray-50 rounded p-3 max-h-80 overflow-y-auto">
                    <div class="font-mono text-xs space-y-1">
                      {#each Object.entries(fullMetadata).sort(([a], [b]) => a.localeCompare(b)) as [key, value]}
                        <div class="flex gap-2">
                          <span class="text-gray-500 shrink-0">{key}:</span>
                          <span class="text-gray-700 break-all">
                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                          </span>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Focal Point Editor Modal (large overlay) -->
  {#if isEditingFocal && currentMedia}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-8"
      onmousemove={handleGlobalMouseMove}
      onmouseup={handleGlobalMouseUp}
      onkeydown={handleFocalKeydown}
    >
      <div class="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        <!-- Header -->
        <div class="px-6 py-4 border-b border-gray-200">
          <h3 class="text-lg font-semibold text-gray-900">Set Hero Focal Point</h3>
        </div>

        <!-- Large Preview (matches hero constraints) -->
        <div class="p-6 flex-1 overflow-hidden">
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            bind:this={focalPreviewEl}
            class="relative w-full max-h-[40vh] mx-auto rounded-lg overflow-hidden cursor-crosshair select-none bg-gray-100"
            style="aspect-ratio: 2.35 / 1;"
            onmousedown={handleFocalMouseDown}
            onmousemove={handleFocalMouseMove}
            onmouseup={handleFocalMouseUp}
          >
            <img
              src={imageSrc()}
              alt="Hero preview"
              class="absolute inset-0 w-full h-full object-cover"
              style="object-position: {pendingFocalX * 100}% {pendingFocalY * 100}%;"
            />
            <!-- DESIGN_SYSTEM: No gradient overlay - pure photograph per DESIGN.md -->
            <!-- Draggable focal point pin -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="absolute w-10 h-10 -translate-x-1/2 -translate-y-1/2 z-10 cursor-grab active:cursor-grabbing"
              style="left: {pendingFocalX * 100}%; top: {pendingFocalY * 100}%;"
              onmousedown={handlePinMouseDown}
              role="slider"
              aria-label="Focal point position"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(pendingFocalX * 100)}
              tabindex="0"
            >
              <!-- Outer ring -->
              <div class="absolute inset-0 rounded-full border-3 border-white shadow-lg" style="box-shadow: 0 2px 8px rgba(0,0,0,0.3), inset 0 0 0 2px rgba(0,0,0,0.1);"></div>
              <!-- Inner circle -->
              <div class="absolute inset-2 rounded-full bg-accent shadow-inner"></div>
              <!-- Crosshair -->
              <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div class="w-px h-4 bg-white/80"></div>
              </div>
              <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div class="w-4 h-px bg-white/80"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex items-center justify-between">
          <!-- Left side: Additional hero destinations -->
          <div class="flex gap-2">
            <button
              onclick={handleDashboardClick}
              class="px-3 py-2 text-sm font-medium rounded-lg transition {dashboardSelected ? 'bg-accent text-white hover:bg-accent/90' : 'text-gray-600 bg-white border border-gray-300 hover:bg-gray-50'}"
            >
              {dashboardSelected ? 'Save' : 'Dashboard'}
            </button>
            {#if onSetHostHeroImage}
              <button
                onclick={handleHostLocationClick}
                class="px-3 py-2 text-sm font-medium rounded-lg transition {hostLocationSelected ? 'bg-amber-500 text-white hover:bg-amber-600' : 'text-gray-600 bg-white border border-gray-300 hover:bg-gray-50'}"
              >
                {hostLocationSelected ? 'Save' : 'Host-Location'}
              </button>
            {/if}
          </div>
          <!-- Right side: Cancel/Save -->
          <div class="flex gap-3">
            <button
              onclick={cancelFocalEdit}
              class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              onclick={saveFocalEdit}
              class="px-5 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent/90 transition"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Counter -->
  <div class="absolute bottom-6 left-1/2 -translate-x-1/2 text-foreground text-sm bg-white/80 px-4 py-2 rounded shadow">
    {currentIndex + 1} / {mediaList.length}
  </div>

  <!-- Bottom-right action buttons -->
  <div class="absolute bottom-6 right-6 flex flex-col gap-2 z-10">
    <button
      onclick={toggleInfo}
      class="px-4 py-2 bg-white text-foreground rounded shadow hover:bg-gray-50 transition text-sm"
      aria-pressed={showExif}
    >
      {showExif ? 'Hide Info' : 'Show Info'}
    </button>
    <button
      onclick={showInFinder}
      class="px-4 py-2 bg-white text-foreground rounded shadow hover:bg-gray-50 transition text-sm"
    >
      Show in Finder
    </button>
    <button
      onclick={toggleHidden}
      disabled={togglingHidden}
      class="px-4 py-2 rounded shadow transition text-sm disabled:opacity-50 disabled:cursor-not-allowed {isCurrentHidden ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : 'bg-white text-foreground hover:bg-gray-50'}"
      title={isCurrentHidden ? (isLivePhoto ? 'Live Photo video' : hiddenReason === 'sdr_duplicate' ? 'SDR duplicate' : 'Hidden by user') : 'Hide this item'}
    >
      {#if togglingHidden}
        ...
      {:else if isCurrentHidden}
        <span class="flex items-center gap-1.5">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          Unhide
        </span>
      {:else}
        <span class="flex items-center gap-1.5">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
          </svg>
          Hide
        </span>
      {/if}
    </button>
    <!-- Move and Delete buttons only visible when Info panel is open (safety) -->
    {#if showExif}
      <!-- Move to sub-location button (only if sublocations provided) -->
      {#if sublocations.length > 0 || locid}
        <button
          onclick={openMoveModal}
          class="px-4 py-2 bg-white text-foreground rounded shadow hover:bg-gray-50 transition text-sm"
        >
          <span class="flex items-center gap-1.5">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
            Move
          </span>
        </button>
      {/if}
      <!-- Delete button -->
      <button
        onclick={() => showDeleteConfirm = true}
        class="px-4 py-2 bg-red-50 text-red-700 rounded shadow hover:bg-red-100 transition text-sm"
      >
        <span class="flex items-center gap-1.5">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Delete
        </span>
      </button>
    {/if}
  </div>

  <!-- Delete Confirmation Modal -->
  {#if showDeleteConfirm}
    <div
      class="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center p-4"
      onclick={() => showDeleteConfirm = false}
      role="dialog"
      aria-modal="true"
    >
      <div
        class="bg-white rounded-lg shadow-xl max-w-sm w-full"
        onclick={(e) => e.stopPropagation()}
      >
        <div class="p-5">
          <h3 class="text-lg font-semibold text-gray-900 mb-2">Delete File?</h3>
          <p class="text-sm text-gray-600 mb-4">
            This will permanently delete the file from your archive. This cannot be undone.
          </p>
          <div class="flex gap-3 justify-end">
            <button
              onclick={() => showDeleteConfirm = false}
              class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              onclick={handleDelete}
              disabled={deleting}
              class="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Move to Sub-location Modal -->
  {#if showMoveModal}
    <div
      class="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center p-4"
      onclick={() => showMoveModal = false}
      role="dialog"
      aria-modal="true"
    >
      <div
        class="bg-white rounded-lg shadow-xl max-w-sm w-full"
        onclick={(e) => e.stopPropagation()}
      >
        <div class="p-5">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Move to Building</h3>

          <!-- Sub-location options -->
          <div class="space-y-2 mb-4">
            <!-- Host location option -->
            <label class="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition {selectedSubid === null && !creatingNewSub ? 'border-accent bg-accent/5' : 'border-gray-200'}">
              <input
                type="radio"
                name="sublocation"
                checked={selectedSubid === null && !creatingNewSub}
                onchange={() => { selectedSubid = null; creatingNewSub = false; }}
                class="w-4 h-4 text-accent"
              />
              <span class="text-sm text-gray-700">Host Location (no building)</span>
            </label>

            <!-- Existing sub-locations -->
            {#each sublocations as sub}
              <label class="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition {selectedSubid === sub.subid && !creatingNewSub ? 'border-accent bg-accent/5' : 'border-gray-200'}">
                <input
                  type="radio"
                  name="sublocation"
                  checked={selectedSubid === sub.subid && !creatingNewSub}
                  onchange={() => { selectedSubid = sub.subid; creatingNewSub = false; }}
                  class="w-4 h-4 text-accent"
                />
                <span class="text-sm text-gray-700">{sub.subnam}</span>
              </label>
            {/each}

            <!-- Create new option -->
            {#if locid}
              <label class="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition {creatingNewSub ? 'border-accent bg-accent/5' : 'border-gray-200'}">
                <input
                  type="radio"
                  name="sublocation"
                  checked={creatingNewSub}
                  onchange={() => creatingNewSub = true}
                  class="w-4 h-4 text-accent"
                />
                <span class="text-sm text-gray-700">Create new...</span>
              </label>
            {/if}
          </div>

          <!-- New sub-location name input -->
          {#if creatingNewSub}
            <div class="mb-4">
              <input
                type="text"
                bind:value={newSubName}
                placeholder="Building name..."
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
              />
            </div>
          {/if}

          <!-- Actions -->
          <div class="flex gap-3 justify-end">
            <button
              onclick={() => showMoveModal = false}
              class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              onclick={handleMove}
              disabled={moving || (creatingNewSub && !newSubName.trim())}
              class="px-4 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent/90 transition disabled:opacity-50"
            >
              {moving ? 'Moving...' : 'Move'}
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
