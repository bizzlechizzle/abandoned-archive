<script lang="ts">
  /**
   * LocationHeader - Location name, favorite star, edit button
   * Per LILBITS: ~80 lines, single responsibility
   */
  import { router } from '../../stores/router';
  import type { Location } from '@au-archive/core';

  interface Props {
    location: Location;
    isEditing: boolean;
    togglingFavorite: boolean;
    onToggleFavorite: () => void;
    onEditToggle: () => void;
  }

  let { location, isEditing, togglingFavorite, onToggleFavorite, onEditToggle }: Props = $props();
</script>

<div class="mb-6">
  <button
    onclick={() => router.navigate('/locations')}
    class="text-sm text-accent hover:underline mb-2"
  >
    &larr; Back to Locations
  </button>
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <h1 class="text-3xl font-bold text-foreground">{location.locnam}</h1>
      <button
        onclick={onToggleFavorite}
        disabled={togglingFavorite}
        class="p-1 hover:bg-gray-100 rounded transition disabled:opacity-50"
        title={location.favorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        {#if location.favorite}
          <svg class="w-6 h-6 text-yellow-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        {:else}
          <svg class="w-6 h-6 text-gray-400 hover:text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        {/if}
      </button>
    </div>
    <button
      onclick={onEditToggle}
      class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition"
    >
      {isEditing ? 'Cancel Edit' : 'Edit'}
    </button>
  </div>
  {#if location.akanam}
    <p class="text-gray-500 mt-1">Also Known As: {location.akanam}</p>
  {/if}
</div>
