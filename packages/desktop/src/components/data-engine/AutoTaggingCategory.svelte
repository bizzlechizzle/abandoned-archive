<script lang="ts">
  import PromptEditor from './PromptEditor.svelte';
  import { type CategoryKey, CATEGORY_LABELS } from './default-prompts';

  interface Props {
    category: CategoryKey;
    expanded?: boolean;
    onToggle?: () => void;
  }

  let { category, expanded = false, onToggle }: Props = $props();

  const label = CATEGORY_LABELS[category];
</script>

<div class="border-b border-braun-200 last:border-b-0">
  <!-- Category Header -->
  <button
    onclick={onToggle}
    class="w-full py-4 flex items-center justify-between text-left hover:bg-braun-50 transition-colors"
  >
    <span class="text-sm font-medium text-braun-900">{label}</span>
    <svg
      class="w-4 h-4 text-braun-400 transition-transform duration-200 {expanded ? 'rotate-180' : ''}"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  <!-- Category Content: Prompt Editor -->
  {#if expanded}
    <div class="pl-4 pr-2 pb-4">
      <div class="bg-braun-50 rounded p-4">
        <PromptEditor {category} />
      </div>
    </div>
  {/if}
</div>
