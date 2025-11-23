<script lang="ts">
  import { onMount } from 'svelte';
  import DatabaseSettings from '../components/DatabaseSettings.svelte';
  import HealthMonitoring from '../components/HealthMonitoring.svelte';

  let archivePath = $state('');
  let deleteOriginals = $state(false);
  let currentUser = $state('default');
  let loginRequired = $state(false);
  let importMap = $state(true);
  let mapImport = $state(true);
  let loading = $state(true);
  let saving = $state(false);
  let saveMessage = $state('');

  // Kanye6: Thumbnail regeneration state
  let regenerating = $state(false);
  let regenProgress = $state(0);
  let regenTotal = $state(0);
  let regenMessage = $state('');

  async function loadSettings() {
    try {
      loading = true;
      if (!window.electronAPI?.settings) {
        console.error('Electron API not available - preload script may have failed to load');
        return;
      }
      const settings = await window.electronAPI.settings.getAll();

      archivePath = settings.archive_folder || '';
      deleteOriginals = settings.delete_on_import === 'true';
      currentUser = settings.current_user || 'default';
      loginRequired = settings.login_required === 'true';
      importMap = settings.import_map !== 'false'; // Default true
      mapImport = settings.map_import !== 'false'; // Default true
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      loading = false;
    }
  }

  async function selectArchiveFolder() {
    if (!window.electronAPI?.dialog) return;
    try {
      const folder = await window.electronAPI.dialog.selectFolder();
      if (folder) {
        archivePath = folder;
      }
    } catch (error) {
      console.error('Error selecting folder:', error);
    }
  }

  async function saveSettings() {
    if (!window.electronAPI?.settings) return;
    try {
      saving = true;
      saveMessage = '';

      await Promise.all([
        window.electronAPI.settings.set('archive_folder', archivePath),
        window.electronAPI.settings.set('delete_on_import', deleteOriginals.toString()),
        window.electronAPI.settings.set('current_user', currentUser),
        window.electronAPI.settings.set('login_required', loginRequired.toString()),
        window.electronAPI.settings.set('import_map', importMap.toString()),
        window.electronAPI.settings.set('map_import', mapImport.toString()),
      ]);

      saveMessage = 'Settings saved successfully';
      setTimeout(() => {
        saveMessage = '';
      }, 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      saveMessage = 'Error saving settings';
    } finally {
      saving = false;
    }
  }

  /**
   * Kanye6: Regenerate thumbnails for all images missing multi-tier thumbnails
   * This repairs old imports that only have 256px thumbnails
   */
  async function regenerateThumbnails() {
    if (!window.electronAPI?.media?.regenerateAllThumbnails) {
      regenMessage = 'Thumbnail regeneration not available';
      return;
    }

    try {
      regenerating = true;
      regenProgress = 0;
      regenTotal = 0;
      regenMessage = 'Starting thumbnail regeneration...';

      const result = await window.electronAPI.media.regenerateAllThumbnails();

      if (result.total === 0) {
        regenMessage = 'All images already have thumbnails';
      } else {
        regenMessage = `Regenerated ${result.generated} of ${result.total} thumbnails (${result.failed} failed)`;
      }

      setTimeout(() => {
        regenMessage = '';
      }, 5000);
    } catch (error) {
      console.error('Thumbnail regeneration failed:', error);
      regenMessage = 'Thumbnail regeneration failed';
    } finally {
      regenerating = false;
    }
  }

  onMount(() => {
    loadSettings();
  });
</script>

<div class="p-8">
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-foreground mb-2">Settings</h1>
    <p class="text-gray-600">Configure application preferences</p>
  </div>

  {#if loading}
    <div class="max-w-2xl">
      <p class="text-gray-500">Loading settings...</p>
    </div>
  {:else}
    <div class="max-w-2xl">
      <div class="bg-white rounded-lg shadow p-6 mb-6">
        <h2 class="text-lg font-semibold mb-4 text-foreground">User</h2>
        <div class="mb-4">
          <label for="currentUser" class="block text-sm font-medium text-gray-700 mb-2">
            Current User
          </label>
          <input
            id="currentUser"
            type="text"
            bind:value={currentUser}
            placeholder="Enter your name"
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <p class="text-xs text-gray-500 mt-2">
            Used to track who added or modified locations
          </p>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow p-6 mb-6">
        <h2 class="text-lg font-semibold mb-4 text-foreground">Archive Folder</h2>
        <div class="mb-4">
          <label for="archivePath" class="block text-sm font-medium text-gray-700 mb-2">
            Location
          </label>
          <div class="flex gap-2">
            <input
              id="archivePath"
              type="text"
              bind:value={archivePath}
              placeholder="/path/to/archive"
              class="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <button
              onclick={selectArchiveFolder}
              class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition"
            >
              Browse
            </button>
          </div>
          <p class="text-xs text-gray-500 mt-2">
            Where imported media files will be stored
          </p>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow p-6 mb-6">
        <h2 class="text-lg font-semibold mb-4 text-foreground">Import Options</h2>
        <div class="space-y-3">
          <div class="flex items-center">
            <input
              type="checkbox"
              bind:checked={deleteOriginals}
              id="deleteOriginals"
              class="mr-2"
            />
            <label for="deleteOriginals" class="text-sm text-gray-700">
              Delete original files after import
            </label>
          </div>
          <p class="text-xs text-gray-500 ml-6">
            Original files will be moved to archive folder and deleted from source
          </p>

          <div class="flex items-center">
            <input
              type="checkbox"
              bind:checked={importMap}
              id="importMap"
              class="mr-2"
            />
            <label for="importMap" class="text-sm text-gray-700">
              Show map during import
            </label>
          </div>
          <p class="text-xs text-gray-500 ml-6">
            Display a map to pin location GPS during import
          </p>

          <div class="flex items-center">
            <input
              type="checkbox"
              bind:checked={mapImport}
              id="mapImport"
              class="mr-2"
            />
            <label for="mapImport" class="text-sm text-gray-700">
              Enable map-based import
            </label>
          </div>
          <p class="text-xs text-gray-500 ml-6">
            Allow creating locations directly from the map
          </p>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow p-6 mb-6">
        <h2 class="text-lg font-semibold mb-4 text-foreground">Security</h2>
        <div class="flex items-center mb-4">
          <input
            type="checkbox"
            bind:checked={loginRequired}
            id="loginRequired"
            class="mr-2"
          />
          <label for="loginRequired" class="text-sm text-gray-700">
            Require login at startup
          </label>
        </div>
        <p class="text-xs text-gray-500">
          Prompt for user authentication when the application starts
        </p>
      </div>

      <!-- Kanye6: Maintenance Section for Thumbnail Regeneration -->
      <div class="bg-white rounded-lg shadow p-6 mb-6">
        <h2 class="text-lg font-semibold mb-4 text-foreground">Maintenance</h2>
        <div class="space-y-4">
          <div>
            <p class="text-sm text-gray-700 mb-2">
              Regenerate thumbnails for images imported before the multi-tier system.
              This creates 400px, 800px, and 1920px versions for better quality display.
            </p>
            <div class="flex items-center gap-4">
              <button
                onclick={regenerateThumbnails}
                disabled={regenerating}
                class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50"
              >
                {regenerating ? 'Regenerating...' : 'Regenerate All Thumbnails'}
              </button>
              {#if regenMessage}
                <span class="text-sm text-gray-600">{regenMessage}</span>
              {/if}
            </div>
            <p class="text-xs text-gray-500 mt-2">
              This may take a while for large archives. RAW files (NEF, CR2, etc.) will have previews extracted first.
            </p>
          </div>
        </div>
      </div>

      <DatabaseSettings />

      <HealthMonitoring />

      <button
        onclick={saveSettings}
        disabled={saving}
        class="px-6 py-2 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  {/if}
</div>
