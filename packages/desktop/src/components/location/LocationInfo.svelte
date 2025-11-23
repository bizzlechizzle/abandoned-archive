<script lang="ts">
  /**
   * LocationInfo - Type, condition, status, documentation, access
   * Per LILBITS: ~120 lines, single responsibility
   * Per PUEA: Only render fields that have values
   */
  import type { Location } from '@au-archive/core';

  interface Props {
    location: Location;
    onNavigateFilter: (type: string, value: string) => void;
  }

  let { location, onNavigateFilter }: Props = $props();

  // PUEA: Check if we have any info to display
  const hasAnyInfo = $derived(
    location.type || location.stype || location.condition ||
    location.status || location.documentation || location.access || location.historic
  );
</script>

{#if hasAnyInfo}
  <div class="bg-white rounded-lg shadow p-6">
    <h2 class="text-xl font-semibold mb-4 text-foreground">Information</h2>
    <dl class="space-y-3">
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
          </dd>
        </div>
      {/if}

      {#if location.stype}
        <div>
          <dt class="text-sm font-medium text-gray-500">Sub-Type</dt>
          <dd class="text-base">
            <button
              onclick={() => onNavigateFilter('stype', location.stype!)}
              class="text-accent hover:underline"
              title="View all {location.stype} locations"
            >
              {location.stype}
            </button>
          </dd>
        </div>
      {/if}

      {#if location.condition}
        <div>
          <dt class="text-sm font-medium text-gray-500">Condition</dt>
          <dd class="text-base">
            <button
              onclick={() => onNavigateFilter('condition', location.condition!)}
              class="text-accent hover:underline"
              title="View all locations with this condition"
            >
              {location.condition}
            </button>
          </dd>
        </div>
      {/if}

      {#if location.status}
        <div>
          <dt class="text-sm font-medium text-gray-500">Status</dt>
          <dd class="text-base">
            <button
              onclick={() => onNavigateFilter('status', location.status!)}
              class="text-accent hover:underline"
              title="View all locations with this status"
            >
              {location.status}
            </button>
          </dd>
        </div>
      {/if}

      {#if location.documentation}
        <div>
          <dt class="text-sm font-medium text-gray-500">Documentation</dt>
          <dd class="text-base">
            <button
              onclick={() => onNavigateFilter('documentation', location.documentation!)}
              class="text-accent hover:underline"
              title="View all locations with this documentation level"
            >
              {location.documentation}
            </button>
          </dd>
        </div>
      {/if}

      {#if location.access}
        <div>
          <dt class="text-sm font-medium text-gray-500">Access</dt>
          <dd class="text-base">
            <button
              onclick={() => onNavigateFilter('access', location.access!)}
              class="text-accent hover:underline"
              title="View all locations with this access level"
            >
              {location.access}
            </button>
          </dd>
        </div>
      {/if}

      {#if location.historic}
        <div>
          <dt class="text-sm font-medium text-gray-500">Historic Landmark</dt>
          <dd class="text-base">
            <button
              onclick={() => onNavigateFilter('historic', 'true')}
              class="text-accent hover:underline"
              title="View all historic landmarks"
            >
              Yes
            </button>
          </dd>
        </div>
      {/if}
    </dl>
  </div>
{/if}
