<script lang="ts">
  /**
   * LocationGallery - Clean image grid with hero badge
   * Sub-accordion within Original Assets
   * Per DECISION-020: 4x2 grid, opens in MediaViewer
   * Premium UX: Accent ring hover, hero badge
   */
  import type { MediaImage } from './types';
  import { thumbnailCache } from '../../stores/thumbnail-cache-store';

  interface Props {
    images: MediaImage[];
    heroImgsha: string | null;
    onOpenLightbox: (index: number) => void;
  }

  let { images, heroImgsha, onOpenLightbox }: Props = $props();

  const IMAGE_LIMIT = 8; // 4x2 grid
  let isOpen = $state(true); // Expanded by default when parent opens
  let showAllImages = $state(false);

  const displayedImages = $derived(showAllImages ? images : images.slice(0, IMAGE_LIMIT));

  // Cache-bust param to force reload after thumbnail regeneration
  const cacheVersion = $derived($thumbnailCache);
</script>

{#if images.length > 0}
  <div class="border-b border-gray-100 last:border-b-0">
    <!-- Sub-accordion header -->
    <button
      onclick={() => isOpen = !isOpen}
      aria-expanded={isOpen}
      class="w-full py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
    >
      <h3 class="text-sm font-medium text-gray-700">Images ({images.length})</h3>
      <svg
        class="w-4 h-4 text-gray-400 transition-transform duration-200 {isOpen ? 'rotate-180' : ''}"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    {#if isOpen}
      <div class="pb-4">
        <!-- 4x2 Grid -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          {#each displayedImages as image, displayIndex}
            {@const actualIndex = images.findIndex(img => img.imgsha === image.imgsha)}
            {@const isHero = heroImgsha === image.imgsha}
            <button
              onclick={() => onOpenLightbox(actualIndex)}
              class="image-card aspect-[1.618/1] bg-gray-100 rounded-lg overflow-hidden relative group"
            >
              {#if image.thumb_path_sm || image.thumb_path}
                <img
                  src={`media://${image.thumb_path_sm || image.thumb_path}?v=${cacheVersion}`}
                  srcset={`
                    media://${image.thumb_path_sm || image.thumb_path}?v=${cacheVersion} 1x
                    ${image.thumb_path_lg ? `, media://${image.thumb_path_lg}?v=${cacheVersion} 2x` : ''}
                  `}
                  alt={image.imgnam}
                  loading="lazy"
                  class="w-full h-full object-cover"
                />
              {:else}
                <div class="absolute inset-0 flex items-center justify-center text-gray-400">
                  <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              {/if}

              <!-- Hero badge (always visible on hero) -->
              {#if isHero}
                <div class="absolute top-2 left-2 px-2 py-0.5 bg-accent text-white text-xs font-medium rounded shadow-sm">
                  Hero
                </div>
              {/if}
            </button>
          {/each}
        </div>

        <!-- Show more -->
        {#if images.length > IMAGE_LIMIT}
          <div class="mt-3 text-center">
            <button
              onclick={() => showAllImages = !showAllImages}
              class="text-sm text-accent hover:underline"
            >
              {showAllImages ? 'Show Less' : `Show All (${images.length - IMAGE_LIMIT} more)`}
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  /* Premium hover effect */
  .image-card {
    transition: transform 200ms ease, box-shadow 200ms ease;
    border: 2px solid transparent;
  }

  .image-card:hover {
    transform: scale(1.02);
    box-shadow: 0 8px 25px -5px rgba(0, 0, 0, 0.15);
    border-color: var(--color-accent, #b9975c);
  }
</style>
