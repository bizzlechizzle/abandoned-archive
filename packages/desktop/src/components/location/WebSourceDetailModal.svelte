<script lang="ts">
  /**
   * WebSourceDetailModal - Comprehensive archive viewer
   * OPT-111: Shows all extracted metadata from archived web pages
   * Braun Design: Functional minimalism, data-dense but readable
   */

  interface WebSource {
    source_id: string;
    url: string;
    title: string | null;
    source_type: string;
    status: string;
    notes: string | null;
    extracted_title: string | null;
    extracted_author: string | null;
    extracted_date: string | null;
    extracted_publisher: string | null;
    word_count: number;
    image_count: number;
    video_count: number;
    screenshot_path: string | null;
    pdf_path: string | null;
    html_path: string | null;
    warc_path: string | null;
    domain: string | null;
    extracted_links: string | null;
    page_metadata_json: string | null;
    archived_at: string | null;
    created_at: string;
    // OPT-115: Enhanced metadata fields
    canonical_url: string | null;
    language: string | null;
    og_title: string | null;
    og_description: string | null;
    og_image: string | null;
    twitter_card_json: string | null;
    schema_org_json: string | null;
    http_status: number | null;
    capture_method: string | null;
    extension_captured_at: string | null;
    puppeteer_captured_at: string | null;
    extension_screenshot_path: string | null;
    extension_html_path: string | null;
  }

  interface WebSourceImage {
    id: number;
    url: string;
    local_path: string | null;
    hash: string | null;
    width: number | null;
    height: number | null;
    size: number | null;
    original_filename: string | null;
    alt: string | null;
    caption: string | null;
    credit: string | null;
    attribution: string | null;
    srcset_variants: string | null;
    exif_json: string | null;
    is_hi_res: number;
    is_hero: number;
  }

  interface WebSourceVideo {
    id: number;
    url: string;
    local_path: string | null;
    title: string | null;
    description: string | null;
    duration: number | null;
    platform: string | null;
    uploader: string | null;
    upload_date: string | null;
    view_count: number | null;
    metadata_json: string | null;
  }

  interface Props {
    sourceId: string;
    onClose: () => void;
  }

  let { sourceId, onClose }: Props = $props();

  // State
  let loading = $state(true);
  let source = $state<WebSource | null>(null);
  let images = $state<WebSourceImage[]>([]);
  let videos = $state<WebSourceVideo[]>([]);
  let selectedImage = $state<WebSourceImage | null>(null);
  let error = $state<string | null>(null);

  // Collapsible sections
  let showLinks = $state(false);
  let showImages = $state(true);
  let showVideos = $state(true);

  // Load data on mount
  $effect(() => {
    if (sourceId) {
      loadDetail();
    }
  });

  async function loadDetail() {
    loading = true;
    error = null;
    try {
      const detail = await window.electronAPI.websources.getDetail(sourceId);
      source = detail.source;
      images = detail.images || [];
      videos = detail.videos || [];
    } catch (err) {
      console.error('Failed to load web source detail:', err);
      error = err instanceof Error ? err.message : 'Failed to load archive';
    } finally {
      loading = false;
    }
  }

  function formatBytes(bytes: number | null): string {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDuration(seconds: number | null): string {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }

  function parseLinks(): Array<{ url: string; text: string }> {
    if (!source?.extracted_links) return [];
    try {
      return JSON.parse(source.extracted_links).slice(0, 50);
    } catch {
      return [];
    }
  }

  function parseExif(exifJson: string | null): Record<string, unknown> | null {
    if (!exifJson) return null;
    try {
      return JSON.parse(exifJson);
    } catch {
      return null;
    }
  }

  function parseSrcset(srcsetJson: string | null): string[] {
    if (!srcsetJson) return [];
    try {
      return JSON.parse(srcsetJson);
    } catch {
      return [];
    }
  }

  // OPT-115: Parse Twitter Card JSON
  function parseTwitterCard(json: string | null): Record<string, string> | null {
    if (!json) return null;
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  // OPT-115: Parse Schema.org JSON
  function parseSchemaOrg(json: string | null): unknown[] | null {
    if (!json) return null;
    try {
      const parsed = JSON.parse(json);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return null;
    }
  }

  // OPT-115: Get capture method display name
  function getCaptureMethodDisplay(method: string | null): string {
    switch (method) {
      case 'extension': return 'Browser Extension (Live Session)';
      case 'puppeteer': return 'Automated Browser';
      case 'hybrid': return 'Extension + Automated';
      default: return 'Unknown';
    }
  }

  function getDomain(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  async function handleOpenFile(path: string | null) {
    if (path) {
      try {
        await window.electronAPI.shell.openPath(path);
      } catch (err) {
        console.error('Failed to open file:', err);
      }
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      if (selectedImage) {
        selectedImage = null;
      } else {
        onClose();
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Modal Backdrop -->
<div
  class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
  onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
>
  <!-- Modal Content -->
  <div class="bg-braun-50 w-full max-w-4xl max-h-[90vh] rounded overflow-hidden flex flex-col border border-braun-300">
    {#if loading}
      <div class="p-8 text-center text-braun-500">Loading archive...</div>
    {:else if error}
      <div class="p-8 text-center text-red-600">{error}</div>
    {:else if !source}
      <div class="p-8 text-center text-braun-500">Archive not found</div>
    {:else if selectedImage}
      <!-- Image Detail View -->
      <div class="flex-1 overflow-y-auto">
        <div class="p-6">
          <button
            onclick={() => selectedImage = null}
            class="text-sm text-braun-600 hover:text-braun-900 mb-4 flex items-center gap-1"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Images
          </button>

          <!-- Image Preview -->
          {#if selectedImage.local_path}
            <div class="mb-6 bg-braun-200 rounded overflow-hidden flex items-center justify-center" style="max-height: 400px;">
              <img
                src="au-media://{selectedImage.local_path}"
                alt={selectedImage.alt || 'Archived image'}
                class="max-w-full max-h-96 object-contain"
              />
            </div>
          {/if}

          <!-- Image Metadata -->
          <div class="space-y-6">
            <section>
              <h3 class="text-xs font-semibold text-braun-500 uppercase tracking-wider mb-3">FILE INFO</h3>
              <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt class="text-braun-500">Filename</dt>
                <dd class="text-braun-900">{selectedImage.original_filename || '-'}</dd>
                <dt class="text-braun-500">Dimensions</dt>
                <dd class="text-braun-900">{selectedImage.width || '?'} x {selectedImage.height || '?'}</dd>
                <dt class="text-braun-500">Size</dt>
                <dd class="text-braun-900">{formatBytes(selectedImage.size)}</dd>
                <dt class="text-braun-500">Hash</dt>
                <dd class="text-braun-900 font-mono text-xs">{selectedImage.hash || '-'}</dd>
                <dt class="text-braun-500">Hi-Res</dt>
                <dd class="text-braun-900">{selectedImage.is_hi_res ? 'Yes' : 'No'}</dd>
              </dl>
            </section>

            <section>
              <h3 class="text-xs font-semibold text-braun-500 uppercase tracking-wider mb-3">PAGE METADATA</h3>
              <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt class="text-braun-500">Alt Text</dt>
                <dd class="text-braun-900">{selectedImage.alt || '-'}</dd>
                <dt class="text-braun-500">Caption</dt>
                <dd class="text-braun-900">{selectedImage.caption || '-'}</dd>
                <dt class="text-braun-500">Credit</dt>
                <dd class="text-braun-900">{selectedImage.credit || '-'}</dd>
                <dt class="text-braun-500">Attribution</dt>
                <dd class="text-braun-900">{selectedImage.attribution || '-'}</dd>
              </dl>
            </section>

            {#if parseSrcset(selectedImage.srcset_variants).length > 0}
              <section>
                <h3 class="text-xs font-semibold text-braun-500 uppercase tracking-wider mb-3">AVAILABLE RESOLUTIONS</h3>
                <div class="flex flex-wrap gap-2">
                  {#each parseSrcset(selectedImage.srcset_variants) as variant}
                    <span class="px-2 py-1 bg-braun-200 text-braun-700 text-xs rounded font-mono">{variant}</span>
                  {/each}
                </div>
              </section>
            {/if}

            {#if parseExif(selectedImage.exif_json)}
              <section>
                <h3 class="text-xs font-semibold text-braun-500 uppercase tracking-wider mb-3">EXIF DATA</h3>
                <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm max-h-48 overflow-y-auto">
                  {#each Object.entries(parseExif(selectedImage.exif_json) || {}).slice(0, 30) as [key, value]}
                    <dt class="text-braun-500 truncate">{key}</dt>
                    <dd class="text-braun-900 truncate">{String(value)}</dd>
                  {/each}
                </dl>
              </section>
            {/if}
          </div>
        </div>
      </div>
    {:else}
      <!-- Main Archive View -->
      <header class="p-6 border-b border-braun-300 flex items-start justify-between bg-white">
        <div class="flex-1 min-w-0">
          <h2 id="modal-title" class="text-xl font-semibold text-braun-900 truncate">
            {source.title || source.extracted_title || 'Archived Page'}
          </h2>
          <div class="flex items-center gap-2 mt-1 text-sm text-braun-500 flex-wrap">
            <span>{source.domain || getDomain(source.url)}</span>
            <span class="text-braun-300">|</span>
            <span class="capitalize">{source.source_type}</span>
            {#if source.archived_at}
              <span class="text-braun-300">|</span>
              <span>Archived {formatDate(source.archived_at)}</span>
            {/if}
          </div>
        </div>
        <button
          onclick={onClose}
          class="p-2 text-braun-400 hover:text-braun-900 transition"
          aria-label="Close"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div class="flex-1 overflow-y-auto p-6 space-y-6">
        <!-- Page Info -->
        <section>
          <h3 class="text-xs font-semibold text-braun-500 uppercase tracking-wider mb-3">PAGE INFO</h3>
          <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt class="text-braun-500">Domain</dt>
            <dd class="text-braun-900">{source.domain || getDomain(source.url)}</dd>
            {#if source.extracted_author}
              <dt class="text-braun-500">Author</dt>
              <dd class="text-braun-900">{source.extracted_author}</dd>
            {/if}
            {#if source.extracted_date}
              <dt class="text-braun-500">Published</dt>
              <dd class="text-braun-900">{formatDate(source.extracted_date)}</dd>
            {/if}
            {#if source.extracted_publisher}
              <dt class="text-braun-500">Publisher</dt>
              <dd class="text-braun-900">{source.extracted_publisher}</dd>
            {/if}
            {#if source.language}
              <dt class="text-braun-500">Language</dt>
              <dd class="text-braun-900">{source.language}</dd>
            {/if}
            {#if source.http_status}
              <dt class="text-braun-500">HTTP Status</dt>
              <dd class="text-braun-900">{source.http_status}</dd>
            {/if}
            <dt class="text-braun-500">Words</dt>
            <dd class="text-braun-900">{source.word_count?.toLocaleString() || 0}</dd>
            <dt class="text-braun-500">Images</dt>
            <dd class="text-braun-900">{source.image_count || 0}</dd>
            <dt class="text-braun-500">Videos</dt>
            <dd class="text-braun-900">{source.video_count || 0}</dd>
          </dl>
        </section>

        <!-- OPT-115: Open Graph Preview -->
        {#if source.og_title || source.og_description || source.og_image}
        <section>
          <h3 class="text-xs font-semibold text-braun-500 uppercase tracking-wider mb-3">OPEN GRAPH</h3>
          <div class="bg-white p-3 rounded border border-braun-200">
            {#if source.og_image}
              <img
                src={source.og_image}
                alt="OG Preview"
                class="w-full max-h-32 object-cover rounded mb-2"
                loading="lazy"
              />
            {/if}
            {#if source.og_title}
              <p class="font-medium text-braun-900 text-sm">{source.og_title}</p>
            {/if}
            {#if source.og_description}
              <p class="text-xs text-braun-600 mt-1 line-clamp-3">{source.og_description}</p>
            {/if}
          </div>
        </section>
        {/if}

        <!-- OPT-115: Twitter Card -->
        {#if parseTwitterCard(source.twitter_card_json)}
          {@const twitter = parseTwitterCard(source.twitter_card_json)}
          <section>
            <h3 class="text-xs font-semibold text-braun-500 uppercase tracking-wider mb-3">TWITTER CARD</h3>
            <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm bg-white p-3 rounded border border-braun-200">
              {#each Object.entries(twitter || {}) as [key, value]}
                {#if value}
                  <dt class="text-braun-500 capitalize">{key.replace(/_/g, ' ')}</dt>
                  <dd class="text-braun-900 truncate">{value}</dd>
                {/if}
              {/each}
            </dl>
          </section>
        {/if}

        <!-- OPT-115: Schema.org Data -->
        {#if parseSchemaOrg(source.schema_org_json)}
          {@const schemas = parseSchemaOrg(source.schema_org_json)}
          <section>
            <h3 class="text-xs font-semibold text-braun-500 uppercase tracking-wider mb-3">SCHEMA.ORG ({schemas?.length || 0})</h3>
            <div class="bg-white p-3 rounded border border-braun-200 max-h-48 overflow-y-auto">
              <pre class="text-xs text-braun-700 whitespace-pre-wrap">{JSON.stringify(schemas, null, 2)}</pre>
            </div>
          </section>
        {/if}

        <!-- OPT-115: Capture Info -->
        {#if source.capture_method}
        <section>
          <h3 class="text-xs font-semibold text-braun-500 uppercase tracking-wider mb-3">CAPTURE INFO</h3>
          <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt class="text-braun-500">Method</dt>
            <dd class="text-braun-900">{getCaptureMethodDisplay(source.capture_method)}</dd>
            {#if source.extension_captured_at}
              <dt class="text-braun-500">Extension Capture</dt>
              <dd class="text-braun-900">{formatDate(source.extension_captured_at)}</dd>
            {/if}
            {#if source.puppeteer_captured_at}
              <dt class="text-braun-500">Automated Capture</dt>
              <dd class="text-braun-900">{formatDate(source.puppeteer_captured_at)}</dd>
            {/if}
            {#if source.canonical_url && source.canonical_url !== source.url}
              <dt class="text-braun-500">Canonical URL</dt>
              <dd class="text-braun-900 truncate" title={source.canonical_url}>{source.canonical_url}</dd>
            {/if}
          </dl>
        </section>
        {/if}

        <!-- Archive Files -->
        <section>
          <h3 class="text-xs font-semibold text-braun-500 uppercase tracking-wider mb-3">ARCHIVE FILES</h3>
          <div class="flex flex-wrap gap-2">
            {#if source.screenshot_path}
              <button
                onclick={() => handleOpenFile(source?.screenshot_path ?? null)}
                class="px-3 py-2 bg-braun-200 text-braun-700 text-sm rounded hover:bg-braun-300 transition"
              >
                Screenshot
              </button>
            {/if}
            {#if source.pdf_path}
              <button
                onclick={() => handleOpenFile(source?.pdf_path ?? null)}
                class="px-3 py-2 bg-braun-200 text-braun-700 text-sm rounded hover:bg-braun-300 transition"
              >
                PDF
              </button>
            {/if}
            {#if source.html_path}
              <button
                onclick={() => handleOpenFile(source?.html_path ?? null)}
                class="px-3 py-2 bg-braun-200 text-braun-700 text-sm rounded hover:bg-braun-300 transition"
              >
                HTML
              </button>
            {/if}
            {#if source.warc_path}
              <button
                onclick={() => handleOpenFile(source?.warc_path ?? null)}
                class="px-3 py-2 bg-braun-200 text-braun-700 text-sm rounded hover:bg-braun-300 transition"
              >
                WARC
              </button>
            {/if}
            {#if !source.screenshot_path && !source.pdf_path && !source.html_path && !source.warc_path}
              <span class="text-sm text-braun-400">No archive files yet</span>
            {/if}
          </div>
        </section>

        <!-- Extracted Links -->
        {#if parseLinks().length > 0}
          <section>
            <button
              onclick={() => showLinks = !showLinks}
              class="w-full flex items-center justify-between text-xs font-semibold text-braun-500 uppercase tracking-wider mb-3 hover:text-braun-700"
            >
              <span>EXTRACTED LINKS ({parseLinks().length})</span>
              <span class="text-braun-400">{showLinks ? '▲' : '▼'}</span>
            </button>
            {#if showLinks}
              <ul class="space-y-1 max-h-48 overflow-y-auto bg-white p-3 rounded border border-braun-200 text-sm">
                {#each parseLinks() as link}
                  <li class="truncate">
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-braun-600 hover:text-braun-900 hover:underline"
                      title={link.url}
                    >
                      {link.text || link.url}
                    </a>
                  </li>
                {/each}
              </ul>
            {/if}
          </section>
        {/if}

        <!-- Images -->
        {#if images.length > 0}
          <section>
            <button
              onclick={() => showImages = !showImages}
              class="w-full flex items-center justify-between text-xs font-semibold text-braun-500 uppercase tracking-wider mb-3 hover:text-braun-700"
            >
              <span>IMAGES ({images.length})</span>
              <span class="text-braun-400">{showImages ? '▲' : '▼'}</span>
            </button>
            {#if showImages}
              <div class="grid grid-cols-4 gap-2">
                {#each images as img}
                  <button
                    onclick={() => selectedImage = img}
                    class="aspect-square bg-braun-200 rounded overflow-hidden hover:ring-2 hover:ring-braun-500 transition relative"
                    title={img.alt || img.original_filename || 'View image details'}
                  >
                    {#if img.local_path}
                      <img
                        src="au-media://{img.local_path}"
                        alt={img.alt || 'Archived image'}
                        class="w-full h-full object-cover"
                        loading="lazy"
                      />
                    {:else}
                      <div class="w-full h-full flex items-center justify-center text-braun-400 text-xs">
                        No file
                      </div>
                    {/if}
                    {#if img.is_hi_res}
                      <span class="absolute top-1 right-1 bg-green-600 text-white text-xs px-1 rounded">HD</span>
                    {/if}
                  </button>
                {/each}
              </div>
              <p class="text-xs text-braun-400 mt-2">Click an image for full metadata</p>
            {/if}
          </section>
        {/if}

        <!-- Videos -->
        {#if videos.length > 0}
          <section>
            <button
              onclick={() => showVideos = !showVideos}
              class="w-full flex items-center justify-between text-xs font-semibold text-braun-500 uppercase tracking-wider mb-3 hover:text-braun-700"
            >
              <span>VIDEOS ({videos.length})</span>
              <span class="text-braun-400">{showVideos ? '▲' : '▼'}</span>
            </button>
            {#if showVideos}
              <ul class="space-y-3">
                {#each videos as vid}
                  <li class="p-3 bg-white border border-braun-200 rounded">
                    <div class="font-medium text-braun-900">{vid.title || 'Untitled Video'}</div>
                    <div class="text-sm text-braun-500 mt-1">
                      {vid.platform || 'Unknown'}
                      {#if vid.duration}
                        <span class="mx-1">-</span> {formatDuration(vid.duration)}
                      {/if}
                      {#if vid.uploader}
                        <span class="mx-1">-</span> by {vid.uploader}
                      {/if}
                      {#if vid.view_count}
                        <span class="mx-1">-</span> {vid.view_count.toLocaleString()} views
                      {/if}
                    </div>
                    {#if vid.description}
                      <p class="text-sm text-braun-600 mt-2 line-clamp-2">{vid.description}</p>
                    {/if}
                    {#if vid.local_path}
                      <button
                        onclick={() => handleOpenFile(vid.local_path)}
                        class="mt-2 text-sm text-braun-600 hover:text-braun-900 hover:underline"
                      >
                        Open video file
                      </button>
                    {/if}
                  </li>
                {/each}
              </ul>
            {/if}
          </section>
        {/if}

        <!-- Notes -->
        {#if source.notes}
          <section>
            <h3 class="text-xs font-semibold text-braun-500 uppercase tracking-wider mb-3">NOTES</h3>
            <p class="text-sm text-braun-700 whitespace-pre-wrap bg-white p-3 rounded border border-braun-200">{source.notes}</p>
          </section>
        {/if}

        <!-- Original URL -->
        <section>
          <h3 class="text-xs font-semibold text-braun-500 uppercase tracking-wider mb-3">ORIGINAL URL</h3>
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            class="text-sm text-braun-600 hover:text-braun-900 hover:underline break-all"
          >
            {source.url}
          </a>
        </section>
      </div>
    {/if}
  </div>
</div>
