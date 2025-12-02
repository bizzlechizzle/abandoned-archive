<script lang="ts">
  /**
   * LocationOriginalAssets - Accordion wrapper for all media types
   * Contains Images, Videos, Documents sub-accordions
   * Per DECISION-020: Original Assets Accordion Refactor
   * Migration 23: Hidden media filtering with "Show All" toggle
   */
  import LocationGallery from './LocationGallery.svelte';
  import LocationVideos from './LocationVideos.svelte';
  import LocationDocuments from './LocationDocuments.svelte';
  import type { MediaImage, MediaVideo, MediaDocument } from './types';

  interface Props {
    images: MediaImage[];
    videos: MediaVideo[];
    documents: MediaDocument[];
    heroImgsha: string | null;
    onOpenImageLightbox: (index: number) => void;
    onOpenVideoLightbox: (index: number) => void;
    onOpenDocument: (path: string) => void;
  }

  let {
    images,
    videos,
    documents,
    heroImgsha,
    onOpenImageLightbox,
    onOpenVideoLightbox,
    onOpenDocument,
  }: Props = $props();

  // Outer accordion - collapsed by default (user can expand if wanted)
  let isOpen = $state(false);

  // Hidden media toggle - show all vs visible only
  let showHidden = $state(false);

  // Calculate hidden counts
  const hiddenImageCount = $derived(images.filter(i => i.hidden === 1).length);
  const hiddenVideoCount = $derived(videos.filter(v => v.hidden === 1).length);
  const hiddenDocCount = $derived(documents.filter(d => d.hidden === 1).length);
  const totalHiddenCount = $derived(hiddenImageCount + hiddenVideoCount + hiddenDocCount);

  // Filtered media based on showHidden state
  const visibleImages = $derived(showHidden ? images : images.filter(i => i.hidden !== 1));
  const visibleVideos = $derived(showHidden ? videos : videos.filter(v => v.hidden !== 1));
  const visibleDocuments = $derived(showHidden ? documents : documents.filter(d => d.hidden !== 1));

  // Calculate total visible media count
  const visibleCount = $derived(visibleImages.length + visibleVideos.length + visibleDocuments.length);
  const totalCount = $derived(images.length + videos.length + documents.length);

  // OPT-036: Pre-compute index maps for O(1) lookups instead of O(n) findIndex
  const imageIndexMap = $derived(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < images.length; i++) {
      map.set(images[i].imgsha, i);
    }
    return map;
  });

  const videoIndexMap = $derived(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < videos.length; i++) {
      map.set(videos[i].vidsha, i);
    }
    return map;
  });

  // Map visible index to original index for lightbox callback
  function getOriginalImageIndex(visibleIndex: number): number {
    if (showHidden) return visibleIndex;
    const visibleItem = visibleImages[visibleIndex];
    return imageIndexMap().get(visibleItem.imgsha) ?? visibleIndex;
  }

  function getOriginalVideoIndex(visibleIndex: number): number {
    if (showHidden) return visibleIndex;
    const visibleItem = visibleVideos[visibleIndex];
    return videoIndexMap().get(visibleItem.vidsha) ?? visibleIndex;
  }
</script>

<div class="mt-6 bg-white rounded-lg shadow">
  <!-- Outer accordion header -->
  <button
    onclick={() => isOpen = !isOpen}
    aria-expanded={isOpen}
    class="w-full p-6 flex items-center justify-between text-left hover:bg-gray-50 transition-colors rounded-lg"
  >
    <h2 class="text-xl font-semibold text-foreground">
      Original Assets
      <span class="text-base font-normal text-gray-400 ml-2">
        ({visibleCount}{totalHiddenCount > 0 && !showHidden ? ` of ${totalCount}` : ''})
      </span>
    </h2>
    <svg
      class="w-5 h-5 text-gray-400 transition-transform duration-200 {isOpen ? 'rotate-180' : ''}"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  {#if isOpen}
    <div class="px-6 pb-6 space-y-2">
      <!-- Show All toggle when there are hidden items -->
      {#if totalHiddenCount > 0}
        <div class="flex items-center justify-end mb-2">
          <button
            onclick={() => showHidden = !showHidden}
            class="text-sm flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors {showHidden ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {#if showHidden}
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              {:else}
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              {/if}
            </svg>
            {showHidden ? 'Showing All' : `Show All (${totalHiddenCount} hidden)`}
          </button>
        </div>
      {/if}

      <LocationGallery
        images={visibleImages}
        {heroImgsha}
        onOpenLightbox={(i) => onOpenImageLightbox(getOriginalImageIndex(i))}
      />
      <LocationVideos
        videos={visibleVideos}
        onOpenLightbox={(i) => onOpenVideoLightbox(getOriginalVideoIndex(i))}
      />
      <LocationDocuments
        documents={visibleDocuments}
        onOpenFile={onOpenDocument}
      />
    </div>
  {/if}
</div>
