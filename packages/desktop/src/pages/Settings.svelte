<script lang="ts">
  import { onMount } from 'svelte';
  import DatabaseSettings from '../components/DatabaseSettings.svelte';
  import HealthMonitoring from '../components/HealthMonitoring.svelte';
  import { thumbnailCache } from '../stores/thumbnail-cache-store';

  interface User {
    user_id: string;
    username: string;
    display_name: string | null;
    has_pin: boolean;
    is_active: boolean;
    last_login: string | null;
  }

  let archivePath = $state('');
  let deleteOriginals = $state(false);
  let currentUserId = $state<string | null>(null);
  let currentUsername = $state('default');
  let importMap = $state(true);
  let mapImport = $state(true);
  let loading = $state(true);
  let saving = $state(false);
  let saveMessage = $state('');

  // Migration 24: User management state
  let appMode = $state<'single' | 'multi'>('single');
  let requireLogin = $state(false);
  let users = $state<User[]>([]);
  let showAddUser = $state(false);
  let editingUserId = $state<string | null>(null);
  let changingPinUserId = $state<string | null>(null);

  // New user form
  let newUsername = $state('');
  let newDisplayName = $state('');
  let newPin = $state('');
  let newConfirmPin = $state('');
  let newUserError = $state('');

  // Edit user form
  let editUsername = $state('');
  let editDisplayName = $state('');
  let editError = $state('');

  // Change PIN form
  let changePin = $state('');
  let changeConfirmPin = $state('');
  let changePinError = $state('');

  // Kanye6: Thumbnail regeneration state
  let regenerating = $state(false);
  let regenProgress = $state(0);
  let regenTotal = $state(0);
  let regenMessage = $state('');

  // Kanye9: Address normalization state
  let normalizing = $state(false);
  let normalizeMessage = $state('');

  // DECISION-012: Region backfill state
  let backfillingRegions = $state(false);
  let backfillMessage = $state('');

  // Migration 23: Live Photo detection state
  let detectingLivePhotos = $state(false);
  let livePhotoMessage = $state('');

  // P6: Darktable state removed per v010steps.md

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
      currentUserId = settings.current_user_id || null;
      currentUsername = settings.current_user || 'default';
      appMode = (settings.app_mode as 'single' | 'multi') || 'single';
      requireLogin = settings.require_login === 'true';
      importMap = settings.import_map !== 'false'; // Default true
      mapImport = settings.map_import !== 'false'; // Default true

      // Load users for multi-user mode
      await loadUsers();
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      loading = false;
    }
  }

  async function loadUsers() {
    if (!window.electronAPI?.users) return;
    try {
      users = await window.electronAPI.users.findAll();
    } catch (error) {
      console.error('Error loading users:', error);
    }
  }

  async function switchToMultiUser() {
    if (!window.electronAPI?.settings) return;
    try {
      await window.electronAPI.settings.set('app_mode', 'multi');
      appMode = 'multi';
      saveMessage = 'Switched to multi-user mode';
      setTimeout(() => saveMessage = '', 3000);
    } catch (error) {
      console.error('Error switching mode:', error);
    }
  }

  async function switchToSingleUser() {
    if (!window.electronAPI?.settings) return;
    try {
      await window.electronAPI.settings.set('app_mode', 'single');
      appMode = 'single';
      saveMessage = 'Switched to single-user mode';
      setTimeout(() => saveMessage = '', 3000);
    } catch (error) {
      console.error('Error switching mode:', error);
    }
  }

  async function toggleRequireLogin() {
    if (!window.electronAPI?.settings) return;
    try {
      const newValue = !requireLogin;
      await window.electronAPI.settings.set('require_login', newValue.toString());
      requireLogin = newValue;
      saveMessage = newValue ? 'Login will be required at startup' : 'Login no longer required at startup';
      setTimeout(() => saveMessage = '', 3000);
    } catch (error) {
      console.error('Error toggling require login:', error);
    }
  }

  function openAddUser() {
    newUsername = '';
    newDisplayName = '';
    newPin = '';
    newConfirmPin = '';
    newUserError = '';
    showAddUser = true;
  }

  function cancelAddUser() {
    showAddUser = false;
    newUserError = '';
  }

  async function createUser() {
    if (!window.electronAPI?.users) return;

    newUserError = '';

    if (!newUsername.trim()) {
      newUserError = 'Username is required';
      return;
    }

    if (!newPin) {
      newUserError = 'PIN is required';
      return;
    }

    if (newPin.length < 4) {
      newUserError = 'PIN must be at least 4 digits';
      return;
    }

    if (!/^\d+$/.test(newPin)) {
      newUserError = 'PIN must contain only numbers';
      return;
    }

    if (newPin !== newConfirmPin) {
      newUserError = 'PINs do not match';
      return;
    }

    try {
      await window.electronAPI.users.create({
        username: newUsername.trim(),
        display_name: newDisplayName.trim() || null,
        pin: newPin,
      });

      showAddUser = false;
      await loadUsers();
      saveMessage = `User "${newUsername}" created`;
      setTimeout(() => saveMessage = '', 3000);
    } catch (error) {
      console.error('Error creating user:', error);
      newUserError = 'Failed to create user';
    }
  }

  function startEditUser(user: User) {
    editingUserId = user.user_id;
    editUsername = user.username;
    editDisplayName = user.display_name || '';
    editError = '';
  }

  function cancelEditUser() {
    editingUserId = null;
    editError = '';
  }

  async function saveEditUser() {
    if (!window.electronAPI?.users || !editingUserId) return;

    editError = '';

    if (!editUsername.trim()) {
      editError = 'Username is required';
      return;
    }

    try {
      await window.electronAPI.users.update(editingUserId, {
        username: editUsername.trim(),
        display_name: editDisplayName.trim() || null,
      });

      editingUserId = null;
      await loadUsers();
      saveMessage = 'User updated';
      setTimeout(() => saveMessage = '', 3000);
    } catch (error) {
      console.error('Error updating user:', error);
      editError = 'Failed to update user';
    }
  }

  function startChangePin(user: User) {
    changingPinUserId = user.user_id;
    changePin = '';
    changeConfirmPin = '';
    changePinError = '';
  }

  function cancelChangePin() {
    changingPinUserId = null;
    changePinError = '';
  }

  async function saveChangePin() {
    if (!window.electronAPI?.users || !changingPinUserId) return;

    changePinError = '';

    if (!changePin) {
      changePinError = 'PIN is required';
      return;
    }

    if (changePin.length < 4) {
      changePinError = 'PIN must be at least 4 digits';
      return;
    }

    if (!/^\d+$/.test(changePin)) {
      changePinError = 'PIN must contain only numbers';
      return;
    }

    if (changePin !== changeConfirmPin) {
      changePinError = 'PINs do not match';
      return;
    }

    try {
      await window.electronAPI.users.setPin(changingPinUserId, changePin);
      saveMessage = 'PIN changed successfully';

      changingPinUserId = null;
      await loadUsers();
      setTimeout(() => saveMessage = '', 3000);
    } catch (error) {
      console.error('Error changing PIN:', error);
      changePinError = 'Failed to change PIN';
    }
  }

  async function deleteUser(user: User) {
    if (!window.electronAPI?.users) return;

    if (users.length <= 1) {
      alert('Cannot delete the last user');
      return;
    }

    if (!confirm(`Are you sure you want to delete user "${user.display_name || user.username}"?`)) {
      return;
    }

    try {
      await window.electronAPI.users.delete(user.user_id);
      await loadUsers();
      saveMessage = 'User deleted';
      setTimeout(() => saveMessage = '', 3000);
    } catch (error) {
      console.error('Error deleting user:', error);
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
   * @param force - If true, regenerate ALL thumbnails/previews (fixes rotation issues)
   */
  async function regenerateThumbnails(force: boolean = false) {
    if (!window.electronAPI?.media?.regenerateAllThumbnails) {
      regenMessage = 'Thumbnail regeneration not available';
      return;
    }

    try {
      regenerating = true;
      regenProgress = 0;
      regenTotal = 0;
      regenMessage = force ? 'Regenerating ALL thumbnails and previews...' : 'Starting thumbnail regeneration...';

      const result = await window.electronAPI.media.regenerateAllThumbnails({ force });

      if (result.total === 0 && result.rawTotal === 0) {
        regenMessage = 'All images already have thumbnails and previews';
      } else {
        // Kanye9: Show both thumbnail and preview extraction stats
        const thumbMsg = result.total > 0 ? `${result.generated}/${result.total} thumbnails` : '';
        const previewMsg = result.rawTotal > 0 ? `${result.previewsExtracted}/${result.rawTotal} RAW previews` : '';
        const failMsg = (result.failed + (result.previewsFailed || 0)) > 0 ? `(${result.failed + (result.previewsFailed || 0)} failed)` : '';
        regenMessage = `Processed: ${[thumbMsg, previewMsg].filter(Boolean).join(', ')} ${failMsg}`.trim();

        // Bust the cache to force all images to reload with new thumbnails
        thumbnailCache.bust();
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

  // Migration 30: DNG LibRaw rendering state
  let renderingDng = $state(false);
  let dngMessage = $state('');

  /**
   * Migration 30: Regenerate DNG previews using LibRaw for full-quality rendering
   * This fixes "potato quality" drone shots where embedded preview is tiny (960x720 for 5376x3956)
   */
  async function regenerateDngPreviews() {
    if (!window.electronAPI?.media?.regenerateDngPreviews) {
      dngMessage = 'DNG rendering not available';
      return;
    }

    try {
      renderingDng = true;
      dngMessage = 'Rendering DNG files with LibRaw...';

      const result = await window.electronAPI.media.regenerateDngPreviews();

      if (result.total === 0) {
        dngMessage = 'No DNG files need re-rendering';
      } else {
        dngMessage = `Rendered ${result.rendered}/${result.total} DNG files${result.failed > 0 ? ` (${result.failed} failed)` : ''}`;
        // Bust cache to force reload
        thumbnailCache.bust();
      }

      setTimeout(() => {
        dngMessage = '';
      }, 5000);
    } catch (error) {
      console.error('DNG rendering failed:', error);
      dngMessage = 'DNG rendering failed';
    } finally {
      renderingDng = false;
    }
  }

  /**
   * Kanye9: Normalize all addresses using AddressService
   * This backfills address_raw, address_normalized, address_parsed_json for existing locations
   */
  async function normalizeAllAddresses() {
    if (!window.electronAPI?.locations) {
      normalizeMessage = 'Location API not available';
      return;
    }

    try {
      normalizing = true;
      normalizeMessage = 'Normalizing addresses...';

      // Get all locations
      const locations = await window.electronAPI.locations.findAll();
      let processed = 0;
      let updated = 0;

      for (const loc of locations) {
        // Skip if no address data
        if (!loc.address?.street && !loc.address?.city && !loc.address?.zipcode) {
          processed++;
          continue;
        }

        // Update location to trigger address normalization
        await window.electronAPI.locations.update(loc.locid, {
          address: loc.address
        });

        processed++;
        updated++;
        normalizeMessage = `Normalized ${processed} of ${locations.length} locations...`;
      }

      normalizeMessage = `Done! Normalized ${updated} locations with address data.`;
      setTimeout(() => {
        normalizeMessage = '';
      }, 5000);
    } catch (error) {
      console.error('Address normalization failed:', error);
      normalizeMessage = 'Normalization failed';
    } finally {
      normalizing = false;
    }
  }

  // P6: Darktable functions removed per v010steps.md

  /**
   * DECISION-012: Backfill region fields for existing locations
   * Populates Census region, division, state direction, and cultural region
   */
  async function backfillRegions() {
    if (!window.electronAPI?.locations?.backfillRegions) {
      backfillMessage = 'Region backfill not available';
      return;
    }

    try {
      backfillingRegions = true;
      backfillMessage = 'Calculating regions for all locations...';

      const result = await window.electronAPI.locations.backfillRegions();

      if (result.updated === 0) {
        backfillMessage = `All ${result.total} locations already have region data`;
      } else {
        backfillMessage = `Updated ${result.updated} of ${result.total} locations with region data`;
      }

      setTimeout(() => {
        backfillMessage = '';
      }, 5000);
    } catch (error) {
      console.error('Region backfill failed:', error);
      backfillMessage = 'Region backfill failed';
    } finally {
      backfillingRegions = false;
    }
  }

  /**
   * Migration 23: Detect and hide Live Photo videos and SDR duplicates
   * Scans all locations and auto-hides companion files
   */
  async function detectAllLivePhotos() {
    if (!window.electronAPI?.media?.detectLivePhotosAndSDR || !window.electronAPI?.locations) {
      livePhotoMessage = 'Live Photo detection not available';
      return;
    }

    try {
      detectingLivePhotos = true;
      livePhotoMessage = 'Scanning locations...';

      // Get all locations
      const locations = await window.electronAPI.locations.findAll();
      let processed = 0;
      let totalHidden = 0;

      for (const loc of locations) {
        processed++;
        livePhotoMessage = `Scanning ${processed} of ${locations.length} locations...`;

        const result = await window.electronAPI.media.detectLivePhotosAndSDR(loc.locid);
        if (result?.livePhotosHidden) {
          totalHidden += result.livePhotosHidden;
        }
        if (result?.sdrHidden) {
          totalHidden += result.sdrHidden;
        }
      }

      if (totalHidden === 0) {
        livePhotoMessage = `Scanned ${locations.length} locations. No new Live Photos or SDR duplicates found.`;
      } else {
        livePhotoMessage = `Done! Found and hid ${totalHidden} Live Photo videos and SDR duplicates across ${locations.length} locations.`;
      }

      setTimeout(() => {
        livePhotoMessage = '';
      }, 8000);
    } catch (error) {
      console.error('Live Photo detection failed:', error);
      livePhotoMessage = 'Detection failed';
    } finally {
      detectingLivePhotos = false;
    }
  }

  onMount(() => {
    loadSettings();
  });
</script>

<div class="p-8">
  <div class="mb-8">
    <div class="flex items-baseline justify-between">
      <h1 class="text-3xl font-bold text-foreground mb-2">Settings</h1>
      <span class="text-sm text-gray-400">v0.1.0</span>
    </div>
    <p class="text-gray-600">Configure application preferences</p>
  </div>

  {#if loading}
    <div class="max-w-2xl">
      <p class="text-gray-500">Loading settings...</p>
    </div>
  {:else}
    <div class="max-w-2xl">
      <!-- User Management -->
      <div class="bg-white rounded-lg shadow p-6 mb-6">
        <h2 class="text-lg font-semibold text-foreground mb-4">Users</h2>

        <!-- User List -->
        <div class="space-y-3">
          {#each users as user}
            <div class="border border-gray-200 rounded-lg p-4">
              {#if editingUserId === user.user_id}
                <!-- Edit Mode -->
                <div class="space-y-3">
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block text-xs font-medium text-gray-600 mb-1">Username</label>
                      <input
                        type="text"
                        bind:value={editUsername}
                        class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                    <div>
                      <label class="block text-xs font-medium text-gray-600 mb-1">Display Name</label>
                      <input
                        type="text"
                        bind:value={editDisplayName}
                        placeholder="Optional"
                        class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                  </div>
                  {#if editError}
                    <p class="text-red-500 text-xs">{editError}</p>
                  {/if}
                  <div class="flex gap-2">
                    <button
                      onclick={saveEditUser}
                      class="px-3 py-1 text-sm bg-accent text-white rounded hover:opacity-90"
                    >
                      Save
                    </button>
                    <button
                      onclick={cancelEditUser}
                      class="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              {:else if changingPinUserId === user.user_id}
                <!-- Change PIN Mode -->
                <div class="space-y-3">
                  <p class="text-sm font-medium text-foreground">
                    Change PIN for {user.display_name || user.username}
                  </p>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block text-xs font-medium text-gray-600 mb-1">New PIN</label>
                      <input
                        type="password"
                        inputmode="numeric"
                        pattern="[0-9]*"
                        maxlength="6"
                        bind:value={changePin}
                        placeholder="4-6 digits"
                        class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-accent text-center"
                      />
                    </div>
                    <div>
                      <label class="block text-xs font-medium text-gray-600 mb-1">Confirm PIN</label>
                      <input
                        type="password"
                        inputmode="numeric"
                        pattern="[0-9]*"
                        maxlength="6"
                        bind:value={changeConfirmPin}
                        placeholder="Re-enter"
                        class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-accent text-center"
                      />
                    </div>
                  </div>
                  {#if changePinError}
                    <p class="text-red-500 text-xs">{changePinError}</p>
                  {/if}
                  <div class="flex gap-2">
                    <button
                      onclick={saveChangePin}
                      class="px-3 py-1 text-sm bg-accent text-white rounded hover:opacity-90"
                    >
                      Save PIN
                    </button>
                    <button
                      onclick={cancelChangePin}
                      class="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              {:else}
                <!-- View Mode -->
                <div class="flex items-center justify-between">
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-foreground">{user.display_name || user.username}</span>
                      {#if currentUserId === user.user_id}
                        <span class="text-xs bg-accent/10 text-accent px-1.5 py-0.5 rounded">Current</span>
                      {/if}
                    </div>
                    {#if user.display_name}
                      <p class="text-xs text-gray-500">@{user.username}</p>
                    {/if}
                    {#if user.last_login}
                      <p class="text-xs text-gray-400">Last login: {new Date(user.last_login).toLocaleDateString()}</p>
                    {/if}
                  </div>
                  <div class="flex gap-1">
                    <button
                      onclick={() => startEditUser(user)}
                      class="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                      title="Edit user"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                      </svg>
                    </button>
                    <button
                      onclick={() => startChangePin(user)}
                      class="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                      title="Change PIN"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
                      </svg>
                    </button>
                    {#if users.length > 1}
                      <button
                        onclick={() => deleteUser(user)}
                        class="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                        title="Delete user"
                      >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                      </button>
                    {/if}
                  </div>
                </div>
              {/if}
            </div>
          {/each}

          <!-- Security Settings -->
          <div class="border-t border-gray-200 pt-4 mt-4">
            <h3 class="text-sm font-medium text-gray-700 mb-3">Security</h3>
            <label class="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={requireLogin}
                onchange={toggleRequireLogin}
                class="mt-0.5 h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
              />
              <div>
                <span class="text-sm text-foreground">Require PIN on startup</span>
                <p class="text-xs text-gray-500 mt-0.5">App will prompt for PIN each time it launches</p>
              </div>
            </label>
          </div>

          <!-- Add User Form -->
          {#if showAddUser}
            <div class="border border-accent rounded-lg p-4 bg-accent/5">
              <h3 class="font-medium text-foreground mb-3">Add New User</h3>
              <div class="space-y-3">
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Username *</label>
                    <input
                      type="text"
                      bind:value={newUsername}
                      placeholder="Enter username"
                      class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Display Name</label>
                    <input
                      type="text"
                      bind:value={newDisplayName}
                      placeholder="Optional"
                      class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">PIN *</label>
                    <input
                      type="password"
                      inputmode="numeric"
                      pattern="[0-9]*"
                      maxlength="6"
                      bind:value={newPin}
                      placeholder="4-6 digits"
                      class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-accent text-center"
                    />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Confirm PIN *</label>
                    <input
                      type="password"
                      inputmode="numeric"
                      pattern="[0-9]*"
                      maxlength="6"
                      bind:value={newConfirmPin}
                      placeholder="Re-enter"
                      class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-accent text-center"
                    />
                  </div>
                </div>
                {#if newUserError}
                  <p class="text-red-500 text-xs">{newUserError}</p>
                {/if}
                <div class="flex gap-2">
                  <button
                    onclick={createUser}
                    class="px-3 py-1 text-sm bg-accent text-white rounded hover:opacity-90"
                  >
                    Create User
                  </button>
                  <button
                    onclick={cancelAddUser}
                    class="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          {:else}
            <button
              onclick={openAddUser}
              class="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-gray-400 hover:text-gray-600 transition text-sm"
            >
              + Add User
            </button>
          {/if}
        </div>
      </div>

      <div class="bg-white rounded-lg shadow p-6 mb-6">
        <h2 class="text-lg font-semibold mb-3 text-foreground">Archive Folder</h2>
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
        <h2 class="text-lg font-semibold mb-3 text-foreground">Import Options</h2>
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


      <!-- Kanye6: Maintenance Section for Thumbnail Regeneration -->
      <div class="bg-white rounded-lg shadow p-6 mb-6">
        <h2 class="text-lg font-semibold mb-3 text-foreground">Maintenance</h2>
        <div class="space-y-3">
          <div>
            <p class="text-sm text-gray-700 mb-2">
              Regenerate thumbnails for images imported before the multi-tier system.
              This creates 400px, 800px, and 1920px versions for better quality display.
            </p>
            <div class="flex flex-wrap items-center gap-3">
              <button
                onclick={() => regenerateThumbnails(false)}
                disabled={regenerating}
                class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50"
              >
                {regenerating ? 'Regenerating...' : 'Regenerate Missing'}
              </button>
              <button
                onclick={() => regenerateThumbnails(true)}
                disabled={regenerating}
                class="px-4 py-2 bg-gray-600 text-white rounded hover:opacity-90 transition disabled:opacity-50"
                title="Re-extracts all RAW previews with correct EXIF rotation"
              >
                {regenerating ? 'Regenerating...' : 'Fix All Rotations'}
              </button>
              <button
                onclick={regenerateDngPreviews}
                disabled={renderingDng}
                class="px-4 py-2 bg-orange-600 text-white rounded hover:opacity-90 transition disabled:opacity-50"
                title="Uses LibRaw/dcraw_emu to render full-quality DNG previews (fixes potato quality drone shots)"
              >
                {renderingDng ? 'Rendering...' : 'Fix DNG Quality'}
              </button>
              {#if regenMessage}
                <span class="text-sm text-gray-600">{regenMessage}</span>
              {/if}
              {#if dngMessage}
                <span class="text-sm text-gray-600">{dngMessage}</span>
              {/if}
            </div>
            <p class="text-xs text-gray-500 mt-2">
              "Regenerate Missing" processes only images without thumbnails. "Fix All Rotations" re-processes everything to fix sideways DSLR images. "Fix DNG Quality" uses LibRaw to render full-resolution DNG previews for drone shots.
            </p>
          </div>

          <!-- Kanye9: Address Normalization -->
          <div class="mt-6 pt-6 border-t border-gray-200">
            <p class="text-sm text-gray-700 mb-2">
              Normalize all addresses using AddressService. This populates address_raw, address_normalized, and address_parsed_json fields for existing locations.
            </p>
            <div class="flex items-center gap-4">
              <button
                onclick={normalizeAllAddresses}
                disabled={normalizing}
                class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50"
              >
                {normalizing ? 'Normalizing...' : 'Normalize All Addresses'}
              </button>
              {#if normalizeMessage}
                <span class="text-sm text-gray-600">{normalizeMessage}</span>
              {/if}
            </div>
            <p class="text-xs text-gray-500 mt-2">
              Cleans city names (removes "Village Of", "City Of"), standardizes state codes, and stores both raw and normalized forms.
            </p>
          </div>

          <!-- DECISION-012: Region Backfill -->
          <div class="mt-6 pt-6 border-t border-gray-200">
            <p class="text-sm text-gray-700 mb-2">
              Populate region fields for existing locations. Calculates Census region, division, state direction, and cultural region based on address and GPS data.
            </p>
            <div class="flex items-center gap-4">
              <button
                onclick={backfillRegions}
                disabled={backfillingRegions}
                class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50"
              >
                {backfillingRegions ? 'Processing...' : 'Backfill Region Data'}
              </button>
              {#if backfillMessage}
                <span class="text-sm text-gray-600">{backfillMessage}</span>
              {/if}
            </div>
            <p class="text-xs text-gray-500 mt-2">
              Adds Census Region (Northeast/Midwest/South/West), Division, state direction (e.g., "Eastern NY"), and Cultural Region fields.
            </p>
          </div>

          <!-- Migration 23: Live Photo Detection -->
          <div class="mt-6 pt-6 border-t border-gray-200">
            <p class="text-sm text-gray-700 mb-2">
              Detect and auto-hide Live Photo companion videos and SDR duplicate images across all locations.
            </p>
            <div class="flex items-center gap-4">
              <button
                onclick={detectAllLivePhotos}
                disabled={detectingLivePhotos}
                class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50"
              >
                {detectingLivePhotos ? 'Scanning...' : 'Detect Live Photos'}
              </button>
              {#if livePhotoMessage}
                <span class="text-sm text-gray-600">{livePhotoMessage}</span>
              {/if}
            </div>
            <p class="text-xs text-gray-500 mt-2">
              iPhone Live Photo videos (.MOV paired with images) and SDR duplicates (_SDR suffix files) will be hidden from the gallery but remain accessible via "Show All".
            </p>
          </div>
        </div>
      </div>

      <!-- P6: Darktable section removed per v010steps.md -->

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
