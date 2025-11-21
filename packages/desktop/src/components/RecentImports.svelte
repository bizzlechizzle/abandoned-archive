<script lang="ts">
  interface ImportRecord {
    import_id: string;
    locid: string | null;
    import_date: string;
    auth_imp: string | null;
    img_count: number;
    vid_count: number;
    doc_count: number;
    locnam?: string;
    address_state?: string;
  }

  interface Props {
    imports: ImportRecord[];
  }

  let { imports }: Props = $props();

  function formatDate(isoDate: string): string {
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
</script>

<div class="mt-8">
  <h2 class="text-lg font-semibold mb-4 text-foreground">Recent Imports</h2>
  {#if imports.length > 0}
    <div class="bg-white rounded-lg shadow">
      <ul class="divide-y divide-gray-200">
        {#each imports as importRecord}
          <li class="p-4 hover:bg-gray-50">
            <div class="flex justify-between items-start">
              <div>
                {#if importRecord.locnam}
                  <p class="font-medium text-foreground">{importRecord.locnam}</p>
                {:else}
                  <p class="font-medium text-gray-500">Import #{importRecord.import_id.slice(0, 8)}</p>
                {/if}
                <p class="text-sm text-gray-500 mt-1">
                  {formatDate(importRecord.import_date)}
                  {#if importRecord.auth_imp}
                    · by {importRecord.auth_imp}
                  {/if}
                </p>
              </div>
              <div class="text-sm text-gray-600">
                {#if importRecord.img_count > 0}
                  <span class="block">{importRecord.img_count} images</span>
                {/if}
                {#if importRecord.vid_count > 0}
                  <span class="block">{importRecord.vid_count} videos</span>
                {/if}
                {#if importRecord.doc_count > 0}
                  <span class="block">{importRecord.doc_count} documents</span>
                {/if}
              </div>
            </div>
          </li>
        {/each}
      </ul>
    </div>
  {:else}
    <div class="bg-white rounded-lg shadow p-6 text-center text-gray-400">
      <p>No recent imports</p>
    </div>
  {/if}
</div>
