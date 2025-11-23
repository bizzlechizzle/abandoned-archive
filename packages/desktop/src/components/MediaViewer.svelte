<script lang="ts">
  /**
   * MediaViewer - Full-screen lightbox for viewing images and videos
   *
   * Features:
   * - Displays images via native <img> (standard formats)
   * - Displays RAW previews extracted by ExifTool
   * - Keyboard navigation (arrow keys, Escape to close)
   * - Shows EXIF panel on toggle
   */

  interface Props {
    mediaList: Array<{
      hash: string;
      path: string;
      thumbPath?: string | null;
      previewPath?: string | null;
      type: 'image' | 'video';
      name?: string;
      width?: number | null;
      height?: number | null;
      dateTaken?: string | null;
      cameraMake?: string | null;
      cameraModel?: string | null;
      gpsLat?: number | null;
      gpsLng?: number | null;
    }>;
    startIndex?: number;
    onClose: () => void;
  }

  let { mediaList, startIndex = 0, onClose }: Props = $props();

  let currentIndex = $state(startIndex);
  let showExif = $state(false);
  let imageError = $state(false);
  let regenerating = $state(false);
  let regenerateError = $state<string | null>(null);

  const currentMedia = $derived(mediaList[currentIndex]);

  // Get the best available image source
  // Uses custom media:// protocol registered in main process to bypass file:// restrictions
  const imageSrc = $derived(() => {
    if (!currentMedia) return '';
    // Priority: preview (for RAW) -> original path
    if (currentMedia.previewPath) {
      return `media://${currentMedia.previewPath}`;
    }
    return `media://${currentMedia.path}`;
  });

  function handleKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case 'Escape':
        onClose();
        break;
      case 'ArrowLeft':
        goToPrevious();
        break;
      case 'ArrowRight':
        goToNext();
        break;
      case 'i':
        showExif = !showExif;
        break;
    }
  }

  function goToPrevious() {
    if (currentIndex > 0) {
      currentIndex--;
      imageError = false;
      triggerPreload();
    }
  }

  function goToNext() {
    if (currentIndex < mediaList.length - 1) {
      currentIndex++;
      imageError = false;
      triggerPreload();
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

  async function openInSystemViewer() {
    if (currentMedia) {
      await window.electronAPI?.media?.openFile(currentMedia.path);
    }
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
  class="fixed inset-0 bg-black bg-opacity-95 z-50 flex items-center justify-center"
  role="dialog"
  aria-modal="true"
>
  <!-- Close button -->
  <button
    onclick={onClose}
    class="absolute top-4 right-4 text-white hover:text-gray-300 transition z-10"
    aria-label="Close viewer"
  >
    <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
    </svg>
  </button>

  <!-- Open in system viewer button -->
  <button
    onclick={openInSystemViewer}
    class="absolute top-4 left-4 px-4 py-2 bg-white bg-opacity-20 text-white rounded hover:bg-opacity-30 transition text-sm z-10"
  >
    Open in System Viewer
  </button>

  <!-- Toggle EXIF button -->
  <button
    onclick={() => showExif = !showExif}
    class="absolute top-4 left-48 px-4 py-2 bg-white bg-opacity-20 text-white rounded hover:bg-opacity-30 transition text-sm z-10"
    aria-pressed={showExif}
  >
    {showExif ? 'Hide' : 'Show'} Info (i)
  </button>

  <!-- Navigation buttons -->
  {#if currentIndex > 0}
    <button
      onclick={goToPrevious}
      class="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 transition p-2"
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
      class="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 transition p-2"
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
        <!-- Error state - show open in viewer prompt -->
        <div class="text-center text-white">
          <p class="text-xl mb-4">Cannot display this file format in browser</p>
          <p class="text-gray-400 mb-4">{currentMedia.name || currentMedia.path}</p>

          {#if regenerateError}
            <p class="text-red-400 mb-4">{regenerateError}</p>
          {/if}

          <div class="flex gap-4 justify-center">
            <button
              onclick={openInSystemViewer}
              class="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
            >
              Open in System Viewer
            </button>

            <!-- Kanye11: Regenerate preview button for RAW files -->
            <button
              onclick={regeneratePreview}
              disabled={regenerating}
              class="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {regenerating ? 'Extracting Preview...' : 'Extract Preview'}
            </button>
          </div>

          <p class="text-gray-500 text-sm mt-4">
            RAW files require preview extraction to display in browser
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

  <!-- EXIF Panel -->
  {#if showExif && currentMedia}
    <div class="absolute right-0 top-16 bottom-0 w-80 bg-black bg-opacity-80 text-white p-4 overflow-y-auto">
      <h3 class="text-lg font-semibold mb-4">Image Info</h3>

      <div class="space-y-2 text-sm">
        {#if currentMedia.name}
          <div>
            <span class="text-gray-400">Name:</span>
            <span class="ml-2">{currentMedia.name}</span>
          </div>
        {/if}

        {#if currentMedia.width && currentMedia.height}
          <div>
            <span class="text-gray-400">Dimensions:</span>
            <span class="ml-2">{currentMedia.width} × {currentMedia.height}</span>
          </div>
        {/if}

        {#if currentMedia.dateTaken}
          <div>
            <span class="text-gray-400">Date Taken:</span>
            <span class="ml-2">{new Date(currentMedia.dateTaken).toLocaleString()}</span>
          </div>
        {/if}

        {#if currentMedia.cameraMake || currentMedia.cameraModel}
          <div>
            <span class="text-gray-400">Camera:</span>
            <span class="ml-2">{[currentMedia.cameraMake, currentMedia.cameraModel].filter(Boolean).join(' ')}</span>
          </div>
        {/if}

        {#if currentMedia.gpsLat && currentMedia.gpsLng}
          <div>
            <span class="text-gray-400">GPS:</span>
            <a
              href={`https://www.openstreetmap.org/?mlat=${currentMedia.gpsLat}&mlon=${currentMedia.gpsLng}&zoom=15`}
              target="_blank"
              rel="noopener noreferrer"
              class="ml-2 text-blue-400 hover:underline"
            >
              {currentMedia.gpsLat.toFixed(6)}, {currentMedia.gpsLng.toFixed(6)}
            </a>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Counter -->
  <div class="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black bg-opacity-50 px-4 py-2 rounded">
    {currentIndex + 1} / {mediaList.length}
  </div>
</div>
