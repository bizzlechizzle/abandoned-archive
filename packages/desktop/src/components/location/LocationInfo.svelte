<script lang="ts">
  /**
   * LocationInfo - Information box with structured fields
   * Per DECISION-019: Complete overhaul to mirror LocationMapSection styling
   * Display order: AKA, Status+Type, Built/Abandoned, Documentation, Flags, Historical Name, Author
   */
  import type { Location, LocationInput } from '@au-archive/core';
  import { ACCESS_OPTIONS } from '../../constants/location-enums';
  import { onMount } from 'svelte';
  import { router } from '../../stores/router';

  // Author from location_authors table
  interface LocationAuthor {
    user_id: string;
    username: string;
    display_name: string | null;
    role: 'creator' | 'documenter' | 'contributor';
    added_at: string;
  }

  // Media types for author extraction
  interface MediaWithAuthor {
    auth_imp?: string | null;
    imported_by?: string | null;
    is_contributed?: number;
    contribution_source?: string | null;
  }

  interface Props {
    location: Location;
    images?: MediaWithAuthor[];
    videos?: MediaWithAuthor[];
    documents?: MediaWithAuthor[];
    onNavigateFilter: (type: string, value: string) => void;
    onSave?: (updates: Partial<LocationInput>) => Promise<void>;
  }

  let { location, images = [], videos = [], documents = [], onNavigateFilter, onSave }: Props = $props();

  // Edit modal state
  let showEditModal = $state(false);
  let saving = $state(false);

  // Autocomplete options for Type/Sub-Type
  let typeOptions = $state<string[]>([]);
  let stypeOptions = $state<string[]>([]);

  // Authors from location_authors table
  let authors = $state<LocationAuthor[]>([]);

  // Load autocomplete options and authors on mount
  onMount(async () => {
    try {
      const [types, stypes, locationAuthors] = await Promise.all([
        window.electronAPI?.locations?.getDistinctTypes?.() || [],
        window.electronAPI?.locations?.getDistinctSubTypes?.() || [],
        window.electronAPI?.locationAuthors?.findByLocation?.(location.locid) || [],
      ]);
      typeOptions = types;
      stypeOptions = stypes;
      authors = locationAuthors;
    } catch (err) {
      console.error('Error loading type options:', err);
    }
  });

  // Edit form state - DECISION-019: All information fields
  let editForm = $state({
    locnam: '',
    locnamVerified: false,
    locnamShort: '',      // Migration 21: Custom short name for hero
    locnamUseThe: false,  // Migration 21: Prepend "The" to display name
    historicalName: '',
    historicalNameVerified: false,
    akanam: '',
    akanamVerified: false,
    access: '',
    builtYear: '',
    builtType: 'year' as 'year' | 'range' | 'date',
    abandonedYear: '',
    abandonedType: 'year' as 'year' | 'range' | 'date',
    type: '',
    stype: '',
    historic: false,
    favorite: false,
    project: false,
    docInterior: false,
    docExterior: false,
    docDrone: false,
    docWebHistory: false,
    docMapFind: false,
    auth_imp: '',
  });

  // Track original status for change detection
  let originalStatus = $state('');

  // PUEA: Check if we have data to display for each section
  const hasHistoricalName = $derived(!!location.historicalName);
  const hasAkaName = $derived(!!location.akanam);
  const hasStatus = $derived(!!location.access);
  const hasDocumentation = $derived(
    location.docInterior || location.docExterior || location.docDrone || location.docWebHistory || location.docMapFind
  );
  const hasBuiltOrAbandoned = $derived(!!location.builtYear || !!location.abandonedYear);
  const hasType = $derived(!!location.type);
  const hasFlags = $derived(location.historic || location.favorite || location.project);
  const hasAuthor = $derived(!!location.auth_imp);  // Original author field
  const hasAuthors = $derived(authors.length > 0);  // Tracked contributors from location_authors

  // Role display labels
  const roleLabels: Record<string, string> = {
    creator: 'Creator',
    documenter: 'Documenter',
    contributor: 'Contributor',
  };

  // Extract unique authors from media (dedup against location_authors)
  const mediaAuthors = $derived(() => {
    const allMedia = [...images, ...videos, ...documents];
    const authorSet = new Set<string>();
    const locationAuthorNames = new Set(authors.map(a => a.username).concat(authors.map(a => a.display_name).filter(Boolean) as string[]));

    // Also include location.auth_imp in dedup check
    if (location.auth_imp) locationAuthorNames.add(location.auth_imp);

    for (const m of allMedia) {
      if (m.auth_imp && !locationAuthorNames.has(m.auth_imp)) {
        authorSet.add(m.auth_imp);
      }
    }
    return Array.from(authorSet);
  });

  // Extract unique external contributors (is_contributed = 1)
  const externalContributors = $derived(() => {
    const allMedia = [...images, ...videos, ...documents];
    const sources = new Set<string>();
    for (const m of allMedia) {
      if (m.is_contributed === 1 && m.contribution_source) {
        sources.add(m.contribution_source);
      }
    }
    return Array.from(sources);
  });

  const hasMediaAuthors = $derived(mediaAuthors().length > 0);
  const hasExternalContributors = $derived(externalContributors().length > 0);

  // Parse AKA names for display (split by comma)
  const displayAkaNames = $derived(
    location.akanam ? location.akanam.split(',').map(s => s.trim()).filter(Boolean) : []
  );

  // Hide AKA if only 1 name and it matches Historical Name (duplicate)
  const shouldShowAka = $derived(
    hasAkaName &&
    !(displayAkaNames.length === 1 && displayAkaNames[0] === location.historicalName)
  );

  // Check if we have any info to display at all
  const hasAnyInfo = $derived(
    hasHistoricalName || hasAkaName || hasStatus || hasDocumentation ||
    hasBuiltOrAbandoned || hasType || hasFlags || hasAuthor || hasAuthors ||
    hasMediaAuthors || hasExternalContributors
  );

  // Documentation labels for display
  const docLabels = [
    { key: 'docInterior', label: 'Interior', field: 'docInterior' as const },
    { key: 'docExterior', label: 'Exterior', field: 'docExterior' as const },
    { key: 'docDrone', label: 'Drone', field: 'docDrone' as const },
    { key: 'docMapFind', label: 'Map Find', field: 'docMapFind' as const },
    { key: 'docWebHistory', label: 'Web Find', field: 'docWebHistory' as const },
  ];

  // Get active documentation types
  const activeDocTypes = $derived(
    docLabels.filter(d => location[d.field]).map(d => d.label)
  );

  // Parse AKA names for Historical Name dropdown
  const akaNames = $derived(
    editForm.akanam ? editForm.akanam.split(',').map(s => s.trim()).filter(Boolean) : []
  );

  // Format year display based on type
  function formatYearDisplay(value: string | undefined, type: 'year' | 'range' | 'date' | undefined): string {
    if (!value) return '';
    return value; // Return as-is, type determines interpretation
  }

  // Handle Drone checkbox - auto-select Exterior
  function handleDroneChange(checked: boolean) {
    editForm.docDrone = checked;
    if (checked) {
      editForm.docExterior = true;
    }
  }

  // AKA name management
  let newAkaInput = $state('');

  function removeAkaName(nameToRemove: string) {
    const names = akaNames.filter(n => n !== nameToRemove);
    editForm.akanam = names.join(', ');
  }

  function addAkaName() {
    const trimmed = newAkaInput.trim();
    if (trimmed && !akaNames.includes(trimmed)) {
      const names = [...akaNames, trimmed];
      editForm.akanam = names.join(', ');
    }
    newAkaInput = '';
  }

  function handleAkaKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addAkaName();
    }
  }

  function openEditModal() {
    originalStatus = location.access || '';
    editForm = {
      locnam: location.locnam || '',
      locnamVerified: location.locnamVerified || false,
      locnamShort: location.locnamShort || '',
      locnamUseThe: location.locnamUseThe || false,
      historicalName: location.historicalName || '',
      historicalNameVerified: location.historicalNameVerified || false,
      akanam: location.akanam || '',
      akanamVerified: location.akanamVerified || false,
      access: location.access || '',
      builtYear: location.builtYear || '',
      builtType: location.builtType || 'year',
      abandonedYear: location.abandonedYear || '',
      abandonedType: location.abandonedType || 'year',
      type: location.type || '',
      stype: location.stype || '',
      historic: location.historic || false,
      favorite: location.favorite || false,
      project: location.project || false,
      docInterior: location.docInterior || false,
      docExterior: location.docExterior || false,
      docDrone: location.docDrone || false,
      docWebHistory: location.docWebHistory || false,
      docMapFind: location.docMapFind || false,
      auth_imp: location.auth_imp || '',
    };
    newAkaInput = '';
    showEditModal = true;
  }

  async function handleSave() {
    if (!onSave) return;
    try {
      saving = true;

      // Track status change date if status changed
      const statusChanged = editForm.access !== originalStatus;
      const statusChangedAt = statusChanged ? new Date().toISOString() : undefined;

      await onSave({
        locnam: editForm.locnam,
        locnamVerified: editForm.locnamVerified,
        locnamShort: editForm.locnamShort || undefined,
        locnamUseThe: editForm.locnamUseThe,
        historicalName: editForm.historicalName || undefined,
        historicalNameVerified: editForm.historicalNameVerified,
        akanam: editForm.akanam || undefined,
        akanamVerified: editForm.akanamVerified,
        access: editForm.access || undefined,
        statusChangedAt: statusChangedAt,
        builtYear: editForm.builtYear || undefined,
        builtType: editForm.builtYear ? editForm.builtType : undefined,
        abandonedYear: editForm.abandonedYear || undefined,
        abandonedType: editForm.abandonedYear ? editForm.abandonedType : undefined,
        type: editForm.type || undefined,
        stype: editForm.stype || undefined,
        historic: editForm.historic,
        favorite: editForm.favorite,
        project: editForm.project,
        docInterior: editForm.docInterior,
        docExterior: editForm.docExterior,
        docDrone: editForm.docDrone,
        docWebHistory: editForm.docWebHistory,
        docMapFind: editForm.docMapFind,
        auth_imp: editForm.auth_imp || undefined,
      });
      showEditModal = false;
    } catch (err) {
      console.error('Error saving information:', err);
    } finally {
      saving = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') showEditModal = false;
  }
</script>

<svelte:window onkeydown={showEditModal ? handleKeydown : undefined} />

<!-- DECISION-019: Information Box styled to match LocationMapSection -->
<div class="bg-white rounded-lg shadow-md">
  <!-- Header with edit button -->
  <div class="flex items-start justify-between px-8 pt-6 pb-4">
    <h2 class="text-2xl font-semibold text-foreground leading-none">Information</h2>
    {#if onSave}
      <button
        onclick={openEditModal}
        class="text-sm text-accent hover:underline leading-none mt-1"
        title="Edit information"
      >
        edit
      </button>
    {/if}
  </div>

  <!-- Content sections - PUEA: Only show sections that have data -->
  <!-- Display order: AKA, Status+Type, Built/Abandoned, Documentation, Flags, Historical Name, Author -->
  <div class="px-8 pb-6">
    {#if hasAnyInfo}
      <!-- AKA Name (show only if exists and not duplicate of Historical Name) -->
      {#if shouldShowAka}
        <div class="mb-4">
          <h3 class="section-title mb-1">Also Known As</h3>
          <div class="flex flex-wrap gap-2">
            {#each displayAkaNames as name}
              <span class="px-2 py-0.5 bg-accent/10 text-accent rounded text-sm">{name}</span>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Status + Type (same row) -->
      {#if hasStatus || hasType}
        <div class="mb-4 grid grid-cols-2 gap-4">
          <div>
            <h3 class="section-title mb-1">Status</h3>
            {#if hasStatus}
              <button
                onclick={() => onNavigateFilter('access', location.access!)}
                class="text-base text-accent hover:underline"
                title="View all locations with this status"
              >
                {location.access}
              </button>
            {:else}
              <p class="text-sm text-gray-400 italic">Not set</p>
            {/if}
          </div>
          <div>
            <h3 class="section-title mb-1">Type</h3>
            {#if hasType}
              <p class="text-base">
                <button
                  onclick={() => onNavigateFilter('type', location.type!)}
                  class="text-accent hover:underline"
                  title="View all {location.type} locations"
                >
                  {location.type}
                </button>
                {#if location.stype}
                  <span class="text-gray-400"> / </span>
                  <button
                    onclick={() => onNavigateFilter('stype', location.stype!)}
                    class="text-accent hover:underline"
                    title="View all {location.stype} locations"
                  >
                    {location.stype}
                  </button>
                {/if}
              </p>
            {:else}
              <p class="text-sm text-gray-400 italic">Not set</p>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Built / Abandoned -->
      {#if hasBuiltOrAbandoned}
        <div class="mb-4 grid grid-cols-2 gap-4">
          <div>
            <h3 class="section-title mb-1">Built</h3>
            {#if location.builtYear}
              <span class="px-2 py-0.5 bg-accent/10 text-accent rounded text-sm">{formatYearDisplay(location.builtYear, location.builtType)}</span>
            {:else}
              <p class="text-sm text-gray-400 italic">Not set</p>
            {/if}
          </div>
          <div>
            <h3 class="section-title mb-1">Abandoned</h3>
            {#if location.abandonedYear}
              <span class="px-2 py-0.5 bg-accent/10 text-accent rounded text-sm">{formatYearDisplay(location.abandonedYear, location.abandonedType)}</span>
            {:else}
              <p class="text-sm text-gray-400 italic">Not set</p>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Documentation badges - accent color -->
      {#if hasDocumentation}
        <div class="mb-4">
          <h3 class="section-title mb-1">Documentation</h3>
          <div class="flex flex-wrap gap-2">
            {#each activeDocTypes as docType}
              <span class="px-2 py-0.5 bg-accent/10 text-accent rounded text-sm">
                {docType}
              </span>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Flags - text links (clickable filters) -->
      {#if hasFlags}
        <div class="mb-4">
          <h3 class="section-title mb-1">Flags</h3>
          <div class="flex flex-wrap gap-3">
            {#if location.project}
              <button
                onclick={() => onNavigateFilter('project', 'true')}
                class="text-base text-accent hover:underline"
                title="View all project locations"
              >
                Project
              </button>
            {/if}
            {#if location.favorite}
              <button
                onclick={() => onNavigateFilter('favorite', 'true')}
                class="text-base text-accent hover:underline"
                title="View all favorites"
              >
                Favorite
              </button>
            {/if}
            {#if location.historic}
              <button
                onclick={() => onNavigateFilter('historic', 'true')}
                class="text-base text-accent hover:underline"
                title="View all historic landmarks"
              >
                Historical
              </button>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Historical Name (show only if exists) -->
      {#if hasHistoricalName}
        <div class="mb-4">
          <h3 class="section-title mb-1">Historical Name</h3>
          <span class="px-2 py-0.5 bg-accent/10 text-accent rounded text-sm">{location.historicalName}</span>
        </div>
      {/if}

      <!-- Author / Contributors -->
      {#if hasAuthor || hasAuthors || hasMediaAuthors || hasExternalContributors}
        <div>
          <h3 class="section-title mb-1">{(hasAuthors || hasMediaAuthors || hasExternalContributors) ? 'Authors' : 'Author'}</h3>
          <div class="flex flex-wrap gap-2">
            {#if hasAuthor && !authors.some(a => a.username === location.auth_imp || a.display_name === location.auth_imp)}
              <!-- Show auth_imp if not already in location_authors -->
              <button
                onclick={() => onNavigateFilter('author', location.auth_imp!)}
                class="px-2 py-0.5 bg-accent/10 text-accent rounded text-sm hover:bg-accent/20 transition"
                title="View all locations by {location.auth_imp}"
              >
                {location.auth_imp}
              </button>
            {/if}
            {#each authors as author}
              <button
                onclick={() => router.navigate('/locations', undefined, { authorId: author.user_id })}
                class="inline-flex items-center gap-1.5 px-2 py-0.5 bg-accent/10 text-accent rounded text-sm hover:bg-accent/20 transition"
                title="View all locations by {author.display_name || author.username}"
              >
                <span>{author.display_name || author.username}</span>
                <span class="text-xs text-accent/60">({roleLabels[author.role] || author.role})</span>
              </button>
            {/each}
            <!-- Media authors (from photos/videos, not in location_authors) -->
            {#each mediaAuthors() as mediaAuthor}
              <button
                onclick={() => onNavigateFilter('author', mediaAuthor)}
                class="px-2 py-0.5 bg-accent/10 text-accent rounded text-sm hover:bg-accent/20 transition"
                title="View all locations by {mediaAuthor}"
              >
                {mediaAuthor}
              </button>
            {/each}
            <!-- External contributors (contributed media) -->
            {#each externalContributors() as source}
              <span
                class="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-sm"
                title="Contributed media"
              >
                {source}
              </span>
            {/each}
          </div>
        </div>
      {/if}
    {:else}
      <p class="text-gray-400 text-sm italic">No information added yet</p>
    {/if}
  </div>
</div>

<!-- DECISION-019: Edit Modal -->
{#if showEditModal}
  <div
    class="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50"
    onclick={() => showEditModal = false}
    role="button"
    tabindex="-1"
  >
    <div
      class="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden relative z-[100000]"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <h2 class="text-lg font-semibold text-foreground">Edit Information</h2>
        <button
          onclick={() => showEditModal = false}
          class="p-1 text-gray-400 hover:text-gray-600 transition"
          aria-label="Close"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Content - Form order: Location Name, AKA, Historical Name (dropdown), Status (dropdown), Type/Sub-Type (autocomplete), Built/Abandoned, Documentation, Flags, Author -->
      <div class="p-6 overflow-y-auto max-h-[65vh] space-y-5">
        <!-- Location Name -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Location Name</label>
          <input
            type="text"
            bind:value={editForm.locnam}
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="Location name"
          />
        </div>

        <!-- Hero Display Name - Migration 21 -->
        <div class="bg-gray-50 rounded-lg p-4 -mx-1">
          <label class="block text-sm font-medium text-gray-700 mb-2">Hero Display Name</label>
          <p class="text-xs text-gray-500 mb-3">Override the auto-generated title shown on the hero image</p>

          <div class="space-y-3">
            <div>
              <input
                type="text"
                bind:value={editForm.locnamShort}
                class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="Custom short name (leave empty for auto)"
              />
            </div>

            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={editForm.locnamUseThe}
                class="w-4 h-4 text-accent rounded border-gray-300 focus:ring-accent"
              />
              <span class="text-sm">Prepend "The"</span>
            </label>

            <!-- Preview -->
            <div class="text-xs text-gray-500">
              Preview: <span class="font-medium text-gray-700">{editForm.locnamUseThe ? 'The ' : ''}{editForm.locnamShort || '(auto-generated from name)'}</span>
            </div>
          </div>
        </div>

        <!-- AKA Name - Pill tag UI -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Also Known As</label>
          <!-- Existing AKA names as pills -->
          {#if akaNames.length > 0}
            <div class="flex flex-wrap gap-2 mb-2">
              {#each akaNames as name}
                <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-accent/10 text-accent rounded text-sm">
                  {name}
                  <button
                    type="button"
                    onclick={() => removeAkaName(name)}
                    class="text-accent/60 hover:text-accent ml-0.5"
                    title="Remove {name}"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              {/each}
            </div>
          {/if}
          <!-- Input to add new AKA name -->
          <input
            type="text"
            bind:value={newAkaInput}
            onkeydown={handleAkaKeydown}
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="Type a name and press Enter"
          />
        </div>

        <!-- Historical Name - dropdown from AKA values -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Historical Name</label>
          <select
            bind:value={editForm.historicalName}
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">Select from AKA names...</option>
            {#each akaNames as name}
              <option value={name}>{name}</option>
            {/each}
          </select>
        </div>

        <!-- Status - dropdown -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Status</label>
          <select
            bind:value={editForm.access}
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">Select status...</option>
            {#each ACCESS_OPTIONS as option}
              <option value={option}>{option}</option>
            {/each}
          </select>
        </div>

        <!-- Type / Sub-Type with autocomplete -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Type</label>
            <input
              type="text"
              list="type-options"
              bind:value={editForm.type}
              class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="e.g., Hospital, Factory"
            />
            <datalist id="type-options">
              {#each typeOptions as option}
                <option value={option} />
              {/each}
            </datalist>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Sub-Type</label>
            <input
              type="text"
              list="stype-options"
              bind:value={editForm.stype}
              class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="e.g., Psychiatric, Textile"
            />
            <datalist id="stype-options">
              {#each stypeOptions as option}
                <option value={option} />
              {/each}
            </datalist>
          </div>
        </div>

        <!-- Built -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Built</label>
          <div class="flex gap-2">
            <select
              bind:value={editForm.builtType}
              class="px-2 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent text-sm"
            >
              <option value="year">Year</option>
              <option value="range">Range</option>
              <option value="date">Date</option>
            </select>
            <input
              type="text"
              bind:value={editForm.builtYear}
              placeholder={editForm.builtType === 'year' ? '1920' : editForm.builtType === 'range' ? '1920-1925' : '1920-05-15'}
              class="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
        </div>

        <!-- Abandoned -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Abandoned</label>
          <div class="flex gap-2">
            <select
              bind:value={editForm.abandonedType}
              class="px-2 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent text-sm"
            >
              <option value="year">Year</option>
              <option value="range">Range</option>
              <option value="date">Date</option>
            </select>
            <input
              type="text"
              bind:value={editForm.abandonedYear}
              placeholder={editForm.abandonedType === 'year' ? '2005' : editForm.abandonedType === 'range' ? '2005-2010' : '2005-03-20'}
              class="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
        </div>

        <!-- Documentation checkboxes - Drone auto-selects Exterior -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Documentation</label>
          <div class="grid grid-cols-2 gap-2">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={editForm.docInterior}
                class="w-4 h-4 text-accent rounded border-gray-300 focus:ring-accent"
              />
              <span class="text-sm">Interior</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={editForm.docExterior}
                class="w-4 h-4 text-accent rounded border-gray-300 focus:ring-accent"
              />
              <span class="text-sm">Exterior</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editForm.docDrone}
                onchange={(e) => handleDroneChange(e.currentTarget.checked)}
                class="w-4 h-4 text-accent rounded border-gray-300 focus:ring-accent"
              />
              <span class="text-sm">Drone</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={editForm.docMapFind}
                class="w-4 h-4 text-accent rounded border-gray-300 focus:ring-accent"
              />
              <span class="text-sm">Map Find</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={editForm.docWebHistory}
                class="w-4 h-4 text-accent rounded border-gray-300 focus:ring-accent"
              />
              <span class="text-sm">Web Find</span>
            </label>
          </div>
        </div>

        <!-- Flags - accent color for all -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Flags</label>
          <div class="flex flex-wrap gap-4">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={editForm.project}
                class="w-4 h-4 text-accent rounded border-gray-300 focus:ring-accent"
              />
              <span class="text-sm">Project</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={editForm.favorite}
                class="w-4 h-4 text-accent rounded border-gray-300 focus:ring-accent"
              />
              <span class="text-sm">Favorite</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={editForm.historic}
                class="w-4 h-4 text-accent rounded border-gray-300 focus:ring-accent"
              />
              <span class="text-sm">Historical</span>
            </label>
          </div>
        </div>

        <!-- Author -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Author</label>
          <input
            type="text"
            bind:value={editForm.auth_imp}
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="Who documented this location"
          />
        </div>
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
        <button
          type="button"
          onclick={() => showEditModal = false}
          class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition"
        >
          Cancel
        </button>
        <button
          type="button"
          onclick={handleSave}
          disabled={saving}
          class="px-4 py-2 text-sm font-medium text-white bg-accent rounded hover:opacity-90 transition disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* DECISION-019: Section titles - match LocationMapSection styling */
  .section-title {
    font-size: 0.9rem;
    font-weight: 500;
    color: rgb(107, 114, 128); /* text-gray-500 */
    line-height: 1.25;
  }
</style>
