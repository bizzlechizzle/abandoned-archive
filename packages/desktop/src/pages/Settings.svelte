<script lang="ts">
  let archivePath = $state('');
  let deleteOriginals = $state(false);
  let tileCache = $state(true);

  function selectArchiveFolder() {
    console.log('Open folder dialog');
  }

  function saveSettings() {
    console.log('Save settings');
  }

  function backupDatabase() {
    console.log('Backup database');
  }
</script>

<div class="p-8">
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-foreground mb-2">Settings</h1>
    <p class="text-gray-600">Configure application preferences</p>
  </div>

  <div class="max-w-2xl">
    <div class="bg-white rounded-lg shadow p-6 mb-6">
      <h2 class="text-lg font-semibold mb-4 text-foreground">Archive Folder</h2>
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-2">
          Location
        </label>
        <div class="flex gap-2">
          <input
            type="text"
            bind:value={archivePath}
            placeholder="/path/to/archive"
            class="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
            disabled
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
      <h2 class="text-lg font-semibold mb-4 text-foreground">Map Settings</h2>
      <div class="flex items-center mb-4">
        <input
          type="checkbox"
          bind:checked={tileCache}
          id="tileCache"
          class="mr-2"
        />
        <label for="tileCache" class="text-sm text-gray-700">
          Cache map tiles locally
        </label>
      </div>
      <p class="text-xs text-gray-500">
        Improves performance but uses disk space
      </p>
    </div>

    <div class="bg-white rounded-lg shadow p-6 mb-6">
      <h2 class="text-lg font-semibold mb-4 text-foreground">Database</h2>
      <button
        onclick={backupDatabase}
        class="px-4 py-2 bg-gray-200 text-foreground rounded hover:bg-gray-300 transition"
      >
        Backup Database
      </button>
      <p class="text-xs text-gray-500 mt-2">
        Create a backup of your location database
      </p>
    </div>

    <div class="flex justify-end">
      <button
        onclick={saveSettings}
        class="px-6 py-2 bg-accent text-white rounded hover:opacity-90 transition"
      >
        Save Settings
      </button>
    </div>
  </div>
</div>
