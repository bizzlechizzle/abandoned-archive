<script lang="ts">
  /**
   * SubLocationGrid - Premium grid of sub-location cards for host locations
   * Migration 28: Max 4 per row, click to navigate to sub-location detail
   * Design: Cinematic cards with golden ratio, centered text, premium hover
   */
  import { router } from '../../stores/router';

  interface SubLocation {
    subid: string;
    sub12: string;
    locid: string;
    subnam: string;
    ssubname: string | null;
    type: string | null;
    status: string | null;
    hero_imgsha: string | null;
    is_primary: boolean;
    hero_thumb_path?: string;
  }

  interface Props {
    locid: string;
    sublocations: SubLocation[];
    onAddSubLocation?: () => void;
  }

  let { locid, sublocations, onAddSubLocation }: Props = $props();

  function navigateToSubLocation(subid: string) {
    router.navigate(`/location/${locid}/sub/${subid}`);
  }
</script>

<section class="mt-8">
  <div class="mb-4">
    <h2 class="text-lg font-semibold text-foreground">Buildings & Structures</h2>
  </div>

  {#if sublocations.length === 0}
    <div class="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
      <svg class="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
      <p class="text-gray-500 mb-2">No buildings added yet</p>
      <p class="text-sm text-gray-400">Add buildings to organize media by structure</p>
      {#if onAddSubLocation}
        <button
          onclick={onAddSubLocation}
          class="mt-4 px-4 py-2 bg-accent text-white rounded-full hover:opacity-90 transition shadow-sm"
        >
          Add First Building
        </button>
      {/if}
    </div>
  {:else}
    <div class="grid grid-cols-2 gap-4">
      {#each sublocations as subloc}
        <button
          onclick={() => navigateToSubLocation(subloc.subid)}
          class="building-card rounded-lg overflow-hidden text-left"
        >
          <!-- Hero image with cinematic text overlay (golden ratio) -->
          <div class="card-container aspect-[1.618] bg-gray-100 relative overflow-hidden">
            {#if subloc.hero_thumb_path}
              <img
                src="media://{subloc.hero_thumb_path}"
                alt={subloc.subnam}
                class="w-full h-full object-cover"
              />
            {:else}
              <div class="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                <svg class="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
            {/if}

            <!-- Permanent dark overlay for text legibility -->
            <div class="absolute inset-0 pointer-events-none" style="background: rgba(69,69,69,0.25);"></div>

            <!-- Gold gradient hover overlay -->
            <div class="gold-overlay absolute inset-0 opacity-0 transition-opacity duration-300 pointer-events-none" style="background: linear-gradient(135deg, rgba(185,151,92,0.4) 0%, rgba(212,175,55,0.25) 50%, rgba(185,151,92,0.4) 100%);"></div>

            <!-- Cinematic centered title -->
            <div class="absolute inset-0 flex items-center justify-center">
              <h3 class="cinematic-title w-3/4 font-bold text-white text-center uppercase tracking-[0.2em]">
                {subloc.subnam}
              </h3>
            </div>

            <!-- Primary badge -->
            {#if subloc.is_primary}
              <div class="absolute top-2 right-2 px-2.5 py-0.5 bg-amber-500 text-white text-xs font-medium rounded-full shadow-sm">
                Primary
              </div>
            {/if}
          </div>
        </button>
      {/each}

      <!-- Add card -->
      {#if onAddSubLocation}
        <button
          onclick={onAddSubLocation}
          class="add-card rounded-lg border-2 border-dashed border-gray-200 hover:border-accent hover:bg-accent/5 transition flex flex-col items-center justify-center gap-2"
          style="aspect-ratio: 1.618;"
        >
          <svg class="w-8 h-8 text-gray-400 group-hover:text-accent transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          <span class="text-sm text-gray-500">Add Building</span>
        </button>
      {/if}
    </div>
  {/if}
</section>

<style>
  /* Premium hover effect - matches LocationGallery */
  .building-card {
    transition: transform 200ms ease, box-shadow 200ms ease;
    border: 2px solid transparent;
  }

  .building-card:hover {
    transform: scale(1.02);
    box-shadow: 0 8px 25px -5px rgba(0, 0, 0, 0.15);
    border-color: var(--color-accent, #b9975c);
  }

  /* Gold gradient overlay on hover */
  .building-card:hover .gold-overlay {
    opacity: 1;
  }

  /* Container for scaling text */
  .card-container {
    container-type: inline-size;
  }

  /* Cinematic title - scales with container width */
  .cinematic-title {
    font-size: 10cqw;
    line-height: 1.2;
    text-shadow: 0 2px 6px rgba(0,0,0,0.6);
  }

  /* Add card hover */
  .add-card {
    transition: border-color 200ms ease, background-color 200ms ease;
  }

  .add-card:hover svg,
  .add-card:hover span {
    color: var(--color-accent, #b9975c);
  }
</style>
