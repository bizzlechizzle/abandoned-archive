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

  // Derived events
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
    if (!establishedEvent) return 'Built —';
    const subtype = establishedEvent.event_subtype || 'built';
    const label = subtypeLabels[subtype] || 'Built';
    const date = establishedEvent.date_display;
    return date ? `${label} ${date}` : `${label} —`;
  }

  function formatVisitDate(event: TimelineEvent): string {
    return event.date_display || '—';
  }

  function getMediaSummary(event: TimelineEvent): string {
    const count = event.media_count || 0;
    if (count === 0) return '';
    return count === 1 ? '1 photo' : `${count} photos`;
  }

  function formatDatabaseEntryDate(): string {
    if (!databaseEntryEvent?.date_display) return '';
    // Normalize to ISO 8601: YYYY-MM-DD
    const raw = databaseEntryEvent.date_display;
    let formatted = raw;
    if (raw.includes('T')) {
      formatted = raw.split('T')[0];
    }
    return `${formatted} · Added to Database`;
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

        <!-- Established Event (always first) -->
        <div class="relative pb-4">
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
              {getEstablishedDisplay()}
            </button>
          {/if}
        </div>

        <!-- Visit Events -->
        {#each visibleVisits as event (event.event_id)}
          <div class="relative pb-4">
            <!-- Hollow dot for visits -->
            <div class="absolute -left-5 top-[5px] w-[7px] h-[7px] rounded-full border border-braun-400 bg-white"></div>

            <div class="text-[15px] text-braun-900">
              {formatVisitDate(event)}
            </div>
            <div class="text-[13px] text-braun-600">
              {#if event.source_device}
                {event.source_device}
                {#if getMediaSummary(event)}
                  · {getMediaSummary(event)}
                {/if}
              {:else if getMediaSummary(event)}
                {getMediaSummary(event)}
              {/if}
            </div>
          </div>
        {/each}

        <!-- Show more visits button -->
        {#if hiddenVisitCount > 0 && !showAllVisits}
          <div class="relative pb-4">
            <button
              type="button"
              onclick={() => showAllVisits = true}
              class="text-[13px] text-braun-600 hover:text-braun-900 hover:underline"
            >
              Show {hiddenVisitCount} earlier visits
            </button>
          </div>
        {/if}

        <!-- Database Entry Event (always last) -->
        {#if databaseEntryEvent}
          <div class="relative">
            <!-- Small square dot for database entry -->
            <div class="absolute -left-5 top-[6px] w-[5px] h-[5px] bg-braun-400"></div>

            <div class="text-[13px] text-braun-700">
              {formatDatabaseEntryDate()}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
