<script lang="ts">
  /**
   * LocationResearchPeople - People entities nested accordion
   * Extracted people from web sources, nested within Research section
   * Per Braun: Nested accordion, confidence dots, functional colors
   */
  import { onMount } from 'svelte';

  interface Props {
    locid: string;
  }

  let { locid }: Props = $props();

  interface Entity {
    extraction_id: string;
    entity_type: 'person' | 'organization';
    entity_name: string;
    entity_role: string | null;
    date_range: string | null;
    confidence: number;
    context_sentence: string | null;
    status: 'approved' | 'pending' | 'rejected';
    created_at: string;
  }

  let entities = $state<Entity[]>([]);
  let loading = $state(true);
  let isOpen = $state(false);

  // Filter to people only
  let people = $derived(entities.filter(e => e.entity_type === 'person'));

  const roleLabels: Record<string, string> = {
    owner: 'Owner',
    architect: 'Architect',
    developer: 'Developer',
    employee: 'Employee',
    founder: 'Founder',
    visitor: 'Visitor',
    photographer: 'Photographer',
    historian: 'Historian',
    unknown: '',
  };

  onMount(async () => {
    await loadEntities();
  });

  $effect(() => {
    const _ = locid;
    loadEntities();
  });

  async function loadEntities() {
    if (!window.electronAPI?.extraction?.entities) {
      loading = false;
      return;
    }

    loading = true;
    try {
      const result = await window.electronAPI.extraction.entities.getByLocation(locid);
      if (result.success && result.entities) {
        entities = result.entities;
      }
    } catch (e) {
      console.error('Failed to load entities:', e);
    } finally {
      loading = false;
    }
  }

  function formatRole(entity: Entity): string {
    const label = roleLabels[entity.entity_role || 'unknown'] || entity.entity_role;
    if (entity.date_range) {
      return label ? `${label} (${entity.date_range})` : entity.date_range;
    }
    return label || '';
  }

  function getConfidenceClass(confidence: number): string {
    if (confidence >= 0.85) return 'bg-[#4A8C5E]';
    if (confidence >= 0.5) return 'bg-[#C9A227]';
    return 'bg-[#B85C4A]';
  }
</script>

<!-- Nested accordion - no outer border -->
<div class="border-b border-braun-200 last:border-b-0">
  <button
    onclick={() => isOpen = !isOpen}
    aria-expanded={isOpen}
    class="w-full py-3 flex items-center justify-between text-left hover:bg-braun-50 transition-colors"
  >
    <span class="text-base font-medium text-braun-900">People</span>
    <div class="flex items-center gap-2">
      {#if !loading}
        <span class="text-sm text-braun-400">({people.length})</span>
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
        <div class="py-4 text-sm text-braun-500">Loading...</div>
      {:else if people.length === 0}
        <div class="py-4 text-sm text-braun-500">No people extracted</div>
      {:else}
        <ul class="space-y-2">
          {#each people as person (person.extraction_id)}
            <li class="flex items-start gap-2">
              <!-- Confidence indicator dot -->
              <span
                class="mt-1.5 w-2 h-2 rounded-full flex-shrink-0 {getConfidenceClass(person.confidence)}"
                title="Confidence: {Math.round(person.confidence * 100)}%"
              ></span>
              <div class="min-w-0 flex-1">
                <span class="text-[14px] font-medium text-braun-900">{person.entity_name}</span>
                {#if formatRole(person)}
                  <span class="text-[13px] text-braun-600"> - {formatRole(person)}</span>
                {/if}
                {#if person.status === 'pending'}
                  <span class="ml-2 text-[11px] text-[#C9A227] uppercase tracking-wide">(unverified)</span>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>
