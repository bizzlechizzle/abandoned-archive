<script lang="ts">
  /**
   * LocationSettings - Administrative controls for location
   * OPT-100: Separated from NerdStats for better discoverability
   * Braun Design: Accordion box matching NerdStats styling
   */
  import type { Location } from '@au-archive/core';
  import { router } from '../../stores/router';
  import AutocompleteInput from '../AutocompleteInput.svelte';
  import { getTypeForSubtype } from '../../lib/type-hierarchy';

  interface Props {
    location: Location;
    onLocationUpdated?: () => void;
  }

  let { location, onLocationUpdated }: Props = $props();

  let isOpen = $state(false);

  // Fix media state
  let fixingImages = $state(false);
  let fixingVideos = $state(false);
  let fixMessage = $state('');

  // Edit Type modal state
  let showEditType = $state(false);
  let editType = $state('');
  let editSubType = $state('');
  let savingType = $state(false);
  let typeSuggestions = $state<string[]>([]);
  let subTypeSuggestions = $state<string[]>([]);

  // Edit Name modal state
  let showEditName = $state(false);
  let editName = $state('');
  let savingName = $state(false);

  // Delete state
  let showDeleteConfirm = $state(false);
  let deletePin = $state('');
  let deletePinError = $state('');
  let deleting = $state(false);

  // Load suggestions when opened
  $effect(() => {
    if (isOpen && typeSuggestions.length === 0) {
      loadSuggestions();
    }
  });

  async function loadSuggestions() {
    try {
      const locations = await window.electronAPI?.locations?.findAll() || [];
      const types = new Set<string>();
      const subTypes = new Set<string>();
      locations.forEach((loc: Location) => {
        if (loc.type) types.add(loc.type);
        if (loc.stype) subTypes.add(loc.stype);
      });
      typeSuggestions = Array.from(types).sort();
      subTypeSuggestions = Array.from(subTypes).sort();
    } catch (err) {
      console.warn('[LocationSettings] Failed to load suggestions:', err);
    }
  }

  // Fix images for this location
  async function fixLocationImages() {
    if (!window.electronAPI?.media?.fixLocationImages) {
      fixMessage = 'Not available';
      return;
    }

    try {
      fixingImages = true;
      fixMessage = 'Fixing images...';

      const result = await window.electronAPI.media.fixLocationImages(location.locid);

      if (result.total === 0) {
        fixMessage = 'No images to fix';
      } else {
        fixMessage = `Fixed ${result.fixed}/${result.total} images${result.errors > 0 ? ` (${result.errors} errors)` : ''}`;
      }

      if (result.fixed > 0) {
        onLocationUpdated?.();
      }

      setTimeout(() => { fixMessage = ''; }, 5000);
    } catch (err) {
      console.error('Fix images failed:', err);
      fixMessage = 'Failed';
    } finally {
      fixingImages = false;
    }
  }

  // Fix videos for this location
  async function fixLocationVideos() {
    if (!window.electronAPI?.media?.fixLocationVideos) {
      fixMessage = 'Not available';
      return;
    }

    try {
      fixingVideos = true;
      fixMessage = 'Fixing videos...';

      const result = await window.electronAPI.media.fixLocationVideos(location.locid);

      if (result.total === 0) {
        fixMessage = 'No videos to fix';
      } else {
        fixMessage = `Fixed ${result.fixed}/${result.total} videos${result.errors > 0 ? ` (${result.errors} errors)` : ''}`;
      }

      if (result.fixed > 0) {
        onLocationUpdated?.();
      }

      setTimeout(() => { fixMessage = ''; }, 5000);
    } catch (err) {
      console.error('Fix videos failed:', err);
      fixMessage = 'Failed';
    } finally {
      fixingVideos = false;
    }
  }

  // Open Edit Type modal
  function openEditType() {
    editType = location.type || '';
    editSubType = location.stype || '';
    showEditType = true;
  }

  // Auto-fill type when sub-type changes
  function handleSubTypeChange(value: string) {
    editSubType = value;
    if (value && !editType) {
      const matchedType = getTypeForSubtype(value);
      if (matchedType) {
        editType = matchedType;
      }
    }
  }

  // Save type changes
  async function saveType() {
    if (!window.electronAPI?.locations?.update) return;

    try {
      savingType = true;
      await window.electronAPI.locations.update(location.locid, {
        type: editType || undefined,
        stype: editSubType || undefined,
      });
      showEditType = false;
      onLocationUpdated?.();
    } catch (err) {
      console.error('Save type failed:', err);
      alert('Failed to save type');
    } finally {
      savingType = false;
    }
  }

  // Open Edit Name modal
  function openEditName() {
    editName = location.locnam || '';
    showEditName = true;
  }

  // Save name changes
  async function saveName() {
    if (!window.electronAPI?.locations?.update) return;
    if (!editName.trim()) {
      alert('Name is required');
      return;
    }

    try {
      savingName = true;
      await window.electronAPI.locations.update(location.locid, {
        locnam: editName.trim(),
      });
      showEditName = false;
      onLocationUpdated?.();
    } catch (err) {
      console.error('Save name failed:', err);
      alert('Failed to save name');
    } finally {
      savingName = false;
    }
  }

  // Verify PIN for delete (second confirmation)
  async function verifyDeletePin() {
    if (!deletePin) {
      deletePinError = 'Please enter your PIN';
      return;
    }

    try {
      const users = await window.electronAPI?.users?.findAll?.() || [];
      const currentUser = users[0] as { user_id: string } | undefined;

      if (!currentUser) {
        deletePinError = 'No user found';
        return;
      }

      const result = await window.electronAPI?.users?.verifyPin(currentUser.user_id, deletePin);
      if (result?.success) {
        await deleteLocation();
      } else {
        deletePinError = 'Invalid PIN';
      }
    } catch (err) {
      console.error('PIN verification failed:', err);
      deletePinError = 'Verification failed';
    }
  }

  // Delete location
  async function deleteLocation() {
    if (!window.electronAPI?.locations?.delete) return;

    try {
      deleting = true;
      await window.electronAPI.locations.delete(location.locid);
      showDeleteConfirm = false;
      router.navigate('/locations');
    } catch (err) {
      console.error('Delete location failed:', err);
      alert('Failed to delete location');
    } finally {
      deleting = false;
    }
  }

  function cancelDelete() {
    showDeleteConfirm = false;
    deletePin = '';
    deletePinError = '';
  }
</script>

<div class="mt-6 bg-white rounded border border-braun-300">
  <button
    onclick={() => isOpen = !isOpen}
    aria-expanded={isOpen}
    class="w-full p-6 flex items-center justify-between text-left hover:bg-braun-50 transition-colors"
  >
    <h2 class="text-xl font-semibold text-braun-900">Location Settings</h2>
    <svg
      class="w-5 h-5 text-braun-400 transition-transform duration-200 {isOpen ? 'rotate-180' : ''}"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  {#if isOpen}
  <div class="px-6 pb-6">
    <div class="space-y-4">
      <!-- Media Fix Section -->
      <div>
        <p class="text-xs font-semibold text-braun-400 uppercase mb-2">Media Repair</p>
        <div class="flex flex-wrap items-center gap-2">
          <button
            onclick={fixLocationImages}
            disabled={fixingImages || fixingVideos}
            class="px-3 py-1 text-sm bg-braun-900 text-white rounded hover:bg-braun-600 transition disabled:opacity-50"
          >
            {fixingImages ? 'Fixing...' : 'Fix Images'}
          </button>
          <button
            onclick={fixLocationVideos}
            disabled={fixingImages || fixingVideos}
            class="px-3 py-1 text-sm bg-braun-900 text-white rounded hover:bg-braun-600 transition disabled:opacity-50"
          >
            {fixingVideos ? 'Fixing...' : 'Fix Videos'}
          </button>
          {#if fixMessage}
            <span class="text-sm text-braun-600">{fixMessage}</span>
          {/if}
        </div>
        <p class="text-xs text-braun-400 mt-1">Regenerate missing thumbnails and proxies</p>
      </div>

      <!-- Edit Section -->
      <div>
        <p class="text-xs font-semibold text-braun-400 uppercase mb-2">Edit Location</p>
        <div class="flex flex-wrap items-center gap-2">
          <button
            onclick={openEditType}
            class="px-3 py-1 text-sm bg-braun-600 text-white rounded hover:bg-braun-500 transition"
          >
            Edit Type
          </button>
          <button
            onclick={openEditName}
            class="px-3 py-1 text-sm bg-braun-600 text-white rounded hover:bg-braun-500 transition"
          >
            Edit Name
          </button>
        </div>
      </div>

      <!-- Danger Zone -->
      <div class="pt-2 border-t border-braun-200">
        <p class="text-xs font-semibold text-braun-400 uppercase mb-2">Danger Zone</p>
        <button
          onclick={() => showDeleteConfirm = true}
          class="px-3 py-1 text-sm bg-error text-white rounded hover:opacity-90 transition"
        >
          Delete Location
        </button>
        <p class="text-xs text-braun-400 mt-1">Permanently delete this location and all media</p>
      </div>
    </div>
  </div>
  {/if}
</div>

<!-- Edit Type Modal -->
{#if showEditType}
<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onclick={() => showEditType = false}>
  <div class="bg-white rounded border border-braun-300 p-6 w-full max-w-md mx-4" onclick={(e) => e.stopPropagation()}>
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-lg font-semibold">Edit Type</h3>
      <button onclick={() => showEditType = false} class="text-braun-400 hover:text-braun-600">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
    <div class="space-y-4">
      <div>
        <label for="edit-type" class="block text-sm font-medium text-braun-700 mb-1">Type</label>
        <AutocompleteInput
          bind:value={editType}
          suggestions={typeSuggestions}
          id="edit-type"
          placeholder="e.g., Industrial, Medical..."
          class="w-full px-3 py-2 border border-braun-300 rounded focus:outline-none focus:border-braun-600"
        />
      </div>
      <div>
        <label for="edit-subtype" class="block text-sm font-medium text-braun-700 mb-1">Sub-Type</label>
        <AutocompleteInput
          bind:value={editSubType}
          onchange={handleSubTypeChange}
          suggestions={subTypeSuggestions}
          id="edit-subtype"
          placeholder="e.g., Factory, Hospital..."
          class="w-full px-3 py-2 border border-braun-300 rounded focus:outline-none focus:border-braun-600"
        />
      </div>
    </div>
    <div class="flex justify-end gap-3 mt-6">
      <button
        onclick={() => showEditType = false}
        class="px-4 py-2 bg-braun-200 text-braun-700 rounded hover:bg-braun-300 transition"
      >
        Cancel
      </button>
      <button
        onclick={saveType}
        disabled={savingType}
        class="px-4 py-2 bg-braun-900 text-white rounded hover:bg-braun-600 transition disabled:opacity-50"
      >
        {savingType ? 'Saving...' : 'Save'}
      </button>
    </div>
  </div>
</div>
{/if}

<!-- Edit Name Modal -->
{#if showEditName}
<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onclick={() => showEditName = false}>
  <div class="bg-white rounded border border-braun-300 p-6 w-full max-w-md mx-4" onclick={(e) => e.stopPropagation()}>
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-lg font-semibold">Edit Name</h3>
      <button onclick={() => showEditName = false} class="text-braun-400 hover:text-braun-600">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
    <div class="space-y-4">
      <div>
        <label for="edit-name" class="block text-sm font-medium text-braun-700 mb-1">Location Name</label>
        <input
          id="edit-name"
          type="text"
          bind:value={editName}
          placeholder="Location name"
          class="w-full px-3 py-2 border border-braun-300 rounded focus:outline-none focus:border-braun-600"
        />
      </div>
    </div>
    <div class="flex justify-end gap-3 mt-6">
      <button
        onclick={() => showEditName = false}
        class="px-4 py-2 bg-braun-200 text-braun-700 rounded hover:bg-braun-300 transition"
      >
        Cancel
      </button>
      <button
        onclick={saveName}
        disabled={savingName || !editName.trim()}
        class="px-4 py-2 bg-braun-900 text-white rounded hover:bg-braun-600 transition disabled:opacity-50"
      >
        {savingName ? 'Saving...' : 'Save'}
      </button>
    </div>
  </div>
</div>
{/if}

<!-- Delete Confirmation Modal (with second PIN) -->
{#if showDeleteConfirm}
<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onclick={cancelDelete}>
  <div class="bg-white rounded border border-braun-300 p-6 w-full max-w-md mx-4" onclick={(e) => e.stopPropagation()}>
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-lg font-semibold text-error">Delete "{location.locnam}"?</h3>
      <button onclick={cancelDelete} class="text-braun-400 hover:text-braun-600">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
    <div class="bg-braun-100 border border-braun-300 rounded p-4 mb-4">
      <p class="text-sm text-braun-700 mb-2">This action cannot be undone.</p>
      <p class="text-sm text-error font-medium">All media files will be permanently deleted.</p>
    </div>
    <div class="mb-4">
      <label for="delete-pin" class="block text-sm font-medium text-braun-700 mb-1">Enter PIN to confirm</label>
      <input
        id="delete-pin"
        type="password"
        inputmode="numeric"
        pattern="[0-9]*"
        maxlength="6"
        bind:value={deletePin}
        placeholder="PIN"
        onkeydown={(e) => e.key === 'Enter' && verifyDeletePin()}
        class="w-24 px-3 py-2 text-center border border-braun-300 rounded focus:outline-none focus:border-braun-600"
      />
      {#if deletePinError}
        <p class="text-sm text-error mt-1">{deletePinError}</p>
      {/if}
    </div>
    <div class="flex justify-end gap-3">
      <button
        onclick={cancelDelete}
        disabled={deleting}
        class="px-4 py-2 bg-braun-200 text-braun-700 rounded hover:bg-braun-300 transition"
      >
        Cancel
      </button>
      <button
        onclick={verifyDeletePin}
        disabled={deleting || !deletePin}
        class="px-4 py-2 bg-error text-white rounded hover:opacity-90 transition disabled:opacity-50"
      >
        {deleting ? 'Deleting...' : 'Delete'}
      </button>
    </div>
  </div>
</div>
{/if}
