<script lang="ts">
  /**
   * LocationTimeline - Timeline display for location history (OPT-119)
   * Shows established dates, visits, web page publish dates, and database entry
   * Visual hierarchy: Major (user visits, established) → Minor (other visits, web pages) → Technical (db entry)
   * Per PLAN: Braun white card styling, view-only mode (no editing)
   */
  import type { TimelineEvent, TimelineEventWithSource } from '@au-archive/core';
  import { onMount } from 'svelte';

  interface Props {
    locid: string;
    subid?: string | null;
    isHostLocation?: boolean;
    onUpdate?: () => void;
    onOpenWebSource?: (websourceId: string) => void;
  }

  let {
    locid,
    subid = null,
    isHostLocation = false,
    onUpdate,
    onOpenWebSource
  }: Props = $props();

  // Timeline state
  let events = $state<(TimelineEvent | TimelineEventWithSource)[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let expanded = $state(false);
  let currentUser = $state<string | null>(null);

  // Media counts cache: event_id -> { images, videos }
  let mediaCounts = $state<Map<string, { images: number; videos: number }>>(new Map());

  // Max entries to show when collapsed
  const MAX_ENTRIES = 7;

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

  // Count events by type for collapse priority
  let establishedEvents = $derived(
    sortedEvents.filter(e => e.event_type === 'established')
  );

  let databaseEntryEvents = $derived(
    sortedEvents.filter(e => e.event_type === 'database_entry')
  );

  let visitEvents = $derived(
    sortedEvents.filter(e => e.event_type === 'visit')
  );

  let webPageEvents = $derived(
    sortedEvents.filter(e => e.event_type === 'custom' && e.event_subtype === 'web_page')
  );

  // Calculate hidden count
  let hiddenCount = $derived(
    sortedEvents.length > MAX_ENTRIES ? sortedEvents.length - MAX_ENTRIES : 0
  );

  // Build display list with priority-based collapsing
  let displayEvents = $derived(() => {
    if (expanded || sortedEvents.length <= MAX_ENTRIES) {
      return sortedEvents;
    }

    // Priority: established first, then database_entry, then fill with recent visits/web pages
    const reserved = [...establishedEvents, ...databaseEntryEvents];
    const reservedIds = new Set(reserved.map(e => e.event_id));

    // Remaining slots for visits and web pages
    const remainingSlots = Math.max(0, MAX_ENTRIES - reserved.length);

    // Combine visits and web pages, sorted by date (most recent first for priority)
    const otherEvents = [...visitEvents, ...webPageEvents]
      .sort((a, b) => (b.date_sort ?? 0) - (a.date_sort ?? 0))
      .slice(0, remainingSlots);

    // Combine all and re-sort chronologically
    const combined = [...reserved, ...otherEvents];
    return combined.sort((a, b) => {
      const aSort = a.event_type === 'established' && (a.date_sort === null || a.date_sort === 99999999)
        ? -1
        : (a.date_sort ?? 99999999);
      const bSort = b.event_type === 'established' && (b.date_sort === null || b.date_sort === 99999999)
        ? -1
        : (b.date_sort ?? 99999999);
      return aSort - bSort;
    });
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
  onMount(async () => {
    // Get current user for visit classification
    try {
      currentUser = await window.electronAPI.settings.get('current_user') as string | null;
    } catch (e) {
      console.warn('Could not get current user:', e);
    }
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

      // Fetch media counts for visit events (async, non-blocking)
      loadMediaCounts();
    } catch (e) {
      console.error('Failed to load timeline:', e);
      error = 'Failed to load timeline';
    } finally {
      loading = false;
    }
  }

  async function loadMediaCounts() {
    const visitEvts = events.filter(e => e.event_type === 'visit' && e.media_hashes);
    if (!visitEvts.length) return;

    const newCounts = new Map(mediaCounts);

    // Fetch counts in parallel
    await Promise.all(
      visitEvts.map(async (event) => {
        if (!event.media_hashes) return;
        try {
          const counts = await window.electronAPI.timeline.getMediaCounts(event.media_hashes);
          newCounts.set(event.event_id, counts);
        } catch (err) {
          console.warn('Failed to get media counts for', event.event_id, err);
        }
      })
    );

    mediaCounts = newCounts;
  }

  /**
   * Classify event for visual hierarchy
   * Major: established, user's own visits
   * Minor: other visits, web pages
   * Technical: database entry
   */
  function getEventClass(event: TimelineEvent | TimelineEventWithSource): 'major' | 'minor' | 'technical' {
    if (event.event_type === 'database_entry') return 'technical';
    if (event.event_type === 'established') return 'major';
    if (event.event_type === 'visit') {
      return event.created_by === currentUser ? 'major' : 'minor';
    }
    // Web page events are Minor
    if (event.event_type === 'custom' && event.event_subtype === 'web_page') {
      return 'minor';
    }
    return 'minor';
  }

  function formatEstablishedLine(event: TimelineEvent | TimelineEventWithSource): string {
    const subtype = event.event_subtype || 'built';
    const label = subtypeLabels[subtype] || 'Built';
    const date = event.date_display;
    return date ? `${date} - ${label}` : `Unknown - ${label}`;
  }

  function formatVisitLine(event: TimelineEvent | TimelineEventWithSource): string {
    const date = event.date_display || '—';
    const username = event.created_by || 'Unknown';

    // Build media count string from cache (or fallback to total)
    let mediaStr = '';
    const counts = mediaCounts.get(event.event_id);
    if (counts) {
      const parts: string[] = [];
      if (counts.images > 0) {
        parts.push(`${counts.images} image${counts.images !== 1 ? 's' : ''}`);
      }
      if (counts.videos > 0) {
        parts.push(`${counts.videos} video${counts.videos !== 1 ? 's' : ''}`);
      }
      if (parts.length > 0) {
        mediaStr = ` (${parts.join(', ')})`;
      }
    } else if (event.media_count && event.media_count > 0) {
      // Fallback while loading
      mediaStr = ` (${event.media_count} photo${event.media_count !== 1 ? 's' : ''})`;
    }

    return `${date} - Site Visit${mediaStr} - ${username}`;
  }

  function formatWebPageLine(event: TimelineEvent | TimelineEventWithSource): string {
    const date = event.date_display || '—';
    const title = event.notes || 'Web Page';
    // Truncate long titles
    const truncatedTitle = title.length > 40 ? title.slice(0, 37) + '...' : title;
    return `${date} - Web: ${truncatedTitle}`;
  }

  function formatDatabaseEntryLine(event: TimelineEvent | TimelineEventWithSource): string {
    if (!event.date_display) return '— - Added to Database';
    // Normalize to ISO 8601: YYYY-MM-DD
    const raw = event.date_display;
    let formatted = raw;
    if (raw.includes('T')) {
      formatted = raw.split('T')[0];
    }
    return `${formatted} - Added to Database`;
  }

  function handleWebPageClick(event: TimelineEvent | TimelineEventWithSource) {
    if (event.source_ref && onOpenWebSource) {
      onOpenWebSource(event.source_ref);
    }
  }

  function toggleExpanded() {
    expanded = !expanded;
  }
</script>

<!-- PLAN: Match LocationMapSection white card styling -->
<div class="bg-white rounded border border-braun-300 flex-1 flex flex-col">
  <!-- Header with expand/collapse button -->
  <div class="px-8 pt-6 pb-4 flex items-center justify-between">
    <h2 class="text-2xl font-semibold text-braun-900 leading-none">Timeline</h2>
    {#if sortedEvents.length > MAX_ENTRIES}
      <button
        type="button"
        onclick={toggleExpanded}
        class="text-sm text-braun-500 hover:text-braun-900 hover:underline"
        title={expanded ? 'Show fewer entries' : 'Show all entries'}
      >
        {expanded ? 'collapse' : 'expand'}
      </button>
    {/if}
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
    {:else if sortedEvents.length === 0}
      <div class="flex items-center justify-center py-8">
        <div class="text-braun-500 text-sm">No timeline events</div>
      </div>
    {:else}
      <div class="timeline-events relative pl-5">
        <!-- Vertical line -->
        <div class="absolute left-[3px] top-2 bottom-2 w-px bg-braun-300"></div>

        <!-- Chronological event list (oldest first) -->
        {#each displayEvents() as event, index (event.event_id)}
          {@const isLast = index === displayEvents().length - 1 && hiddenCount === 0}
          {@const eventClass = getEventClass(event)}

          {#if event.event_type === 'established'}
            <!-- Established Event - Major -->
            <div class="relative {isLast ? '' : 'pb-4'}">
              <!-- Filled 8px dot for major -->
              <div class="absolute -left-5 top-[6px] w-2 h-2 rounded-full bg-braun-900"></div>
              <div class="text-[15px] font-medium text-braun-900">
                {formatEstablishedLine(event)}
              </div>
            </div>

          {:else if event.event_type === 'visit'}
            <!-- Visit Event - Major (user) or Minor (other) -->
            <div class="relative {isLast ? '' : 'pb-4'}">
              {#if eventClass === 'major'}
                <!-- Filled 8px dot for user's own visits -->
                <div class="absolute -left-5 top-[6px] w-2 h-2 rounded-full bg-braun-900"></div>
                <div class="text-[15px] font-medium text-braun-900">
                  {formatVisitLine(event)}
                </div>
              {:else}
                <!-- Hollow 8px dot for other visits -->
                <div class="absolute -left-5 top-[6px] w-2 h-2 rounded-full border border-braun-400 bg-white"></div>
                <div class="text-[15px] font-normal text-braun-600">
                  {formatVisitLine(event)}
                </div>
              {/if}
            </div>

          {:else if event.event_type === 'custom' && event.event_subtype === 'web_page'}
            <!-- Web Page Event - Minor with diamond marker -->
            <div class="relative {isLast ? '' : 'pb-4'}">
              <!-- Diamond marker (rotated square) -->
              <div class="absolute -left-5 top-[7px] w-[6px] h-[6px] border border-braun-400 bg-white rotate-45"></div>
              <button
                type="button"
                onclick={() => handleWebPageClick(event)}
                class="text-[15px] font-normal text-braun-600 hover:text-braun-900 hover:underline cursor-pointer text-left"
              >
                {formatWebPageLine(event)}
              </button>
            </div>

          {:else if event.event_type === 'database_entry'}
            <!-- Database Entry Event - Technical -->
            <div class="relative {isLast ? '' : 'pb-4'}">
              <!-- Small 4px square for technical -->
              <div class="absolute -left-5 top-[8px] w-1 h-1 bg-braun-400"></div>
              <div class="text-[13px] font-normal text-braun-500">
                {formatDatabaseEntryLine(event)}
              </div>
            </div>
          {/if}
        {/each}

        <!-- Show more button when collapsed -->
        {#if hiddenCount > 0 && !expanded}
          <div class="relative pb-4">
            <button
              type="button"
              onclick={toggleExpanded}
              class="text-[13px] text-braun-600 hover:text-braun-900 hover:underline"
            >
              Show {hiddenCount} more entries
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
