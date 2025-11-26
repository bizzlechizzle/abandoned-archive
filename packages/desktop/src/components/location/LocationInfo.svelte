<script lang="ts">
  /**
   * LocationInfo - Information box with structured fields
   * Per DECISION-019: Complete overhaul to mirror LocationMapSection styling
   * Display: Historical Name, AKA Name, Status, Documentation, Built/Abandoned, Type/Sub-Type, Flags, Author
   */
  import type { Location, LocationInput } from '@au-archive/core';

  interface Props {
    location: Location;
    onNavigateFilter: (type: string, value: string) => void;
    onSave?: (updates: Partial<LocationInput>) => Promise<void>;
  }

  let { location, onNavigateFilter, onSave }: Props = $props();

  // Edit modal state
  let showEditModal = $state(false);
  let saving = $state(false);

  // Edit form state - DECISION-019: All information fields
  let editForm = $state({
    locnam: '',
    locnamVerified: false,
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
    auth_imp: '',
  });

  // PUEA: Check if we have data to display for each section
  const hasHistoricalName = $derived(!!location.historicalName);
  const hasAkaName = $derived(!!location.akanam);
  const hasStatus = $derived(!!location.access);
  const hasDocumentation = $derived(
    location.docInterior || location.docExterior || location.docDrone || location.docWebHistory
  );
  const hasBuiltOrAbandoned = $derived(!!location.builtYear || !!location.abandonedYear);
  const hasType = $derived(!!location.type);
  const hasFlags = $derived(location.historic || location.favorite || location.project);
  const hasAuthor = $derived(!!location.auth_imp);

  // Check if we have any info to display at all
  const hasAnyInfo = $derived(
    hasHistoricalName || hasAkaName || hasStatus || hasDocumentation ||
    hasBuiltOrAbandoned || hasType || hasFlags || hasAuthor
  );

  // Documentation labels for checkboxes
  const docLabels = [
    { key: 'docInterior', label: 'Interior', field: 'docInterior' as const },
    { key: 'docExterior', label: 'Exterior', field: 'docExterior' as const },
    { key: 'docDrone', label: 'Drone', field: 'docDrone' as const },
    { key: 'docWebHistory', label: 'Web/History', field: 'docWebHistory' as const },
  ];

  // Get active documentation types
  const activeDocTypes = $derived(
    docLabels.filter(d => location[d.field]).map(d => d.label)
  );

  // Format year display based on type
  function formatYearDisplay(value: string | undefined, type: 'year' | 'range' | 'date' | undefined): string {
    if (!value) return '';
    return value; // Return as-is, type determines interpretation
  }

  function openEditModal() {
    editForm = {
      locnam: location.locnam || '',
      locnamVerified: location.locnamVerified || false,
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
      auth_imp: location.auth_imp || '',
    };
    showEditModal = true;
  }

  async function handleSave() {
    if (!onSave) return;
    try {
      saving = true;
      await onSave({
        locnam: editForm.locnam,
        locnamVerified: editForm.locnamVerified,
        historicalName: editForm.historicalName || undefined,
        historicalNameVerified: editForm.historicalNameVerified,
        akanam: editForm.akanam || undefined,
        akanamVerified: editForm.akanamVerified,
        access: editForm.access || undefined,
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
<div class="bg-white rounded-lg shadow">
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
  <div class="px-8 pb-6">
    {#if hasAnyInfo}
      <!-- Historical Name (show only if exists) -->
      {#if hasHistoricalName}
        <div class="mb-4">
          <h3 class="section-title mb-1">Historical Name</h3>
          <p class="text-base text-gray-900">{location.historicalName}</p>
        </div>
      {/if}

      <!-- AKA Name (show only if exists) -->
      {#if hasAkaName}
        <div class="mb-4">
          <h3 class="section-title mb-1">Also Known As</h3>
          <p class="text-base text-gray-900">{location.akanam}</p>
        </div>
      {/if}

      <!-- Status -->
      {#if hasStatus}
        <div class="mb-4">
          <h3 class="section-title mb-1">Status</h3>
          <button
            onclick={() => onNavigateFilter('access', location.access!)}
            class="text-base text-accent hover:underline"
            title="View all locations with this status"
          >
            {location.access}
          </button>
        </div>
      {/if}

      <!-- Documentation badges -->
      {#if hasDocumentation}
        <div class="mb-4">
          <h3 class="section-title mb-1">Documentation</h3>
          <div class="flex flex-wrap gap-2">
            {#each activeDocTypes as docType}
              <span class="px-2 py-0.5 bg-green-100 text-green-800 rounded text-sm">
                {docType}
              </span>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Built / Abandoned -->
      {#if hasBuiltOrAbandoned}
        <div class="mb-4 grid grid-cols-2 gap-4">
          <div>
            <h3 class="section-title mb-1">Built</h3>
            {#if location.builtYear}
              <p class="text-base text-gray-900">{formatYearDisplay(location.builtYear, location.builtType)}</p>
            {:else}
              <p class="text-sm text-gray-400 italic">Not set</p>
            {/if}
          </div>
          <div>
            <h3 class="section-title mb-1">Abandoned</h3>
            {#if location.abandonedYear}
              <p class="text-base text-gray-900">{formatYearDisplay(location.abandonedYear, location.abandonedType)}</p>
            {:else}
              <p class="text-sm text-gray-400 italic">Not set</p>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Type / Sub-Type -->
      {#if hasType}
        <div class="mb-4">
          <h3 class="section-title mb-1">Type</h3>
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
        </div>
      {/if}

      <!-- Flags -->
      {#if hasFlags}
        <div class="mb-4">
          <h3 class="section-title mb-1">Flags</h3>
          <div class="flex flex-wrap gap-2">
            {#if location.historic}
              <button
                onclick={() => onNavigateFilter('historic', 'true')}
                class="px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-sm hover:bg-amber-200"
                title="View all historic landmarks"
              >
                Historic
              </button>
            {/if}
            {#if location.favorite}
              <button
                onclick={() => onNavigateFilter('favorite', 'true')}
                class="px-2 py-0.5 bg-red-100 text-red-800 rounded text-sm hover:bg-red-200"
                title="View all favorites"
              >
                Favorite
              </button>
            {/if}
            {#if location.project}
              <button
                onclick={() => onNavigateFilter('project', 'true')}
                class="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-sm hover:bg-blue-200"
                title="View all project locations"
              >
                Project
              </button>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Author -->
      {#if hasAuthor}
        <div>
          <h3 class="section-title mb-1">Author</h3>
          <p class="text-base text-gray-900">{location.auth_imp}</p>
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

      <!-- Content -->
      <div class="p-6 overflow-y-auto max-h-[65vh] space-y-5">
        <!-- Location Name + Verified -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Location Name</label>
          <div class="flex gap-3 items-center">
            <input
              type="text"
              bind:value={editForm.locnam}
              class="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="Location name"
            />
            <label class="flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                bind:checked={editForm.locnamVerified}
                class="w-4 h-4 text-accent rounded border-gray-300 focus:ring-accent"
              />
              <span class="text-sm text-gray-600">verified</span>
            </label>
          </div>
        </div>

        <!-- Historical Name + Verified -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Historical Name</label>
          <div class="flex gap-3 items-center">
            <input
              type="text"
              bind:value={editForm.historicalName}
              class="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="Original or historical name"
            />
            <label class="flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                bind:checked={editForm.historicalNameVerified}
                class="w-4 h-4 text-accent rounded border-gray-300 focus:ring-accent"
              />
              <span class="text-sm text-gray-600">verified</span>
            </label>
          </div>
        </div>

        <!-- AKA Name + Verified -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Also Known As</label>
          <div class="flex gap-3 items-center">
            <input
              type="text"
              bind:value={editForm.akanam}
              class="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="Alternative name"
            />
            <label class="flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                bind:checked={editForm.akanamVerified}
                class="w-4 h-4 text-accent rounded border-gray-300 focus:ring-accent"
              />
              <span class="text-sm text-gray-600">verified</span>
            </label>
          </div>
        </div>

        <!-- Status -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Status</label>
          <input
            type="text"
            bind:value={editForm.access}
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="e.g., Open, Demolished, Private"
          />
        </div>

        <!-- Documentation checkboxes -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Documentation</label>
          <div class="grid grid-cols-2 gap-2">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={editForm.docInterior}
                class="w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500"
              />
              <span class="text-sm">Interior</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={editForm.docExterior}
                class="w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500"
              />
              <span class="text-sm">Exterior</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={editForm.docDrone}
                class="w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500"
              />
              <span class="text-sm">Drone</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={editForm.docWebHistory}
                class="w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500"
              />
              <span class="text-sm">Web/History</span>
            </label>
          </div>
        </div>

        <!-- Built / Abandoned -->
        <div class="grid grid-cols-2 gap-4">
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
        </div>

        <!-- Type / Sub-Type -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Type</label>
            <input
              type="text"
              bind:value={editForm.type}
              class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="e.g., Hospital, Factory"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Sub-Type</label>
            <input
              type="text"
              bind:value={editForm.stype}
              class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="e.g., Psychiatric, Textile"
            />
          </div>
        </div>

        <!-- Flags -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Flags</label>
          <div class="flex flex-wrap gap-4">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={editForm.project}
                class="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <span class="text-sm">Project</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={editForm.favorite}
                class="w-4 h-4 text-red-600 rounded border-gray-300 focus:ring-red-500"
              />
              <span class="text-sm">Favorite</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={editForm.historic}
                class="w-4 h-4 text-amber-600 rounded border-gray-300 focus:ring-amber-500"
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
