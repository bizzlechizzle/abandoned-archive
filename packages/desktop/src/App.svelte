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
  // ImportProgress moved to Navigation sidebar (SidebarImportProgress.svelte)
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
  import Research from './pages/Research.svelte';
  import LocationDetail from './pages/LocationDetail.svelte';
  // SubLocationDetail merged into LocationDetail (Phase 3)
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
  // FIX: Import started listener (receives importId immediately for cancel to work)
  let unsubscribeStarted: (() => void) | null = null;
  // FIX 5.4: Backup status listener
  let unsubscribeBackup: (() => void) | null = null;

  // DESIGN_SYSTEM: System theme change listener
  let mediaQueryListener: ((e: MediaQueryListEvent) => void) | null = null;

  /**
   * DESIGN_SYSTEM: Apply theme to document root
   * Called before first paint to prevent flash of wrong theme
   */
  function applyTheme(theme: 'dark' | 'light' | 'system') {
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }

  /**
   * DESIGN_SYSTEM: Initialize theme on app startup
   * Loads saved preference and applies before first paint
   */
  async function initializeTheme() {
    try {
      if (window.electronAPI?.settings) {
        const savedTheme = await window.electronAPI.settings.get('theme');
        const theme = (savedTheme as 'dark' | 'light' | 'system') || 'light';
        applyTheme(theme);

        // If using system theme, listen for OS theme changes
        if (theme === 'system') {
          const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
          mediaQueryListener = (e: MediaQueryListEvent) => {
            document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
          };
          mediaQuery.addEventListener('change', mediaQueryListener);
        }
      } else {
        // Default to light if settings not available
        document.documentElement.setAttribute('data-theme', 'light');
      }
    } catch (error) {
      console.error('Error initializing theme:', error);
      // Default to light on error
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }

  /**
   * Check if login is required based on user setting
   */
  async function checkAuthRequired(): Promise<boolean> {
    if (!window.electronAPI?.settings || !window.electronAPI?.users) {
      return false;
    }

    try {
      const requireLogin = await window.electronAPI.settings.get('require_login');
      return requireLogin === 'true';
    } catch (error) {
      console.error('Error checking auth requirement:', error);
      return false;
    }
  }

  /**
   * Handle successful login from Login page
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
   * Handle setup completion - authenticate user directly
   * User just created their account, no need to ask for login immediately
   */
  function handleSetupComplete(userId: string, username: string) {
    setupComplete = true;
    currentUserId = userId;
    currentUsername = username;
    isAuthenticated = true;
    requiresLogin = false; // Don't show login after fresh setup

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
    // DESIGN_SYSTEM: Initialize theme before first paint
    initializeTheme();

    router.init();
    checkFirstRun();

    // FIX: Subscribe to import started event (receives importId immediately for cancel to work)
    if (window.electronAPI?.media?.onImportStarted) {
      unsubscribeStarted = window.electronAPI.media.onImportStarted((data) => {
        importStore.setImportId(data.importId);
      });
    }

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

    // BagIt: Schedule validation if due (weekly background check)
    if (window.electronAPI?.bagit?.scheduleValidation) {
      window.electronAPI.bagit.scheduleValidation().catch((err: Error) => {
        console.warn('[BagIt] Failed to schedule validation:', err);
        // Non-fatal - don't show error to user
      });
    }
  });

  onDestroy(() => {
    if (unsubscribeStarted) {
      unsubscribeStarted();
    }
    if (unsubscribeProgress) {
      unsubscribeProgress();
    }
    // FIX 5.4: Cleanup backup listener
    if (unsubscribeBackup) {
      unsubscribeBackup();
    }
    // DESIGN_SYSTEM: Cleanup system theme listener
    if (mediaQueryListener) {
      window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', mediaQueryListener);
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
  <!-- DESIGN_SYSTEM: Use design tokens for loading screen -->
  <div class="min-h-screen flex items-center justify-center bg-[var(--color-bg)]">
    <div class="text-center">
      <div class="inline-block rounded-full h-12 w-12 border-b-2 border-[var(--color-accent)] mb-4"></div>
      <p class="text-[var(--color-text-muted)]">Loading...</p>
    </div>
  </div>
{:else if currentRoute.path === '/setup'}
  <Setup onComplete={handleSetupComplete} />
{:else if !setupComplete}
  <Setup onComplete={handleSetupComplete} />
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
      {:else if currentRoute.path === '/research'}
        <Research />
      {:else if currentRoute.path === '/settings'}
        <Settings />
      {:else if currentRoute.path === '/location/:id'}
        <LocationDetail locationId={currentRoute.params?.id || ''} />
      {:else if currentRoute.path === '/location/:locid/sub/:subid'}
        <!-- Unified: LocationDetail handles both location and sub-location views -->
        <LocationDetail locationId={currentRoute.params?.locid || ''} subId={currentRoute.params?.subid || ''} />
      {:else}
        <Dashboard />
      {/if}
    {/snippet}
  </Layout>
  <!-- Import progress moved to sidebar (SidebarImportProgress in Navigation.svelte) -->
  <!-- FIX 4.6: Global toast notifications -->
  <ToastContainer />
  <!-- P1: Global import modal -->
  <ImportModal />
{/if}
