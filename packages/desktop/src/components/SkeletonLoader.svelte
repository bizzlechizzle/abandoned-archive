<script lang="ts">
  /**
   * SkeletonLoader - Premium shimmer loading placeholders
   * OPT-040: FAANG-level perceived performance
   *
   * Usage:
   *   <SkeletonLoader type="card" />
   *   <SkeletonLoader type="row" count={5} />
   *   <SkeletonLoader type="grid" count={8} />
   *   <SkeletonLoader type="text" width="60%" />
   */

  interface Props {
    type?: 'card' | 'row' | 'grid' | 'text' | 'thumbnail' | 'table-row';
    count?: number;
    width?: string;
    height?: string;
  }

  let { type = 'text', count = 1, width = '100%', height }: Props = $props();
</script>

{#if type === 'card'}
  {#each Array(count) as _, i}
    <div class="skeleton-card rounded-lg overflow-hidden">
      <div class="skeleton-shimmer aspect-video bg-gray-200"></div>
      <div class="p-4 space-y-2">
        <div class="skeleton-shimmer h-4 bg-gray-200 rounded w-3/4"></div>
        <div class="skeleton-shimmer h-3 bg-gray-200 rounded w-1/2"></div>
      </div>
    </div>
  {/each}

{:else if type === 'row'}
  {#each Array(count) as _, i}
    <div class="flex items-center gap-4 p-4">
      <div class="skeleton-shimmer w-16 h-16 bg-gray-200 rounded-lg flex-shrink-0"></div>
      <div class="flex-1 space-y-2">
        <div class="skeleton-shimmer h-4 bg-gray-200 rounded w-3/4"></div>
        <div class="skeleton-shimmer h-3 bg-gray-200 rounded w-1/2"></div>
      </div>
    </div>
  {/each}

{:else if type === 'grid'}
  <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
    {#each Array(count) as _, i}
      <div class="skeleton-shimmer aspect-[1.618/1] bg-gray-200 rounded-lg"></div>
    {/each}
  </div>

{:else if type === 'thumbnail'}
  {#each Array(count) as _, i}
    <div class="skeleton-shimmer bg-gray-200 rounded-lg" style="width: {width}; height: {height || '64px'};"></div>
  {/each}

{:else if type === 'table-row'}
  {#each Array(count) as _, i}
    <div class="grid grid-cols-[1fr_150px_200px_80px] border-b border-gray-100" style="height: 60px;">
      <div class="px-6 py-4 flex flex-col justify-center gap-1">
        <div class="skeleton-shimmer h-4 bg-gray-200 rounded w-3/4"></div>
        <div class="skeleton-shimmer h-3 bg-gray-200 rounded w-1/2"></div>
      </div>
      <div class="px-6 py-4 flex items-center">
        <div class="skeleton-shimmer h-4 bg-gray-200 rounded w-20"></div>
      </div>
      <div class="px-6 py-4 flex items-center">
        <div class="skeleton-shimmer h-4 bg-gray-200 rounded w-28"></div>
      </div>
      <div class="px-6 py-4 flex items-center">
        <div class="skeleton-shimmer h-5 bg-gray-200 rounded-full w-10"></div>
      </div>
    </div>
  {/each}

{:else}
  <!-- Default: text line -->
  <div class="skeleton-shimmer h-4 bg-gray-200 rounded" style="width: {width};"></div>
{/if}

<style>
  /* Premium shimmer animation */
  .skeleton-shimmer {
    position: relative;
    overflow: hidden;
  }

  .skeleton-shimmer::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.4) 50%,
      transparent 100%
    );
    animation: shimmer 1.5s infinite;
  }

  @keyframes shimmer {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }

  /* DESIGN_SYSTEM: Card uses design tokens */
  .skeleton-card {
    background: var(--color-surface);
    box-shadow: var(--shadow-sm);
  }
</style>
