<script lang="ts">
  /**
   * LocationHero - Hero image display with click-to-lightbox
   * Per LILBITS: ~100 lines, single responsibility
   * Per PUEA: Show placeholder with import prompt if no images
   */
  import type { MediaImage } from './types';
  import { formatResolution } from './types';

  interface Props {
    images: MediaImage[];
    heroImgsha: string | null;
    onOpenLightbox: (index: number) => void;
  }

  let { images, heroImgsha, onOpenLightbox }: Props = $props();

  const heroImage = $derived(
    heroImgsha
      ? images.find(img => img.imgsha === heroImgsha) || images[0]
      : images[0]
  );

  const heroIndex = $derived(
    heroImage ? images.findIndex(img => img.imgsha === heroImage.imgsha) : 0
  );

  const heroSrc = $derived(
    heroImage
      ? heroImage.preview_path || heroImage.thumb_path_lg || heroImage.thumb_path_sm || heroImage.thumb_path
      : null
  );
</script>

<!-- PUEA: Show different content based on data availability -->
{#if images.length > 0 && heroImage}
  <div class="mb-6 -mx-8 -mt-8">
    <button
      onclick={() => onOpenLightbox(heroIndex >= 0 ? heroIndex : 0)}
      class="relative w-full h-64 md:h-96 bg-gray-100 overflow-hidden group cursor-pointer"
    >
      {#if heroSrc}
        <img
          src={`media://${heroSrc}`}
          alt={heroImage.imgnam || 'Hero Image'}
          class="absolute inset-0 w-full h-full object-cover"
        />
      {:else}
        <div class="absolute inset-0 flex items-center justify-center text-gray-400">
          <svg class="w-24 h-24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      {/if}
      <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-6">
        <div class="flex items-center justify-between text-white">
          <div>
            <p class="text-xs opacity-80">Hero Image</p>
            {#if heroImage.meta_width && heroImage.meta_height}
              <p class="text-sm">{formatResolution(heroImage.meta_width, heroImage.meta_height)}</p>
            {/if}
          </div>
          <div class="opacity-0 group-hover:opacity-100 transition">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
            </svg>
          </div>
        </div>
      </div>
    </button>
  </div>
{:else}
  <!-- PUEA: Graceful empty state with action prompt -->
  <div class="mb-6 -mx-8 -mt-8 h-64 md:h-96 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
    <div class="text-center text-gray-400">
      <svg class="w-24 h-24 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      <p class="text-lg">No Hero Image</p>
      <p class="text-sm mt-1">Import images to set a hero image</p>
    </div>
  </div>
{/if}
