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
  import type { IntelligenceMatch, IntelligenceScanResult } from '../types/electron';
  import { importModal, closeImportModal } from '../stores/import-modal-store';
  import { router } from '../stores/router';
  import { toasts } from '../stores/toast-store';
  import AutocompleteInput from './AutocompleteInput.svelte';
  import ImportIntelligence from './ImportIntelligence.svelte';
  import DuplicateWarningPanel from './DuplicateWarningPanel.svelte';
  import { STATE_ABBREVIATIONS, getStateCodeFromName } from '../../electron/services/us-state-codes';
  import { ACCESS_OPTIONS } from '../constants/location-enums';
  import { getTypeForSubtype } from '../lib/type-hierarchy';
  import { DUPLICATE_CONFIG } from '../lib/constants';

  // Form state
  let name = $state('');
  let type = $state('');
  let subType = $state('');
  let selectedState = $state('');
  let author = $state('');
  let access = $state('Abandoned');

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

  // Import Intelligence state
  let showIntelligence = $state(false);
  let intelligenceDismissed = $state(false);

  // Phase 2: Reference map matching
  interface RefMapMatch {
    pointId: string;
    mapId: string;
    name: string;
    description: string | null;
    lat: number;
    lng: number;
    state: string | null;
    category: string | null;
    mapName: string;
    score: number;
  }
  let refMapMatches = $state<RefMapMatch[]>([]);
  let matchesLoading = $state(false);
  let matchesDismissed = $state(false);
  let matchSearchTimeout: ReturnType<typeof setTimeout> | null = null;

  // Migration 38: Duplicate detection state
  // ADR: ADR-pin-conversion-duplicate-prevention.md
  interface DuplicateMatch {
    locationId: string;
    locnam: string;
    akanam: string | null;
    historicalName: string | null;
    state: string | null;
    matchType: 'gps' | 'name';
    distanceMeters?: number;
    nameSimilarity?: number;
    matchedField?: 'locnam' | 'akanam' | 'historicalName';
    mediaCount: number;
  }
  let duplicateMatch = $state<DuplicateMatch | null>(null);
  let duplicateProcessing = $state(false);
  let duplicateDismissed = $state(false);
  let duplicateCheckTimeout: ReturnType<typeof setTimeout> | null = null;
  // Track ref point ID when creating from a reference map point
  let creatingFromRefPointId = $state<string | null>(null);

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
      if ($importModal.prefilledData.name) {
        name = $importModal.prefilledData.name;
      }
      if ($importModal.prefilledData.state) {
        selectedState = $importModal.prefilledData.state;
      }
      if ($importModal.prefilledData.type) {
        type = $importModal.prefilledData.type;
      }
      // Migration 38: Track ref point ID for deletion after location creation
      if ($importModal.prefilledData.refPointId) {
        creatingFromRefPointId = $importModal.prefilledData.refPointId;
      }
    }
  });

  // Re-load settings when modal opens (to restore author after resetForm)
  $effect(() => {
    if ($importModal.isOpen) {
      loadOptions();
      // Show intelligence panel if GPS is prefilled and not dismissed
      if ($importModal.prefilledData?.gps_lat && $importModal.prefilledData?.gps_lng && !intelligenceDismissed) {
        showIntelligence = true;
      }
    }
  });

  // Phase 2: Debounced reference map matching
  // Searches for matches when name changes (300ms debounce)
  $effect(() => {
    // Don't search if:
    // - GPS already provided (from map click)
    // - User dismissed suggestions
    // - Name too short
    const hasGps = $importModal.prefilledData?.gps_lat && $importModal.prefilledData?.gps_lng;
    if (hasGps || matchesDismissed || name.trim().length < 3) {
      refMapMatches = [];
      return;
    }

    // Clear previous timeout
    if (matchSearchTimeout) {
      clearTimeout(matchSearchTimeout);
    }

    // Debounce the search
    matchSearchTimeout = setTimeout(async () => {
      if (!window.electronAPI?.refMaps?.findMatches) return;

      try {
        matchesLoading = true;
        const matches = await window.electronAPI.refMaps.findMatches(name.trim(), {
          threshold: DUPLICATE_CONFIG.NAME_SIMILARITY_THRESHOLD,
          limit: 3,
          state: selectedState || null,
        });
        refMapMatches = matches;
      } catch (err) {
        console.error('Error finding ref map matches:', err);
        refMapMatches = [];
      } finally {
        matchesLoading = false;
      }
    }, 300);
  });

  // Migration 38: Debounced duplicate check when name or GPS changes
  // Checks for existing locations with similar name OR nearby GPS
  $effect(() => {
    // Skip if user already dismissed the warning
    if (duplicateDismissed) return;

    // Need at least a name to check
    const trimmedName = name.trim();
    if (trimmedName.length < 3) {
      duplicateMatch = null;
      return;
    }

    // Clear previous timeout
    if (duplicateCheckTimeout) {
      clearTimeout(duplicateCheckTimeout);
    }

    // Get GPS if available
    const gpsLat = $importModal.prefilledData?.gps_lat ?? null;
    const gpsLng = $importModal.prefilledData?.gps_lng ?? null;

    // Debounce the check (300ms)
    duplicateCheckTimeout = setTimeout(async () => {
      if (!window.electronAPI?.locations?.checkDuplicateByNameAndGps) return;

      try {
        const result = await window.electronAPI.locations.checkDuplicateByNameAndGps({
          name: trimmedName,
          lat: gpsLat,
          lng: gpsLng,
        });

        if (result.hasDuplicate && result.match) {
          duplicateMatch = result.match;
        } else {
          duplicateMatch = null;
        }
      } catch (err) {
        console.error('[ImportModal] Duplicate check failed:', err);
        duplicateMatch = null;
      }
    }, 300);
  });

  // Apply GPS from a matched reference point
  function applyMatchGps(match: RefMapMatch) {
    // Update the prefilled data in the store to include GPS with proper source attribution
    importModal.update(current => ({
      ...current,
      prefilledData: {
        ...current.prefilledData,
        gps_lat: match.lat,
        gps_lng: match.lng,
        gps_source: 'ref_map_point', // Track that GPS came from reference map, not user verification
      },
    }));
    // Clear matches after applying
    refMapMatches = [];
    // User already chose from RefMapMatches - skip ImportIntelligence panel
    intelligenceDismissed = true;
    showIntelligence = false;
    toasts.success(`GPS applied from "${match.name}"`);
  }

  // Dismiss match suggestions
  function dismissMatches() {
    matchesDismissed = true;
    refMapMatches = [];
  }

  // Migration 38: Handle "This is the same place" - navigate to existing location
  async function handleDuplicateSamePlace(locationId: string, locationName: string) {
    duplicateProcessing = true;
    try {
      closeImportModal();
      resetForm();
      toasts.success(`Navigating to "${locationName}"`);
      router.navigate(`/location/${locationId}`);
    } finally {
      duplicateProcessing = false;
    }
  }

  // Migration 38: Handle "Different place" - add exclusion and allow creation
  async function handleDuplicateDifferentPlace(matchName: string) {
    duplicateProcessing = true;
    try {
      // Add exclusion so we don't ask again for this pair
      if (window.electronAPI?.locations?.addExclusion) {
        await window.electronAPI.locations.addExclusion(name.trim(), matchName);
      }
      // Clear the warning and allow creation
      duplicateDismissed = true;
      duplicateMatch = null;
      toasts.success('Got it! You can proceed with creating this location.');
    } catch (err) {
      console.error('[ImportModal] Failed to add exclusion:', err);
      toasts.error('Failed to save preference');
    } finally {
      duplicateProcessing = false;
    }
  }

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

    // Include GPS if pre-filled (from map right-click or ref map match)
    // Use explicit null check to handle coordinates at 0 (equator/prime meridian)
    if ($importModal.prefilledData?.gps_lat !== null && $importModal.prefilledData?.gps_lat !== undefined &&
        $importModal.prefilledData?.gps_lng !== null && $importModal.prefilledData?.gps_lng !== undefined) {
      // Use tracked GPS source, defaulting to user_map_click for backward compatibility
      const gpsSource = $importModal.prefilledData.gps_source || 'user_map_click';
      data.gps = {
        lat: $importModal.prefilledData.gps_lat,
        lng: $importModal.prefilledData.gps_lng,
        source: gpsSource,
        // Only mark as verified on map if user actually confirmed via map click
        // GPS from ref_map_point or other sources should NOT be marked as verified
        verifiedOnMap: gpsSource === 'user_map_click',
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

      // Migration 38: Delete the ref point if we created from one
      // ADR: ADR-pin-conversion-duplicate-prevention.md - original map file preserved
      if (creatingFromRefPointId && window.electronAPI?.refMaps?.deletePoint) {
        try {
          await window.electronAPI.refMaps.deletePoint(creatingFromRefPointId);
        } catch (delErr) {
          // Non-fatal - location was created successfully
        }
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

      // Migration 38: Delete the ref point if we created from one
      if (creatingFromRefPointId && window.electronAPI?.refMaps?.deletePoint) {
        try {
          await window.electronAPI.refMaps.deletePoint(creatingFromRefPointId);
        } catch (delErr) {
          // Non-fatal - location was created successfully
        }
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
    access = 'Abandoned';
    isHostLocation = false;
    addFirstBuilding = false;
    subLocationName = '';
    isPrimaryBuilding = true;
    subLocNameDuplicate = false;
    error = '';
    // Phase 2: Reset match state
    refMapMatches = [];
    matchesDismissed = false;
    if (matchSearchTimeout) {
      clearTimeout(matchSearchTimeout);
      matchSearchTimeout = null;
    }
    // Reset intelligence state
    showIntelligence = false;
    intelligenceDismissed = false;
    // Migration 38: Reset duplicate detection state
    duplicateMatch = null;
    duplicateDismissed = false;
    duplicateProcessing = false;
    creatingFromRefPointId = null;
    if (duplicateCheckTimeout) {
      clearTimeout(duplicateCheckTimeout);
      duplicateCheckTimeout = null;
    }
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

  // Import Intelligence handlers
  function handleIntelligenceSelectLocation(locid: string, locName: string) {
    // User selected an existing location - navigate to it for import
    closeImportModal();
    resetForm();
    toasts.success(`Selected "${locName}" - add media from location page`);
    router.navigate(`/location/${locid}?autoImport=true`);
  }

  function handleIntelligenceSelectSubLocation(subid: string, locid: string, subName: string) {
    closeImportModal();
    resetForm();
    toasts.success(`Selected "${subName}" - add media from building page`);
    router.navigate(`/location/${locid}/sub/${subid}?autoImport=true`);
  }

  function handleIntelligenceCreateFromRefPoint(pointId: string, pointName: string, lat: number, lng: number) {
    // Apply the ref point data and show create form
    name = pointName;
    // Migration 38: Track the ref point ID for deletion after location creation
    creatingFromRefPointId = pointId;
    importModal.update(current => ({
      ...current,
      prefilledData: {
        ...current.prefilledData,
        gps_lat: lat,
        gps_lng: lng,
        gps_source: 'ref_map_point', // Track that GPS came from reference map
        name: pointName,
      },
    }));
    showIntelligence = false;
    intelligenceDismissed = true;
    toasts.success(`GPS applied from reference point`);
  }

  function handleIntelligenceCreateNew() {
    // User explicitly wants to create new location
    showIntelligence = false;
    intelligenceDismissed = true;
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
      class="bg-[#fff8f2] rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto relative z-[100000]"
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Header -->
      <div class="p-5 flex justify-between items-center bg-[#fff8f2]">
        <div>
          <h2 id="modal-title" class="text-xl font-semibold text-foreground">
            New Location
          </h2>
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
        <!-- Import Intelligence Panel - shown when GPS is prefilled -->
        {#if showIntelligence && $importModal.prefilledData?.gps_lat && $importModal.prefilledData?.gps_lng}
          <ImportIntelligence
            lat={$importModal.prefilledData.gps_lat}
            lng={$importModal.prefilledData.gps_lng}
            hints={{
              filename: undefined,
              inferredType: type || undefined,
              inferredState: selectedState || undefined,
            }}
            proposedName={name || $importModal.prefilledData?.name || undefined}
            excludeRefPointId={creatingFromRefPointId}
            onSelectLocation={handleIntelligenceSelectLocation}
            onSelectSubLocation={handleIntelligenceSelectSubLocation}
            onCreateFromRefPoint={handleIntelligenceCreateFromRefPoint}
            onCreateNew={handleIntelligenceCreateNew}
          />
        {/if}

        <!-- Migration 38: Duplicate Warning Panel - shown when similar location detected -->
        {#if duplicateMatch && !duplicateDismissed && (!showIntelligence || intelligenceDismissed)}
          <DuplicateWarningPanel
            proposedName={name.trim()}
            match={duplicateMatch}
            onSamePlace={handleDuplicateSamePlace}
            onDifferentPlace={handleDuplicateDifferentPlace}
            processing={duplicateProcessing}
            proposedLat={$importModal.prefilledData?.gps_lat}
            proposedLng={$importModal.prefilledData?.gps_lng}
          />
        {/if}

        <!-- Show form only when intelligence is dismissed or no GPS -->
        {#if !showIntelligence || intelligenceDismissed || !$importModal.prefilledData?.gps_lat}
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
              Location Name
            </label>
            <input
              id="loc-name"
              type="text"
              bind:value={name}
              disabled={saving}
              placeholder="Enter location name"
              class="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent disabled:opacity-50 transition"
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

        <!-- Phase 2: Reference Map Match Suggestions -->
        {#if refMapMatches.length > 0 && !matchesDismissed}
          <div class="bg-accent/10 border border-accent/30 rounded-lg p-3 animate-in fade-in duration-200">
            <div class="flex items-start gap-2">
              <svg class="w-5 h-5 text-accent flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-foreground">
                  {refMapMatches.length === 1 ? 'Possible match found' : `${refMapMatches.length} possible matches found`}
                </p>
                <div class="mt-2 space-y-2">
                  {#each refMapMatches as match}
                    <div class="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-accent/20">
                      <div class="min-w-0 flex-1">
                        <p class="text-sm font-medium text-gray-900 truncate">{match.name}</p>
                        <p class="text-xs text-gray-500">
                          From: {match.mapName}
                          <span class="ml-2 text-accent">{Math.round(match.score * 100)}% match</span>
                        </p>
                      </div>
                      <button
                        onclick={() => applyMatchGps(match)}
                        class="ml-3 px-3 py-1.5 bg-accent text-white text-xs font-medium rounded hover:opacity-90 transition flex-shrink-0"
                      >
                        Apply GPS
                      </button>
                    </div>
                  {/each}
                </div>
                <button
                  onclick={dismissMatches}
                  class="mt-2 text-xs text-accent hover:opacity-80 transition"
                >
                  Dismiss suggestions
                </button>
              </div>
            </div>
          </div>
        {:else if matchesLoading}
          <div class="text-xs text-gray-400 flex items-center gap-1">
            <svg class="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Checking reference maps...
          </div>
        {/if}

        <!-- Row 2: Sub-Location Name + Primary (conditional) -->
        {#if addFirstBuilding}
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="subloc-name" class="block text-sm font-medium text-gray-700 mb-1.5">
                Sub-Location Name
              </label>
              <input
                id="subloc-name"
                type="text"
                bind:value={subLocationName}
                disabled={saving}
                placeholder="e.g., Main Building, Powerhouse"
                class="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent disabled:opacity-50 transition"
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
            State
          </label>
          <AutocompleteInput
            value={selectedState}
            onchange={handleStateChange}
            suggestions={getStateSuggestions()}
            id="loc-state"
            placeholder="NY or New York"
            class="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent disabled:opacity-50 transition uppercase"
          />
          <p class="text-xs text-gray-500 mt-1">Type 2-letter code or full state name</p>
        </div>

        <!-- Row 3: Type + Sub-Type -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label for="loc-type" class="block text-sm font-medium text-gray-700 mb-1.5">
              Type
            </label>
            <AutocompleteInput
              value={type}
              onchange={(val) => type = val}
              suggestions={allTypes}
              id="loc-type"
              placeholder="e.g., Factory, Hospital"
              class="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent disabled:opacity-50 transition"
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
              class="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent disabled:opacity-50 transition"
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
        {/if}
        <!-- End form conditional -->
      </div>

      <!-- Footer - hide when showing intelligence -->
      {#if !showIntelligence || intelligenceDismissed || !$importModal.prefilledData?.gps_lat}
      <div class="p-5 bg-[#fff8f2] flex justify-end items-center">
        <div class="flex gap-3">
          <button
            onclick={handleCancel}
            disabled={saving}
            class="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50 font-medium"
          >
            Cancel
          </button>
          <button
            onclick={handleCreate}
            disabled={saving}
            class="px-3 py-1.5 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 transition disabled:opacity-50 font-medium shadow-sm"
          >
            {saving ? 'Creating...' : 'Create'}
          </button>
          <button
            onclick={handleCreateAndAddMedia}
            disabled={saving}
            class="px-3 py-1.5 text-sm border-2 border-accent text-accent bg-white rounded-lg hover:bg-accent hover:text-white transition disabled:opacity-50 font-medium"
          >
            {saving ? 'Adding...' : 'Add Media'}
          </button>
        </div>
      </div>
      {/if}
    </div>
  </div>
{/if}
