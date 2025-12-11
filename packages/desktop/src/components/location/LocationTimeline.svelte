<script lang="ts">
  /**
   * LocationTimeline - Timeline display for location history
   * Shows established date, visits (from EXIF), and database entry
   * Per PLAN-timeline-feature: Braun-compliant vertical timeline design
   */
  import type { TimelineEvent, TimelineEventWithSource } from '@au-archive/core';
  import TimelineEventRow from './TimelineEventRow.svelte';
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

  // Editable established date
  let establishedEvent = $derived(
    events.find(e => e.event_type === 'established')
  );
  let databaseEntryEvent = $derived(
    events.find(e => e.event_type === 'database_entry')
  );
  let visitEvents = $derived(
    events.filter(e => e.event_type === 'visit').sort((a, b) =>
      (b.date_sort ?? 0) - (a.date_sort ?? 0)
    )
  );

  // Collapse visits if more than 5
  const VISIBLE_VISITS = 5;
  let visibleVisits = $derived(
    showAllVisits ? visitEvents : visitEvents.slice(0, VISIBLE_VISITS)
  );
  let hiddenVisitCount = $derived(
    visitEvents.length > VISIBLE_VISITS ? visitEvents.length - VISIBLE_VISITS : 0
  );

  // Load timeline on mount
  onMount(() => {
    loadTimeline();
  });

  // Reload when locid/subid changes
  $effect(() => {
    // Trigger on locid or subid change
    const _ = locid + (subid ?? '');
    loadTimeline();
  });

  async function loadTimeline() {
    loading = true;
    error = null;

    try {
      if (subid) {
        // Sub-location: get only its events
        events = await window.electronAPI.timeline.findBySubLocation(locid, subid);
      } else if (isHostLocation) {
        // Host location: get combined timeline (includes sub-location events)
        events = await window.electronAPI.timeline.findCombined(locid);
      } else {
        // Regular location: get its events only
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
      await loadTimeline();
      onUpdate?.();
    } catch (e) {
      console.error('Failed to update established date:', e);
    }
  }

  async function handleApprove(eventId: string) {
    try {
      // TODO: Get current user ID from store
      await window.electronAPI.timeline.approve(eventId, 'user');
      await loadTimeline();
      onUpdate?.();
    } catch (e) {
      console.error('Failed to approve event:', e);
    }
  }

  function toggleEditMode() {
    editMode = !editMode;
  }
</script>

<div class="timeline-container bg-braun-50 border border-braun-200 rounded">
  <!-- Header -->
  <div class="flex items-center justify-between px-4 py-3 border-b border-braun-200">
    <h3 class="text-[11px] font-medium uppercase tracking-[0.1em] text-braun-500">
      Timeline
    </h3>
    <button
      type="button"
      onclick={toggleEditMode}
      class="text-[11px] font-medium text-braun-600 hover:text-braun-900 uppercase tracking-wide"
    >
      {editMode ? 'collapse' : 'edit'}
    </button>
  </div>

  <!-- Content -->
  <div class="px-4 py-3">
    {#if loading}
      <div class="flex items-center justify-center py-8">
        <div class="text-braun-500 text-[13px]">Loading timeline...</div>
      </div>
    {:else if error}
      <div class="flex items-center justify-center py-8">
        <div class="text-red-600 text-[13px]">{error}</div>
      </div>
    {:else}
      <div class="timeline-events relative">
        <!-- Vertical line -->
        <div class="absolute left-[3px] top-0 bottom-0 w-[1px] bg-braun-300"></div>

        <!-- Established Event -->
        {#if establishedEvent}
          <TimelineEventRow
            event={establishedEvent}
            {editMode}
            isFirst={true}
            onUpdate={handleEstablishedUpdate}
            onApprove={handleApprove}
          />
        {:else if editMode}
          <!-- Show add button if no established event -->
          <div class="relative pl-6 pb-4">
            <div class="absolute left-0 top-1 w-[7px] h-[7px] rounded-full border border-braun-400 bg-white"></div>
            <div class="text-[15px] text-braun-400">Established</div>
            <TimelineDateInput
              onSave={(date, subtype) => handleEstablishedUpdate(date, subtype)}
              placeholder="Enter date..."
            />
          </div>
        {/if}

        <!-- Visit Events -->
        {#if visibleVisits.length > 0}
          {#each visibleVisits as event (event.event_id)}
            <TimelineEventRow
              {event}
              {editMode}
              showSourceBuilding={isHostLocation && 'source_building' in event}
              onApprove={handleApprove}
            />
          {/each}
        {/if}

        <!-- Show more visits button -->
        {#if hiddenVisitCount > 0 && !showAllVisits}
          <div class="relative pl-6 py-2">
            <button
              type="button"
              onclick={() => showAllVisits = true}
              class="text-[13px] text-braun-600 hover:text-braun-900"
            >
              Show {hiddenVisitCount} earlier visits
            </button>
          </div>
        {/if}

        <!-- Database Entry Event -->
        {#if databaseEntryEvent}
          <TimelineEventRow
            event={databaseEntryEvent}
            {editMode}
            isLast={true}
          />
        {/if}

        <!-- Empty state for no visits -->
        {#if visitEvents.length === 0 && !editMode}
          <div class="relative pl-6 py-3">
            <div class="text-[13px] text-braun-500 bg-braun-100 rounded px-3 py-2">
              Import media to automatically detect visit dates
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .timeline-container {
    min-height: 200px;
  }

  .timeline-events {
    padding-left: 0;
  }
</style>
