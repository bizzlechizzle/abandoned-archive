<script lang="ts">
  let searchQuery = $state('');
  let bookmarks = $state<Array<{ url: string; title: string; locid?: string }>>([
    { url: 'https://maps.google.com', title: 'Google Maps' },
    { url: 'https://www.historicaerials.com', title: 'Historic Aerials' },
    { url: 'https://www.google.com/search', title: 'Google Search' }
  ]);

  function openUrl(url: string) {
    if (window.electronAPI?.shell) {
      window.electronAPI.shell.openExternal(url);
    }
  }
</script>

<div class="h-full flex">
  <div class="flex-1 flex flex-col items-center justify-center bg-gray-50">
    <div class="max-w-2xl p-8 text-center">
      <h1 class="text-3xl font-bold mb-4 text-foreground">Web Browser</h1>
      <p class="text-gray-600 mb-6">
        The integrated web browser feature is planned for v0.2.0.
      </p>
      <p class="text-gray-600 mb-8">
        For now, use the quick links on the right to open research tools in your system browser.
      </p>
      <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h2 class="text-lg font-semibold mb-3 text-foreground">v0.2.0 Planned Features</h2>
        <ul class="text-left text-sm text-gray-600 space-y-2">
          <li>Integrated browser with BrowserView API</li>
          <li>Persistent bookmarks with location association</li>
          <li>Screenshot capture to location</li>
          <li>Web page archiving (HTML snapshot)</li>
          <li>Research session tracking</li>
        </ul>
      </div>
    </div>
  </div>

  <aside class="w-80 bg-white border-l border-gray-200 overflow-y-auto">
    <div class="p-4">
      <h2 class="text-lg font-semibold mb-4 text-foreground">Research Tools</h2>

      <div class="mb-6">
        <h3 class="text-sm font-medium text-gray-700 mb-2">Search Locations</h3>
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search database..."
          class="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      <div class="mb-6">
        <h3 class="text-sm font-medium text-gray-700 mb-2">Quick Links</h3>
        <div class="space-y-2">
          {#each bookmarks as bookmark}
            <button
              onclick={() => openUrl(bookmark.url)}
              class="w-full text-left px-3 py-2 text-sm bg-gray-50 rounded hover:bg-gray-100 truncate"
            >
              {bookmark.title}
            </button>
          {/each}
        </div>
      </div>

      <div class="bg-blue-50 border border-blue-200 rounded p-3">
        <p class="text-xs text-blue-800">
          Links open in your default system browser. Integrated browser coming in v0.2.0.
        </p>
      </div>
    </div>
  </aside>
</div>
