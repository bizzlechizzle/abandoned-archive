<script lang="ts">
  /**
   * LocationTimeline - Timeline display for location history
   * Shows established date, visits (from EXIF), and database entry
   * Per PLAN: Braun white card styling matching LocationMapSection
   */
  import type { TimelineEvent, TimelineEventWithSource } from '@au-archive/core';
  import TimelineDateInput from './TimelineDateInput.svelte';
  import { onMount } from 'svelte';

  interface Props {
    locid: string;
    subid?: string | null;
    isHostLocation?: boolean;
    onUpdate?: () => void;
  }

  let {
    locid,
    subid = null,
    isHostLocation = false,
    onUpdate
  }: Props = $props();

  // Timeline state
  let events = $state<(TimelineEvent | TimelineEventWithSource)[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let editMode = $state(false);
  let showAllVisits = $state(false);
  let editingEstablished = $state(false);

  // Chronological sort: oldest first
  // Unknown established dates pin to top (inherently oldest - building existed before visits)
  let sortedEvents = $derived(
    [...events].sort((a, b) => {
      const aSort = a.event_type === 'established' && (a.date_sort === null || a.date_sort === 99999999)
        ? -1
        : (a.date_sort ?? 99999999);
      const bSort = b.event_type === 'established' && (b.date_sort === null || b.date_sort === 99999999)
        ? -1
        : (b.date_sort ?? 99999999);
      return aSort - bSort;
    })
  );

  // Separate references for edit mode and special handling
  let establishedEvent = $derived(
    events.find(e => e.event_type === 'established')
  );

  // Visit events for collapse logic (already in chronological order from sortedEvents)
  let visitEvents = $derived(
    sortedEvents.filter(e => e.event_type === 'visit')
  );

  // Collapse visits: show oldest N, hide newer ones
  const VISIBLE_VISITS = 5;
  let hiddenVisitCount = $derived(
    visitEvents.length > VISIBLE_VISITS ? visitEvents.length - VISIBLE_VISITS : 0
  );

  // Build display list: all events with visit collapsing applied
  let displayEvents = $derived(() => {
    if (showAllVisits || visitEvents.length <= VISIBLE_VISITS) {
      return sortedEvents;
    }
    // Show only first N visits (oldest), hide newer ones
    const visibleVisitIds = new Set(visitEvents.slice(0, VISIBLE_VISITS).map(e => e.event_id));
    return sortedEvents.filter(e =>
      e.event_type !== 'visit' || visibleVisitIds.has(e.event_id)
    );
  });

  // Subtype labels for established events ("Built", "Opened", etc.)
  const subtypeLabels: Record<string, string> = {
    built: 'Built',
    opened: 'Opened',
    expanded: 'Expanded',
    renovated: 'Renovated',
    closed: 'Closed',
    abandoned: 'Abandoned',
    demolished: 'Demolished'
  };

  // Load timeline on mount
  onMount(() => {
    loadTimeline();
  });

  // Reload when locid/subid changes
  $effect(() => {
    const _ = locid + (subid ?? '');
    loadTimeline();
  });

  async function loadTimeline() {
    loading = true;
    error = null;

    try {
      if (subid) {
        events = await window.electronAPI.timeline.findBySubLocation(locid, subid);
      } else if (isHostLocation) {
        events = await window.electronAPI.timeline.findCombined(locid);
      } else {
        events = await window.electronAPI.timeline.findByLocation(locid);
      }
    } catch (e) {
      console.error('Failed to load timeline:', e);
      error = 'Failed to load timeline';
    } finally {
      loading = false;
    }
  }

  async function handleEstablishedUpdate(dateInput: string, eventSubtype: string) {
    try {
      await window.electronAPI.timeline.updateEstablished(
        locid,
        subid,
        dateInput,
        eventSubtype
      );
      editingEstablished = false;
      await loadTimeline();
      onUpdate?.();
    } catch (e) {
      console.error('Failed to update established date:', e);
    }
  }

  function toggleEditMode() {
    editMode = !editMode;
    if (!editMode) {
      editingEstablished = false;
    }
  }

  function getEstablishedDisplay(): string {
    if (!establishedEvent) return '';
    const subtype = establishedEvent.event_subtype || 'built';
    const label = subtypeLabels[subtype] || 'Built';
    const date = establishedEvent.date_display;
    // DATE - NOTE format; empty if no date (user must edit to add)
    return date ? `${date} - ${label}` : '';
  }

  function formatVisitLine(event: TimelineEvent): string {
    const date = event.date_display || '—';
    return `${date} - Site Visit`;
  }

  function formatDatabaseEntryDate(event: TimelineEvent | TimelineEventWithSource): string {
    if (!event.date_display) return '— - Added to Database';
    // Normalize to ISO 8601: YYYY-MM-DD
    const raw = event.date_display;
    let formatted = raw;
    if (raw.includes('T')) {
      formatted = raw.split('T')[0];
    }
    return `${formatted} - Added to Database`;
  }
</script>

<!-- PLAN: Match LocationMapSection white card styling -->
<div class="bg-white rounded border border-braun-300 flex-1 flex flex-col">
  <!-- Header with edit button -->
  <div class="px-8 pt-6 pb-4 flex items-center justify-between">
    <h2 class="text-2xl font-semibold text-braun-900 leading-none">Timeline</h2>
    <button
      type="button"
      onclick={toggleEditMode}
      class="text-sm text-braun-500 hover:text-braun-900 hover:underline"
      title={editMode ? 'Collapse edit mode' : 'Edit timeline'}
    >
      {editMode ? 'collapse' : 'edit'}
    </button>
  </div>

  <!-- Content -->
  <div class="px-8 pb-6 flex-1">
    {#if loading}
      <div class="flex items-center justify-center py-8">
        <div class="text-braun-500 text-sm">Loading timeline...</div>
      </div>
    {:else if error}
      <div class="flex items-center justify-center py-8">
        <div class="text-red-600 text-sm">{error}</div>
      </div>
    {:else}
      <div class="timeline-events relative pl-5">
        <!-- Vertical line -->
        <div class="absolute left-[3px] top-2 bottom-2 w-px bg-braun-300"></div>

        <!-- Add established date prompt (only in edit mode when no established event exists) -->
        {#if editMode && !establishedEvent}
          <div class="relative pb-4">
            <div class="absolute -left-5 top-[5px] w-[7px] h-[7px] rounded-full bg-braun-300"></div>
            {#if editingEstablished}
              <div class="bg-braun-50 border border-braun-200 rounded p-4">
                <TimelineDateInput
                  initialValue=""
                  initialSubtype="built"
                  onSave={handleEstablishedUpdate}
                  onCancel={() => editingEstablished = false}
                />
              </div>
            {:else}
              <button
                type="button"
                onclick={() => editingEstablished = true}
                class="text-[15px] text-braun-500 hover:text-braun-900 hover:underline cursor-pointer"
              >
                Add established date...
              </button>
            {/if}
          </div>
        {/if}

        <!-- Chronological event list (oldest first) -->
        {#each displayEvents() as event, index (event.event_id)}
          {@const isLast = index === displayEvents().length - 1 && hiddenVisitCount === 0}

          {#if event.event_type === 'established'}
            <!-- Established Event - only show if has date or in edit mode -->
            {@const displayText = getEstablishedDisplay()}
            {#if displayText || editMode}
              <div class="relative {isLast ? '' : 'pb-4'}">
                <!-- Filled dot for established -->
                <div class="absolute -left-5 top-[5px] w-[7px] h-[7px] rounded-full bg-braun-900"></div>

                {#if editMode && editingEstablished}
                  <!-- Inline edit form -->
                  <div class="bg-braun-50 border border-braun-200 rounded p-4">
                    <TimelineDateInput
                      initialValue={establishedEvent?.date_display || ''}
                      initialSubtype={establishedEvent?.event_subtype || 'built'}
                      onSave={handleEstablishedUpdate}
                      onCancel={() => editingEstablished = false}
                    />
                  </div>
                {:else}
                  <button
                    type="button"
                    onclick={() => editMode && (editingEstablished = true)}
                    class="text-[15px] text-braun-900 {editMode ? 'hover:underline cursor-pointer' : 'cursor-default'}"
                    disabled={!editMode}
                  >
                    {displayText || 'Add established date...'}
                  </button>
                {/if}
              </div>
            {/if}

          {:else if event.event_type === 'visit'}
            <!-- Visit Event -->
            <div class="relative {isLast ? '' : 'pb-4'}">
              <!-- Hollow dot for visits -->
              <div class="absolute -left-5 top-[5px] w-[7px] h-[7px] rounded-full border border-braun-400 bg-white"></div>

              <div class="text-[15px] text-braun-900">
                {formatVisitLine(event)}
              </div>
            </div>

          {:else if event.event_type === 'database_entry'}
            <!-- Database Entry Event -->
            <div class="relative {isLast ? '' : 'pb-4'}">
              <!-- Small square dot for database entry -->
              <div class="absolute -left-5 top-[5px] w-[5px] h-[5px] bg-braun-400"></div>

              <div class="text-[15px] text-braun-600">
                {formatDatabaseEntryDate(event)}
              </div>
            </div>
          {/if}
        {/each}

        <!-- Show more visits button (newer visits hidden) -->
        {#if hiddenVisitCount > 0 && !showAllVisits}
          <div class="relative pb-4">
            <button
              type="button"
              onclick={() => showAllVisits = true}
              class="text-[13px] text-braun-600 hover:text-braun-900 hover:underline"
            >
              Show {hiddenVisitCount} more recent visits
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
