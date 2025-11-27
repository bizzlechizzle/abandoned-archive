<script lang="ts">
  /**
   * LocationVideos - Premium video thumbnail grid
   * Sub-accordion within Original Assets
   * Per DECISION-020: 4x2 grid, opens in MediaViewer
   * Premium UX: Accent ring hover, options menu dropdown
   */
  import type { MediaVideo } from './types';
  import { formatDuration } from './types';

  interface Props {
    videos: MediaVideo[];
    onOpenLightbox: (index: number) => void;
    onShowInFinder?: (path: string) => void;
  }

  let { videos, onOpenLightbox, onShowInFinder }: Props = $props();

  const VIDEO_LIMIT = 8; // 4x2 grid
  let isOpen = $state(true); // Expanded by default
  let showAllVideos = $state(false);
  let openMenuIndex = $state<number | null>(null);

  const displayedVideos = $derived(showAllVideos ? videos : videos.slice(0, VIDEO_LIMIT));

  function toggleMenu(e: MouseEvent, index: number) {
    e.stopPropagation();
    openMenuIndex = openMenuIndex === index ? null : index;
  }

  function closeMenu() {
    openMenuIndex = null;
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
    if (!target.closest('.video-menu')) {
      closeMenu();
    }
  }
</script>

<svelte:window onclick={handleClickOutside} />

{#if videos.length > 0}
  <div class="border-b border-gray-100 last:border-b-0">
    <!-- Sub-accordion header -->
    <button
      onclick={() => isOpen = !isOpen}
      aria-expanded={isOpen}
      class="w-full py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
    >
      <h3 class="text-sm font-medium text-gray-700">Videos ({videos.length})</h3>
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
          {#each displayedVideos as video, displayIndex}
            {@const actualIndex = videos.findIndex(v => v.vidsha === video.vidsha)}
            {@const isMenuOpen = openMenuIndex === displayIndex}
            <div class="video-card aspect-[1.618/1] bg-gray-100 rounded-lg overflow-hidden relative group">
              <!-- Clickable video area -->
              <button
                onclick={() => onOpenLightbox(actualIndex)}
                class="w-full h-full focus:outline-none"
              >
                {#if video.thumb_path_sm || video.thumb_path}
                  <img
                    src={`media://${video.thumb_path_sm || video.thumb_path}`}
                    alt={video.vidnam}
                    loading="lazy"
                    class="w-full h-full object-cover"
                  />
                {:else}
                  <!-- Fallback: video icon -->
                  <div class="absolute inset-0 flex items-center justify-center text-gray-400 bg-gray-200">
                    <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                {/if}
              </button>

              <!-- Play button overlay (center, on hover) -->
              <div class="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                <div class="w-12 h-12 bg-black/60 rounded-full flex items-center justify-center">
                  <svg class="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>

              <!-- Duration badge (always visible, bottom-left) -->
              {#if video.meta_duration}
                <div class="absolute bottom-2 left-2 px-2 py-0.5 bg-black/70 text-white text-xs font-medium rounded">
                  {formatDuration(video.meta_duration)}
                </div>
              {/if}

              <!-- Options menu button (visible on hover) -->
              <div class="video-menu absolute top-2 right-2">
                <button
                  onclick={(e) => toggleMenu(e, displayIndex)}
                  class="w-7 h-7 flex items-center justify-center bg-black/50 hover:bg-black/70 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm {isMenuOpen ? 'opacity-100 bg-black/70' : ''}"
                  aria-label="Video options"
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
                    <button
                      onclick={(e) => handleOpenLightbox(e, actualIndex)}
                      class="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <svg class="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      Play Video
                    </button>
                    {#if onShowInFinder}
                      <button
                        onclick={(e) => handleShowInFinder(e, video.vidloc)}
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
        {#if videos.length > VIDEO_LIMIT}
          <div class="mt-3 text-center">
            <button
              onclick={() => showAllVideos = !showAllVideos}
              class="text-sm text-accent hover:underline"
            >
              {showAllVideos ? 'Show Less' : `Show All (${videos.length - VIDEO_LIMIT} more)`}
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  /* Premium hover effect */
  .video-card {
    transition: transform 200ms ease, box-shadow 200ms ease;
    border: 2px solid transparent;
  }

  .video-card:hover {
    transform: scale(1.02);
    box-shadow: 0 8px 25px -5px rgba(0, 0, 0, 0.15);
    border-color: var(--color-accent, #b9975c);
  }

  /* Ensure menu stays above other elements */
  .video-menu {
    z-index: 10;
  }
</style>
