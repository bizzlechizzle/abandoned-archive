<script lang="ts">
  /**
   * LocationWebSources - Web source archive management
   * OPT-109: Comprehensive web archiving replacing simple bookmarks
   * Per LILBITS: ~300 lines, single responsibility
   */

  interface WebSource {
    source_id: string;
    url: string;
    title: string | null;
    source_type: string;
    status: 'pending' | 'archiving' | 'complete' | 'partial' | 'failed';
    notes: string | null;
    extracted_title: string | null;
    extracted_author: string | null;
    word_count: number;
    image_count: number;
    video_count: number;
    screenshot_path: string | null;
    created_at: string;
    archived_at: string | null;
  }

  interface Props {
    locid: string;
    onOpenSource: (url: string) => void;
    onViewArchive?: (sourceId: string) => void;
  }

  let { locid, onOpenSource, onViewArchive }: Props = $props();

  // State
  let sources = $state<WebSource[]>([]);
  let loading = $state(true);
  let showAddForm = $state(false);
  let archivingSource = $state<string | null>(null);

  // Add form state
  let newUrl = $state('');
  let newTitle = $state('');
  let newType = $state('article');
  let newNotes = $state('');
  let addingSource = $state(false);

  // Load sources on mount
  $effect(() => {
    if (locid) {
      loadSources();
    }
  });

  async function loadSources() {
    loading = true;
    try {
      sources = await window.electronAPI.websources.findByLocation(locid);
    } catch (err) {
      console.error('Failed to load web sources:', err);
    } finally {
      loading = false;
    }
  }

  async function handleAddSource() {
    if (!newUrl.trim()) return;
    addingSource = true;
    try {
      await window.electronAPI.websources.create({
        url: newUrl.trim(),
        title: newTitle.trim() || null,
        locid,
        source_type: newType,
        notes: newNotes.trim() || null,
      });
      // Reset form
      newUrl = '';
      newTitle = '';
      newType = 'article';
      newNotes = '';
      showAddForm = false;
      // Reload
      await loadSources();
    } catch (err) {
      console.error('Failed to add web source:', err);
      alert(err instanceof Error ? err.message : 'Failed to add source');
    } finally {
      addingSource = false;
    }
  }

  async function handleArchive(sourceId: string) {
    archivingSource = sourceId;
    try {
      await window.electronAPI.websources.archive(sourceId, {
        captureScreenshot: true,
        capturePdf: true,
        captureHtml: true,
        captureWarc: true,
        extractImages: true,
        extractText: true,
      });
      await loadSources();
    } catch (err) {
      console.error('Failed to archive source:', err);
      alert(err instanceof Error ? err.message : 'Failed to archive');
    } finally {
      archivingSource = null;
    }
  }

  async function handleDelete(sourceId: string) {
    if (!confirm('Delete this web source and all its archives?')) return;
    try {
      await window.electronAPI.websources.delete(sourceId);
      await loadSources();
    } catch (err) {
      console.error('Failed to delete source:', err);
    }
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'complete': return 'bg-green-100 text-green-700';
      case 'partial': return 'bg-yellow-100 text-yellow-700';
      case 'failed': return 'bg-red-100 text-red-700';
      case 'archiving': return 'bg-blue-100 text-blue-700';
      default: return 'bg-braun-100 text-braun-600';
    }
  }

  function getStatusLabel(status: string): string {
    switch (status) {
      case 'complete': return 'Archived';
      case 'partial': return 'Partial';
      case 'failed': return 'Failed';
      case 'archiving': return 'Archiving...';
      default: return 'Pending';
    }
  }

  const sourceTypes = [
    { value: 'article', label: 'Article' },
    { value: 'gallery', label: 'Photo Gallery' },
    { value: 'video', label: 'Video' },
    { value: 'social', label: 'Social Media' },
    { value: 'map', label: 'Map' },
    { value: 'document', label: 'Document' },
    { value: 'archive', label: 'Archive' },
    { value: 'other', label: 'Other' },
  ];
</script>

<div class="mt-6 bg-white rounded border border-braun-300 p-6">
  <div class="flex items-center justify-between mb-3">
    <div class="flex items-center gap-2">
      <svg class="w-5 h-5 text-braun-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
      <h2 class="text-xl font-semibold text-braun-900">Web Sources ({sources.length})</h2>
    </div>
    <button
      onclick={() => showAddForm = !showAddForm}
      class="text-sm text-braun-900 hover:underline"
    >
      {showAddForm ? 'Cancel' : '+ Add Source'}
    </button>
  </div>

  {#if showAddForm}
    <div class="mb-4 p-4 bg-braun-50 rounded">
      <div class="space-y-3">
        <div>
          <label for="source-url" class="block form-label mb-1">URL *</label>
          <input
            id="source-url"
            type="url"
            bind:value={newUrl}
            placeholder="https://..."
            class="w-full px-3 py-2 border border-braun-300 rounded focus:outline-none focus:border-braun-600"
          />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="source-title" class="block form-label mb-1">Title</label>
            <input
              id="source-title"
              type="text"
              bind:value={newTitle}
              placeholder="Optional title"
              class="w-full px-3 py-2 border border-braun-300 rounded focus:outline-none focus:border-braun-600"
            />
          </div>
          <div>
            <label for="source-type" class="block form-label mb-1">Type</label>
            <select
              id="source-type"
              bind:value={newType}
              class="w-full px-3 py-2 border border-braun-300 rounded focus:outline-none focus:border-braun-600"
            >
              {#each sourceTypes as type}
                <option value={type.value}>{type.label}</option>
              {/each}
            </select>
          </div>
        </div>
        <div>
          <label for="source-notes" class="block form-label mb-1">Notes</label>
          <textarea
            id="source-notes"
            bind:value={newNotes}
            placeholder="Optional notes about this source"
            rows="2"
            class="w-full px-3 py-2 border border-braun-300 rounded focus:outline-none focus:border-braun-600 resize-none"
          ></textarea>
        </div>
        <button
          onclick={handleAddSource}
          disabled={addingSource || !newUrl.trim()}
          class="w-full px-4 py-2 bg-braun-900 text-white rounded hover:bg-braun-600 transition disabled:opacity-50"
        >
          {addingSource ? 'Adding...' : 'Add Web Source'}
        </button>
      </div>
    </div>
  {/if}

  {#if loading}
    <div class="text-center py-8 text-braun-400">Loading...</div>
  {:else if sources.length > 0}
    <div class="space-y-3">
      {#each sources as source}
        <div class="p-4 bg-braun-50 rounded hover:bg-braun-100 transition">
          <div class="flex items-start justify-between">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <button
                  onclick={() => onOpenSource(source.url)}
                  class="text-braun-900 hover:underline font-medium truncate max-w-md"
                >
                  {source.title || source.extracted_title || source.url}
                </button>
                <span class="px-2 py-0.5 text-xs rounded capitalize {getStatusColor(source.status)}">
                  {getStatusLabel(source.status)}
                </span>
                <span class="px-2 py-0.5 bg-braun-100 text-braun-600 text-xs rounded capitalize">
                  {source.source_type}
                </span>
              </div>
              {#if source.title || source.extracted_title}
                <p class="text-xs text-braun-400 truncate mt-1">{source.url}</p>
              {/if}
              {#if source.status === 'complete' || source.status === 'partial'}
                <div class="flex items-center gap-4 mt-2 text-xs text-braun-500">
                  {#if source.word_count > 0}
                    <span>{source.word_count.toLocaleString()} words</span>
                  {/if}
                  {#if source.image_count > 0}
                    <span>{source.image_count} images</span>
                  {/if}
                  {#if source.video_count > 0}
                    <span>{source.video_count} videos</span>
                  {/if}
                  {#if source.extracted_author}
                    <span>by {source.extracted_author}</span>
                  {/if}
                </div>
              {/if}
              {#if source.notes}
                <p class="text-sm text-braun-600 mt-2">{source.notes}</p>
              {/if}
            </div>
            <div class="flex items-center gap-2 ml-4">
              {#if source.status === 'pending' || source.status === 'failed'}
                <button
                  onclick={() => handleArchive(source.source_id)}
                  disabled={archivingSource === source.source_id}
                  class="px-3 py-1 text-sm bg-braun-900 text-white rounded hover:bg-braun-600 disabled:opacity-50"
                  title="Archive this page"
                >
                  {archivingSource === source.source_id ? 'Archiving...' : 'Archive'}
                </button>
              {:else if source.status === 'complete' && onViewArchive}
                <button
                  onclick={() => onViewArchive?.(source.source_id)}
                  class="px-3 py-1 text-sm border border-braun-300 rounded hover:bg-braun-100"
                  title="View archive"
                >
                  View
                </button>
              {/if}
              <button
                onclick={() => handleDelete(source.source_id)}
                class="p-1 text-braun-400 hover:text-error transition"
                title="Delete source"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="text-center text-braun-400 py-8 border-2 border-dashed border-braun-200 rounded">
      <svg class="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
      <p class="text-sm">No web sources yet</p>
      <p class="text-xs mt-1">Add URLs to articles, photos, and resources to archive them</p>
    </div>
  {/if}
</div>
