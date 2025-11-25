<script lang="ts">
  /**
   * ImportModal.svelte
   * P1: Global pop-up import form for creating new locations
   * Per v010steps.md - accessible anywhere, replaces /imports page
   * Refactored: Uses shared constants and AutocompleteInput for state
   */
  import { onMount } from 'svelte';
  import type { Location } from '@au-archive/core';
  import { importModal, closeImportModal } from '../stores/import-modal-store';
  import { router } from '../stores/router';
  import { toasts } from '../stores/toast-store';
  import AutocompleteInput from './AutocompleteInput.svelte';
  import { STATE_ABBREVIATIONS, getStateCodeFromName } from '../../electron/services/us-state-codes';
  import { ACCESS_OPTIONS } from '../constants/location-enums';

  // Form state
  let name = $state('');
  let type = $state('');
  let subType = $state('');  // DECISION-015: Add Sub-Type field
  let selectedState = $state('');
  let author = $state('');
  let access = $state('');

  // DECISION-016: Documentation checkboxes (replaces dropdown)
  let docInterior = $state(false);
  let docExterior = $state(false);
  let docDrone = $state(false);
  let docWebHistory = $state(false);

  // P2: Database-driven lists
  let allLocations = $state<Location[]>([]);
  let availableTypes = $state<string[]>([]);
  let allTypes = $state<string[]>([]);

  // UI state
  let saving = $state(false);
  let error = $state('');

  // Generate state suggestions (all US states formatted)
  function getStateSuggestions(): string[] {
    const existingStates = new Set<string>();
    allLocations.forEach(loc => {
      if (loc.address?.state) {
        const code = loc.address.state.toUpperCase();
        const fullName = Object.entries(STATE_ABBREVIATIONS).find(([_, abbr]) => abbr === code)?.[0];
        if (fullName) {
          const titleCased = fullName.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
          existingStates.add(`${code} (${titleCased})`);
        } else {
          existingStates.add(code);
        }
      }
    });

    const allStates = Object.entries(STATE_ABBREVIATIONS).map(([name, code]) => {
      const titleCased = name.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
      return `${code} (${titleCased})`;
    });

    const merged = new Set([...existingStates, ...allStates]);
    return Array.from(merged).sort();
  }

  // Normalize state input - accepts full name or code
  function handleStateChange(value: string) {
    if (!value) {
      selectedState = '';
      return;
    }

    // Extract just the code if format is "NY (New York)"
    const codeMatch = value.match(/^([A-Z]{2})\s*\(/);
    if (codeMatch) {
      selectedState = codeMatch[1];
      return;
    }

    // Try to convert full name to code
    const code = getStateCodeFromName(value);
    if (code) {
      selectedState = code;
      return;
    }

    // Otherwise store as-is (will be uppercased)
    selectedState = value.toUpperCase().substring(0, 2);
  }

  // Get type suggestions from existing locations
  function getTypeSuggestions(): string[] {
    const types = new Set<string>();
    allLocations.forEach(loc => {
      if (loc.type) types.add(loc.type);
    });
    return Array.from(types).sort();
  }

  // DECISION-015/016: Get sub-type suggestions filtered by selected Type
  function getSubTypeSuggestions(): string[] {
    const subTypes = new Set<string>();
    allLocations.forEach(loc => {
      // Only include sub-types from locations matching selected type
      if ((!type || loc.type === type) && (loc as any).subtype) {
        subTypes.add((loc as any).subtype);
      }
    });
    return Array.from(subTypes).sort();
  }

  // Get author suggestions from existing locations
  function getAuthorSuggestions(): string[] {
    const authors = new Set<string>();
    allLocations.forEach(loc => {
      if (loc.auth_imp) authors.add(loc.auth_imp);
    });
    return Array.from(authors).sort();
  }

  // Load locations and default author from database/settings
  async function loadOptions() {
    try {
      const locations = await window.electronAPI.locations.findAll();
      allLocations = locations;

      // Extract unique types
      const types = new Set<string>();
      locations.forEach((loc: any) => {
        if (loc.type) types.add(loc.type);
      });

      allTypes = Array.from(types).sort();
      availableTypes = allTypes;

      // FEAT-7: Load default author from settings
      if (window.electronAPI?.settings) {
        const settings = await window.electronAPI.settings.getAll();
        if (settings.current_user && !author) {
          author = settings.current_user;
        }
      }
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

  // Re-load settings when modal opens (to restore author after resetForm)
  $effect(() => {
    if ($importModal.isOpen) {
      loadOptions();
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

    if (selectedState.length !== 2) {
      error = 'State must be 2-letter postal abbreviation (e.g., NY, CA)';
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
        subtype: subType || undefined,  // DECISION-015: Include sub-type
        // DECISION-016: Documentation checkboxes
        docInterior: docInterior || undefined,
        docExterior: docExterior || undefined,
        docDrone: docDrone || undefined,
        docWebHistory: docWebHistory || undefined,
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
      toasts.success('Location created successfully');

      // P1 Resolved Decision #4: Navigate to new location page
      if (newLocation?.locid) {
        router.navigate(`/location/${newLocation.locid}`);
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
    subType = '';  // DECISION-015: Reset sub-type
    selectedState = '';
    author = '';
    access = '';
    error = '';
    // DECISION-016: Reset documentation checkboxes
    docInterior = false;
    docExterior = false;
    docDrone = false;
    docWebHistory = false;
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
  <!-- Backdrop (DECISION-013: z-[99999] ensures modal appears above maps) -->
  <div
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[99999]"
    onclick={handleCancel}
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
  >
    <!-- Modal -->
    <div
      class="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto relative z-[100000]"
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

        <!-- State (required) - Now with AutocompleteInput -->
        <div>
          <label for="loc-state" class="block text-sm font-medium text-gray-700 mb-1">
            State <span class="text-red-500">*</span>
          </label>
          <AutocompleteInput
            value={selectedState}
            onchange={handleStateChange}
            suggestions={getStateSuggestions()}
            id="loc-state"
            placeholder="NY or New York"
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 uppercase"
          />
          <p class="text-xs text-gray-500 mt-1">Type 2-letter code or full state name</p>
        </div>

        <!-- Type (required) - AutocompleteInput with suggestions from database -->
        <div>
          <label for="loc-type" class="block text-sm font-medium text-gray-700 mb-1">
            Type <span class="text-red-500">*</span>
          </label>
          <AutocompleteInput
            value={type}
            onchange={(val) => type = val}
            suggestions={availableTypes}
            id="loc-type"
            placeholder="e.g., Factory, Hospital, School"
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
          />
          {#if selectedState && availableTypes.length > 0}
            <p class="text-xs text-gray-500 mt-1">Showing types in {selectedState} (or type new)</p>
          {:else if selectedState}
            <p class="text-xs text-gray-500 mt-1">No existing types in {selectedState} - enter a new one</p>
          {:else}
            <p class="text-xs text-gray-500 mt-1">Select a state to see existing types</p>
          {/if}
        </div>

        <!-- DECISION-015: Sub-Type (optional) -->
        <div>
          <label for="loc-subtype" class="block text-sm font-medium text-gray-700 mb-1">
            Sub-Type
          </label>
          <AutocompleteInput
            value={subType}
            onchange={(val) => subType = val}
            suggestions={getSubTypeSuggestions()}
            id="loc-subtype"
            placeholder="e.g., Textile Mill, Asylum, Elementary"
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
          />
          <p class="text-xs text-gray-500 mt-1">Optional sub-category within Type</p>
        </div>

        <!-- Author - Now with AutocompleteInput -->
        <div>
          <label for="loc-author" class="block text-sm font-medium text-gray-700 mb-1">
            Author
          </label>
          <AutocompleteInput
            value={author}
            onchange={(val) => author = val}
            suggestions={getAuthorSuggestions()}
            id="loc-author"
            placeholder="Your name"
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
          />
        </div>

        <!-- DECISION-016: Documentation Checkboxes -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Documentation</label>
          <div class="grid grid-cols-2 gap-2">
            <label class="flex items-center gap-2">
              <input type="checkbox" bind:checked={docInterior} disabled={saving} class="rounded" />
              <span class="text-sm">Interior</span>
            </label>
            <label class="flex items-center gap-2">
              <input type="checkbox" bind:checked={docExterior} disabled={saving} class="rounded" />
              <span class="text-sm">Exterior</span>
            </label>
            <label class="flex items-center gap-2">
              <input type="checkbox" bind:checked={docDrone} disabled={saving} class="rounded" />
              <span class="text-sm">Drone</span>
            </label>
            <label class="flex items-center gap-2">
              <input type="checkbox" bind:checked={docWebHistory} disabled={saving} class="rounded" />
              <span class="text-sm">Web-History</span>
            </label>
          </div>
        </div>

        <!-- Status -->
        <div>
          <label for="loc-access" class="block text-sm font-medium text-gray-700 mb-1">
            Status
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
