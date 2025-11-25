<script lang="ts">
  /**
   * LocationHero - Static cinematic hero image display
   * Per LILBITS: ~100 lines, single responsibility
   * Per PUEA: Show placeholder with import prompt if no images
   */
  import type { MediaImage } from './types';

  interface Props {
    images: MediaImage[];
    heroImgsha: string | null;
  }

  let { images, heroImgsha }: Props = $props();

  const heroImage = $derived(
    heroImgsha
      ? images.find(img => img.imgsha === heroImgsha) || images[0]
      : images[0]
  );

  const heroSrc = $derived(
    heroImage
      ? heroImage.preview_path || heroImage.thumb_path_lg || heroImage.thumb_path_sm || heroImage.thumb_path
      : null
  );
</script>

<!-- Hero with 2.35:1 cinematic aspect, gradient to #fffbf7, static display (no click-to-lightbox) -->
{#if images.length > 0 && heroImage}
  <div class="mb-6">
    <div
      class="relative w-full bg-gray-100 overflow-hidden"
      style="aspect-ratio: 2.35 / 1;"
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
      <!-- Gradient fade to page background color (bottom 5% fully solid) -->
      <div class="absolute bottom-0 left-0 right-0 h-[20%] pointer-events-none" style="background: linear-gradient(to top, #fffbf7 25%, transparent 100%);"></div>
    </div>
  </div>
{:else}
  <!-- PUEA: Graceful empty state with action prompt -->
  <div class="mb-6 bg-gradient-to-br from-gray-100 to-[#fffbf7] flex items-center justify-center" style="aspect-ratio: 2.35 / 1;">
    <div class="text-center text-gray-400">
      <svg class="w-24 h-24 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      <p class="text-lg">No Hero Image</p>
      <p class="text-sm mt-1">Import images to set a hero image</p>
    </div>
  </div>
{/if}
