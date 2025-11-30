<script lang="ts">
  let backupMessage = $state('');
  let backingUp = $state(false);
  let restoreMessage = $state('');
  let restoring = $state(false);

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
</script>

<div class="bg-white rounded-lg shadow p-6 mb-6">
  <h2 class="text-lg font-semibold mb-3 text-foreground">Database</h2>

  <div class="space-y-3">
    <!-- Backup -->
    <div>
      <button
        onclick={backupDatabase}
        disabled={backingUp || restoring}
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
        disabled={restoring || backingUp}
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
