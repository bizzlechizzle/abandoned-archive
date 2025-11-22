<script lang="ts">
  import { onMount } from 'svelte';

  let backupMessage = $state('');
  let backingUp = $state(false);
  let restoreMessage = $state('');
  let restoring = $state(false);
  let locationMessage = $state('');
  let changingLocation = $state(false);

  // Database location state
  let currentPath = $state('');
  let defaultPath = $state('');
  let isCustom = $state(false);
  let loading = $state(true);

  async function loadDatabaseLocation() {
    try {
      loading = true;
      if (!window.electronAPI?.database?.getLocation) {
        console.error('Database location API not available');
        return;
      }
      const location = await window.electronAPI.database.getLocation();
      currentPath = location.currentPath;
      defaultPath = location.defaultPath;
      isCustom = location.isCustom;
    } catch (error) {
      console.error('Error loading database location:', error);
    } finally {
      loading = false;
    }
  }

  async function backupDatabase() {
    try {
      backingUp = true;
      backupMessage = '';

      const result = await window.electronAPI.database.backup();

      if (result.success) {
        backupMessage = `Database backed up successfully to: ${result.path}`;
      } else {
        backupMessage = result.message || 'Backup canceled';
      }

      setTimeout(() => {
        backupMessage = '';
      }, 5000);
    } catch (error) {
      console.error('Error backing up database:', error);
      backupMessage = 'Error backing up database';
      setTimeout(() => {
        backupMessage = '';
      }, 5000);
    } finally {
      backingUp = false;
    }
  }

  async function restoreDatabase() {
    try {
      restoring = true;
      restoreMessage = '';

      const result = await window.electronAPI.database.restore();

      if (result.success) {
        restoreMessage = result.message;
        if (result.autoBackupPath) {
          restoreMessage += ` Current database backed up to: ${result.autoBackupPath}`;
        }
        // Message stays visible since user needs to restart
      } else {
        restoreMessage = result.message || 'Restore canceled';
        setTimeout(() => {
          restoreMessage = '';
        }, 5000);
      }
    } catch (error) {
      console.error('Error restoring database:', error);
      restoreMessage = 'Error restoring database';
      setTimeout(() => {
        restoreMessage = '';
      }, 5000);
    } finally {
      restoring = false;
    }
  }

  async function changeLocation() {
    try {
      changingLocation = true;
      locationMessage = '';

      const result = await window.electronAPI.database.changeLocation();

      if (result.success) {
        locationMessage = result.message;
        if (result.newPath) {
          currentPath = result.newPath;
          isCustom = true;
        }
        // Message stays visible since user needs to restart
      } else {
        locationMessage = result.message || 'Operation canceled';
        setTimeout(() => {
          locationMessage = '';
        }, 5000);
      }
    } catch (error) {
      console.error('Error changing database location:', error);
      locationMessage = 'Error changing database location';
      setTimeout(() => {
        locationMessage = '';
      }, 5000);
    } finally {
      changingLocation = false;
    }
  }

  async function resetLocation() {
    try {
      changingLocation = true;
      locationMessage = '';

      const result = await window.electronAPI.database.resetLocation();

      if (result.success) {
        locationMessage = result.message;
        if (result.newPath) {
          currentPath = result.newPath;
          isCustom = false;
        }
        // Message stays visible since user needs to restart
      } else {
        locationMessage = result.message || 'Operation canceled';
        setTimeout(() => {
          locationMessage = '';
        }, 5000);
      }
    } catch (error) {
      console.error('Error resetting database location:', error);
      locationMessage = 'Error resetting database location';
      setTimeout(() => {
        locationMessage = '';
      }, 5000);
    } finally {
      changingLocation = false;
    }
  }

  onMount(() => {
    loadDatabaseLocation();
  });
</script>

<div class="bg-white rounded-lg shadow p-6 mb-6">
  <h2 class="text-lg font-semibold mb-4 text-foreground">Database</h2>

  <div class="space-y-4">
    <!-- Database Location -->
    <div>
      <label class="block text-sm font-medium text-gray-700 mb-2">
        Database Location
      </label>
      {#if loading}
        <p class="text-sm text-gray-500">Loading...</p>
      {:else}
        <div class="flex gap-2 items-center">
          <input
            type="text"
            value={currentPath}
            readonly
            class="flex-1 px-3 py-2 border border-gray-300 rounded bg-gray-50 text-sm text-gray-700 font-mono"
          />
          <button
            onclick={changeLocation}
            disabled={changingLocation || backingUp || restoring}
            class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {changingLocation ? 'Changing...' : 'Change'}
          </button>
        </div>
        <div class="flex items-center justify-between mt-2">
          <p class="text-xs text-gray-500">
            {#if isCustom}
              Using custom location. Default: {defaultPath}
            {:else}
              Using default location
            {/if}
          </p>
          {#if isCustom}
            <button
              onclick={resetLocation}
              disabled={changingLocation || backingUp || restoring}
              class="text-xs text-blue-600 hover:text-blue-800 underline disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Reset to default
            </button>
          {/if}
        </div>
        {#if locationMessage}
          <p class="text-sm mt-2 {locationMessage.includes('Error') || locationMessage.includes('canceled') || locationMessage.includes('same') ? 'text-red-600' : 'text-green-600'}">
            {locationMessage}
          </p>
        {/if}
      {/if}
    </div>

    <!-- Divider -->
    <hr class="border-gray-200" />

    <!-- Backup -->
    <div>
      <button
        onclick={backupDatabase}
        disabled={backingUp || restoring || changingLocation}
        class="px-4 py-2 bg-gray-200 text-foreground rounded hover:bg-gray-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {backingUp ? 'Backing up...' : 'Backup Database'}
      </button>
      <p class="text-xs text-gray-500 mt-2">
        Create a backup of your location database
      </p>
      {#if backupMessage}
        <p class="text-sm mt-2 {backupMessage.includes('Error') || backupMessage.includes('canceled') ? 'text-red-600' : 'text-green-600'}">
          {backupMessage}
        </p>
      {/if}
    </div>

    <!-- Restore -->
    <div>
      <button
        onclick={restoreDatabase}
        disabled={restoring || backingUp || changingLocation}
        class="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {restoring ? 'Restoring...' : 'Restore Database'}
      </button>
      <p class="text-xs text-gray-500 mt-2">
        Restore database from a backup file. Your current database will be backed up automatically.
      </p>
      {#if restoreMessage}
        <p class="text-sm mt-2 {restoreMessage.includes('Error') || restoreMessage.includes('canceled') || restoreMessage.includes('Invalid') ? 'text-red-600' : 'text-green-600'}">
          {restoreMessage}
        </p>
      {/if}
    </div>
  </div>
</div>
