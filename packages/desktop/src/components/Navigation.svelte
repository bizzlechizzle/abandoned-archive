<script lang="ts">
  /**
   * Navigation.svelte - Main sidebar navigation
   * DESIGN_SYSTEM: Updated with Ulm School / Functional Minimalism styling
   * - Typography-only wordmark (no logo)
   * - Design tokens for all colors
   * - Minimal, functional design
   */
  import { router } from '../stores/router';
  import { openImportModal } from '../stores/import-modal-store';
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

<nav class="nav-sidebar">
  <!-- macOS: Top padding for traffic light buttons (hiddenInset titlebar) -->
  <div class="pt-8">
    <!-- DESIGN_SYSTEM: Typography-only wordmark per DESIGN.md -->
    <div class="nav-header">
      <div class="app-wordmark">
        <span>ABANDONED</span>
        <span>ARCHIVE</span>
      </div>
    </div>
  </div>

  <!-- P1: New Location button - opens global import modal -->
  <div class="px-4 py-3">
    <button onclick={() => openImportModal()} class="btn-primary w-full">
      New Location
    </button>
  </div>

  <div class="flex-1 overflow-y-auto">
    <ul class="py-4">
      {#each menuItems as item}
        <li>
          <button
            onclick={() => navigate(item.path)}
            class="nav-item {isActive(item.path) ? 'nav-item-active' : ''}"
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
  <div class="nav-footer">
    <div class="flex justify-between items-center">
      <button
        onclick={() => navigate('/search')}
        class="nav-icon-btn {isActive('/search') ? 'nav-icon-btn-active' : ''}"
        title="Search"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span class="text-sm">Search</span>
      </button>
      <button
        onclick={() => navigate('/settings')}
        class="nav-icon-btn {isActive('/settings') ? 'nav-icon-btn-active' : ''}"
        title="Settings"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span class="text-sm">Settings</span>
      </button>
    </div>
  </div>
</nav>

<style>
  /* DESIGN_SYSTEM: Navigation uses design tokens */
  .nav-sidebar {
    width: 16rem; /* w-64 */
    height: 100vh;
    background: var(--color-surface);
    color: var(--color-text-primary);
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--color-border);
  }

  .nav-header {
    padding: var(--space-6);
    text-align: center;
  }

  /* DESIGN_SYSTEM: Typography-only wordmark per DESIGN.md */
  .app-wordmark {
    display: flex;
    flex-direction: column;
    font-size: var(--text-sm);
    font-weight: var(--font-semibold);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-text-primary);
    line-height: 1.4;
    text-align: center;
  }

  /* DESIGN_SYSTEM: Primary button style */
  .btn-primary {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-2) var(--space-4);
    background: var(--color-accent);
    color: var(--color-accent-text);
    border-radius: var(--radius-md);
    font-weight: var(--font-medium);
    font-size: var(--text-sm);
    transition: opacity var(--duration-fast) var(--ease-out);
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  /* DESIGN_SYSTEM: Navigation item styles */
  .nav-item {
    width: 100%;
    padding: var(--space-3) var(--space-6);
    text-align: left;
    transition: background-color var(--duration-fast) var(--ease-out);
    color: var(--color-text-secondary);
  }

  .nav-item:hover {
    background: var(--color-surface-elevated);
  }

  .nav-item-active {
    background: var(--color-surface-elevated);
    border-left: 4px solid var(--color-accent);
    color: var(--color-text-primary);
  }

  .nav-footer {
    padding: var(--space-4);
    border-top: 1px solid var(--color-border);
  }

  .nav-icon-btn {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-lg);
    color: var(--color-text-muted);
    transition: background-color var(--duration-fast) var(--ease-out);
  }

  .nav-icon-btn:hover {
    background: var(--color-surface-elevated);
    color: var(--color-text-secondary);
  }

  .nav-icon-btn-active {
    background: var(--color-surface-elevated);
    color: var(--color-text-primary);
  }
</style>
