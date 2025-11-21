<script lang="ts">
  import { onMount } from 'svelte';

  let healthDashboard = $state<any>(null);
  let healthLoading = $state(false);
  let healthError = $state('');
  let showHealthDetails = $state(false);

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

  function formatDate(isoDate: string): string {
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function getStatusColor(status: string): string {
    if (status === 'healthy') return 'text-green-700';
    if (status === 'warning') return 'text-yellow-700';
    return 'text-red-700';
  }

  function getStatusBgColor(status: string): string {
    if (status === 'healthy') return 'bg-green-100';
    if (status === 'warning') return 'bg-yellow-100';
    return 'bg-red-100';
  }

  onMount(() => {
    loadHealthDashboard();
  });
</script>

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

      <!-- Integrity Health -->
      <div class="p-4 border rounded">
        <div class="flex items-center justify-between mb-2">
          <h4 class="font-medium text-gray-900">Data Integrity</h4>
          <span class="text-xs px-2 py-1 rounded {getStatusBgColor(healthDashboard.status.components.integrity.status)} {getStatusColor(healthDashboard.status.components.integrity.status)}">
            {healthDashboard.status.components.integrity.status}
          </span>
        </div>
        <p class="text-sm text-gray-600">{healthDashboard.status.components.integrity.message}</p>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="flex gap-2">
      <button
        onclick={createBackup}
        disabled={healthLoading}
        class="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition disabled:opacity-50"
      >
        Create Backup
      </button>
      <button
        onclick={runMaintenance}
        disabled={healthLoading}
        class="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition disabled:opacity-50"
      >
        Run Maintenance
      </button>
      <button
        onclick={() => (showHealthDetails = !showHealthDetails)}
        class="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition"
      >
        {showHealthDetails ? 'Hide' : 'Show'} Details
      </button>
    </div>

    {#if showHealthDetails && healthDashboard.stats}
      <div class="mt-4 pt-4 border-t">
        <h3 class="font-semibold text-gray-900 mb-3">Statistics</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p class="text-sm text-gray-600">Database Size</p>
            <p class="font-medium">{(healthDashboard.stats.databaseSize / (1024 * 1024)).toFixed(2)} MB</p>
          </div>
          <div>
            <p class="text-sm text-gray-600">Total Locations</p>
            <p class="font-medium">{healthDashboard.stats.totalLocations}</p>
          </div>
          <div>
            <p class="text-sm text-gray-600">Total Media</p>
            <p class="font-medium">{healthDashboard.stats.totalMedia}</p>
          </div>
          <div>
            <p class="text-sm text-gray-600">Backups</p>
            <p class="font-medium">{healthDashboard.stats.backupCount}</p>
          </div>
        </div>
      </div>
    {/if}
  {:else if healthLoading}
    <p class="text-gray-500">Loading health information...</p>
  {/if}
</div>
