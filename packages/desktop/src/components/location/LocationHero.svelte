<script lang="ts">
  /**
   * LocationHero - Cinematic hero image with seamless gradient fade
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

<!-- Hero with 2:1 aspect, seamless S-curve light gradient -->
{#if images.length > 0 && heroImage}
  <div>
    <div
      class="relative w-full bg-[#fffbf7] overflow-hidden"
      style="aspect-ratio: 2 / 1;"
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
      <!-- Seamless light gradient: bottom 12.5% solid, S-curve fade to 80% -->
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
    </div>
  </div>
{:else}
  <!-- PUEA: Graceful empty state with action prompt -->
  <div class="bg-gradient-to-br from-gray-100 to-[#fffbf7] flex items-center justify-center" style="aspect-ratio: 2 / 1;">
    <div class="text-center text-gray-400">
      <svg class="w-24 h-24 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      <p class="text-lg">No Hero Image</p>
      <p class="text-sm mt-1">Import images to set a hero image</p>
    </div>
  </div>
{/if}
