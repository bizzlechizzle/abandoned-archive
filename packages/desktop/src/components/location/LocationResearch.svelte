<script lang="ts">
  /**
   * LocationResearch - Research section accordion wrapper
   * Contains: Timeline (detailed), People, Companies
   * Per Braun: White card accordion, 8pt grid, functional minimalism
   */
  import { router } from '../../stores/router';
  import LocationResearchTimeline from './LocationResearchTimeline.svelte';
  import LocationResearchPeople from './LocationResearchPeople.svelte';
  import LocationResearchCompanies from './LocationResearchCompanies.svelte';

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

  // Outer accordion state - collapsed by default
  let isOpen = $state(false);

  function openResearchPage() {
    router.navigate('/research');
  }
</script>

<div class="mt-6 bg-white rounded border border-braun-300">
  <!-- Outer accordion header -->
  <button
    onclick={() => isOpen = !isOpen}
    aria-expanded={isOpen}
    class="w-full p-6 flex items-center justify-between text-left hover:bg-braun-50 transition-colors"
  >
    <h2 class="text-xl font-semibold text-braun-900">Research</h2>
    <svg
      class="w-5 h-5 text-braun-400 transition-transform duration-200 {isOpen ? 'rotate-180' : ''}"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  {#if isOpen}
    <div class="px-6 pb-6">
      <!-- Nested accordions - inset with additional padding -->
      <div class="pl-4 space-y-2">
        <!-- Timeline (detailed) -->
        <LocationResearchTimeline
          {locid}
          {subid}
          {isHostLocation}
          {onOpenWebSource}
        />

        <!-- People -->
        <LocationResearchPeople {locid} />

        <!-- Companies -->
        <LocationResearchCompanies {locid} />
      </div>

      <!-- Research button - bottom right -->
      <div class="flex justify-end pt-4">
        <button
          onclick={openResearchPage}
          class="px-4 py-2 text-sm bg-braun-900 text-white rounded hover:bg-braun-600 transition-colors"
        >
          Research
        </button>
      </div>
    </div>
  {/if}
</div>
