<script lang="ts">
  /**
   * LocationNerdStats - Technical metadata (IDs, timestamps, GPS details, counts)
   * Location Settings: PIN-protected section at bottom for sensitive operations
   */
  import type { Location } from '@au-archive/core';
  import { router } from '../../stores/router';
  import AutocompleteInput from '../AutocompleteInput.svelte';
  import { getTypeForSubtype } from '../../lib/type-hierarchy';

  interface Props {
    location: Location;
    imageCount: number;
    videoCount: number;
    documentCount: number;
    onLocationUpdated?: () => void;
  }

  let { location, imageCount, videoCount, documentCount, onLocationUpdated }: Props = $props();

  let isOpen = $state(false);
  let copiedField = $state<string | null>(null);

  // Location Settings state
  let settingsUnlocked = $state(false);
  let pinInput = $state('');
  let pinError = $state('');
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

  // BagIt Archive state
  let bagStatus = $state<string | null>(null);
  let bagLastVerified = $state<string | null>(null);
  let bagLastError = $state<string | null>(null);
  let regeneratingBag = $state(false);
  let validatingBag = $state(false);
  let bagMessage = $state('');

  // Per-user view statistics
  interface ViewStats {
    totalViews: number;
    uniqueViewers: number;
    lastViewedAt: string | null;
    recentViewers: Array<{
      user_id: string;
      username: string;
      display_name: string | null;
      view_count: number;
      last_viewed_at: string;
    }>;
  }
  let viewStats = $state<ViewStats | null>(null);
  let loadingViewStats = $state(false);

  // Fetch view stats, suggestions, and BagIt status when section is opened
  $effect(() => {
    if (isOpen && !viewStats && !loadingViewStats) {
      loadingViewStats = true;
      window.electronAPI?.locations?.getViewStats(location.locid)
        .then((stats: ViewStats) => {
          viewStats = stats;
        })
        .catch((err: Error) => {
          console.warn('[NerdStats] Failed to load view stats:', err);
        })
        .finally(() => {
          loadingViewStats = false;
        });

      // Load type suggestions
      loadSuggestions();

      // Load BagIt status
      loadBagStatus();
    }
  });

  async function loadBagStatus() {
    try {
      const status = await window.electronAPI?.bagit?.status(location.locid);
      if (status) {
        bagStatus = status.bag_status || 'none';
        bagLastVerified = status.bag_last_verified || null;
        bagLastError = status.bag_last_error || null;
      }
    } catch (err) {
      console.warn('[NerdStats] Failed to load bag status:', err);
    }
  }

  async function regenerateBag() {
    if (regeneratingBag || !window.electronAPI?.bagit?.regenerate) return;

    try {
      regeneratingBag = true;
      bagMessage = 'Regenerating archive...';

      await window.electronAPI.bagit.regenerate(location.locid);

      bagMessage = 'Archive regenerated successfully';
      await loadBagStatus();
      setTimeout(() => { bagMessage = ''; }, 3000);
    } catch (err) {
      console.error('Regenerate bag failed:', err);
      bagMessage = 'Failed to regenerate archive';
    } finally {
      regeneratingBag = false;
    }
  }

  async function validateBag() {
    if (validatingBag || !window.electronAPI?.bagit?.validate) return;

    try {
      validatingBag = true;
      bagMessage = 'Validating archive...';

      const result = await window.electronAPI.bagit.validate(location.locid);

      if (result.status === 'valid') {
        bagMessage = 'Archive verified successfully';
      } else if (result.status === 'incomplete') {
        bagMessage = `Archive incomplete: ${result.missingFiles?.length || 0} missing files`;
      } else if (result.status === 'invalid') {
        bagMessage = `Archive invalid: ${result.checksumErrors?.length || 0} checksum errors`;
      }

      await loadBagStatus();
      setTimeout(() => { bagMessage = ''; }, 5000);
    } catch (err) {
      console.error('Validate bag failed:', err);
      bagMessage = 'Validation failed';
    } finally {
      validatingBag = false;
    }
  }

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
      console.warn('[NerdStats] Failed to load suggestions:', err);
    }
  }

  function copyToClipboard(text: string, field: string) {
    navigator.clipboard.writeText(text);
    copiedField = field;
    setTimeout(() => {
      copiedField = null;
    }, 1500);
  }

  // PIN verification for settings unlock
  async function verifyPin() {
    if (!pinInput) {
      pinError = 'Please enter your PIN';
      return;
    }

    try {
      const users = await window.electronAPI?.users?.findAll?.() || [];
      const currentUser = users[0] as { user_id: string } | undefined;

      if (!currentUser) {
        pinError = 'No user found';
        return;
      }

      const result = await window.electronAPI?.users?.verifyPin(currentUser.user_id, pinInput);
      if (result?.success) {
        settingsUnlocked = true;
        pinError = '';
        pinInput = '';
      } else {
        pinError = 'Invalid PIN';
      }
    } catch (err) {
      console.error('PIN verification failed:', err);
      pinError = 'Verification failed';
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

      // Refresh data to show updated thumbnails
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

      // Refresh data to show updated thumbnails
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
        // PIN verified, proceed with delete
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
    <h2 class="text-xl font-semibold text-braun-900">Nerd Stats</h2>
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
  <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
    <!-- IDs -->
    <div class="col-span-full border-b pb-3 mb-2">
      <p class="text-xs font-semibold text-braun-400 uppercase mb-2">Identifiers</p>
    </div>
    <div>
      <span class="text-braun-500">Full Location ID:</span>
      <button
        onclick={() => copyToClipboard(location.locid, 'locid')}
        class="ml-2 font-mono text-xs text-braun-900 hover:underline"
        title="Click to copy"
      >
        {copiedField === 'locid' ? 'Copied!' : location.locid}
      </button>
    </div>
    <div>
      <span class="text-braun-500">Short ID (loc12):</span>
      <button
        onclick={() => copyToClipboard(location.loc12, 'loc12')}
        class="ml-2 font-mono text-xs text-braun-900 hover:underline"
        title="Click to copy"
      >
        {copiedField === 'loc12' ? 'Copied!' : location.loc12}
      </button>
    </div>
    {#if location.slocnam}
      <div>
        <span class="text-braun-500">Short Name:</span>
        <span class="ml-2 font-mono text-xs">{location.slocnam}</span>
      </div>
    {/if}

    <!-- Timestamps -->
    <div class="col-span-full border-b pb-3 mb-2 mt-5">
      <p class="text-xs font-semibold text-braun-400 uppercase mb-2">Timestamps</p>
    </div>
    {#if location.locadd}
      <div>
        <span class="text-braun-500">Created:</span>
        <span class="ml-2">{new Date(location.locadd).toLocaleString()}</span>
      </div>
    {/if}
    {#if location.locup}
      <div>
        <span class="text-braun-500">Last Updated:</span>
        <span class="ml-2">{new Date(location.locup).toLocaleString()}</span>
      </div>
    {/if}
    {#if location.auth_imp}
      <div>
        <span class="text-braun-500">Author:</span>
        <span class="ml-2">{location.auth_imp}</span>
      </div>
    {/if}

    <!-- View Tracking -->
    <div class="col-span-full border-b pb-3 mb-2 mt-5">
      <p class="text-xs font-semibold text-braun-400 uppercase mb-2">Activity</p>
    </div>
    <div>
      <span class="text-braun-500">Total Views:</span>
      <span class="ml-2 font-semibold">{viewStats?.totalViews ?? location.viewCount ?? 0}</span>
    </div>
    {#if viewStats}
      <div>
        <span class="text-braun-500">Unique Viewers:</span>
        <span class="ml-2 font-semibold">{viewStats.uniqueViewers}</span>
      </div>
    {/if}
    {#if viewStats?.lastViewedAt || location.lastViewedAt}
      <div>
        <span class="text-braun-500">Last Viewed:</span>
        <span class="ml-2">{new Date(viewStats?.lastViewedAt ?? location.lastViewedAt!).toLocaleString()}</span>
      </div>
    {/if}
    {#if viewStats?.recentViewers && viewStats.recentViewers.length > 0}
      <div class="col-span-full mt-3">
        <span class="text-braun-500">Recent Viewers:</span>
        <div class="mt-2 flex flex-wrap gap-2">
          {#each viewStats.recentViewers.slice(0, 5) as viewer}
            <span class="inline-flex items-center px-2 py-1 bg-braun-100 rounded text-xs">
              {viewer.display_name || viewer.username}
              <span class="ml-1 text-braun-400">({viewer.view_count})</span>
            </span>
          {/each}
        </div>
      </div>
    {/if}
    {#if loadingViewStats}
      <div class="col-span-full text-xs text-braun-400">Loading view details...</div>
    {/if}

    <!-- GPS Details -->
    {#if location.gps}
      <div class="col-span-full border-b pb-3 mb-2 mt-5">
        <p class="text-xs font-semibold text-braun-400 uppercase mb-2">GPS Details</p>
      </div>
      <div>
        <span class="text-braun-500">GPS Source:</span>
        <span class="ml-2 capitalize">{location.gps.source?.replace(/_/g, ' ')}</span>
      </div>
      <div>
        <span class="text-braun-500">Map Verified:</span>
        <span class="ml-2">{location.gps.verifiedOnMap ? 'Yes' : 'No'}</span>
      </div>
      {#if location.gps.accuracy}
        <div>
          <span class="text-braun-500">GPS Accuracy:</span>
          <span class="ml-2">{location.gps.accuracy}m</span>
        </div>
      {/if}
      {#if location.gps.capturedAt}
        <div>
          <span class="text-braun-500">GPS Captured:</span>
          <span class="ml-2">{new Date(location.gps.capturedAt).toLocaleString()}</span>
        </div>
      {/if}
    {/if}

    <!-- Media Counts -->
    <div class="col-span-full border-b pb-3 mb-2 mt-5">
      <p class="text-xs font-semibold text-braun-400 uppercase mb-2">Media Statistics</p>
    </div>
    <div>
      <span class="text-braun-500">Images:</span>
      <span class="ml-2 font-semibold">{imageCount}</span>
    </div>
    <div>
      <span class="text-braun-500">Videos:</span>
      <span class="ml-2 font-semibold">{videoCount}</span>
    </div>
    <div>
      <span class="text-braun-500">Documents:</span>
      <span class="ml-2 font-semibold">{documentCount}</span>
    </div>
    <div>
      <span class="text-braun-500">Total Media:</span>
      <span class="ml-2 font-semibold">{imageCount + videoCount + documentCount}</span>
    </div>

    <!-- BagIt Archive (Self-Documenting Archive per RFC 8493) -->
    <div class="col-span-full border-b pb-3 mb-2 mt-5">
      <p class="text-xs font-semibold text-braun-400 uppercase mb-2">Archive Integrity</p>
    </div>
    <div>
      <span class="text-braun-500">Status:</span>
      <span class="ml-2">
        {#if bagStatus === 'valid'}
          <span class="text-success font-medium">Valid</span>
        {:else if bagStatus === 'complete'}
          <span class="text-braun-700 font-medium">Complete</span>
        {:else if bagStatus === 'incomplete'}
          <span class="text-warning font-medium">Incomplete</span>
        {:else if bagStatus === 'invalid'}
          <span class="text-error font-medium">Invalid</span>
        {:else}
          <span class="text-braun-400">Not Generated</span>
        {/if}
      </span>
    </div>
    {#if bagLastVerified}
      <div>
        <span class="text-braun-500">Last Verified:</span>
        <span class="ml-2">{new Date(bagLastVerified).toLocaleString()}</span>
      </div>
    {/if}
    {#if bagLastError}
      <div class="col-span-full">
        <span class="text-braun-500">Last Error:</span>
        <span class="ml-2 text-error text-xs">{bagLastError}</span>
      </div>
    {/if}
    <div class="col-span-full mt-2">
      <div class="flex flex-wrap items-center gap-2">
        <button
          onclick={regenerateBag}
          disabled={regeneratingBag || validatingBag}
          class="px-3 py-1 text-sm bg-braun-900 text-white rounded hover:bg-braun-600 transition disabled:opacity-50"
          title="Regenerate BagIt archive files for this location"
        >
          {regeneratingBag ? 'Regenerating...' : 'Regenerate Archive'}
        </button>
        <button
          onclick={validateBag}
          disabled={regeneratingBag || validatingBag}
          class="px-3 py-1 text-sm bg-braun-600 text-white rounded hover:bg-braun-500 transition disabled:opacity-50"
          title="Verify file checksums match manifest"
        >
          {validatingBag ? 'Validating...' : 'Verify Checksums'}
        </button>
        {#if bagMessage}
          <span class="text-sm text-braun-600">{bagMessage}</span>
        {/if}
      </div>
      <p class="text-xs text-braun-400 mt-2">
        Self-documenting archive per BagIt RFC 8493. Files survive 35+ years without database.
      </p>
    </div>

    <!-- Regions -->
    {#if location.regions && location.regions.length > 0}
      <div class="col-span-full border-b pb-3 mb-2 mt-5">
        <p class="text-xs font-semibold text-braun-400 uppercase mb-2">Classification</p>
      </div>
      <div class="col-span-full">
        <span class="text-braun-500">Regions:</span>
        <span class="ml-2">{location.regions.join(', ')}</span>
      </div>
    {/if}

    <!-- Location Settings (PIN-protected, inside Nerd Stats) -->
    <div class="col-span-full border-b pb-3 mb-2 mt-5">
      <p class="text-xs font-semibold text-braun-400 uppercase mb-2">Location Settings</p>
    </div>
    <div class="col-span-full">
      {#if !settingsUnlocked}
        <!-- PIN Entry -->
        <div class="flex items-center gap-3">
          <svg class="w-4 h-4 text-braun-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span class="text-sm text-braun-600">Enter PIN to unlock</span>
        </div>
        <div class="mt-2 flex items-center gap-3">
          <input
            type="password"
            inputmode="numeric"
            pattern="[0-9]*"
            maxlength="6"
            bind:value={pinInput}
            placeholder="PIN"
            onkeydown={(e) => e.key === 'Enter' && verifyPin()}
            class="w-20 px-2 py-1 text-center text-sm border border-braun-300 rounded focus:outline-none focus:border-braun-600"
          />
          <button
            onclick={verifyPin}
            class="px-3 py-1 text-sm bg-braun-900 text-white rounded hover:bg-braun-600 transition"
          >
            Unlock
          </button>
          {#if pinError}
            <span class="text-sm text-error">{pinError}</span>
          {/if}
        </div>
      {:else}
        <!-- Unlocked Settings -->
        <div class="space-y-3">
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
            {#if fixMessage}
              <span class="text-sm text-braun-600">{fixMessage}</span>
            {/if}
          </div>

          <div class="pt-2">
            <button
              onclick={() => showDeleteConfirm = true}
              class="px-3 py-1 text-sm bg-error text-white rounded hover:opacity-90 transition"
            >
              Delete Location
            </button>
          </div>
        </div>
      {/if}
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
