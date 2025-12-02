<script lang="ts">
  /**
   * Dashboard.svelte - Main dashboard
   *
   * Layout:
   * - Stats row
   * - Projects (pinned/favorite locations)
   * - Recent Locations / Recent Imports (2-col)
   * - Top Type / Top State (2-col, no thumbnails)
   */
  import { onMount } from 'svelte';
  import { router } from '../stores/router';
  import { isImporting, importProgress, recentImports as storeRecentImports } from '../stores/import-store';
  import { thumbnailCache } from '../stores/thumbnail-cache-store';
  import { LocationHero, type MediaImage } from '../components/location';
  import SkeletonLoader from '../components/SkeletonLoader.svelte';

  interface ImportRecord {
    import_id: string;
    locid: string | null;
    import_date: string;
    auth_imp: string | null;
    img_count: number;
    vid_count: number;
    doc_count: number;
    map_count: number;
    notes: string | null;
    locnam?: string;
    address_state?: string;
    heroThumbPath?: string;
  }

  interface LocationWithHero {
    locid: string;
    locnam: string;
    address?: { state?: string };
    heroThumbPath?: string;
  }

  interface TypeStat {
    type: string;
    count: number;
  }

  interface StateStat {
    state: string;
    count: number;
  }

  // Stats
  let totalLocations = $state(0);
  let totalImages = $state(0);
  let totalVideos = $state(0);
  let totalDocuments = $state(0);
  let totalBookmarks = $state(0);

  // Format large numbers with "k" suffix (e.g., 3024 → "3k", 3150 → "3.2k")
  function formatCount(n: number): string {
    if (n < 1000) return n.toString();
    const k = n / 1000;
    const rounded = Math.round(k * 10) / 10;
    return rounded % 1 === 0 ? `${Math.floor(rounded)}k` : `${rounded}k`;
  }

  // Sections
  let projects = $state<LocationWithHero[]>([]);
  let recentLocations = $state<LocationWithHero[]>([]);
  let recentImports = $state<ImportRecord[]>([]);
  let topTypes = $state<TypeStat[]>([]);
  let topStates = $state<StateStat[]>([]);

  // Dashboard hero
  let dashboardHero = $state<{imgsha: string; focalX: number; focalY: number} | null>(null);
  let dashboardHeroImage = $state<{thumb_path?: string; preview_path?: string; thumb_path_lg?: string; thumb_path_sm?: string} | null>(null);

  let loading = $state(true);

  // Hero title auto-sizing: responsive to container width
  let heroTitleEl = $state<HTMLElement | null>(null);
  let heroTitleFontSize = $state(128); // Start at max, shrink as needed
  let heroContainerEl = $state<HTMLElement | null>(null);

  // Cache version for busting browser cache after thumbnail regeneration
  const cacheVersion = $derived($thumbnailCache);

  // Build images array for LocationHero component (empty array = show empty state)
  const heroImages = $derived<MediaImage[]>(() => {
    if (!dashboardHero || !dashboardHeroImage) return [];
    return [{
      imgsha: dashboardHero.imgsha,
      imgnam: 'Dashboard Hero',
      imgloc: '',
      locid: null,
      subid: null,
      meta_width: null,
      meta_height: null,
      meta_date_taken: null,
      meta_camera_make: null,
      meta_camera_model: null,
      meta_gps_lat: null,
      meta_gps_lng: null,
      thumb_path: dashboardHeroImage.thumb_path || null,
      thumb_path_sm: dashboardHeroImage.thumb_path_sm || null,
      thumb_path_lg: dashboardHeroImage.thumb_path_lg || null,
      preview_path: dashboardHeroImage.preview_path || null,
    }];
  });

  onMount(async () => {
    if (!window.electronAPI?.locations) {
      console.error('Electron API not available');
      loading = false;
      return;
    }

    // Fetch each section independently so one failure doesn't blank the whole dashboard
    try {
      totalLocations = await window.electronAPI.locations.count();
    } catch (e) {
      console.error('Failed to load location count:', e);
    }

    try {
      const mediaCounts = await window.electronAPI.imports.getTotalMediaCount();
      totalImages = mediaCounts.images;
      totalVideos = mediaCounts.videos;
      totalDocuments = mediaCounts.documents;
    } catch (e) {
      console.error('Failed to load media counts:', e);
    }

    try {
      totalBookmarks = await window.electronAPI.bookmarks.count();
    } catch (e) {
      console.error('Failed to load bookmark count:', e);
    }

    try {
      // Projects = locations with project flag set, includes hero thumbnails
      projects = await window.electronAPI.locations.findProjects(5);
    } catch (e) {
      console.error('Failed to load projects:', e);
    }

    try {
      recentLocations = await window.electronAPI.locations.findRecentlyViewed(5);
    } catch (e) {
      console.error('Failed to load recent locations:', e);
    }

    try {
      recentImports = await window.electronAPI.imports.findRecent(5) as ImportRecord[];
    } catch (e) {
      console.error('Failed to load recent imports:', e);
    }

    try {
      topTypes = await window.electronAPI.stats.topTypes(5);
    } catch (e) {
      console.error('Failed to load top types:', e);
    }

    try {
      topStates = await window.electronAPI.stats.topStates(5);
    } catch (e) {
      console.error('Failed to load top states:', e);
    }

    // Load dashboard hero
    try {
      const imgsha = await window.electronAPI.settings.get('dashboard_hero_imgsha');
      if (imgsha) {
        const focalX = parseFloat(await window.electronAPI.settings.get('dashboard_hero_focal_x') || '0.5');
        const focalY = parseFloat(await window.electronAPI.settings.get('dashboard_hero_focal_y') || '0.5');
        dashboardHero = { imgsha, focalX, focalY };
        // Load the image thumbnail paths
        dashboardHeroImage = await window.electronAPI.media.findImageByHash(imgsha);
      }
    } catch (e) {
      console.error('Failed to load dashboard hero:', e);
    }

    loading = false;
  });

  function formatDate(isoDate: string): string {
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // Responsive title sizing (simplified for single-word "Dashboard")
  function fitTitle() {
    const el = heroTitleEl;
    const container = heroContainerEl;
    if (!el || !container) return;

    const maxSize = 128;
    const minSize = 14;

    // "Dashboard" is always single line
    el.style.whiteSpace = 'nowrap';

    // Binary search for optimal size
    let low = minSize;
    let high = maxSize;
    let bestFit = minSize;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      el.style.fontSize = `${mid}px`;

      const containerWidth = container.clientWidth;
      const textWidth = el.scrollWidth;

      if (textWidth <= containerWidth) {
        bestFit = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    el.style.fontSize = `${bestFit}px`;
    heroTitleFontSize = bestFit;
  }

  // Effect: Auto-size title on mount and container resize
  $effect(() => {
    const el = heroTitleEl;
    const container = heroContainerEl;
    if (!el) return;

    requestAnimationFrame(fitTitle);

    const resizeObserver = new ResizeObserver(() => {
      fitTitle();
    });

    if (container) {
      resizeObserver.observe(container);
    }

    return () => resizeObserver.disconnect();
  });
</script>

<!-- Resize handler for title text fitting -->
<svelte:window onresize={fitTitle} />

<div class="h-full overflow-auto">
  <!-- Dashboard Hero (uses same component as Location pages) -->
  <LocationHero
    images={heroImages()}
    heroImgsha={dashboardHero?.imgsha || null}
    focalX={dashboardHero?.focalX ?? 0.5}
    focalY={dashboardHero?.focalY ?? 0.5}
  />

  <!-- Title overlaps hero gradient -->
  <div class="max-w-6xl mx-auto px-8 pb-4 relative z-20 -mt-10">
    <div bind:this={heroContainerEl} class="w-[88%] mx-auto text-center">
      <h1
        bind:this={heroTitleEl}
        class="hero-title font-bold uppercase leading-tight text-center mb-0"
        style="font-size: {heroTitleFontSize}px;"
      >
        Dashboard
      </h1>
    </div>
  </div>

  <div class="max-w-6xl mx-auto px-8 pt-6 pb-8">
  {#if loading}
    <!-- OPT-040: Premium skeleton loaders instead of "Loading..." text -->
    <div class="space-y-6">
      <!-- Stats skeleton -->
      <div class="flex justify-center gap-8 mb-8">
        {#each Array(5) as _}
          <div class="text-center space-y-1">
            <div class="skeleton-shimmer h-8 w-12 bg-gray-200 rounded mx-auto"></div>
            <div class="skeleton-shimmer h-3 w-16 bg-gray-200 rounded"></div>
          </div>
        {/each}
      </div>
      <!-- Projects skeleton -->
      <div class="bg-white rounded-lg shadow p-6">
        <div class="skeleton-shimmer h-5 w-24 bg-gray-200 rounded mb-4"></div>
        <SkeletonLoader type="row" count={3} />
      </div>
      <!-- Two-column skeleton -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="bg-white rounded-lg shadow p-6">
          <div class="skeleton-shimmer h-5 w-32 bg-gray-200 rounded mb-4"></div>
          <SkeletonLoader type="row" count={3} />
        </div>
        <div class="bg-white rounded-lg shadow p-6">
          <div class="skeleton-shimmer h-5 w-28 bg-gray-200 rounded mb-4"></div>
          <SkeletonLoader type="row" count={3} />
        </div>
      </div>
    </div>
  {:else}
    <!-- Active Import Status -->
    {#if $isImporting && $importProgress}
      <div class="mb-6">
        <div class="bg-white rounded-lg shadow p-6 border-l-4 border-accent">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 bg-accent rounded-full animate-pulse"></div>
              <h3 class="text-lg font-semibold text-foreground">Import In Progress</h3>
            </div>
            <span class="text-sm text-gray-500">
              {$importProgress.current} of {$importProgress.total} files
            </span>
          </div>
          <p class="text-sm text-gray-600 mb-2">
            Importing to <button onclick={() => router.navigate(`/location/${$importProgress.locid}`)} class="text-accent hover:underline font-medium">{$importProgress.locationName}</button>
          </p>
          {#if $importProgress.currentFilename}
            <p class="text-xs text-gray-500 mb-2 truncate" title={$importProgress.currentFilename}>
              Processing: {$importProgress.currentFilename}
            </p>
          {/if}
          <div class="w-full bg-gray-200 rounded-full h-3">
            <div
              class="bg-accent h-3 rounded-full transition-all duration-300 ease-out"
              style="width: {$importProgress.percent}%"
            ></div>
          </div>
          <p class="text-xs text-gray-500 mt-2">
            {$importProgress.percent}% complete
          </p>
        </div>
      </div>
    {/if}

    <!-- Recent Background Imports -->
    {#if $storeRecentImports.length > 0}
      <div class="mb-6">
        <div class="bg-white rounded-lg shadow p-6">
          <h3 class="text-lg font-semibold text-foreground mb-3">Recent Background Imports</h3>
          <div class="space-y-2">
            {#each $storeRecentImports.slice(0, 3) as job}
              <div class="flex items-center justify-between text-sm py-2 border-b border-gray-100 last:border-0">
                <div class="flex items-center gap-2">
                  <button onclick={() => router.navigate(`/location/${job.locid}`)} class="text-accent hover:underline">
                    {job.locationName}
                  </button>
                </div>
                <div class="text-gray-500 text-xs">
                  {#if job.status === 'completed'}
                    {job.imported} imported, {job.duplicates} duplicates
                  {:else}
                    <span class="text-red-500">{job.error || 'Failed'}</span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/if}

    <!-- Stats Row -->
    <div class="flex justify-center gap-8 mb-8">
      <div class="text-center">
        <div class="text-2xl font-bold text-accent">{formatCount(totalLocations)}</div>
        <div class="text-xs text-gray-500">locations</div>
      </div>
      <div class="text-center">
        <div class="text-2xl font-bold text-accent">{formatCount(totalImages)}</div>
        <div class="text-xs text-gray-500">images</div>
      </div>
      <div class="text-center">
        <div class="text-2xl font-bold text-accent">{formatCount(totalVideos)}</div>
        <div class="text-xs text-gray-500">videos</div>
      </div>
      <div class="text-center">
        <div class="text-2xl font-bold text-accent">{formatCount(totalDocuments)}</div>
        <div class="text-xs text-gray-500">documents</div>
      </div>
      <div class="text-center">
        <div class="text-2xl font-bold text-accent">{formatCount(totalBookmarks)}</div>
        <div class="text-xs text-gray-500">bookmarks</div>
      </div>
    </div>

    <!-- Projects (Pinned Locations) -->
    <div class="mb-6">
      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex justify-between items-center mb-3">
          <h3 class="text-lg font-semibold text-foreground">Projects</h3>
          <button onclick={() => router.navigate('/locations', undefined, { project: true })} class="text-xs text-accent hover:underline">
            show all
          </button>
        </div>
        {#if projects.length > 0}
          <div class="space-y-3">
            {#each projects as location}
              <button
                onclick={() => router.navigate(`/location/${location.locid}`)}
                class="flex items-center gap-4 w-full text-left px-3 py-3 rounded-lg hover:bg-gray-50 transition"
              >
                <div class="w-32 h-20 bg-gray-200 rounded-lg flex-shrink-0 overflow-hidden">
                  {#if location.heroThumbPath}
                    <img src={`media://${location.heroThumbPath}?v=${cacheVersion}`} alt="" class="w-full h-full object-cover" loading="lazy" width="128" height="80" />
                  {/if}
                </div>
                <div class="min-w-0">
                  <span class="text-base text-accent font-medium truncate block">{location.locnam}</span>
                  {#if location.address?.state}
                    <span class="text-sm text-gray-400">{location.address.state}</span>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        {:else}
          <p class="text-sm text-gray-400">No pinned locations yet</p>
        {/if}
      </div>
    </div>

    <!-- Recent Locations + Recent Imports -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
      <!-- Recent Locations -->
      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex justify-between items-center mb-3">
          <h3 class="text-lg font-semibold text-foreground">Recent Locations</h3>
          <button onclick={() => router.navigate('/locations')} class="text-xs text-accent hover:underline">
            show all
          </button>
        </div>
        {#if recentLocations.length > 0}
          <div class="space-y-3">
            {#each recentLocations as location}
              <button
                onclick={() => router.navigate(`/location/${location.locid}`)}
                class="flex items-center gap-4 w-full text-left px-2 py-2 rounded-lg hover:bg-gray-50 transition"
              >
                <div class="w-16 h-16 bg-gray-200 rounded-lg flex-shrink-0 overflow-hidden">
                  {#if location.heroThumbPath}
                    <img src={`media://${location.heroThumbPath}?v=${cacheVersion}`} alt="" class="w-full h-full object-cover" loading="lazy" width="64" height="64" />
                  {/if}
                </div>
                <div class="min-w-0">
                  <span class="text-sm text-accent font-medium truncate block">{location.locnam}</span>
                  {#if location.address?.state}
                    <span class="text-xs text-gray-400">{location.address.state}</span>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        {:else}
          <p class="text-sm text-gray-400">No recent locations</p>
        {/if}
      </div>

      <!-- Recent Imports -->
      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex justify-between items-center mb-3">
          <h3 class="text-lg font-semibold text-foreground">Recent Imports</h3>
          <button onclick={() => router.navigate('/imports')} class="text-xs text-accent hover:underline">
            show all
          </button>
        </div>
        {#if recentImports.length > 0}
          <div class="space-y-3">
            {#each recentImports as importRecord}
              <button
                onclick={() => importRecord.locid && router.navigate(`/location/${importRecord.locid}`)}
                class="flex items-center gap-4 w-full text-left px-2 py-2 rounded-lg hover:bg-gray-50 transition"
                disabled={!importRecord.locid}
              >
                <div class="w-16 h-16 bg-gray-200 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center text-gray-400 text-lg font-medium">
                  {#if importRecord.heroThumbPath}
                    <img src={`media://${importRecord.heroThumbPath}?v=${cacheVersion}`} alt="" class="w-full h-full object-cover" loading="lazy" width="64" height="64" />
                  {:else}
                    {importRecord.img_count + importRecord.vid_count + importRecord.doc_count}
                  {/if}
                </div>
                <div class="min-w-0">
                  <span class="text-sm text-accent font-medium truncate block">
                    {importRecord.locnam || `Import #${importRecord.import_id.slice(0, 8)}`}
                  </span>
                  <span class="text-xs text-gray-400">{formatDate(importRecord.import_date)}</span>
                </div>
              </button>
            {/each}
          </div>
        {:else}
          <p class="text-sm text-gray-400">No imports yet</p>
        {/if}
      </div>
    </div>

    <!-- Top Type + Top State (no thumbnails) -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Top Type -->
      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex justify-between items-center mb-3">
          <h3 class="text-lg font-semibold text-foreground">Top Type</h3>
          <button onclick={() => router.navigate('/locations')} class="text-xs text-accent hover:underline">
            show all
          </button>
        </div>
        {#if topTypes.length > 0}
          <div class="space-y-2">
            {#each topTypes as stat}
              <button
                onclick={() => router.navigate('/locations', undefined, { type: stat.type })}
                class="flex items-center justify-between w-full text-left px-2 py-2 rounded hover:bg-gray-50 transition"
              >
                <span class="text-sm text-accent font-medium truncate">{stat.type}</span>
                <span class="text-xs text-gray-500">{stat.count}</span>
              </button>
            {/each}
          </div>
        {:else}
          <p class="text-sm text-gray-400">No data yet</p>
        {/if}
      </div>

      <!-- Top State -->
      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex justify-between items-center mb-3">
          <h3 class="text-lg font-semibold text-foreground">Top State</h3>
          <button onclick={() => router.navigate('/locations')} class="text-xs text-accent hover:underline">
            show all
          </button>
        </div>
        {#if topStates.length > 0}
          <div class="space-y-2">
            {#each topStates as stat}
              <button
                onclick={() => router.navigate('/locations', undefined, { state: stat.state })}
                class="flex items-center justify-between w-full text-left px-2 py-2 rounded hover:bg-gray-50 transition"
              >
                <span class="text-sm text-accent font-medium truncate">{stat.state}</span>
                <span class="text-xs text-gray-500">{stat.count}</span>
              </button>
            {/each}
          </div>
        {:else}
          <p class="text-sm text-gray-400">No data yet</p>
        {/if}
      </div>
    </div>
  {/if}
</div>
</div>

<style>
  /* Hero title: auto-sized to fit container, matches LocationDetail styling */
  .hero-title {
    color: #454545;
    letter-spacing: 0.02em; /* Tight, premium spacing */
    word-spacing: -0.02em; /* Cohesive word blocks */
    font-weight: 800;
    text-wrap: balance; /* Balances word distribution across lines */
    /* Hand-painted sign style - hard offset shadow, accent gold */
    text-shadow: 3px 3px 0 rgba(185, 151, 92, 0.5);
  }

  /* OPT-040: Skeleton shimmer animation */
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
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
</style>
