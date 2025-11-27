<script lang="ts">
  /**
   * LocationGallery - Premium image grid with hero selection
   * Sub-accordion within Original Assets
   * Per DECISION-020: 4x2 grid, accordion toggle
   * Premium UX: Accent ring hover, options menu dropdown
   */
  import type { MediaImage } from './types';

  interface Props {
    images: MediaImage[];
    heroImgsha: string | null;
    onOpenLightbox: (index: number) => void;
    onSetHeroImage: (imgsha: string) => void;
    onShowInFinder?: (path: string) => void;
  }

  let { images, heroImgsha, onOpenLightbox, onSetHeroImage, onShowInFinder }: Props = $props();

  const IMAGE_LIMIT = 8; // 4x2 grid
  let isOpen = $state(true); // Expanded by default when parent opens
  let showAllImages = $state(false);
  let openMenuIndex = $state<number | null>(null);

  const displayedImages = $derived(showAllImages ? images : images.slice(0, IMAGE_LIMIT));

  function toggleMenu(e: MouseEvent, index: number) {
    e.stopPropagation();
    openMenuIndex = openMenuIndex === index ? null : index;
  }

  function closeMenu() {
    openMenuIndex = null;
  }

  function handleSetHero(e: MouseEvent, imgsha: string) {
    e.stopPropagation();
    onSetHeroImage(imgsha);
    closeMenu();
  }

  function handleOpenLightbox(e: MouseEvent, index: number) {
    e.stopPropagation();
    onOpenLightbox(index);
    closeMenu();
  }

  function handleShowInFinder(e: MouseEvent, path: string) {
    e.stopPropagation();
    onShowInFinder?.(path);
    closeMenu();
  }

  // Close menu when clicking outside
  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.image-menu')) {
      closeMenu();
    }
  }
</script>

<svelte:window onclick={handleClickOutside} />

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
            {@const isMenuOpen = openMenuIndex === displayIndex}
            <div class="image-card aspect-[1.618/1] bg-gray-100 rounded-lg overflow-hidden relative group">
              <!-- Clickable image area -->
              <button
                onclick={() => onOpenLightbox(actualIndex)}
                class="w-full h-full focus:outline-none"
              >
                {#if image.thumb_path_sm || image.thumb_path}
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
                  <div class="absolute inset-0 flex items-center justify-center text-gray-400">
                    <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                {/if}
              </button>

              <!-- Hero badge (always visible on hero) -->
              {#if isHero}
                <div class="absolute top-2 left-2 px-2 py-0.5 bg-accent text-white text-xs font-medium rounded shadow-sm">
                  Hero
                </div>
              {/if}

              <!-- Options menu button (visible on hover) -->
              <div class="image-menu absolute top-2 right-2">
                <button
                  onclick={(e) => toggleMenu(e, displayIndex)}
                  class="w-7 h-7 flex items-center justify-center bg-black/50 hover:bg-black/70 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm {isMenuOpen ? 'opacity-100 bg-black/70' : ''}"
                  aria-label="Image options"
                >
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="6" r="1.5" />
                    <circle cx="12" cy="12" r="1.5" />
                    <circle cx="12" cy="18" r="1.5" />
                  </svg>
                </button>

                <!-- Dropdown menu -->
                {#if isMenuOpen}
                  <div class="absolute top-9 right-0 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                    {#if !isHero}
                      <button
                        onclick={(e) => handleSetHero(e, image.imgsha)}
                        class="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        <svg class="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                        Set as Hero
                      </button>
                    {/if}
                    <button
                      onclick={(e) => handleOpenLightbox(e, actualIndex)}
                      class="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                      </svg>
                      View Full Size
                    </button>
                    {#if onShowInFinder}
                      <button
                        onclick={(e) => handleShowInFinder(e, image.imgloc)}
                        class="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                        Show in Finder
                      </button>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>
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

  /* Ensure menu stays above other elements */
  .image-menu {
    z-index: 10;
  }
</style>
