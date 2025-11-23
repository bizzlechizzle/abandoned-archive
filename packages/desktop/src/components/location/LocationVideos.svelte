<script lang="ts">
  /**
   * LocationVideos - Video list with duration, resolution, codec
   * Per LILBITS: ~100 lines, single responsibility
   * Per PUEA: Only render if videos exist
   */
  import type { MediaVideo } from './types';
  import { formatDuration, formatResolution } from './types';

  interface Props {
    videos: MediaVideo[];
    onOpenFile: (path: string) => void;
  }

  let { videos, onOpenFile }: Props = $props();

  const VIDEO_LIMIT = 3;
  let showAllVideos = $state(false);

  const displayedVideos = $derived(showAllVideos ? videos : videos.slice(0, VIDEO_LIMIT));
</script>

{#if videos.length > 0}
  <div class="mb-6">
    <h3 class="text-sm font-medium text-gray-500 mb-3">Videos ({videos.length})</h3>
    <div class="space-y-2">
      {#each displayedVideos as video}
        <button
          onclick={() => onOpenFile(video.vidloc)}
          class="w-full flex items-center justify-between p-3 bg-gray-50 rounded hover:bg-gray-100 transition text-left"
        >
          <div class="flex items-center gap-3">
            <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <div>
              <p class="text-sm font-medium text-gray-900">{video.vidnam}</p>
              <p class="text-xs text-gray-500">
                {formatDuration(video.meta_duration)}
                {#if video.meta_width && video.meta_height}
                  &middot; {formatResolution(video.meta_width, video.meta_height)}
                {/if}
                {#if video.meta_codec}
                  &middot; {video.meta_codec}
                {/if}
              </p>
            </div>
          </div>
          <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
      {/each}
    </div>
    {#if videos.length > VIDEO_LIMIT}
      <div class="mt-3 text-center">
        <button
          onclick={() => (showAllVideos = !showAllVideos)}
          class="text-sm text-accent hover:underline"
        >
          {showAllVideos ? `Show Less` : `Show All (${videos.length - VIDEO_LIMIT} more)`}
        </button>
      </div>
    {/if}
  </div>
{/if}
