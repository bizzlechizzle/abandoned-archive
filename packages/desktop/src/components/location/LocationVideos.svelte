<script lang="ts">
  /**
   * LocationVideos - Video thumbnail grid
   * Sub-accordion within Original Assets
   * Per DECISION-020: 4x2 grid, opens in MediaViewer
   */
  import type { MediaVideo } from './types';
  import { formatDuration, formatResolution } from './types';

  interface Props {
    videos: MediaVideo[];
    onOpenLightbox: (index: number) => void;
  }

  let { videos, onOpenLightbox }: Props = $props();

  const VIDEO_LIMIT = 8; // 4x2 grid
  let isOpen = $state(true); // Expanded by default
  let showAllVideos = $state(false);

  const displayedVideos = $derived(showAllVideos ? videos : videos.slice(0, VIDEO_LIMIT));
</script>

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
            <div class="aspect-[1.618/1] bg-gray-100 rounded overflow-hidden relative group">
              <button
                onclick={() => onOpenLightbox(actualIndex)}
                class="w-full h-full hover:opacity-90 transition"
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
                <!-- Play button overlay -->
                <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                  <div class="w-12 h-12 bg-black/60 rounded-full flex items-center justify-center">
                    <svg class="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
              </button>
              <!-- Duration/resolution overlay -->
              <div class="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1.5">
                <span>{formatDuration(video.meta_duration)}</span>
                {#if video.meta_width && video.meta_height}
                  <span class="ml-2">{formatResolution(video.meta_width, video.meta_height)}</span>
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
