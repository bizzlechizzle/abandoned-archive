<script lang="ts">
  /**
   * LocationGallery - Image grid with hero selection
   * Per LILBITS: ~200 lines, single responsibility
   * Per PUEA: Only render if images exist
   * Kanye6: Multi-tier thumbnails with srcset, Set Hero button
   */
  import type { MediaImage } from './types';
  import { formatResolution } from './types';

  interface Props {
    images: MediaImage[];
    heroImgsha: string | null;
    onOpenLightbox: (index: number) => void;
    onSetHeroImage: (imgsha: string) => void;
  }

  let { images, heroImgsha, onOpenLightbox, onSetHeroImage }: Props = $props();

  const IMAGE_LIMIT = 6;
  let showAllImages = $state(false);

  const displayedImages = $derived(showAllImages ? images : images.slice(0, IMAGE_LIMIT));
</script>

{#if images.length > 0}
  <div class="mb-6">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-medium text-gray-500">Images ({images.length})</h3>
      <!-- Kanye9: Hero hint for discoverability -->
      <span class="text-xs text-gray-400">Hover any image to set as hero</span>
    </div>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      {#each displayedImages as image, displayIndex}
        {@const actualIndex = images.findIndex(img => img.imgsha === image.imgsha)}
        {@const isHero = heroImgsha === image.imgsha}
        <div class="aspect-square bg-gray-100 rounded overflow-hidden relative group">
          <button
            onclick={() => onOpenLightbox(actualIndex)}
            class="w-full h-full hover:opacity-90 transition"
          >
            {#if image.thumb_path_sm || image.thumb_path}
              <!-- Kanye6: Multi-tier thumbnail with HiDPI support -->
              <img
                src={`media://${image.thumb_path_sm || image.thumb_path}`}
                srcset={`
                  media://${image.thumb_path_sm || image.thumb_path} 1x
                  ${image.thumb_path_lg ? `, media://${image.thumb_path_lg} 2x` : ''}
                `}
                alt={image.imgnam}
                loading="lazy"
                class="w-full h-full object-cover"
              />
            {:else}
              <!-- PUEA: Fallback placeholder -->
              <div class="absolute inset-0 flex items-center justify-center text-gray-400">
                <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            {/if}
          </button>
          <!-- Kanye6: Hero image badge/button -->
          <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition">
            {#if isHero}
              <span class="px-2 py-1 bg-accent text-white text-xs rounded shadow">
                Hero
              </span>
            {:else}
              <button
                onclick={(e) => { e.stopPropagation(); onSetHeroImage(image.imgsha); }}
                class="px-2 py-1 bg-black/60 text-white text-xs rounded hover:bg-black/80 shadow"
                title="Set as hero image"
              >
                Set Hero
              </button>
            {/if}
          </div>
          <!-- Resolution info -->
          <div class="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-2 opacity-0 group-hover:opacity-100 transition">
            {#if image.meta_width && image.meta_height}
              {formatResolution(image.meta_width, image.meta_height)}
            {/if}
          </div>
        </div>
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
  </div>
{:else}
  <!-- PUEA: Empty state -->
  <div class="mb-6">
    <h3 class="text-sm font-medium text-gray-500 mb-3">Images (0)</h3>
    <div class="text-center text-gray-400 py-8 border-2 border-dashed border-gray-200 rounded">
      <p class="text-sm">No images</p>
    </div>
  </div>
{/if}
