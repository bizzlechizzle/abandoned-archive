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
  }

  let { mediaList, startIndex = 0, onClose, heroImgsha, focalX = 0.5, focalY = 0.5, onSetHeroImage, onSetHostHeroImage, onHiddenChanged }: Props = $props();

  let currentIndex = $state(startIndex);
  let showExif = $state(false);
  let imageError = $state(false);
  let regenerating = $state(false);
  let regenerateError = $state<string | null>(null);

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
        mediaType: currentMedia.type,
        hidden: newHiddenState,
        reason: newHiddenState ? 'user' : null,
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
    isEditingFocal = false;
  }

  function cancelFocalEdit() {
    settingHeroFor = null;
    isEditingFocal = false;
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
      class="absolute left-4 top-1/2 -translate-y-1/2 text-foreground hover:text-gray-600 transition p-2"
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
        <!-- Video player -->
        <video
          src={`media://${currentMedia.path}`}
          controls
          class="max-w-full max-h-full object-contain"
        >
          <track kind="captions" />
        </video>
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
    <div class="absolute right-0 top-16 bottom-0 w-96 bg-white/95 text-foreground overflow-y-auto shadow-lg border-l border-gray-200">
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
                        <span class="inline-flex items-center gap-1 px-2 py-1 bg-accent text-white text-xs font-medium rounded shadow-sm">
                          <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                          </svg>
                          Current Hero
                        </span>
                      </div>
                    {/if}
                  </div>
                  <!-- Issue 7: Side-by-side buttons when both building and campus hero options available -->
                  {#if onSetHostHeroImage}
                    <div class="flex gap-2">
                      <button
                        onclick={() => startFocalEdit('building')}
                        class="flex-1 px-3 py-2.5 text-sm font-medium {isCurrentHero ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-accent text-white hover:bg-accent/90'} rounded-lg transition flex items-center justify-center gap-1.5"
                      >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        {isCurrentHero ? 'Adjust' : 'Building Hero'}
                      </button>
                      <button
                        onclick={() => startFocalEdit('campus')}
                        class="flex-1 px-3 py-2.5 text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 rounded-lg transition flex items-center justify-center gap-1.5"
                      >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                        Campus Hero
                      </button>
                    </div>
                  {:else}
                    <!-- Single button when only building hero option -->
                    <button
                      onclick={() => startFocalEdit('building')}
                      class="w-full px-4 py-2.5 text-sm font-medium {isCurrentHero ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-accent text-white hover:bg-accent/90'} rounded-lg transition flex items-center justify-center gap-2"
                    >
                      {#if isCurrentHero}
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
                        </svg>
                        Adjust Position
                      {:else}
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                        Set as Hero Image
                      {/if}
                    </button>
                  {/if}
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
          <p class="text-sm text-gray-500 mt-1">Drag the pin to set the center of the hero crop</p>
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
            <!-- Gradient overlay (identical to LocationHero) -->
            <div
              class="absolute bottom-0 left-0 right-0 h-[80%] pointer-events-none"
              style="background: linear-gradient(to top,
                #fffbf7 0%,
                #fffbf7 12.5%,
                rgba(255,251,247,0.95) 20%,
                rgba(255,251,247,0.82) 30%,
                rgba(255,251,247,0.62) 42%,
                rgba(255,251,247,0.40) 54%,
                rgba(255,251,247,0.22) 66%,
                rgba(255,251,247,0.10) 78%,
                rgba(255,251,247,0.03) 90%,
                transparent 100%
              );"
            ></div>
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
        <div class="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex items-center justify-end gap-3">
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
            {#if isCurrentHero}
              Save Position
            {:else if settingHeroFor === 'campus'}
              Set as Campus Hero
            {:else}
              Set as Hero Image
            {/if}
          </button>
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
  </div>
</div>
