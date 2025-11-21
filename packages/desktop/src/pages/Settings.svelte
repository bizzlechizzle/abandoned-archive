<script lang="ts">
  import { onMount } from 'svelte';

  let archivePath = $state('');
  let deleteOriginals = $state(false);
  let currentUser = $state('default');
  let loading = $state(true);
  let saving = $state(false);
  let saveMessage = $state('');
  let backupMessage = $state('');
  let backingUp = $state(false);

  // Health monitoring state
  let healthDashboard = $state<any>(null);
  let healthLoading = $state(false);
  let healthError = $state('');
  let showHealthDetails = $state(false);

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

  async function loadHealthDashboard() {
    try {
      healthLoading = true;
      healthError = '';
      healthDashboard = await window.electronAPI.health.getDashboard();
    } catch (error) {
      console.error('Error loading health dashboard:', error);
      healthError = 'Failed to load health information';
    } finally {
      healthLoading = false;
    }
  }

  async function runHealthCheck() {
    try {
      healthLoading = true;
      healthError = '';
      await window.electronAPI.health.runCheck();
      await loadHealthDashboard();
    } catch (error) {
      console.error('Error running health check:', error);
      healthError = 'Health check failed';
    } finally {
      healthLoading = false;
    }
  }

  async function createBackup() {
    try {
      healthLoading = true;
      await window.electronAPI.health.createBackup();
      await loadHealthDashboard();
    } catch (error) {
      console.error('Error creating backup:', error);
      healthError = 'Backup creation failed';
    } finally {
      healthLoading = false;
    }
  }

  async function runMaintenance() {
    try {
      healthLoading = true;
      await window.electronAPI.health.runMaintenance();
      await loadHealthDashboard();
    } catch (error) {
      console.error('Error running maintenance:', error);
      healthError = 'Maintenance failed';
    } finally {
      healthLoading = false;
    }
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'healthy':
        return 'text-green-600';
      case 'warning':
        return 'text-yellow-600';
      case 'critical':
      case 'error':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  }

  function getStatusBgColor(status: string): string {
    switch (status) {
      case 'healthy':
        return 'bg-green-100';
      case 'warning':
        return 'bg-yellow-100';
      case 'critical':
      case 'error':
        return 'bg-red-100';
      default:
        return 'bg-gray-100';
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  function formatDate(isoDate: string): string {
    const date = new Date(isoDate);
    return date.toLocaleString();
  }

  onMount(() => {
    loadSettings();
    loadHealthDashboard();
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

      <div class="bg-white rounded-lg shadow p-6 mb-6">
        <h2 class="text-lg font-semibold mb-4 text-foreground">Database</h2>
        <button
          onclick={backupDatabase}
          disabled={backingUp}
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

      <!-- Health Monitoring Dashboard -->
      <div class="bg-white rounded-lg shadow p-6 mb-6">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-lg font-semibold text-foreground">System Health</h2>
          <button
            onclick={runHealthCheck}
            disabled={healthLoading}
            class="px-3 py-1 text-sm bg-gray-200 text-foreground rounded hover:bg-gray-300 transition disabled:opacity-50"
          >
            {healthLoading ? 'Checking...' : 'Run Check'}
          </button>
        </div>

        {#if healthError}
          <div class="p-3 bg-red-100 text-red-700 rounded mb-4">
            {healthError}
          </div>
        {/if}

        {#if healthDashboard}
          <!-- Overall Status -->
          <div class="mb-6 p-4 rounded {getStatusBgColor(healthDashboard.status.overall)}">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="font-semibold {getStatusColor(healthDashboard.status.overall)}">
                  Overall Status: {healthDashboard.status.overall.toUpperCase()}
                </h3>
                <p class="text-sm text-gray-600 mt-1">
                  Last checked: {formatDate(healthDashboard.status.lastCheck)}
                </p>
              </div>
            </div>

            {#if healthDashboard.status.recommendations.length > 0}
              <div class="mt-3 pt-3 border-t border-gray-200">
                <p class="text-sm font-medium text-gray-700 mb-2">Recommendations:</p>
                <ul class="text-sm text-gray-600 list-disc list-inside">
                  {#each healthDashboard.status.recommendations as rec}
                    <li>{rec}</li>
                  {/each}
                </ul>
              </div>
            {/if}
          </div>

          <!-- Component Health Grid -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <!-- Database Health -->
            <div class="p-4 border rounded">
              <div class="flex items-center justify-between mb-2">
                <h4 class="font-medium text-gray-900">Database</h4>
                <span class="text-xs px-2 py-1 rounded {getStatusBgColor(healthDashboard.status.components.database.status)} {getStatusColor(healthDashboard.status.components.database.status)}">
                  {healthDashboard.status.components.database.status}
                </span>
              </div>
              <p class="text-sm text-gray-600">{healthDashboard.status.components.database.message}</p>
            </div>

            <!-- Backups Health -->
            <div class="p-4 border rounded">
              <div class="flex items-center justify-between mb-2">
                <h4 class="font-medium text-gray-900">Backups</h4>
                <span class="text-xs px-2 py-1 rounded {getStatusBgColor(healthDashboard.status.components.backups.status)} {getStatusColor(healthDashboard.status.components.backups.status)}">
                  {healthDashboard.status.components.backups.status}
                </span>
              </div>
              <p class="text-sm text-gray-600">{healthDashboard.status.components.backups.message}</p>
            </div>

            <!-- Disk Space Health -->
            <div class="p-4 border rounded">
              <div class="flex items-center justify-between mb-2">
                <h4 class="font-medium text-gray-900">Disk Space</h4>
                <span class="text-xs px-2 py-1 rounded {getStatusBgColor(healthDashboard.status.components.diskSpace.status)} {getStatusColor(healthDashboard.status.components.diskSpace.status)}">
                  {healthDashboard.status.components.diskSpace.status}
                </span>
              </div>
              <p class="text-sm text-gray-600">{healthDashboard.status.components.diskSpace.message}</p>
            </div>

            <!-- Performance Health -->
            <div class="p-4 border rounded">
              <div class="flex items-center justify-between mb-2">
                <h4 class="font-medium text-gray-900">Performance</h4>
                <span class="text-xs px-2 py-1 rounded {getStatusBgColor(healthDashboard.status.components.performance.status)} {getStatusColor(healthDashboard.status.components.performance.status)}">
                  {healthDashboard.status.components.performance.status}
                </span>
              </div>
              <p class="text-sm text-gray-600">{healthDashboard.status.components.performance.message}</p>
            </div>
          </div>

          <!-- Quick Actions -->
          <div class="flex flex-wrap gap-2 mb-4">
            <button
              onclick={createBackup}
              disabled={healthLoading}
              class="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-50"
            >
              Create Backup
            </button>
            <button
              onclick={runMaintenance}
              disabled={healthLoading}
              class="px-3 py-2 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 transition disabled:opacity-50"
            >
              Run Maintenance
            </button>
            <button
              onclick={() => showHealthDetails = !showHealthDetails}
              class="px-3 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition"
            >
              {showHealthDetails ? 'Hide' : 'Show'} Details
            </button>
          </div>

          <!-- Detailed Information (Collapsible) -->
          {#if showHealthDetails}
            <div class="mt-4 p-4 bg-gray-50 rounded">
              <h3 class="font-semibold text-gray-900 mb-3">Detailed Information</h3>

              <!-- Backup Statistics -->
              <div class="mb-4">
                <h4 class="font-medium text-gray-800 mb-2">Backup Statistics</h4>
                <div class="text-sm text-gray-600 space-y-1">
                  <p>Total Backups: {healthDashboard.backupManifest.backups.length}</p>
                  {#if healthDashboard.backupManifest.lastBackup}
                    <p>Last Backup: {formatDate(healthDashboard.backupManifest.lastBackup)}</p>
                  {/if}
                </div>
              </div>

              <!-- Disk Space Details -->
              <div class="mb-4">
                <h4 class="font-medium text-gray-800 mb-2">Disk Space</h4>
                <div class="text-sm text-gray-600 space-y-1">
                  <p>Available: {formatBytes(healthDashboard.diskSpace.available)}</p>
                  <p>Total: {formatBytes(healthDashboard.diskSpace.total)}</p>
                  <p>Used: {healthDashboard.diskSpace.percentUsed.toFixed(1)}%</p>
                </div>
              </div>

              <!-- Performance Metrics -->
              <div class="mb-4">
                <h4 class="font-medium text-gray-800 mb-2">Performance Metrics</h4>
                <div class="text-sm text-gray-600 space-y-1">
                  {#if healthDashboard.metrics.startupTime}
                    <p>Startup Time: {healthDashboard.metrics.startupTime}ms</p>
                  {/if}
                  <p>Total Operations: {healthDashboard.metrics.totalOperations}</p>
                  <p>Average Query Time: {healthDashboard.metrics.avgQueryDuration.toFixed(0)}ms</p>
                  <p>Slow Queries: {healthDashboard.metrics.slowQueryCount}</p>
                  <p>Errors: {healthDashboard.metrics.errorCount}</p>
                </div>
              </div>

              <!-- Maintenance Schedule -->
              {#if healthDashboard.maintenanceSchedule}
                <div class="mb-4">
                  <h4 class="font-medium text-gray-800 mb-2">Maintenance Schedule</h4>
                  <div class="text-sm text-gray-600 space-y-1">
                    {#if healthDashboard.maintenanceSchedule.lastVacuum}
                      <p>Last VACUUM: {formatDate(healthDashboard.maintenanceSchedule.lastVacuum)}</p>
                    {/if}
                    {#if healthDashboard.maintenanceSchedule.lastAnalyze}
                      <p>Last ANALYZE: {formatDate(healthDashboard.maintenanceSchedule.lastAnalyze)}</p>
                    {/if}
                    <p>VACUUM Count: {healthDashboard.maintenanceSchedule.vacuumCount}</p>
                    <p>ANALYZE Count: {healthDashboard.maintenanceSchedule.analyzeCount}</p>
                  </div>
                </div>
              {/if}

              <!-- Integrity Check -->
              {#if healthDashboard.lastIntegrityCheck}
                <div>
                  <h4 class="font-medium text-gray-800 mb-2">Last Integrity Check</h4>
                  <div class="text-sm text-gray-600 space-y-1">
                    <p>Status: {healthDashboard.lastIntegrityCheck.isHealthy ? 'Healthy' : 'Issues Detected'}</p>
                    <p>Timestamp: {formatDate(healthDashboard.lastIntegrityCheck.timestamp)}</p>
                    <p>Duration: {healthDashboard.lastIntegrityCheck.checkDuration}ms</p>
                    {#if healthDashboard.lastIntegrityCheck.errors.length > 0}
                      <p class="text-red-600">Errors: {healthDashboard.lastIntegrityCheck.errors.length}</p>
                    {/if}
                  </div>
                </div>
              {/if}
            </div>
          {/if}
        {:else if healthLoading}
          <p class="text-gray-500">Loading health information...</p>
        {/if}
      </div>

      <div class="flex justify-end items-center gap-4">
        {#if saveMessage}
          <span class="text-sm {saveMessage.includes('Error') ? 'text-red-600' : 'text-green-600'}">
            {saveMessage}
          </span>
        {/if}
        <button
          onclick={saveSettings}
          disabled={saving}
          class="px-6 py-2 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  {/if}
      <!-- User Management Section -->
</div>
