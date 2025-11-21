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
  import { onMount } from 'svelte';
  import { router } from './stores/router';
  import Layout from './components/Layout.svelte';
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
{/if}
