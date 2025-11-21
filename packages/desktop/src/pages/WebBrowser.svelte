<script lang="ts">
  /**
   * WebBrowser.svelte - Integrated web browser per page_web-browser.md spec
   *
   * Per spec:
   * - embedded browser
   * - right side toolbar with:
   *   - save bookmark (with search/autofill based on database)
   *   - recents (list top 5)
   *   - projects/pinned (list top 5 - refers to favorite locations)
   *   - uploads (list top 5)
   *   - save - add new buttons
   *   - bookmark browser by state/type/location
   */
  import { onMount, onDestroy } from 'svelte';
  import type { Location } from '@au-archive/core';

  interface Bookmark {
    bookmark_id: string;
    url: string;
    title: string | null;
    locid: string | null;
    created_date: string;
  }

  interface ImportRecord {
    import_id: string;
    locid: string | null;
    import_date: string;
    img_count: number;
    vid_count: number;
  }

  // Browser state
  let currentUrl = $state('https://maps.google.com');
  let urlInput = $state('https://maps.google.com');
  let pageTitle = $state('');
  let isLoading = $state(false);
  let browserContainerRef: HTMLDivElement;

  // Sidebar state
  let searchQuery = $state('');
  let recentBookmarks = $state<Bookmark[]>([]);
  let pinnedLocations = $state<Location[]>([]);
  let recentUploads = $state<ImportRecord[]>([]);
  let showSaveBookmark = $state(false);
  let bookmarkLocid = $state<string | null>(null);
  let bookmarkTitle = $state('');
  let autocompleteResults = $state<Location[]>([]);
  let locationSearchQuery = $state('');
  let savingBookmark = $state(false);

  let cleanupFunctions: Array<() => void> = [];
  let resizeObserver: ResizeObserver | null = null;

  onMount(async () => {
    // Set up browser event listeners
    if (window.electronAPI?.browser) {
      cleanupFunctions.push(
        window.electronAPI.browser.onNavigated((url: string) => {
          currentUrl = url;
          urlInput = url;
        })
      );
      cleanupFunctions.push(
        window.electronAPI.browser.onTitleChanged((title: string) => {
          pageTitle = title;
          bookmarkTitle = title;
        })
      );
      cleanupFunctions.push(
        window.electronAPI.browser.onLoadingChanged((loading: boolean) => {
          isLoading = loading;
        })
      );

      // Set up resize observer for browser container
      if (browserContainerRef) {
        resizeObserver = new ResizeObserver(() => {
          updateBrowserBounds();
        });
        resizeObserver.observe(browserContainerRef);
      }

      // Initial positioning and navigation
      await updateBrowserBounds();
      await window.electronAPI.browser.navigate(currentUrl);
    }

    // Load sidebar data
    await loadSidebarData();
  });

  onDestroy(() => {
    // Clean up event listeners
    cleanupFunctions.forEach(fn => fn());

    // Clean up resize observer
    if (resizeObserver) {
      resizeObserver.disconnect();
    }

    // Hide browser view when leaving page
    window.electronAPI?.browser?.hide();
  });

  async function updateBrowserBounds() {
    if (!browserContainerRef || !window.electronAPI?.browser) return;

    const rect = browserContainerRef.getBoundingClientRect();
    await window.electronAPI.browser.show({
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    });
  }

  async function loadSidebarData() {
    if (!window.electronAPI) return;

    try {
      // Load recent bookmarks (top 5) per spec
      if (window.electronAPI.bookmarks) {
        recentBookmarks = (await window.electronAPI.bookmarks.findRecent(5)) as Bookmark[];
      }

      // Load pinned/favorite locations (top 5) - "projects" in spec means pinned items
      if (window.electronAPI.locations) {
        pinnedLocations = (await window.electronAPI.locations.favorites()).slice(0, 5);
      }

      // Load recent uploads (top 5) per spec
      if (window.electronAPI.imports) {
        recentUploads = (await window.electronAPI.imports.findRecent(5)) as ImportRecord[];
      }
    } catch (error) {
      console.error('Error loading sidebar data:', error);
    }
  }

  async function navigate() {
    if (!window.electronAPI?.browser) return;

    let url = urlInput.trim();
    if (!url) return;

    // Add protocol if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    await window.electronAPI.browser.navigate(url);
  }

  async function goBack() {
    await window.electronAPI?.browser?.goBack();
  }

  async function goForward() {
    await window.electronAPI?.browser?.goForward();
  }

  async function reload() {
    await window.electronAPI?.browser?.reload();
  }

  async function handleLocationSearch() {
    if (!locationSearchQuery.trim() || !window.electronAPI?.locations) {
      autocompleteResults = [];
      return;
    }

    try {
      // Search locations for autocomplete - per spec "autofill based on database"
      const results = await window.electronAPI.locations.findAll({ search: locationSearchQuery });
      autocompleteResults = results.slice(0, 10);
    } catch (error) {
      console.error('Error searching locations:', error);
    }
  }

  function selectLocation(loc: Location) {
    bookmarkLocid = loc.locid;
    locationSearchQuery = loc.locnam;
    autocompleteResults = [];
  }

  async function saveBookmark() {
    if (!window.electronAPI?.bookmarks) return;

    try {
      savingBookmark = true;
      await window.electronAPI.bookmarks.create({
        url: currentUrl,
        title: bookmarkTitle || pageTitle || null,
        locid: bookmarkLocid,
        auth_imp: null,
      });
      showSaveBookmark = false;
      bookmarkLocid = null;
      locationSearchQuery = '';
      bookmarkTitle = '';
      // Reload sidebar data to show new bookmark
      await loadSidebarData();
    } catch (error) {
      console.error('Error saving bookmark:', error);
    } finally {
      savingBookmark = false;
    }
  }

  function openBookmark(url: string) {
    urlInput = url;
    navigate();
  }

  function handleKeyPress(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      navigate();
    }
  }
</script>

<div class="h-full flex">
  <!-- Browser Area -->
  <div class="flex-1 flex flex-col">
    <!-- Browser Toolbar -->
    <div class="bg-gray-100 border-b border-gray-200 px-3 py-2 flex items-center gap-2">
      <button
        onclick={goBack}
        class="p-1.5 hover:bg-gray-200 rounded transition"
        title="Back"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <button
        onclick={goForward}
        class="p-1.5 hover:bg-gray-200 rounded transition"
        title="Forward"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
      <button
        onclick={reload}
        class="p-1.5 hover:bg-gray-200 rounded transition"
        title="Reload"
      >
        <svg class="w-4 h-4 {isLoading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>

      <div class="flex-1 flex">
        <input
          type="text"
          bind:value={urlInput}
          onkeypress={handleKeyPress}
          class="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-l focus:outline-none focus:ring-1 focus:ring-accent"
          placeholder="Enter URL..."
        />
        <button
          onclick={navigate}
          class="px-4 py-1.5 bg-accent text-white text-sm rounded-r hover:opacity-90 transition"
        >
          Go
        </button>
      </div>

      {#if isLoading}
        <span class="text-xs text-gray-500">Loading...</span>
      {/if}
    </div>

    <!-- Browser View Container -->
    <div bind:this={browserContainerRef} class="flex-1 bg-white relative">
      <!-- BrowserView will be positioned here by Electron -->
      {#if !window.electronAPI?.browser}
        <div class="absolute inset-0 flex items-center justify-center bg-gray-50">
          <div class="text-center p-8">
            <p class="text-gray-500 mb-2">Browser API not available</p>
            <p class="text-sm text-gray-400">The integrated browser requires the Electron API to be loaded</p>
          </div>
        </div>
      {/if}
    </div>
  </div>

  <!-- Right Sidebar Toolbar - per spec page_web-browser.md -->
  <aside class="w-80 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
    <div class="p-4 border-b border-gray-200">
      <h2 class="text-lg font-semibold text-foreground">Research Tools</h2>
    </div>

    <div class="flex-1 overflow-y-auto p-4 space-y-6">
      <!-- Save Bookmark Section - per spec: save bookmark with buttons -->
      <div>
        <button
          onclick={() => { showSaveBookmark = !showSaveBookmark; bookmarkTitle = pageTitle; }}
          class="w-full px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition text-sm font-medium"
        >
          Save Bookmark
        </button>

        {#if showSaveBookmark}
          <div class="mt-3 p-3 bg-gray-50 rounded border space-y-3">
            <div>
              <p class="text-xs text-gray-600 mb-1 truncate" title={currentUrl}>{currentUrl}</p>
            </div>

            <div>
              <label for="bookmark-title" class="block text-xs text-gray-700 mb-1">Title</label>
              <input
                id="bookmark-title"
                type="text"
                bind:value={bookmarkTitle}
                placeholder="Bookmark title"
                class="w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            <!-- Per spec: search with autofill based on database -->
            <div>
              <label for="location-search" class="block text-xs text-gray-700 mb-1">Link to Location (optional)</label>
              <input
                id="location-search"
                type="text"
                bind:value={locationSearchQuery}
                oninput={handleLocationSearch}
                placeholder="Search locations..."
                class="w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-accent"
              />

              {#if autocompleteResults.length > 0}
                <div class="max-h-32 overflow-y-auto border rounded mt-1 bg-white">
                  {#each autocompleteResults as loc}
                    <button
                      onclick={() => selectLocation(loc)}
                      class="w-full text-left px-2 py-1 text-sm hover:bg-gray-100 truncate"
                    >
                      {loc.locnam}
                      {#if loc.address?.state}
                        <span class="text-gray-400 text-xs">({loc.address.state})</span>
                      {/if}
                    </button>
                  {/each}
                </div>
              {/if}

              {#if bookmarkLocid}
                <p class="text-xs text-green-600 mt-1">Linked to: {locationSearchQuery}</p>
              {/if}
            </div>

            <div class="flex gap-2">
              <button
                onclick={saveBookmark}
                disabled={savingBookmark}
                class="flex-1 px-3 py-1.5 bg-accent text-white text-sm rounded hover:opacity-90 disabled:opacity-50 transition"
              >
                {savingBookmark ? 'Saving...' : 'Save'}
              </button>
              <button
                onclick={() => { showSaveBookmark = false; bookmarkLocid = null; locationSearchQuery = ''; }}
                class="px-3 py-1.5 bg-gray-200 text-sm rounded hover:bg-gray-300 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        {/if}
      </div>

      <!-- Recents Section - per spec: recents list top 5 -->
      <div>
        <h3 class="text-sm font-medium text-gray-700 mb-2">Recents</h3>
        {#if recentBookmarks.length === 0}
          <p class="text-xs text-gray-400">No recent bookmarks</p>
        {:else}
          <div class="space-y-1">
            {#each recentBookmarks as bookmark}
              <button
                onclick={() => openBookmark(bookmark.url)}
                class="w-full text-left px-2 py-1.5 text-sm bg-gray-50 rounded hover:bg-gray-100 truncate transition"
                title={bookmark.url}
              >
                {bookmark.title || bookmark.url}
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Pinned/Favorites Section - per spec: "projects" means pinned items, list top 5 -->
      <div>
        <h3 class="text-sm font-medium text-gray-700 mb-2">Pinned Locations</h3>
        {#if pinnedLocations.length === 0}
          <p class="text-xs text-gray-400">No pinned locations</p>
        {:else}
          <div class="space-y-1">
            {#each pinnedLocations as loc}
              <div class="px-2 py-1.5 text-sm bg-gray-50 rounded">
                <span class="truncate block">{loc.locnam}</span>
                {#if loc.address?.state}
                  <span class="text-xs text-gray-400">{loc.address.state}</span>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Uploads Section - per spec: uploads list top 5 -->
      <div>
        <h3 class="text-sm font-medium text-gray-700 mb-2">Recent Uploads</h3>
        {#if recentUploads.length === 0}
          <p class="text-xs text-gray-400">No recent uploads</p>
        {:else}
          <div class="space-y-1">
            {#each recentUploads as upload}
              <div class="px-2 py-1.5 text-sm bg-gray-50 rounded">
                <span class="text-xs text-gray-600">
                  {new Date(upload.import_date).toLocaleDateString()}
                </span>
                <span class="text-xs text-gray-400 ml-1">
                  ({upload.img_count || 0} imgs, {upload.vid_count || 0} vids)
                </span>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Quick Links -->
      <div>
        <h3 class="text-sm font-medium text-gray-700 mb-2">Quick Links</h3>
        <div class="space-y-1">
          <button
            onclick={() => { urlInput = 'https://maps.google.com'; navigate(); }}
            class="w-full text-left px-2 py-1.5 text-sm bg-gray-50 rounded hover:bg-gray-100 transition"
          >
            Google Maps
          </button>
          <button
            onclick={() => { urlInput = 'https://www.historicaerials.com'; navigate(); }}
            class="w-full text-left px-2 py-1.5 text-sm bg-gray-50 rounded hover:bg-gray-100 transition"
          >
            Historic Aerials
          </button>
          <button
            onclick={() => { urlInput = 'https://www.google.com'; navigate(); }}
            class="w-full text-left px-2 py-1.5 text-sm bg-gray-50 rounded hover:bg-gray-100 transition"
          >
            Google Search
          </button>
        </div>
      </div>
    </div>
  </aside>
</div>
