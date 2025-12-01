<script lang="ts">
  import { router } from '../stores/router';
  import { openImportModal } from '../stores/import-modal-store';
  import logo from '../assets/abandoned-upstate-logo.png';
  import SidebarImportProgress from './SidebarImportProgress.svelte';

  let currentRoute = $state('/dashboard');

  $effect(() => {
    const unsubscribe = router.subscribe((route) => {
      currentRoute = route.path;
    });
    return () => unsubscribe();
  });

  // Navigation order: Dashboard, Locations, Research, Atlas
  // Search and Settings in bottom icon bar
  const menuItems = [
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/locations', label: 'Locations' },
    { path: '/research', label: 'Research' },
    { path: '/atlas', label: 'Atlas' },
  ];

  function navigate(path: string) {
    router.navigate(path);
  }

  function isActive(path: string): boolean {
    return currentRoute === path;
  }
</script>

<nav class="w-64 h-screen bg-background text-foreground flex flex-col border-r border-gray-200">
  <!-- macOS: Top padding for traffic light buttons (hiddenInset titlebar) -->
  <div class="pt-8">
    <div class="p-6 border-b border-gray-200 text-center">
      <img src={logo} alt="Abandoned Upstate" class="h-20 w-auto mx-auto mb-2" />
      <p class="text-sm font-heading font-semibold text-accent tracking-wide">Archive Tool</p>
    </div>
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

  <!-- Import Progress: Shows above Search/Settings when importing -->
  <SidebarImportProgress />

  <!-- Bottom Icon Bar: Search and Settings -->
  <div class="p-4 border-t border-gray-200">
    <div class="flex justify-between items-center">
      <button
        onclick={() => navigate('/search')}
        class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors {isActive('/search') ? 'bg-gray-100' : ''}"
        title="Search"
      >
        <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span class="text-sm text-gray-600">Search</span>
      </button>
      <button
        onclick={() => navigate('/settings')}
        class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors {isActive('/settings') ? 'bg-gray-100' : ''}"
        title="Settings"
      >
        <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span class="text-sm text-gray-600">Settings</span>
      </button>
    </div>
  </div>
</nav>

<style>
  .border-accent {
    border-color: #b9975c;
  }
</style>
