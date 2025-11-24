<script lang="ts">
  import { router } from '../stores/router';
  import { openImportModal } from '../stores/import-modal-store';
  import logo from '../assets/abandoned-upstate-logo.png';

  let currentRoute = $state('/dashboard');

  $effect(() => {
    const unsubscribe = router.subscribe((route) => {
      currentRoute = route.path;
    });
    return () => unsubscribe();
  });

  // P1/P7a: Navigation menu items - Atlas moved to top, Imports removed (replaced by modal)
  // Per v010steps.md: Atlas at top, still default to Dashboard on app load
  const menuItems = [
    { path: '/atlas', label: 'Atlas', icon: 'map' },
    { path: '/dashboard', label: 'Dashboard', icon: 'grid' },
    { path: '/locations', label: 'Locations', icon: 'list' },
    { path: '/browser', label: 'Browser', icon: 'globe' },
    { path: '/search', label: 'Search', icon: 'search' },
    { path: '/settings', label: 'Settings', icon: 'cog' },
  ];

  function navigate(path: string) {
    router.navigate(path);
  }

  function isActive(path: string): boolean {
    return currentRoute === path;
  }
</script>

<nav class="w-64 h-screen bg-background text-foreground flex flex-col border-r border-gray-200">
  <div class="p-6 border-b border-gray-200 text-center">
    <img src={logo} alt="Abandoned Upstate" class="h-20 w-auto mx-auto mb-2" />
    <p class="text-sm font-heading font-semibold text-accent tracking-wide">Archive Tool</p>
  </div>

  <!-- P1: New Location button - opens global import modal -->
  <div class="px-4 py-3 border-b border-gray-200">
    <button
      onclick={() => openImportModal()}
      class="w-full px-4 py-2 bg-accent text-white rounded-lg hover:opacity-90 transition font-medium text-sm flex items-center justify-center gap-2"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
      </svg>
      New Location
    </button>
  </div>

  <div class="flex-1 overflow-y-auto">
    <ul class="py-4">
      {#each menuItems as item}
        <li>
          <button
            onclick={() => navigate(item.path)}
            class="w-full px-6 py-3 text-left hover:bg-gray-100 transition-colors {isActive(item.path) ? 'bg-gray-100 border-l-4 border-accent' : ''}"
          >
            <span class="text-sm font-medium">{item.label}</span>
          </button>
        </li>
      {/each}
    </ul>
  </div>

  <div class="p-4 border-t border-gray-200 text-xs text-gray-400">
    v0.1.0
  </div>
</nav>

<style>
  .border-accent {
    border-color: #b9975c;
  }
</style>
