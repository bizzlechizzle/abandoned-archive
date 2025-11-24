<script lang="ts">
  /**
   * App.svelte - Main application component
   *
   * Per spec in desktop_app.md, pages are:
   * - page_dashboard, page_locations, page_web-browser, page_imports,
   *   page_search, page_settings, page_atlas
   * - page_location, page_sublocation, page_hostlocation
   *
   * Note: "Projects" in the dashboard spec means pinned/favorite items,
   * NOT a separate Projects page. Favorites are accessed via locations.
   */
  import { onMount, onDestroy } from 'svelte';
  import { router } from './stores/router';
  import { importStore } from './stores/import-store';
  // FIX 5.4: Import toast store for backup notifications
  import { toasts } from './stores/toast-store';
  import Layout from './components/Layout.svelte';
  import ImportProgress from './components/ImportProgress.svelte';
  // FIX 4.6: Toast notification system
  import ToastContainer from './components/ToastContainer.svelte';
  // P1: Global import modal
  import ImportModal from './components/ImportModal.svelte';
  import Dashboard from './pages/Dashboard.svelte';
  import Locations from './pages/Locations.svelte';
  import Atlas from './pages/Atlas.svelte';
  import Imports from './pages/Imports.svelte';
  import Settings from './pages/Settings.svelte';
  import Search from './pages/Search.svelte';
  import WebBrowser from './pages/WebBrowser.svelte';
  import LocationDetail from './pages/LocationDetail.svelte';
  import Setup from './pages/Setup.svelte';

  let currentRoute = $state({ path: '/dashboard', params: {} });
  let setupComplete = $state(false);
  let checkingSetup = $state(true);

  // Import progress listener
  let unsubscribeProgress: (() => void) | null = null;
  // FIX 5.4: Backup status listener
  let unsubscribeBackup: (() => void) | null = null;

  async function checkFirstRun() {
    try {
      if (!window.electronAPI?.settings) {
        console.error('Electron API not available - preload script may have failed to load');
        setupComplete = false;
        return;
      }
      const setupStatus = await window.electronAPI.settings.get('setup_complete');
      setupComplete = setupStatus === 'true';

      if (!setupComplete && currentRoute.path !== '/setup') {
        router.navigate('/setup');
      }
    } catch (error) {
      console.error('Error checking setup status:', error);
    } finally {
      checkingSetup = false;
    }
  }

  onMount(() => {
    router.init();
    checkFirstRun();

    // Subscribe to import progress events from main process
    // FIX 4.1 & 4.3: Pass filename and importId to updateProgress
    if (window.electronAPI?.media?.onImportProgress) {
      unsubscribeProgress = window.electronAPI.media.onImportProgress((progress) => {
        importStore.updateProgress(progress.current, progress.total, progress.filename, progress.importId);
      });
    }

    // FIX 5.4: Subscribe to backup status events from main process
    if (window.electronAPI?.backup?.onStatus) {
      unsubscribeBackup = window.electronAPI.backup.onStatus((status) => {
        if (status.success) {
          toasts.success(status.message, 5000);
        } else {
          toasts.error(status.message, 10000); // Longer duration for errors
        }
      });
    }
  });

  onDestroy(() => {
    if (unsubscribeProgress) {
      unsubscribeProgress();
    }
    // FIX 5.4: Cleanup backup listener
    if (unsubscribeBackup) {
      unsubscribeBackup();
    }
  });

  $effect(() => {
    const unsubscribe = router.subscribe((route) => {
      currentRoute = route;
    });
    return () => unsubscribe();
  });
</script>

{#if checkingSetup}
  <div class="min-h-screen flex items-center justify-center bg-gray-50">
    <div class="text-center">
      <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-accent mb-4"></div>
      <p class="text-gray-600">Loading...</p>
    </div>
  </div>
{:else if currentRoute.path === '/setup'}
  <Setup />
{:else}
  <Layout>
    {#snippet children()}
      {#if currentRoute.path === '/dashboard'}
        <Dashboard />
      {:else if currentRoute.path === '/locations'}
        <Locations />
      {:else if currentRoute.path === '/atlas'}
        <Atlas />
      {:else if currentRoute.path === '/imports'}
        <Imports />
      {:else if currentRoute.path === '/search'}
        <Search />
      {:else if currentRoute.path === '/browser'}
        <WebBrowser />
      {:else if currentRoute.path === '/settings'}
        <Settings />
      {:else if currentRoute.path === '/location/:id'}
        <LocationDetail locationId={currentRoute.params?.id || ''} />
      {:else}
        <Dashboard />
      {/if}
    {/snippet}
  </Layout>
  <!-- Global floating import progress indicator -->
  <ImportProgress />
  <!-- FIX 4.6: Global toast notifications -->
  <ToastContainer />
  <!-- P1: Global import modal -->
  <ImportModal />
{/if}
