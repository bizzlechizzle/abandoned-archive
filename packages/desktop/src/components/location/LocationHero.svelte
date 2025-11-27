<script lang="ts">
  /**
   * LocationHero - Cinematic hero image with seamless gradient fade
   * Per LILBITS: ~100 lines, single responsibility
   * Per PUEA: Show placeholder with import prompt if no images
   * Migration 22: Supports focal point for crop positioning
   */
  import type { MediaImage } from './types';

  interface Props {
    images: MediaImage[];
    heroImgsha: string | null;
    focalX?: number; // 0-1, default 0.5 (center)
    focalY?: number; // 0-1, default 0.5 (center)
    isEditing?: boolean;
    onFocalPointChange?: (x: number, y: number) => void;
  }

  let { images, heroImgsha, focalX = 0.5, focalY = 0.5, isEditing = false, onFocalPointChange }: Props = $props();

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

  // Convert focal point (0-1) to object-position percentage
  const objectPosition = $derived(`${focalX * 100}% ${focalY * 100}%`);

  // Drag state for focal point editing
  let isDragging = $state(false);
  let containerRef: HTMLDivElement | undefined = $state();

  function handleMouseDown(e: MouseEvent) {
    if (!isEditing || !containerRef) return;
    isDragging = true;
    updateFocalPoint(e);
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isDragging || !isEditing || !containerRef) return;
    updateFocalPoint(e);
  }

  function handleMouseUp() {
    isDragging = false;
  }

  function updateFocalPoint(e: MouseEvent) {
    if (!containerRef || !onFocalPointChange) return;
    const rect = containerRef.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    onFocalPointChange(x, y);
  }
</script>

<svelte:window onmouseup={handleMouseUp} onmousemove={handleMouseMove} />

<!-- Hero with 2.35:1 aspect, capped at 33% viewport height -->
{#if images.length > 0 && heroImage}
  <div class="w-full bg-[#fffbf7]">
    <div
      bind:this={containerRef}
      class="relative w-full max-h-[33vh] mx-auto overflow-hidden {isEditing ? 'cursor-crosshair' : ''}"
      style="aspect-ratio: 2.35 / 1;"
      role={isEditing ? 'button' : undefined}
      tabindex={isEditing ? 0 : undefined}
      onmousedown={handleMouseDown}
    >
      {#if heroSrc}
        <img
          src={`media://${heroSrc}`}
          alt={heroImage.imgnam || 'Hero Image'}
          class="absolute inset-0 w-full h-full object-cover {isEditing ? 'pointer-events-none' : ''}"
          style="object-position: {objectPosition};"
        />
        <!-- Focal point indicator (visible in edit mode) -->
        {#if isEditing}
          <div
            class="absolute w-8 h-8 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10"
            style="left: {focalX * 100}%; top: {focalY * 100}%;"
          >
            <div class="absolute inset-0 rounded-full border-4 border-white shadow-lg"></div>
            <div class="absolute inset-2 rounded-full bg-accent/80"></div>
          </div>
          <div class="absolute top-3 left-1/2 -translate-x-1/2 bg-black/70 text-white px-3 py-1 rounded-full text-sm font-medium z-20">
            Drag to set focal point
          </div>
        {/if}
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
  <!-- PUEA: Graceful empty state - matches hero constraints -->
  <div class="w-full bg-[#fffbf7]">
    <div class="w-full max-h-[33vh] mx-auto bg-gradient-to-br from-gray-100 to-[#fffbf7] flex items-center justify-center" style="aspect-ratio: 2.35 / 1;">
    <div class="text-center text-gray-400">
      <svg class="w-24 h-24 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      <p class="text-lg">No Hero Image</p>
      <p class="text-sm mt-1">Import images to set a hero image</p>
    </div>
    </div>
  </div>
{/if}
