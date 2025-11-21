<script lang="ts">
  import { router } from '../stores/router';
  import logo from '../assets/abandoned-upstate-logo.png';

  let currentRoute = $state('/dashboard');

  $effect(() => {
    const unsubscribe = router.subscribe((route) => {
      currentRoute = route.path;
    });
    return () => unsubscribe();
  });

  // Per spec in desktop_app.md: left menu items
  // #page_dashboard, #page_locations, #page_web-browser, #page_imports, #page_search, #page_settings, #page_atlas
  // Note: "Projects" in dashboard spec means pinned/favorite items shown on dashboard, not a separate section
  // Note: Bookmarks are part of the browser sidebar per page_web-browser.md spec
  const menuItems = [
    { path: '/dashboard', label: 'Dashboard', icon: 'grid' },
    { path: '/locations', label: 'Locations', icon: 'list' },
    { path: '/browser', label: 'Browser', icon: 'globe' },
    { path: '/imports', label: 'Imports', icon: 'upload' },
    { path: '/search', label: 'Search', icon: 'search' },
    { path: '/settings', label: 'Settings', icon: 'cog' },
    { path: '/atlas', label: 'Atlas', icon: 'map' }
  ];

  function navigate(path: string) {
    router.navigate(path);
  }

  function isActive(path: string): boolean {
    return currentRoute === path;
  }
</script>

<nav class="w-64 h-screen bg-gray-800 text-white flex flex-col">
  <div class="p-4 border-b border-gray-700">
    <img src={logo} alt="Abandoned Upstate" class="h-12 w-auto mb-1" />
    <p class="text-xs text-gray-400">Archive</p>
  </div>

  <div class="flex-1 overflow-y-auto">
    <ul class="py-4">
      {#each menuItems as item}
        <li>
          <button
            onclick={() => navigate(item.path)}
            class="w-full px-6 py-3 text-left hover:bg-gray-700 transition-colors {isActive(item.path) ? 'bg-gray-700 border-l-4 border-accent' : ''}"
          >
            <span class="text-sm font-medium">{item.label}</span>
          </button>
        </li>
      {/each}
    </ul>
  </div>

  <div class="p-4 border-t border-gray-700 text-xs text-gray-400">
    v0.1.0
  </div>
</nav>

<style>
  .border-accent {
    border-color: #b9975c;
  }
</style>
