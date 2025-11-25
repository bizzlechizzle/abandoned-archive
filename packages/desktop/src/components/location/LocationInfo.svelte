<script lang="ts">
  /**
   * LocationInfo - Information box with structured fields
   * Per DECISION-013: Built/Abandoned, booleans, documentation checkboxes
   * Per PUEA: Only render fields that have values
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

  // Edit form state
  let editForm = $state({
    builtYear: '',
    builtType: 'year' as 'year' | 'range' | 'date',
    abandonedYear: '',
    abandonedType: 'year' as 'year' | 'range' | 'date',
    historic: false,
    favorite: false,
    project: false,
    docInterior: false,
    docExterior: false,
    docDrone: false,
    docWebHistory: false,
  });

  // PUEA: Check if we have any info to display
  const hasAnyInfo = $derived(
    location.type || location.stype || location.builtYear ||
    location.abandonedYear || location.historic || location.favorite ||
    location.project || location.docInterior || location.docExterior ||
    location.docDrone || location.docWebHistory || location.access
  );

  // DECISION-013: Information is verified when all core fields are filled
  const isInfoVerified = $derived(
    location.type && (location.builtYear || location.abandonedYear)
  );

  // Format year display based on type
  function formatYearDisplay(value: string | undefined, type: 'year' | 'range' | 'date' | undefined): string {
    if (!value) return '';
    if (type === 'range') return value; // Already formatted as range
    if (type === 'date') return value; // Full date
    return value; // Year only
  }

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

  function openEditModal() {
    editForm = {
      builtYear: location.builtYear || '',
      builtType: location.builtType || 'year',
      abandonedYear: location.abandonedYear || '',
      abandonedType: location.abandonedType || 'year',
      historic: location.historic || false,
      favorite: location.favorite || false,
      project: location.project || false,
      docInterior: location.docInterior || false,
      docExterior: location.docExterior || false,
      docDrone: location.docDrone || false,
      docWebHistory: location.docWebHistory || false,
    };
    showEditModal = true;
  }

  async function handleSave() {
    if (!onSave) return;
    try {
      saving = true;
      await onSave({
        builtYear: editForm.builtYear || undefined,
        builtType: editForm.builtYear ? editForm.builtType : undefined,
        abandonedYear: editForm.abandonedYear || undefined,
        abandonedType: editForm.abandonedYear ? editForm.abandonedType : undefined,
        historic: editForm.historic,
        favorite: editForm.favorite,
        project: editForm.project,
        docInterior: editForm.docInterior,
        docExterior: editForm.docExterior,
        docDrone: editForm.docDrone,
        docWebHistory: editForm.docWebHistory,
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

<div class="bg-white rounded-lg shadow p-8">
  <!-- Header with verification badge and edit button -->
  <div class="flex items-center justify-between mb-6">
    <h2 class="text-xl font-semibold text-foreground">Information</h2>
    {#if onSave}
      <button
        onclick={openEditModal}
        class="text-sm text-accent hover:underline"
        title="Edit information"
      >
        edit
      </button>
    {/if}
  </div>

  {#if hasAnyInfo}
    <dl class="space-y-4">
      {#if location.type}
        <div>
          <dt class="text-sm font-medium text-gray-500">Type</dt>
          <dd class="text-base">
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
          </dd>
        </div>
      {/if}

      {#if location.builtYear}
        <div>
          <dt class="text-sm font-medium text-gray-500">Built</dt>
          <dd class="text-base">{formatYearDisplay(location.builtYear, location.builtType)}</dd>
        </div>
      {/if}

      {#if location.abandonedYear}
        <div>
          <dt class="text-sm font-medium text-gray-500">Abandoned</dt>
          <dd class="text-base">{formatYearDisplay(location.abandonedYear, location.abandonedType)}</dd>
        </div>
      {/if}

      {#if location.access}
        <div>
          <dt class="text-sm font-medium text-gray-500">Status</dt>
          <dd class="text-base">
            <button
              onclick={() => onNavigateFilter('access', location.access!)}
              class="text-accent hover:underline"
              title="View all locations with this status"
            >
              {location.access}
            </button>
          </dd>
        </div>
      {/if}

      <!-- Boolean flags -->
      {#if location.historic || location.favorite || location.project}
        <div>
          <dt class="text-sm font-medium text-gray-500">Flags</dt>
          <dd class="text-base flex flex-wrap gap-2">
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
          </dd>
        </div>
      {/if}

      <!-- Documentation checkboxes display -->
      {#if activeDocTypes.length > 0}
        <div>
          <dt class="text-sm font-medium text-gray-500">Documentation</dt>
          <dd class="text-base flex flex-wrap gap-2">
            {#each activeDocTypes as docType}
              <span class="px-2 py-0.5 bg-green-100 text-green-800 rounded text-sm">
                {docType}
              </span>
            {/each}
          </dd>
        </div>
      {/if}
    </dl>
  {:else}
    <p class="text-gray-400 text-sm italic">No information added yet</p>
  {/if}
</div>

<!-- Edit Modal -->
{#if showEditModal}
  <div
    class="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50"
    onclick={() => showEditModal = false}
    role="button"
    tabindex="-1"
  >
    <div
      class="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-hidden relative z-[100000]"
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
      <div class="p-6 overflow-y-auto max-h-[60vh] space-y-6">
        <!-- Built Year -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Built</label>
          <div class="flex gap-2">
            <select
              bind:value={editForm.builtType}
              class="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
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

        <!-- Abandoned Year -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Abandoned</label>
          <div class="flex gap-2">
            <select
              bind:value={editForm.abandonedType}
              class="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
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

        <!-- Boolean flags -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Flags</label>
          <div class="space-y-2">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={editForm.historic}
                class="w-4 h-4 text-accent rounded border-gray-300 focus:ring-accent"
              />
              <span class="text-sm">Historic Landmark</span>
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
                bind:checked={editForm.project}
                class="w-4 h-4 text-accent rounded border-gray-300 focus:ring-accent"
              />
              <span class="text-sm">Project</span>
            </label>
          </div>
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
