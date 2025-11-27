<script lang="ts">
  /**
   * LocationOriginalAssets - Accordion wrapper for all media types
   * Contains Images, Videos, Documents sub-accordions
   * Per DECISION-020: Original Assets Accordion Refactor
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
    onSetHeroImage: (imgsha: string) => void;
    onOpenDocument: (path: string) => void;
  }

  let {
    images,
    videos,
    documents,
    heroImgsha,
    onOpenImageLightbox,
    onOpenVideoLightbox,
    onSetHeroImage,
    onOpenDocument,
  }: Props = $props();

  // Outer accordion - collapsed by default (user can expand if wanted)
  let isOpen = $state(false);

  // Calculate total media count
  const totalCount = $derived(images.length + videos.length + documents.length);
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
      <span class="text-base font-normal text-gray-400 ml-2">({totalCount})</span>
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
      <LocationGallery
        {images}
        {heroImgsha}
        onOpenLightbox={onOpenImageLightbox}
        onSetHeroImage={onSetHeroImage}
      />
      <LocationVideos
        {videos}
        onOpenLightbox={onOpenVideoLightbox}
      />
      <LocationDocuments
        {documents}
        onOpenFile={onOpenDocument}
      />
    </div>
  {/if}
</div>
