<script lang="ts">
  import { onMount } from 'svelte';
  import DatabaseSettings from '../components/DatabaseSettings.svelte';
  import HealthMonitoring from '../components/HealthMonitoring.svelte';

  let archivePath = $state('');
  let deleteOriginals = $state(false);
  let currentUser = $state('default');
  let loading = $state(true);
  let saving = $state(false);
  let saveMessage = $state('');

  async function loadSettings() {
    try {
      loading = true;
      const settings = await window.electronAPI.settings.getAll();

      archivePath = settings.archive_folder || '';
      deleteOriginals = settings.delete_on_import === 'true';
      currentUser = settings.current_user || 'default';
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      loading = false;
    }
  }

  async function selectArchiveFolder() {
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
    try {
      saving = true;
      saveMessage = '';

      await Promise.all([
        window.electronAPI.settings.set('archive_folder', archivePath),
        window.electronAPI.settings.set('delete_on_import', deleteOriginals.toString()),
        window.electronAPI.settings.set('current_user', currentUser),
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
        <div class="flex items-center mb-4">
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
        <p class="text-xs text-gray-500">
          Original files will be moved to archive folder and deleted from source
        </p>
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
  {:else}
    <div class="text-center p-8">
      <p class="text-gray-600">Loading settings...</p>
    </div>
  {/if}
      <!-- User Management Section -->
</div>
