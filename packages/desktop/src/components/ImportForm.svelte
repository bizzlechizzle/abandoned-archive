<script lang="ts">
  import type { Location } from '@au-archive/core';
  import AutocompleteInput from './AutocompleteInput.svelte';

  interface Props {
    locations: Location[];
    selectedLocation: string;
    deleteOriginals: boolean;
    isImporting: boolean;
    isDragging: boolean;
    importProgress: string;
    progressCurrent: number;
    progressTotal: number;
    onLocationChange: (locid: string) => void;
    onDeleteOriginalsChange: (value: boolean) => void;
    onBrowse: () => void;
    onDragOver: (event: DragEvent) => void;
    onDragLeave: () => void;
    onDrop: (event: DragEvent) => void;
    onLocationCreated?: (location: Location) => void;
  }

  let {
    locations,
    selectedLocation,
    deleteOriginals,
    isImporting,
    isDragging,
    importProgress,
    progressCurrent,
    progressTotal,
    onLocationChange,
    onDeleteOriginalsChange,
    onBrowse,
    onDragOver,
    onDragLeave,
    onDrop,
    onLocationCreated,
  }: Props = $props();

  // Documentation level options per spec
  const DOCUMENTATION_OPTIONS = [
    'Interior + Exterior',
    'Exterior Only',
    'Perimeter Only',
    'Drive-By',
    'No Visit / Keyboard Scout',
    'Drone Only',
  ];

  // Access options per spec
  const ACCESS_OPTIONS = [
    'Abandoned',
    'Vacant',
    'Active',
    'Partially Active',
    'Unknown',
    'Trespassing',
  ];

  // Condition options per spec
  const CONDITION_OPTIONS = [
    'abandoned',
    'demolished',
    'renovated',
    'future classic',
    'unknown',
  ];

  // Status options per spec
  const STATUS_OPTIONS = [
    'locked',
    'open',
    'vandalized',
    'unknown',
    'fire damaged',
    'popular site',
    'time capsule',
    'abandoned',
  ];

  // New location form state - COMPREHENSIVE
  let showNewLocationForm = $state(false);
  let creatingLocation = $state(false);
  let createError = $state('');

  // Location Details
  let newLocName = $state('');
  let newAkaName = $state('');
  let newShortName = $state('');

  // Sub-location
  let isSubLocation = $state(false);
  let parentLocId = $state('');
  let isPrimarySubLocation = $state(false);

  // Classification
  let newType = $state('');
  let newSubType = $state('');

  // Documentation Status
  let newDocumentation = $state('');
  let newAccess = $state('');
  let newCondition = $state('');
  let newStatus = $state('');
  let newHistoric = $state(false);

  // Address
  let newStreet = $state('');
  let newCity = $state('');
  let newState = $state('');
  let newCounty = $state('');
  let newZipcode = $state('');

  // GPS - CRITICAL FIELD
  let newGpsInput = $state('');
  let parsedLat = $state<number | null>(null);
  let parsedLng = $state<number | null>(null);
  let gpsParseError = $state('');
  let gpsVerifiedOnMap = $state(false);
  let gpsSource = $state('manual_entry');

  // GPS source options per spec (must match core GpsSource type)
  const GPS_SOURCE_OPTIONS = [
    { value: 'manual_entry', label: 'Manual Entry' },
    { value: 'user_map_click', label: 'Map Click' },
    { value: 'photo_exif', label: 'Photo EXIF' },
    { value: 'geocoded_address', label: 'Address Geocoded' },
  ];

  // Author
  let newAuthor = $state('');

  // Autocomplete suggestions derived from existing locations
  function getTypeSuggestions(): string[] {
    const types = new Set<string>();
    locations.forEach(loc => {
      if (loc.type) types.add(loc.type);
    });
    return Array.from(types).sort();
  }

  function getSubtypeSuggestions(): string[] {
    const subtypes = new Set<string>();
    locations.forEach(loc => {
      if (loc.stype) subtypes.add(loc.stype);
    });
    return Array.from(subtypes).sort();
  }

  function getAuthorSuggestions(): string[] {
    const authors = new Set<string>();
    locations.forEach(loc => {
      if (loc.auth_imp) authors.add(loc.auth_imp);
    });
    return Array.from(authors).sort();
  }

  function getCitySuggestions(): string[] {
    const cities = new Set<string>();
    locations.forEach(loc => {
      if (loc.address?.city) cities.add(loc.address.city);
    });
    return Array.from(cities).sort();
  }

  function getCountySuggestions(): string[] {
    const counties = new Set<string>();
    locations.forEach(loc => {
      if (loc.address?.county) counties.add(loc.address.county);
    });
    return Array.from(counties).sort();
  }

  // Filter out sub-locations for parent selection
  function getParentLocationOptions(): Location[] {
    return locations.filter(loc => !loc.sub12);
  }

  function generateShortName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 12);
  }

  // Auto-generate short name when location name changes
  function handleLocNameChange() {
    if (newLocName && !newShortName) {
      newShortName = generateShortName(newLocName);
    }
  }

  // Parse GPS input - accepts multiple formats
  function parseGpsInput(input: string): { lat: number; lng: number } | null {
    if (!input.trim()) return null;

    const trimmed = input.trim();

    // Format 1: Decimal degrees "42.123456, -73.123456" or "42.123456 -73.123456"
    const decimalMatch = trimmed.match(/^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/);
    if (decimalMatch) {
      const lat = parseFloat(decimalMatch[1]);
      const lng = parseFloat(decimalMatch[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat, lng };
      }
    }

    // Format 2: DMS "42°7'23.4"N 73°7'23.4"W" (simplified parsing)
    const dmsMatch = trimmed.match(/(\d+)°(\d+)'([\d.]+)"?([NS])\s*(\d+)°(\d+)'([\d.]+)"?([EW])/i);
    if (dmsMatch) {
      let lat = parseInt(dmsMatch[1]) + parseInt(dmsMatch[2]) / 60 + parseFloat(dmsMatch[3]) / 3600;
      let lng = parseInt(dmsMatch[5]) + parseInt(dmsMatch[6]) / 60 + parseFloat(dmsMatch[7]) / 3600;
      if (dmsMatch[4].toUpperCase() === 'S') lat = -lat;
      if (dmsMatch[8].toUpperCase() === 'W') lng = -lng;
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat, lng };
      }
    }

    // Format 3: Simple DMS "42 7 23 N 73 7 23 W"
    const simpleDmsMatch = trimmed.match(/(\d+)\s+(\d+)\s+([\d.]+)\s*([NS])\s+(\d+)\s+(\d+)\s+([\d.]+)\s*([EW])/i);
    if (simpleDmsMatch) {
      let lat = parseInt(simpleDmsMatch[1]) + parseInt(simpleDmsMatch[2]) / 60 + parseFloat(simpleDmsMatch[3]) / 3600;
      let lng = parseInt(simpleDmsMatch[5]) + parseInt(simpleDmsMatch[6]) / 60 + parseFloat(simpleDmsMatch[7]) / 3600;
      if (simpleDmsMatch[4].toUpperCase() === 'S') lat = -lat;
      if (simpleDmsMatch[8].toUpperCase() === 'W') lng = -lng;
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat, lng };
      }
    }

    return null;
  }

  // Handle GPS input change
  function handleGpsInputChange() {
    if (newGpsInput) {
      const parsed = parseGpsInput(newGpsInput);
      if (parsed) {
        parsedLat = parsed.lat;
        parsedLng = parsed.lng;
        gpsParseError = '';
      } else {
        parsedLat = null;
        parsedLng = null;
        gpsParseError = 'Could not parse GPS coordinates. Try: "42.123, -73.456" or DMS format';
      }
    } else {
      parsedLat = null;
      parsedLng = null;
      gpsParseError = '';
    }
  }

  async function handleCreateLocation() {
    if (!newLocName.trim()) {
      createError = 'Location name is required';
      return;
    }

    if (!newState.trim()) {
      createError = 'State is required (2-letter abbreviation)';
      return;
    }

    if (newState.length !== 2) {
      createError = 'State must be 2-letter postal abbreviation (e.g., NY, CA)';
      return;
    }

    if (isSubLocation && !parentLocId) {
      createError = 'Please select a parent location for this sub-location';
      return;
    }

    try {
      creatingLocation = true;
      createError = '';

      const locationData: Record<string, unknown> = {
        locnam: newLocName.trim(),
        slocnam: newShortName.trim() || undefined,
        akanam: newAkaName.trim() || undefined,
        type: newType.trim() || undefined,
        stype: newSubType.trim() || undefined,
        condition: newCondition || undefined,
        status: newStatus || undefined,
        documentation: newDocumentation || undefined,
        access: newAccess || undefined,
        historic: newHistoric,
        auth_imp: newAuthor.trim() || undefined,
        address: {
          street: newStreet.trim() || undefined,
          city: newCity.trim() || undefined,
          county: newCounty.trim() || undefined,
          state: newState.trim().toUpperCase(),
          zipcode: newZipcode.trim() || undefined,
        },
      };

      // Add GPS if parsed successfully
      if (parsedLat !== null && parsedLng !== null) {
        locationData.gps = {
          lat: parsedLat,
          lng: parsedLng,
          source: gpsSource,
          verifiedOnMap: gpsVerifiedOnMap,
        };
      }

      const newLocation = await window.electronAPI.locations.create(locationData);

      // Auto-select the new location
      onLocationChange(newLocation.locid);

      // Notify parent to refresh locations list
      onLocationCreated?.(newLocation);

      // Reset form
      resetForm();
    } catch (error) {
      console.error('Error creating location:', error);
      createError = error instanceof Error ? error.message : 'Failed to create location';
    } finally {
      creatingLocation = false;
    }
  }

  function resetForm() {
    showNewLocationForm = false;
    newLocName = '';
    newAkaName = '';
    newShortName = '';
    isSubLocation = false;
    parentLocId = '';
    isPrimarySubLocation = false;
    newType = '';
    newSubType = '';
    newDocumentation = '';
    newAccess = '';
    newCondition = '';
    newStatus = '';
    newHistoric = false;
    newStreet = '';
    newCity = '';
    newState = '';
    newCounty = '';
    newZipcode = '';
    newGpsInput = '';
    parsedLat = null;
    parsedLng = null;
    gpsParseError = '';
    gpsVerifiedOnMap = false;
    gpsSource = 'manual_entry';
    newAuthor = '';
    createError = '';
  }

  function cancelNewLocation() {
    resetForm();
  }
</script>

<div class="max-w-4xl">
  <!-- Location Selector -->
  <div class="bg-white rounded-lg shadow p-6 mb-6">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">Import Location</h2>
        <p class="text-sm text-gray-500">Select an existing location or create a new one</p>
      </div>
      <button
        type="button"
        onclick={() => (showNewLocationForm = !showNewLocationForm)}
        disabled={isImporting}
        class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50 text-sm font-medium"
        title="Add new location"
      >
        {showNewLocationForm ? 'Back to Select' : '+ Create New Location'}
      </button>
    </div>

    {#if !showNewLocationForm}
      <!-- Existing Location Selector -->
      <div class="space-y-4">
        <div>
          <label for="location-select" class="block text-sm font-medium text-gray-700 mb-2">
            Select Location <span class="text-red-500">*</span>
          </label>
          <select
            id="location-select"
            value={selectedLocation}
            onchange={(e) => onLocationChange((e.target as HTMLSelectElement).value)}
            disabled={isImporting}
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
          >
            <option value="">Choose a location...</option>
            {#each locations as location}
              <option value={location.locid}>
                {location.locnam}
                {location.address?.city ? `, ${location.address.city}` : ''}
                {location.address?.state ? ` (${location.address.state})` : ''}
                {location.type ? ` - ${location.type}` : ''}
              </option>
            {/each}
          </select>
        </div>

        {#if locations.length === 0}
          <div class="p-4 bg-yellow-50 border border-yellow-200 rounded">
            <p class="text-sm text-yellow-800">
              <strong>No locations found.</strong> Click "Create New Location" to add your first location before importing.
            </p>
          </div>
        {/if}

        <div class="flex items-center">
          <input
            type="checkbox"
            id="delete-originals"
            checked={deleteOriginals}
            onchange={(e) => onDeleteOriginalsChange((e.target as HTMLInputElement).checked)}
            disabled={isImporting}
            class="mr-2"
          />
          <label for="delete-originals" class="text-sm text-gray-700">
            Delete original files after import
          </label>
        </div>
      </div>
    {:else}
      <!-- COMPREHENSIVE New Location Form -->
      <div class="space-y-6 border-t pt-6">
        {#if createError}
          <div class="p-3 bg-red-100 text-red-700 rounded text-sm">
            {createError}
          </div>
        {/if}

        <!-- Section: Location Details -->
        <div class="space-y-4">
          <h3 class="text-sm font-semibold text-gray-900 uppercase tracking-wide border-b pb-2">
            Location Details
          </h3>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="md:col-span-2">
              <label for="new-loc-name" class="block text-sm font-medium text-gray-700 mb-1">
                Location Name <span class="text-red-500">*</span>
              </label>
              <input
                id="new-loc-name"
                type="text"
                bind:value={newLocName}
                oninput={handleLocNameChange}
                placeholder="e.g., Hudson River State Hospital, Bethlehem Steel"
                disabled={creatingLocation}
                class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
              />
            </div>

            <div>
              <label for="new-aka-name" class="block text-sm font-medium text-gray-700 mb-1">
                Also Known As (AKA)
              </label>
              <input
                id="new-aka-name"
                type="text"
                bind:value={newAkaName}
                placeholder="Alternative name, local name..."
                disabled={creatingLocation}
                class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
              />
            </div>

            <div>
              <label for="new-short-name" class="block text-sm font-medium text-gray-700 mb-1">
                Short Name (12 chars max)
              </label>
              <input
                id="new-short-name"
                type="text"
                bind:value={newShortName}
                maxlength="12"
                placeholder="Auto-generated"
                disabled={creatingLocation}
                class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 font-mono"
              />
              <p class="text-xs text-gray-500 mt-1">Used for folder names and file prefixes</p>
            </div>
          </div>
        </div>

        <!-- Section: Sub-Location -->
        <div class="space-y-4">
          <div class="flex items-center">
            <input
              type="checkbox"
              id="is-sublocation"
              bind:checked={isSubLocation}
              disabled={creatingLocation}
              class="mr-2"
            />
            <label for="is-sublocation" class="text-sm font-medium text-gray-700">
              This is a sub-location (building within a complex, wing of a hospital, etc.)
            </label>
          </div>

          {#if isSubLocation}
            <div class="ml-6 p-4 bg-blue-50 border border-blue-200 rounded space-y-4">
              <div>
                <label for="parent-location" class="block text-sm font-medium text-gray-700 mb-1">
                  Parent Location <span class="text-red-500">*</span>
                </label>
                <select
                  id="parent-location"
                  bind:value={parentLocId}
                  disabled={creatingLocation}
                  class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
                >
                  <option value="">Select parent location...</option>
                  {#each getParentLocationOptions() as loc}
                    <option value={loc.locid}>
                      {loc.locnam} {loc.address?.state ? `(${loc.address.state})` : ''}
                    </option>
                  {/each}
                </select>
              </div>

              <div class="flex items-center">
                <input
                  type="checkbox"
                  id="primary-sublocation"
                  bind:checked={isPrimarySubLocation}
                  disabled={creatingLocation}
                  class="mr-2"
                />
                <label for="primary-sublocation" class="text-sm text-gray-700">
                  Primary sub-location (main building/area)
                </label>
              </div>
            </div>
          {/if}
        </div>

        <!-- Section: Classification -->
        <div class="space-y-4">
          <h3 class="text-sm font-semibold text-gray-900 uppercase tracking-wide border-b pb-2">
            Classification
          </h3>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label for="new-type" class="block text-sm font-medium text-gray-700 mb-1">
                Type
              </label>
              <AutocompleteInput
                bind:value={newType}
                onchange={(val) => newType = val}
                suggestions={getTypeSuggestions()}
                id="new-type"
                placeholder="Hospital, Factory, School, Church..."
                class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div>
              <label for="new-subtype" class="block text-sm font-medium text-gray-700 mb-1">
                Sub-Type
              </label>
              <AutocompleteInput
                bind:value={newSubType}
                onchange={(val) => newSubType = val}
                suggestions={getSubtypeSuggestions()}
                id="new-subtype"
                placeholder="Psychiatric, Textile Mill, Sanatorium..."
                class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          </div>
        </div>

        <!-- Section: Documentation Status -->
        <div class="space-y-4">
          <h3 class="text-sm font-semibold text-gray-900 uppercase tracking-wide border-b pb-2">
            Documentation Status
          </h3>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label for="new-documentation" class="block text-sm font-medium text-gray-700 mb-1">
                Documentation Level
              </label>
              <select
                id="new-documentation"
                bind:value={newDocumentation}
                disabled={creatingLocation}
                class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
              >
                <option value="">Select...</option>
                {#each DOCUMENTATION_OPTIONS as opt}
                  <option value={opt}>{opt}</option>
                {/each}
              </select>
            </div>

            <div>
              <label for="new-access" class="block text-sm font-medium text-gray-700 mb-1">
                Access Status
              </label>
              <select
                id="new-access"
                bind:value={newAccess}
                disabled={creatingLocation}
                class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
              >
                <option value="">Select...</option>
                {#each ACCESS_OPTIONS as opt}
                  <option value={opt}>{opt}</option>
                {/each}
              </select>
            </div>

            <div>
              <label for="new-condition" class="block text-sm font-medium text-gray-700 mb-1">
                Condition
              </label>
              <select
                id="new-condition"
                bind:value={newCondition}
                disabled={creatingLocation}
                class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
              >
                <option value="">Select...</option>
                {#each CONDITION_OPTIONS as opt}
                  <option value={opt}>{opt}</option>
                {/each}
              </select>
            </div>

            <div>
              <label for="new-status" class="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                id="new-status"
                bind:value={newStatus}
                disabled={creatingLocation}
                class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
              >
                <option value="">Select...</option>
                {#each STATUS_OPTIONS as opt}
                  <option value={opt}>{opt}</option>
                {/each}
              </select>
            </div>
          </div>

          <div class="flex items-center">
            <input
              type="checkbox"
              id="new-historic"
              bind:checked={newHistoric}
              disabled={creatingLocation}
              class="mr-2"
            />
            <label for="new-historic" class="text-sm text-gray-700">
              Historic Landmark / National Register
            </label>
          </div>
        </div>

        <!-- Section: Address -->
        <div class="space-y-4">
          <h3 class="text-sm font-semibold text-gray-900 uppercase tracking-wide border-b pb-2">
            Address
          </h3>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="md:col-span-2">
              <label for="new-street" class="block text-sm font-medium text-gray-700 mb-1">
                Street Address
              </label>
              <input
                id="new-street"
                type="text"
                bind:value={newStreet}
                placeholder="123 Main Street"
                disabled={creatingLocation}
                class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
              />
            </div>

            <div>
              <label for="new-city" class="block text-sm font-medium text-gray-700 mb-1">
                City
              </label>
              <AutocompleteInput
                bind:value={newCity}
                onchange={(val) => newCity = val}
                suggestions={getCitySuggestions()}
                id="new-city"
                placeholder="City name"
                class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div>
              <label for="new-state" class="block text-sm font-medium text-gray-700 mb-1">
                State <span class="text-red-500">*</span>
              </label>
              <input
                id="new-state"
                type="text"
                bind:value={newState}
                maxlength="2"
                placeholder="NY"
                disabled={creatingLocation}
                class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 uppercase"
              />
              <p class="text-xs text-gray-500 mt-1">2-letter postal abbreviation</p>
            </div>

            <div>
              <label for="new-county" class="block text-sm font-medium text-gray-700 mb-1">
                County
              </label>
              <AutocompleteInput
                bind:value={newCounty}
                onchange={(val) => newCounty = val}
                suggestions={getCountySuggestions()}
                id="new-county"
                placeholder="County name"
                class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div>
              <label for="new-zipcode" class="block text-sm font-medium text-gray-700 mb-1">
                Zipcode
              </label>
              <input
                id="new-zipcode"
                type="text"
                bind:value={newZipcode}
                placeholder="12345"
                maxlength="10"
                disabled={creatingLocation}
                class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
              />
            </div>
          </div>
        </div>

        <!-- Section: GPS COORDINATES - CRITICAL -->
        <div class="space-y-4">
          <h3 class="text-sm font-semibold text-gray-900 uppercase tracking-wide border-b pb-2 flex items-center gap-2">
            <span class="text-red-500">*</span>
            GPS Coordinates
            <span class="text-xs font-normal text-gray-500 normal-case">(Critical for archival accuracy)</span>
          </h3>

          <div class="p-4 bg-amber-50 border border-amber-200 rounded">
            <div class="space-y-4">
              <div>
                <label for="new-gps-input" class="block text-sm font-medium text-gray-700 mb-1">
                  GPS Coordinates
                </label>
                <input
                  id="new-gps-input"
                  type="text"
                  bind:value={newGpsInput}
                  oninput={handleGpsInputChange}
                  placeholder="42.123456, -73.456789 or 42 7 23.4 N 73 27 23.4 W"
                  disabled={creatingLocation}
                  class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 font-mono"
                />
                <p class="text-xs text-gray-600 mt-1">
                  Accepts: Decimal degrees (42.123, -73.456), DMS (42 7 23 N 73 27 23 W), or copy-paste from maps
                </p>
              </div>

              {#if gpsParseError}
                <p class="text-sm text-red-600">{gpsParseError}</p>
              {/if}

              {#if parsedLat !== null && parsedLng !== null}
                <div class="p-3 bg-green-100 border border-green-300 rounded">
                  <p class="text-sm text-green-800 font-mono">
                    Parsed: {parsedLat.toFixed(6)}, {parsedLng.toFixed(6)}
                  </p>
                </div>

                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label for="gps-source" class="block text-sm font-medium text-gray-700 mb-1">
                      GPS Source
                    </label>
                    <select
                      id="gps-source"
                      bind:value={gpsSource}
                      disabled={creatingLocation}
                      class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
                    >
                      {#each GPS_SOURCE_OPTIONS as option}
                        <option value={option.value}>{option.label}</option>
                      {/each}
                    </select>
                  </div>

                  <div class="flex items-center pt-6">
                    <input
                      type="checkbox"
                      id="gps-verified"
                      bind:checked={gpsVerifiedOnMap}
                      disabled={creatingLocation}
                      class="mr-2"
                    />
                    <label for="gps-verified" class="text-sm text-gray-700">
                      Verified on map
                    </label>
                  </div>
                </div>
              {/if}

              <p class="text-xs text-amber-700">
                <strong>Why GPS matters:</strong> Without coordinates, your photos exist in a void.
                GPS enables map views, proximity searches, and proves location authenticity.
              </p>
            </div>
          </div>
        </div>

        <!-- Section: Author -->
        <div class="space-y-4">
          <h3 class="text-sm font-semibold text-gray-900 uppercase tracking-wide border-b pb-2">
            Attribution
          </h3>

          <div>
            <label for="new-author" class="block text-sm font-medium text-gray-700 mb-1">
              Documented By
            </label>
            <AutocompleteInput
              bind:value={newAuthor}
              onchange={(val) => newAuthor = val}
              suggestions={getAuthorSuggestions()}
              id="new-author"
              placeholder="Your name or username"
              class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <p class="text-xs text-gray-500 mt-1">Who documented/photographed this location</p>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex gap-3 pt-4 border-t">
          <button
            type="button"
            onclick={handleCreateLocation}
            disabled={creatingLocation || !newLocName.trim() || !newState.trim()}
            class="flex-1 px-4 py-3 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50 font-medium"
          >
            {creatingLocation ? 'Creating Location...' : 'Create Location & Continue to Import'}
          </button>
          <button
            type="button"
            onclick={cancelNewLocation}
            disabled={creatingLocation}
            class="px-6 py-3 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    {/if}
  </div>

  {#if !showNewLocationForm}
    <!-- Browse Button -->
    <button
      onclick={onBrowse}
      disabled={!selectedLocation || isImporting}
      class="w-full mb-4 px-4 py-3 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
    >
      {isImporting ? 'Importing...' : 'Browse Files to Import'}
    </button>

    <!-- Drag & Drop Zone -->
    <div
      class="border-2 border-dashed rounded-lg p-12 text-center transition cursor-pointer {isDragging ? 'border-accent bg-accent bg-opacity-10' : 'border-gray-300'} {!selectedLocation || isImporting ? 'opacity-50 cursor-not-allowed' : 'hover:border-accent'}"
      ondragover={onDragOver}
      ondragleave={onDragLeave}
      ondrop={onDrop}
      onclick={!selectedLocation || isImporting ? undefined : onBrowse}
      role="button"
      tabindex="0"
    >
      <div class="text-gray-400">
        <svg class="mx-auto h-12 w-12 mb-4" stroke="currentColor" fill="none" viewBox="0 0 48 48">
          <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <p class="text-lg mb-2 text-gray-600">Drag and drop files here</p>
        <p class="text-sm text-gray-500">or click to browse</p>
        <p class="text-xs mt-4 text-gray-400">Supported: Images (JPG, PNG, TIFF, RAW), Videos (MP4, MOV, AVI), Documents (PDF, TXT)</p>
      </div>
    </div>

    <!-- Progress Display -->
    {#if importProgress}
      <div class="mt-4 p-4 bg-blue-50 border border-blue-200 rounded">
        <p class="text-sm text-blue-800">{importProgress}</p>
        {#if isImporting && progressTotal > 0}
          <div class="mt-3">
            <div class="w-full bg-gray-200 rounded-full h-2.5">
              <div
                class="bg-accent h-2.5 rounded-full transition-all duration-300"
                style="width: {(progressCurrent / progressTotal) * 100}%"
              ></div>
            </div>
            <p class="text-xs text-gray-600 mt-1 text-right">
              {progressCurrent} / {progressTotal} files ({Math.round((progressCurrent / progressTotal) * 100)}%)
            </p>
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</div>
