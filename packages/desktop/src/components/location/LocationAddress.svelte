<script lang="ts">
  /**
   * LocationAddress - Address display with copy button, clickable filters
   * Per LILBITS: ~100 lines, single responsibility
   * Per PUEA: Only show if address exists
   * Kanye8: Use getDisplayCity() to strip "Village of", "City of" prefixes
   */
  import type { Location } from '@au-archive/core';
  import { getDisplayCity } from '@/lib/display-helpers';

  interface Props {
    address: Location['address'];
    onNavigateFilter: (type: string, value: string) => void;
  }

  let { address, onNavigateFilter }: Props = $props();

  function copyAddress() {
    const addr = [
      address?.street,
      address?.city,
      address?.state,
      address?.zipcode
    ].filter(Boolean).join(', ');
    navigator.clipboard.writeText(addr);
  }

  // PUEA: Only render if we have address data
  const hasAddress = $derived(address?.street || address?.city || address?.state);
</script>

{#if hasAddress}
  <div class="mb-4">
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-sm font-medium text-gray-500">Address</h3>
      <button
        onclick={copyAddress}
        class="text-xs text-accent hover:underline flex items-center gap-1"
        title="Copy address to clipboard"
      >
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
        </svg>
        Copy
      </button>
    </div>

    <div class="text-base text-gray-900 space-y-1">
      {#if address?.street}
        <p class="font-medium">{address.street}</p>
      {/if}

      <p>
        {#if address?.city}
          <button
            onclick={() => onNavigateFilter('city', address!.city!)}
            class="text-accent hover:underline"
            title="View all locations in {getDisplayCity(address.city)}"
          >{getDisplayCity(address.city)}</button>{address?.state || address?.zipcode ? ', ' : ''}
        {/if}
        {#if address?.state}
          <button
            onclick={() => onNavigateFilter('state', address!.state!)}
            class="text-accent hover:underline"
            title="View all locations in {address.state}"
          >{address.state}</button>{' '}
        {/if}
        {#if address?.zipcode}
          <span>{address.zipcode}</span>
        {/if}
      </p>

      {#if address?.county}
        <p class="text-sm text-gray-500">
          <button
            onclick={() => onNavigateFilter('county', address!.county!)}
            class="hover:underline"
            title="View all locations in {address.county} County"
          >{address.county} County</button>
        </p>
      {/if}
    </div>
  </div>
{/if}
