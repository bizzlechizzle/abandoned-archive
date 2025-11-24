<script lang="ts">
  /**
   * ImportModal.svelte
   * P1: Global pop-up import form for creating new locations
   * Per v010steps.md - accessible anywhere, replaces /imports page
   */
  import { onMount } from 'svelte';
  import { importModal, closeImportModal } from '../stores/import-modal-store';
  import { navigate } from '../stores/router';
  import { addToast } from '../stores/toast-store';

  // P0: Access options - consolidated from condition/status per v010steps.md
  const ACCESS_OPTIONS = [
    'Abandoned',
    'Demolished',
    'Active',
    'Partially Active',
    'Future Classic',
    'Vacant',
    'Unknown',
  ];

  const DOCUMENTATION_OPTIONS = [
    'Interior + Exterior',
    'Exterior Only',
    'Perimeter Only',
    'Drive-By',
    'No Visit / Keyboard Scout',
    'Drone Only',
  ];

  // Form state
  let name = $state('');
  let type = $state('');
  let selectedState = $state('');
  let author = $state('');
  let documentation = $state('');
  let access = $state('');

  // P2: Database-driven lists
  let availableStates = $state<string[]>([]);
  let availableTypes = $state<string[]>([]);
  let allTypes = $state<string[]>([]);

  // UI state
  let saving = $state(false);
  let error = $state('');

  // Load states and types from database
  async function loadOptions() {
    try {
      const locations = await window.electronAPI.locations.findAll();

      // Extract unique states
      const states = new Set<string>();
      const types = new Set<string>();

      locations.forEach((loc: any) => {
        if (loc.address?.state) states.add(loc.address.state);
        if (loc.type) types.add(loc.type);
      });

      availableStates = Array.from(states).sort();
      allTypes = Array.from(types).sort();
      availableTypes = allTypes;
    } catch (err) {
      console.error('Error loading options:', err);
    }
  }

  // P2: Filter types by selected state
  async function filterTypesByState(state: string) {
    if (!state) {
      availableTypes = allTypes;
      return;
    }

    try {
      const locations = await window.electronAPI.locations.findAll({ state });
      const types = new Set<string>();
      locations.forEach((loc: any) => {
        if (loc.type) types.add(loc.type);
      });

      availableTypes = Array.from(types).sort();

      // Reset type if not available in new state
      if (type && !availableTypes.includes(type)) {
        type = '';
      }
    } catch (err) {
      console.error('Error filtering types:', err);
      availableTypes = allTypes;
    }
  }

  // Watch for state changes to filter types
  $effect(() => {
    if (selectedState) {
      filterTypesByState(selectedState);
    } else {
      availableTypes = allTypes;
    }
  });

  // Handle pre-filled data from store
  $effect(() => {
    if ($importModal.prefilledData) {
      if ($importModal.prefilledData.state) {
        selectedState = $importModal.prefilledData.state;
      }
      if ($importModal.prefilledData.type) {
        type = $importModal.prefilledData.type;
      }
    }
  });

  async function handleSubmit() {
    if (!name.trim()) {
      error = 'Name is required';
      return;
    }

    if (!selectedState) {
      error = 'State is required';
      return;
    }

    if (!type) {
      error = 'Type is required';
      return;
    }

    try {
      saving = true;
      error = '';

      const locationData: Record<string, unknown> = {
        locnam: name.trim(),
        type: type || undefined,
        documentation: documentation || undefined,
        access: access || undefined,
        auth_imp: author.trim() || undefined,
        address: {
          state: selectedState.toUpperCase(),
        },
      };

      // Include GPS if pre-filled (from map right-click)
      if ($importModal.prefilledData?.gps_lat && $importModal.prefilledData?.gps_lng) {
        locationData.gps = {
          lat: $importModal.prefilledData.gps_lat,
          lng: $importModal.prefilledData.gps_lng,
          source: 'user_map_click',
          verifiedOnMap: true,
        };
      }

      const newLocation = await window.electronAPI.locations.create(locationData);

      // Success: close modal, show toast, navigate to new location
      closeImportModal();
      addToast('Location created successfully', 'success');

      // P1 Resolved Decision #4: Navigate to new location page
      if (newLocation?.locid) {
        navigate('location', { id: newLocation.locid });
      }

      // Reset form
      resetForm();
    } catch (err) {
      console.error('Error creating location:', err);
      error = 'Failed to create location. Please try again.';
    } finally {
      saving = false;
    }
  }

  function resetForm() {
    name = '';
    type = '';
    selectedState = '';
    author = '';
    documentation = '';
    access = '';
    error = '';
  }

  function handleCancel() {
    resetForm();
    closeImportModal();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      handleCancel();
    }
  }

  onMount(() => {
    loadOptions();
  });
</script>

<svelte:window on:keydown={handleKeydown} />

{#if $importModal.isOpen}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    onclick={handleCancel}
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
  >
    <!-- Modal -->
    <div
      class="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Header -->
      <div class="p-4 border-b flex justify-between items-center">
        <h2 id="modal-title" class="text-xl font-semibold text-foreground">
          New Location
        </h2>
        <button
          onclick={handleCancel}
          class="text-gray-400 hover:text-gray-600 transition"
          aria-label="Close"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Content -->
      <div class="p-4 space-y-4">
        {#if error}
          <div class="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        {/if}

        <!-- Name (required) -->
        <div>
          <label for="loc-name" class="block text-sm font-medium text-gray-700 mb-1">
            Name <span class="text-red-500">*</span>
          </label>
          <input
            id="loc-name"
            type="text"
            bind:value={name}
            disabled={saving}
            placeholder="Enter location name"
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
          />
        </div>

        <!-- State (required) -->
        <div>
          <label for="loc-state" class="block text-sm font-medium text-gray-700 mb-1">
            State <span class="text-red-500">*</span>
          </label>
          <select
            id="loc-state"
            bind:value={selectedState}
            disabled={saving}
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
          >
            <option value="">Select state...</option>
            {#each availableStates as state}
              <option value={state}>{state}</option>
            {/each}
          </select>
          <p class="text-xs text-gray-500 mt-1">States with existing locations</p>
        </div>

        <!-- Type (required) -->
        <div>
          <label for="loc-type" class="block text-sm font-medium text-gray-700 mb-1">
            Type <span class="text-red-500">*</span>
          </label>
          <select
            id="loc-type"
            bind:value={type}
            disabled={saving || !selectedState}
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
          >
            <option value="">Select type...</option>
            {#each availableTypes as t}
              <option value={t}>{t}</option>
            {/each}
          </select>
          {#if !selectedState}
            <p class="text-xs text-gray-500 mt-1">Select a state first</p>
          {:else}
            <p class="text-xs text-gray-500 mt-1">Types in {selectedState}</p>
          {/if}
        </div>

        <!-- Author -->
        <div>
          <label for="loc-author" class="block text-sm font-medium text-gray-700 mb-1">
            Author
          </label>
          <input
            id="loc-author"
            type="text"
            bind:value={author}
            disabled={saving}
            placeholder="Your name"
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
          />
        </div>

        <!-- Documentation Level -->
        <div>
          <label for="loc-documentation" class="block text-sm font-medium text-gray-700 mb-1">
            Documentation Level
          </label>
          <select
            id="loc-documentation"
            bind:value={documentation}
            disabled={saving}
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
          >
            <option value="">Select...</option>
            {#each DOCUMENTATION_OPTIONS as opt}
              <option value={opt}>{opt}</option>
            {/each}
          </select>
        </div>

        <!-- Access Status -->
        <div>
          <label for="loc-access" class="block text-sm font-medium text-gray-700 mb-1">
            Access Status
          </label>
          <select
            id="loc-access"
            bind:value={access}
            disabled={saving}
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
          >
            <option value="">Select...</option>
            {#each ACCESS_OPTIONS as opt}
              <option value={opt}>{opt}</option>
            {/each}
          </select>
        </div>

        {#if $importModal.prefilledData?.gps_lat && $importModal.prefilledData?.gps_lng}
          <div class="p-3 bg-green-50 border border-green-200 rounded">
            <p class="text-sm text-green-700">
              GPS pre-filled from map: {$importModal.prefilledData.gps_lat.toFixed(6)}, {$importModal.prefilledData.gps_lng.toFixed(6)}
            </p>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="p-4 border-t flex justify-end gap-2">
        <button
          onclick={handleCancel}
          disabled={saving}
          class="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onclick={handleSubmit}
          disabled={saving}
          class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50"
        >
          {saving ? 'Creating...' : 'Create Location'}
        </button>
      </div>
    </div>
  </div>
{/if}
