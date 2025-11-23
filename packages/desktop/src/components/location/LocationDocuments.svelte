<script lang="ts">
  /**
   * LocationDocuments - Document list
   * Per LILBITS: ~80 lines, single responsibility
   * Per PUEA: Only render if documents exist
   */
  import type { MediaDocument } from './types';

  interface Props {
    documents: MediaDocument[];
    onOpenFile: (path: string) => void;
  }

  let { documents, onOpenFile }: Props = $props();

  const DOCUMENT_LIMIT = 3;
  let showAllDocuments = $state(false);

  const displayedDocuments = $derived(showAllDocuments ? documents : documents.slice(0, DOCUMENT_LIMIT));
</script>

{#if documents.length > 0}
  <div>
    <h3 class="text-sm font-medium text-gray-500 mb-3">Documents ({documents.length})</h3>
    <div class="space-y-2">
      {#each displayedDocuments as doc}
        <button
          onclick={() => onOpenFile(doc.docloc)}
          class="w-full flex items-center justify-between p-3 bg-gray-50 rounded hover:bg-gray-100 transition text-left"
        >
          <div class="flex items-center gap-3">
            <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p class="text-sm font-medium text-gray-900">{doc.docnam}</p>
          </div>
          <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
      {/each}
    </div>
    {#if documents.length > DOCUMENT_LIMIT}
      <div class="mt-3 text-center">
        <button
          onclick={() => (showAllDocuments = !showAllDocuments)}
          class="text-sm text-accent hover:underline"
        >
          {showAllDocuments ? `Show Less` : `Show All (${documents.length - DOCUMENT_LIMIT} more)`}
        </button>
      </div>
    {/if}
  </div>
{/if}
