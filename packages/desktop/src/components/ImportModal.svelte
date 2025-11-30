<script lang="ts">
  /**
   * ImportModal.svelte
   * P1: Global pop-up import form for creating new locations
   * Per v010steps.md - accessible anywhere, replaces /imports page
   *
   * Migration 28: Added sub-location support with 2-column premium layout
   * - Row 1: Location Name | Sub-Location checkbox
   * - Row 2: Sub-Location Name | Primary Building (when sub-location checked)
   * - Row 3: Type | Sub-Type
   * - Row 4: Author | Status
   */
  import { onMount } from 'svelte';
  import type { Location } from '@au-archive/core';
  import { importModal, closeImportModal } from '../stores/import-modal-store';
  import { router } from '../stores/router';
  import { toasts } from '../stores/toast-store';
  import AutocompleteInput from './AutocompleteInput.svelte';
  import { STATE_ABBREVIATIONS, getStateCodeFromName } from '../../electron/services/us-state-codes';
  import { ACCESS_OPTIONS } from '../constants/location-enums';
  import { getTypeForSubtype } from '../lib/type-hierarchy';

  // Form state
  let name = $state('');
  let type = $state('');
  let subType = $state('');
  let selectedState = $state('');
  let author = $state('');
  let access = $state('');

  // Host location & sub-location state (Migration 28)
  let isHostLocation = $state(false);  // This is a campus with multiple buildings
  let addFirstBuilding = $state(false); // Add the first building now
  let subLocationName = $state('');
  let isPrimaryBuilding = $state(true); // Default to primary for first sub-location
  let subLocNameDuplicate = $state(false);
  let subLocNameChecking = $state(false);

  // P2: Database-driven lists
  let allLocations = $state<Location[]>([]);
  let allTypes = $state<string[]>([]);

  // Users for author dropdown
  let users = $state<Array<{user_id: string, username: string, display_name: string | null}>>([]);

  // UI state
  let saving = $state(false);
  let error = $state('');

  // Auto-fill sub-location name when location name changes (if adding first building)
  $effect(() => {
    if (addFirstBuilding && name && !subLocationName) {
      subLocationName = name;
    }
  });

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

  // Get sub-type suggestions from all locations (database-wide)
  function getSubTypeSuggestions(): string[] {
    const subTypes = new Set<string>();
    allLocations.forEach(loc => {
      if (loc.stype) subTypes.add(loc.stype);
    });
    return Array.from(subTypes).sort();
  }

  // Load locations, users, and default author from database/settings
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

      // Load users for author dropdown
      if (window.electronAPI?.users) {
        users = await window.electronAPI.users.findAll();
      }

      // Set default author to current user
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

  // Auto-fill type when user enters a known sub-type
  $effect(() => {
    if (subType && !type) {
      const matchedType = getTypeForSubtype(subType);
      if (matchedType) {
        type = matchedType;
      }
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

  function validateForm(): boolean {
    if (!name.trim()) {
      error = 'Location name is required';
      return false;
    }
    if (!selectedState) {
      error = 'State is required';
      return false;
    }
    if (selectedState.length !== 2) {
      error = 'State must be 2-letter postal abbreviation (e.g., NY, CA)';
      return false;
    }
    if (!type) {
      error = 'Type is required';
      return false;
    }
    // Validate sub-location name if adding first building
    if (addFirstBuilding) {
      if (!subLocationName.trim()) {
        error = 'Building name is required when adding first building';
        return false;
      }
      if (subLocNameDuplicate) {
        error = 'A building with this name already exists';
        return false;
      }
    }
    return true;
  }

  function buildLocationData(): Record<string, unknown> {
    const data: Record<string, unknown> = {
      locnam: name.trim(),
      type: type || undefined,
      stype: subType || undefined,
      access: access || undefined,
      auth_imp: author.trim() || undefined,
      address: {
        state: selectedState.toUpperCase(),
      },
    };

    // Include GPS if pre-filled (from map right-click)
    if ($importModal.prefilledData?.gps_lat && $importModal.prefilledData?.gps_lng) {
      data.gps = {
        lat: $importModal.prefilledData.gps_lat,
        lng: $importModal.prefilledData.gps_lng,
        source: 'user_map_click',
        verifiedOnMap: true,
      };
    }

    return data;
  }

  async function handleCreate() {
    if (!validateForm()) return;

    try {
      saving = true;
      error = '';

      // Create the location
      const newLocation = await window.electronAPI.locations.create(buildLocationData());

      // If adding first building, create the sub-location inside the new host location
      if (addFirstBuilding && newLocation?.locid) {
        await window.electronAPI.sublocations.create({
          locid: newLocation.locid,
          subnam: subLocationName.trim(),
          type: type || null,
          status: access || null,
          is_primary: isPrimaryBuilding,
          created_by: author.trim() || null,
        });
      }

      closeImportModal();
      const successMsg = addFirstBuilding
        ? 'Host location and first building created'
        : isHostLocation
          ? 'Host location created - add buildings from the location page'
          : 'Location created successfully';
      toasts.success(successMsg);

      if (newLocation?.locid) {
        router.navigate(`/location/${newLocation.locid}`);
      }

      resetForm();
    } catch (err) {
      console.error('Error creating location:', err);
      error = 'Failed to create location. Please try again.';
    } finally {
      saving = false;
    }
  }

  async function handleCreateAndAddMedia() {
    if (!validateForm()) return;

    try {
      saving = true;
      error = '';

      const newLocation = await window.electronAPI.locations.create(buildLocationData());

      // If adding first building, create the sub-location
      let createdSubId: string | undefined;
      if (addFirstBuilding && newLocation?.locid) {
        const subloc = await window.electronAPI.sublocations.create({
          locid: newLocation.locid,
          subnam: subLocationName.trim(),
          type: type || null,
          status: access || null,
          is_primary: isPrimaryBuilding,
          created_by: author.trim() || null,
        });
        createdSubId = subloc.subid;
      }

      closeImportModal();
      toasts.success('Location created - select media to import');

      if (newLocation?.locid) {
        // Navigate to the sub-location if created, otherwise to the location
        if (createdSubId) {
          router.navigate(`/location/${newLocation.locid}/sub/${createdSubId}?autoImport=true`);
        } else {
          router.navigate(`/location/${newLocation.locid}?autoImport=true`);
        }
      }

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
    subType = '';
    selectedState = '';
    author = '';
    access = '';
    isHostLocation = false;
    addFirstBuilding = false;
    subLocationName = '';
    isPrimaryBuilding = true;
    subLocNameDuplicate = false;
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

  // Handle host location checkbox toggle
  function handleHostLocationToggle() {
    isHostLocation = !isHostLocation;
    if (!isHostLocation) {
      // Reset building fields when unchecking host location
      addFirstBuilding = false;
      subLocationName = '';
      isPrimaryBuilding = true;
      subLocNameDuplicate = false;
    }
  }

  // Handle add first building checkbox toggle
  function handleAddBuildingToggle() {
    addFirstBuilding = !addFirstBuilding;
    if (addFirstBuilding && name && !subLocationName) {
      subLocationName = name;
    }
    if (!addFirstBuilding) {
      subLocationName = '';
      isPrimaryBuilding = true;
      subLocNameDuplicate = false;
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
    <!-- Modal - wider for 2-column layout -->
    <div
      class="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto relative z-[100000]"
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Header -->
      <div class="p-5 border-b border-gray-200 flex justify-between items-center bg-gray-50">
        <div>
          <h2 id="modal-title" class="text-xl font-semibold text-foreground">
            New Location
          </h2>
          <p class="text-sm text-gray-500 mt-0.5">Add a new location to your archive</p>
        </div>
        <button
          onclick={handleCancel}
          class="text-gray-400 hover:text-gray-600 transition p-1 rounded hover:bg-gray-200"
          aria-label="Close"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Content -->
      <div class="p-5 space-y-5">
        {#if error}
          <div class="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
            <svg class="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
            </svg>
            {error}
          </div>
        {/if}

        <!-- Row 1: Location Name + Checkboxes (Host / Sub-Location) -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label for="loc-name" class="block text-sm font-medium text-gray-700 mb-1.5">
              Location Name <span class="text-red-500">*</span>
            </label>
            <input
              id="loc-name"
              type="text"
              bind:value={name}
              disabled={saving}
              placeholder="Enter location name"
              class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent disabled:opacity-50 transition"
            />
          </div>
          <div class="flex items-end pb-2 gap-4">
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isHostLocation}
                onchange={handleHostLocationToggle}
                disabled={saving}
                class="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent cursor-pointer"
              />
              <span class="text-sm font-medium text-gray-700">Host</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={addFirstBuilding}
                onchange={handleAddBuildingToggle}
                disabled={saving || !isHostLocation}
                class="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent cursor-pointer disabled:opacity-40"
              />
              <span class="text-sm font-medium text-gray-700 {!isHostLocation ? 'opacity-40' : ''}">Sub-Location</span>
            </label>
          </div>
        </div>

        <!-- Row 2: Sub-Location Name + Primary (conditional) -->
        {#if addFirstBuilding}
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="subloc-name" class="block text-sm font-medium text-gray-700 mb-1.5">
                Sub-Location Name <span class="text-red-500">*</span>
              </label>
              <input
                id="subloc-name"
                type="text"
                bind:value={subLocationName}
                disabled={saving}
                placeholder="e.g., Main Building, Powerhouse"
                class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent disabled:opacity-50 transition"
              />
              {#if subLocNameDuplicate}
                <p class="text-xs text-red-600 mt-1">Name already exists</p>
              {/if}
            </div>
            <div class="flex items-end pb-2">
              <label class="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  bind:checked={isPrimaryBuilding}
                  disabled={saving}
                  class="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent cursor-pointer"
                />
                <span class="text-sm font-medium text-gray-700">Primary</span>
              </label>
            </div>
          </div>
        {/if}

        <!-- State (required) -->
        <div>
          <label for="loc-state" class="block text-sm font-medium text-gray-700 mb-1.5">
            State <span class="text-red-500">*</span>
          </label>
          <AutocompleteInput
            value={selectedState}
            onchange={handleStateChange}
            suggestions={getStateSuggestions()}
            id="loc-state"
            placeholder="NY or New York"
            class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent disabled:opacity-50 transition uppercase"
          />
          <p class="text-xs text-gray-500 mt-1">Type 2-letter code or full state name</p>
        </div>

        <!-- Row 3: Type + Sub-Type -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label for="loc-type" class="block text-sm font-medium text-gray-700 mb-1.5">
              Type <span class="text-red-500">*</span>
            </label>
            <AutocompleteInput
              value={type}
              onchange={(val) => type = val}
              suggestions={allTypes}
              id="loc-type"
              placeholder="e.g., Factory, Hospital"
              class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent disabled:opacity-50 transition"
            />
          </div>
          <div>
            <label for="loc-subtype" class="block text-sm font-medium text-gray-700 mb-1.5">
              Sub-Type
            </label>
            <AutocompleteInput
              value={subType}
              onchange={(val) => subType = val}
              suggestions={getSubTypeSuggestions()}
              id="loc-subtype"
              placeholder="e.g., Textile Mill, Asylum"
              class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent disabled:opacity-50 transition"
            />
          </div>
        </div>

        <!-- Row 4: Author + Status -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label for="loc-author" class="block text-sm font-medium text-gray-700 mb-1.5">
              Author
            </label>
            <select
              id="loc-author"
              bind:value={author}
              disabled={saving}
              class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent disabled:opacity-50 transition bg-white"
            >
              {#each users as user}
                <option value={user.username}>
                  {user.display_name || user.username}
                </option>
              {/each}
            </select>
          </div>
          <div>
            <label for="loc-access" class="block text-sm font-medium text-gray-700 mb-1.5">
              Status
            </label>
            <select
              id="loc-access"
              bind:value={access}
              disabled={saving}
              class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent disabled:opacity-50 transition bg-white"
            >
              <option value="">Select...</option>
              {#each ACCESS_OPTIONS as opt}
                <option value={opt}>{opt}</option>
              {/each}
            </select>
          </div>
        </div>

        <!-- GPS Pre-fill indicator -->
        {#if $importModal.prefilledData?.gps_lat && $importModal.prefilledData?.gps_lng}
          <div class="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
            <svg class="w-5 h-5 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd" />
            </svg>
            <p class="text-sm text-green-700">
              GPS coordinates pre-filled: {$importModal.prefilledData.gps_lat.toFixed(6)}, {$importModal.prefilledData.gps_lng.toFixed(6)}
            </p>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="p-5 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
        <div class="text-xs text-gray-500">
          <span class="text-red-500">*</span> Required fields
        </div>
        <div class="flex gap-3">
          <button
            onclick={handleCancel}
            disabled={saving}
            class="px-4 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50 font-medium"
          >
            Cancel
          </button>
          <button
            onclick={handleCreate}
            disabled={saving}
            class="px-5 py-2.5 bg-accent text-white rounded-lg hover:bg-accent/90 transition disabled:opacity-50 font-medium shadow-sm"
          >
            {saving ? 'Creating...' : 'Create'}
          </button>
          <button
            onclick={handleCreateAndAddMedia}
            disabled={saving}
            class="px-5 py-2.5 border-2 border-accent text-accent bg-white rounded-lg hover:bg-accent hover:text-white transition disabled:opacity-50 font-medium"
          >
            {saving ? 'Creating...' : 'Create + Add Media'}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
