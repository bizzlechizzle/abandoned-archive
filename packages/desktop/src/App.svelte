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
   *
   * Migration 24: Added multi-user authentication flow
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
  // Migration 24: Login page
  import Login from './pages/Login.svelte';

  let currentRoute = $state({ path: '/dashboard', params: {} });
  let setupComplete = $state(false);
  let checkingSetup = $state(true);

  // Migration 24: Authentication state
  let isAuthenticated = $state(false);
  let requiresLogin = $state(false);
  let currentUserId = $state<string | null>(null);
  let currentUsername = $state<string | null>(null);

  // Import progress listener
  let unsubscribeProgress: (() => void) | null = null;
  // FIX 5.4: Backup status listener
  let unsubscribeBackup: (() => void) | null = null;

  /**
   * Migration 24: Check if login is required based on app mode and PIN settings
   */
  async function checkAuthRequired(): Promise<boolean> {
    if (!window.electronAPI?.settings || !window.electronAPI?.users) {
      return false;
    }

    try {
      const appMode = await window.electronAPI.settings.get('app_mode');

      // Single user mode: no login required
      if (appMode !== 'multi') {
        return false;
      }

      // Check if "always require login" is enabled
      const alwaysRequireLogin = await window.electronAPI.settings.get('require_login');
      if (alwaysRequireLogin === 'true') {
        return true;
      }

      // Multi-user mode: check if any user has a PIN set
      const hasAnyPin = await window.electronAPI.users.anyUserHasPin();
      return hasAnyPin;
    } catch (error) {
      console.error('Error checking auth requirement:', error);
      return false;
    }
  }

  /**
   * Migration 24: Handle successful login
   */
  function handleLogin(userId: string, username: string) {
    currentUserId = userId;
    currentUsername = username;
    isAuthenticated = true;

    // Save current user to settings
    if (window.electronAPI?.settings) {
      window.electronAPI.settings.set('current_user_id', userId);
      window.electronAPI.settings.set('current_user', username);
    }

    router.navigate('/dashboard');
  }

  /**
   * Migration 24: Auto-login when no PIN is required
   */
  async function autoLogin() {
    if (!window.electronAPI?.settings) return;

    try {
      const userId = await window.electronAPI.settings.get('current_user_id');
      const username = await window.electronAPI.settings.get('current_user');

      if (userId && username) {
        currentUserId = userId;
        currentUsername = username;

        // Update last login
        if (window.electronAPI.users) {
          await window.electronAPI.users.updateLastLogin(userId);
        }
      }

      isAuthenticated = true;
    } catch (error) {
      console.error('Error during auto-login:', error);
      isAuthenticated = true; // Still allow access on error
    }
  }

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
        return;
      }

      // Migration 24: Check authentication after setup
      if (setupComplete) {
        requiresLogin = await checkAuthRequired();

        if (!requiresLogin) {
          // Auto-login if no PIN required
          await autoLogin();
        }
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
{:else if !setupComplete}
  <Setup />
{:else if requiresLogin && !isAuthenticated}
  <!-- Migration 24: Show login page when PIN authentication is required -->
  <Login onLogin={handleLogin} />
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
