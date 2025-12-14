<script lang="ts">
  /**
   * LocationResearchTimeline - Full detailed timeline accordion
   * Shows ALL events (no limit), nested within Research section
   * Per Braun: Nested accordion, no outer border, hover states
   */
  import type { TimelineEvent, TimelineEventWithSource } from '@au-archive/core';
  import { onMount } from 'svelte';

  interface Props {
    locid: string;
    subid?: string | null;
    isHostLocation?: boolean;
    onOpenWebSource?: (websourceId: string) => void;
  }

  let {
    locid,
    subid = null,
    isHostLocation = false,
    onOpenWebSource
  }: Props = $props();

  let events = $state<(TimelineEvent | TimelineEventWithSource)[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let isOpen = $state(false);
  let currentUser = $state<string | null>(null);
  let mediaCounts = $state<Map<string, { images: number; videos: number }>>(new Map());

  // Chronological sort: oldest first
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

  const subtypeLabels: Record<string, string> = {
    built: 'Built',
    opened: 'Opened',
    expanded: 'Expanded',
    renovated: 'Renovated',
    closed: 'Closed',
    abandoned: 'Abandoned',
    demolished: 'Demolished'
  };

  onMount(async () => {
    try {
      currentUser = await window.electronAPI.settings.get('current_user') as string | null;
    } catch (e) {
      console.warn('Could not get current user:', e);
    }
    loadTimeline();
  });

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

  function getEventClass(event: TimelineEvent | TimelineEventWithSource): 'major' | 'minor' | 'technical' {
    if (event.event_type === 'database_entry') return 'technical';
    if (event.event_type === 'established') return 'major';
    if (event.event_type === 'visit') {
      return event.created_by === currentUser ? 'major' : 'minor';
    }
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

    let mediaStr = '';
    const counts = mediaCounts.get(event.event_id);
    if (counts) {
      const parts: string[] = [];
      if (counts.images > 0) parts.push(`${counts.images} image${counts.images !== 1 ? 's' : ''}`);
      if (counts.videos > 0) parts.push(`${counts.videos} video${counts.videos !== 1 ? 's' : ''}`);
      if (parts.length > 0) mediaStr = ` (${parts.join(', ')})`;
    } else if (event.media_count && event.media_count > 0) {
      mediaStr = ` (${event.media_count} photo${event.media_count !== 1 ? 's' : ''})`;
    }

    return `${date} - Site Visit${mediaStr} - ${username}`;
  }

  function formatWebPageLine(event: TimelineEvent | TimelineEventWithSource): string {
    const date = event.date_display || '—';
    const title = event.smart_title || event.notes || 'Web Page';
    const truncatedTitle = title.length > 50 ? title.slice(0, 47) + '...' : title;
    return `${date} - Web: ${truncatedTitle}`;
  }

  function getWebPageTldr(event: TimelineEvent | TimelineEventWithSource): string | null {
    return event.tldr || null;
  }

  function formatDatabaseEntryLine(event: TimelineEvent | TimelineEventWithSource): string {
    if (!event.date_display) return '— - Added to Database';
    const raw = event.date_display;
    let formatted = raw;
    if (raw.includes('T')) formatted = raw.split('T')[0];
    return `${formatted} - Added to Database`;
  }

  function handleWebPageClick(event: TimelineEvent | TimelineEventWithSource) {
    if (event.source_ref && onOpenWebSource) {
      onOpenWebSource(event.source_ref);
    }
  }
</script>

<!-- Nested accordion - no outer border -->
<div class="border-b border-braun-200 last:border-b-0">
  <button
    onclick={() => isOpen = !isOpen}
    aria-expanded={isOpen}
    class="w-full py-3 flex items-center justify-between text-left hover:bg-braun-50 transition-colors"
  >
    <span class="text-base font-medium text-braun-900">Timeline</span>
    <div class="flex items-center gap-2">
      {#if !loading}
        <span class="text-sm text-braun-400">({sortedEvents.length})</span>
      {/if}
      <svg
        class="w-4 h-4 text-braun-400 transition-transform duration-200 {isOpen ? 'rotate-180' : ''}"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  </button>

  {#if isOpen}
    <div class="pb-4 pl-4">
      {#if loading}
        <div class="py-4 text-sm text-braun-500">Loading timeline...</div>
      {:else if error}
        <div class="py-4 text-sm text-red-600">{error}</div>
      {:else if sortedEvents.length === 0}
        <div class="py-4 text-sm text-braun-500">No timeline events</div>
      {:else}
        <div class="timeline-events relative pl-5">
          <div class="absolute left-[3px] top-2 bottom-2 w-px bg-braun-300"></div>

          {#each sortedEvents as event, index (event.event_id)}
            {@const isLast = index === sortedEvents.length - 1}
            {@const eventClass = getEventClass(event)}

            {#if event.event_type === 'established'}
              <div class="relative {isLast ? '' : 'pb-3'}">
                <div class="absolute -left-5 top-[6px] w-2 h-2 rounded-full bg-braun-900"></div>
                <div class="text-[14px] font-medium text-braun-900">
                  {formatEstablishedLine(event)}
                </div>
              </div>

            {:else if event.event_type === 'visit'}
              <div class="relative {isLast ? '' : 'pb-3'}">
                {#if eventClass === 'major'}
                  <div class="absolute -left-5 top-[6px] w-2 h-2 rounded-full bg-braun-900"></div>
                  <div class="text-[14px] font-medium text-braun-900">
                    {formatVisitLine(event)}
                  </div>
                {:else}
                  <div class="absolute -left-5 top-[6px] w-2 h-2 rounded-full border border-braun-400 bg-white"></div>
                  <div class="text-[14px] font-normal text-braun-600">
                    {formatVisitLine(event)}
                  </div>
                {/if}
              </div>

            {:else if event.event_type === 'custom' && event.event_subtype === 'web_page'}
              {@const tldr = getWebPageTldr(event)}
              <div class="relative {isLast ? '' : 'pb-3'}">
                <div class="absolute -left-5 top-[7px] w-[6px] h-[6px] border border-braun-400 bg-white rotate-45"></div>
                <button
                  type="button"
                  onclick={() => handleWebPageClick(event)}
                  class="text-[14px] font-normal text-braun-600 hover:text-braun-900 hover:underline cursor-pointer text-left"
                  title={tldr || undefined}
                >
                  {formatWebPageLine(event)}
                </button>
                {#if tldr}
                  <p class="text-[12px] text-braun-500 mt-0.5 line-clamp-2">{tldr}</p>
                {/if}
              </div>

            {:else if event.event_type === 'database_entry'}
              <div class="relative {isLast ? '' : 'pb-3'}">
                <div class="absolute -left-5 top-[8px] w-1 h-1 bg-braun-400"></div>
                <div class="text-[12px] font-normal text-braun-500">
                  {formatDatabaseEntryLine(event)}
                </div>
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
