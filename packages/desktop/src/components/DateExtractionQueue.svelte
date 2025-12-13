<script lang="ts">
  /**
   * DateExtractionQueue - Global date extraction review queue
   * Migration 73: Date Engine - NLP date extraction from web sources
   *
   * Premium UX Features:
   * - Global queue showing all pending extractions across all locations
   * - Filter by category, confidence, conflict status
   * - Batch approval operations
   * - Statistics dashboard
   * - Keyboard shortcuts (j/k/a/r/Enter)
   * - CSV export/import for bulk review
   * - Pattern management integration
   */
  import { onMount, onDestroy } from 'svelte';
  import { router } from '../stores/router';
  import type { DateExtraction, DateExtractionStats, DateEngineLearningStats } from '@au-archive/core';

  // State
  let extractions = $state<DateExtraction[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let selectedIndex = $state(0);
  let processing = $state<string | null>(null);
  let currentUser = $state('default');
  let expanded = $state(false);

  // Filters
  let filterCategory = $state<string>('');
  let filterMinConfidence = $state(0);
  let filterShowConflicts = $state(false);
  let limit = $state(50);
  let offset = $state(0);

  // Statistics
  let stats = $state<DateExtractionStats | null>(null);
  let learningStats = $state<DateEngineLearningStats | null>(null);

  // Backfill state
  let backfilling = $state(false);
  let backfillProgress = $state<{ processed: number; total: number; extractions_found: number } | null>(null);

  // Export state
  let exporting = $state(false);
  let importing = $state(false);

  // Category options
  const categories = [
    { value: '', label: 'All Categories' },
    { value: 'build_date', label: 'Build Date' },
    { value: 'site_visit', label: 'Site Visit' },
    { value: 'obituary', label: 'Obituary' },
    { value: 'publication', label: 'Publication' },
    { value: 'closure', label: 'Closure' },
    { value: 'opening', label: 'Opening' },
    { value: 'demolition', label: 'Demolition' },
    { value: 'unknown', label: 'Unknown' },
  ];

  // Category colors
  const categoryColors: Record<string, string> = {
    build_date: 'bg-blue-100 text-blue-800 border-blue-200',
    site_visit: 'bg-green-100 text-green-800 border-green-200',
    obituary: 'bg-gray-100 text-gray-800 border-gray-200',
    publication: 'bg-purple-100 text-purple-800 border-purple-200',
    closure: 'bg-red-100 text-red-800 border-red-200',
    opening: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    demolition: 'bg-orange-100 text-orange-800 border-orange-200',
    unknown: 'bg-braun-100 text-braun-800 border-braun-200',
  };

  // Confidence color
  function getConfidenceColor(confidence: number): string {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    if (confidence >= 0.4) return 'text-orange-600';
    return 'text-red-600';
  }

  // Load pending extractions
  async function loadExtractions() {
    try {
      loading = true;
      error = null;

      const results = await window.electronAPI.dateEngine.getPendingReview(limit, offset);
      extractions = results || [];

      // Apply client-side filters
      if (filterCategory) {
        extractions = extractions.filter(e => e.category === filterCategory);
      }
      if (filterMinConfidence > 0) {
        extractions = extractions.filter(e => e.overall_confidence >= filterMinConfidence);
      }
      if (filterShowConflicts) {
        extractions = extractions.filter(e => e.conflict_event_id && !e.conflict_resolved);
      }

      // Reset selection
      if (selectedIndex >= extractions.length) {
        selectedIndex = Math.max(0, extractions.length - 1);
      }
    } catch (err) {
      console.error('Error loading extractions:', err);
      error = err instanceof Error ? err.message : 'Failed to load extractions';
    } finally {
      loading = false;
    }
  }

  // Load statistics
  async function loadStats() {
    try {
      const [extractionStats, learning] = await Promise.all([
        window.electronAPI.dateEngine.getStats(),
        window.electronAPI.dateEngine.getLearningStats(),
      ]);
      stats = extractionStats;
      learningStats = learning;
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  }

  // Approve extraction
  async function handleApprove(extractionId: string) {
    try {
      processing = extractionId;
      await window.electronAPI.dateEngine.approve(extractionId, currentUser);
      await loadExtractions();
      await loadStats();
    } catch (err) {
      console.error('Error approving:', err);
    } finally {
      processing = null;
    }
  }

  // Reject extraction
  async function handleReject(extractionId: string) {
    try {
      processing = extractionId;
      await window.electronAPI.dateEngine.reject(extractionId, currentUser);
      await loadExtractions();
      await loadStats();
    } catch (err) {
      console.error('Error rejecting:', err);
    } finally {
      processing = null;
    }
  }

  // Convert to timeline
  async function handleConvert(extractionId: string) {
    try {
      processing = extractionId;
      await window.electronAPI.dateEngine.convertToTimeline(extractionId, currentUser);
      await loadExtractions();
      await loadStats();
    } catch (err) {
      console.error('Error converting:', err);
    } finally {
      processing = null;
    }
  }

  // Navigate to location
  function navigateToLocation(locid: string | null) {
    if (locid) {
      router.navigate(`/location/${locid}`);
    }
  }

  // Backfill web sources
  async function handleBackfill() {
    try {
      backfilling = true;
      backfillProgress = { processed: 0, total: 0, extractions_found: 0 };

      const result = await window.electronAPI.dateEngine.backfillWebSources({ batch_size: 50 });

      backfillProgress = {
        processed: result.processed,
        total: result.total,
        extractions_found: result.extractions_found,
      };

      await loadExtractions();
      await loadStats();
    } catch (err) {
      console.error('Error backfilling:', err);
    } finally {
      backfilling = false;
    }
  }

  // Export pending to CSV
  async function handleExport() {
    try {
      exporting = true;
      const csvContent = await window.electronAPI.dateEngine.exportPending();

      // Create download
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `date-extractions-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting:', err);
    } finally {
      exporting = false;
    }
  }

  // Import reviewed CSV
  async function handleImport(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.[0]) return;

    try {
      importing = true;
      const file = input.files[0];
      const content = await file.text();

      const result = await window.electronAPI.dateEngine.importReviewed(content, currentUser);

      console.log('Import result:', result);
      await loadExtractions();
      await loadStats();
    } catch (err) {
      console.error('Error importing:', err);
    } finally {
      importing = false;
      input.value = '';
    }
  }

  // Keyboard handler
  function handleKeydown(event: KeyboardEvent) {
    if (!expanded || extractions.length === 0) return;

    // Ignore if in input field
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    switch (event.key) {
      case 'j':
        event.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, extractions.length - 1);
        break;
      case 'k':
        event.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        break;
      case 'a':
        event.preventDefault();
        if (extractions[selectedIndex]?.status === 'pending') {
          handleApprove(extractions[selectedIndex].extraction_id);
        }
        break;
      case 'r':
        event.preventDefault();
        if (extractions[selectedIndex]?.status === 'pending') {
          handleReject(extractions[selectedIndex].extraction_id);
        }
        break;
      case 'Enter':
        event.preventDefault();
        const ext = extractions[selectedIndex];
        if (ext?.status === 'user_approved' || ext?.status === 'auto_approved') {
          handleConvert(ext.extraction_id);
        }
        break;
      case 'g':
        event.preventDefault();
        if (extractions[selectedIndex]?.locid) {
          navigateToLocation(extractions[selectedIndex].locid);
        }
        break;
    }
  }

  // Highlight date in sentence
  function highlightDate(sentence: string, rawText: string): string {
    if (!rawText) return sentence;
    const escaped = rawText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return sentence.replace(
      new RegExp(`(${escaped})`, 'gi'),
      '<mark class="bg-yellow-200 px-0.5 rounded">$1</mark>'
    );
  }

  onMount(async () => {
    await loadExtractions();
    await loadStats();

    // Get current user
    try {
      const settings = await window.electronAPI.settings.getAll();
      currentUser = settings.current_user || 'default';
    } catch (err) {
      console.error('Error loading user:', err);
    }

    window.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
  });

  // Reactive filter changes
  $effect(() => {
    const _cat = filterCategory;
    const _conf = filterMinConfidence;
    const _conflicts = filterShowConflicts;
    loadExtractions();
  });
</script>

<!-- Date Extraction Global Queue -->
<section class="mb-8">
  <button
    onclick={() => expanded = !expanded}
    class="w-full flex items-center justify-between px-4 py-3 bg-braun-50 border border-braun-200 rounded hover:bg-braun-100 transition"
  >
    <div class="flex items-center gap-3">
      <svg
        class="w-5 h-5 text-braun-600 transition-transform {expanded ? 'rotate-90' : ''}"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
      <span class="font-medium text-braun-900">Date Extraction Queue</span>
      {#if stats?.pending_count}
        <span class="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 border border-yellow-200 rounded-full">
          {stats.pending_count} pending
        </span>
      {/if}
    </div>
    <span class="text-xs text-braun-500">j/k a/r Enter g</span>
  </button>

  {#if expanded}
    <div class="border border-t-0 border-braun-200 rounded-b bg-white">
      <!-- Statistics Bar -->
      {#if stats}
        <div class="p-4 border-b border-braun-100 bg-braun-50/50">
          <div class="flex items-center gap-6 text-sm">
            <div>
              <span class="text-yellow-600 font-semibold">{stats.pending_count}</span>
              <span class="text-braun-500 ml-1">Pending</span>
            </div>
            <div>
              <span class="text-green-600 font-semibold">{stats.approved_count}</span>
              <span class="text-braun-500 ml-1">Approved</span>
            </div>
            <div>
              <span class="text-red-600 font-semibold">{stats.rejected_count}</span>
              <span class="text-braun-500 ml-1">Rejected</span>
            </div>
            <div>
              <span class="text-purple-600 font-semibold">{stats.converted_count}</span>
              <span class="text-braun-500 ml-1">Converted</span>
            </div>
            {#if learningStats?.total_entries}
              <div class="ml-auto text-xs text-braun-500">
                ML: {learningStats.total_entries} patterns learned
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Filters and Actions -->
      <div class="p-4 border-b border-braun-100 flex items-center gap-4 flex-wrap">
        <!-- Category Filter -->
        <select
          bind:value={filterCategory}
          class="px-3 py-1.5 text-sm border border-braun-300 rounded bg-white focus:outline-none focus:border-braun-600"
        >
          {#each categories as cat}
            <option value={cat.value}>{cat.label}</option>
          {/each}
        </select>

        <!-- Confidence Filter -->
        <label class="flex items-center gap-2 text-sm text-braun-700">
          Min Confidence:
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            bind:value={filterMinConfidence}
            class="w-24"
          />
          <span class="w-8">{Math.round(filterMinConfidence * 100)}%</span>
        </label>

        <!-- Conflicts Only -->
        <label class="flex items-center gap-2 text-sm text-braun-700 cursor-pointer">
          <input type="checkbox" bind:checked={filterShowConflicts} class="rounded" />
          Conflicts Only
        </label>

        <!-- Spacer -->
        <div class="flex-1"></div>

        <!-- Action Buttons -->
        <button
          onclick={handleBackfill}
          disabled={backfilling}
          class="px-3 py-1.5 text-xs bg-braun-100 text-braun-700 border border-braun-300 rounded hover:bg-braun-200 transition disabled:opacity-50"
        >
          {backfilling ? `Processing ${backfillProgress?.processed || 0}/${backfillProgress?.total || '?'}...` : 'Backfill Web Sources'}
        </button>

        <button
          onclick={handleExport}
          disabled={exporting}
          class="px-3 py-1.5 text-xs bg-braun-100 text-braun-700 border border-braun-300 rounded hover:bg-braun-200 transition disabled:opacity-50"
        >
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>

        <label class="px-3 py-1.5 text-xs bg-braun-100 text-braun-700 border border-braun-300 rounded hover:bg-braun-200 transition cursor-pointer {importing ? 'opacity-50' : ''}">
          {importing ? 'Importing...' : 'Import CSV'}
          <input
            type="file"
            accept=".csv"
            onchange={handleImport}
            disabled={importing}
            class="hidden"
          />
        </label>
      </div>

      <!-- Extractions List -->
      {#if loading}
        <div class="p-6 text-center text-braun-500">Loading extractions...</div>
      {:else if error}
        <div class="p-6 text-center text-red-500">{error}</div>
      {:else if extractions.length === 0}
        <div class="p-6 text-center text-braun-500">
          {#if filterCategory || filterMinConfidence > 0 || filterShowConflicts}
            No extractions match filters
          {:else}
            No pending date extractions
          {/if}
        </div>
      {:else}
        <div class="divide-y divide-braun-100 max-h-96 overflow-y-auto">
          {#each extractions as extraction, index}
            {@const isSelected = index === selectedIndex}
            {@const isProcessing = processing === extraction.extraction_id}
            <div
              class="p-4 transition {isSelected ? 'bg-blue-50' : 'hover:bg-braun-50'}"
              onclick={() => selectedIndex = index}
              role="button"
              tabindex={0}
            >
              <div class="flex items-start justify-between gap-4">
                <!-- Left: Date and Context -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="font-semibold text-braun-900">
                      {extraction.date_display || extraction.parsed_date || extraction.raw_text}
                    </span>
                    <span class="px-2 py-0.5 text-xs border rounded {categoryColors[extraction.category] || categoryColors.unknown}">
                      {extraction.category.replace('_', ' ')}
                    </span>
                    <span class="text-sm {getConfidenceColor(extraction.overall_confidence)}">
                      {Math.round(extraction.overall_confidence * 100)}%
                    </span>
                    {#if extraction.conflict_event_id && !extraction.conflict_resolved}
                      <span class="px-2 py-0.5 text-xs bg-orange-100 text-orange-800 border border-orange-200 rounded">
                        Conflict
                      </span>
                    {/if}
                  </div>

                  <p class="text-sm text-braun-700 truncate">
                    {@html highlightDate(extraction.sentence, extraction.raw_text)}
                  </p>

                  {#if extraction.locid}
                    <button
                      onclick={(e) => { e.stopPropagation(); navigateToLocation(extraction.locid); }}
                      class="mt-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      View Location (g)
                    </button>
                  {/if}
                </div>

                <!-- Right: Actions -->
                <div class="flex items-center gap-2 flex-shrink-0">
                  {#if extraction.status === 'pending'}
                    <button
                      onclick={(e) => { e.stopPropagation(); handleApprove(extraction.extraction_id); }}
                      disabled={isProcessing}
                      class="px-3 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 transition disabled:opacity-50"
                    >
                      {isProcessing ? '...' : 'Approve'}
                    </button>
                    <button
                      onclick={(e) => { e.stopPropagation(); handleReject(extraction.extraction_id); }}
                      disabled={isProcessing}
                      class="px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition disabled:opacity-50"
                    >
                      Reject
                    </button>
                  {:else if extraction.status === 'user_approved' || extraction.status === 'auto_approved'}
                    <button
                      onclick={(e) => { e.stopPropagation(); handleConvert(extraction.extraction_id); }}
                      disabled={isProcessing}
                      class="px-3 py-1 text-xs bg-purple-500 text-white rounded hover:bg-purple-600 transition disabled:opacity-50"
                    >
                      {isProcessing ? '...' : 'Add to Timeline'}
                    </button>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        </div>

        <!-- Pagination -->
        {#if extractions.length >= limit}
          <div class="p-4 border-t border-braun-100 flex justify-between items-center">
            <button
              onclick={() => { offset = Math.max(0, offset - limit); loadExtractions(); }}
              disabled={offset === 0}
              class="px-3 py-1.5 text-sm bg-braun-100 text-braun-700 rounded hover:bg-braun-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span class="text-sm text-braun-500">
              Showing {offset + 1} - {offset + extractions.length}
            </span>
            <button
              onclick={() => { offset += limit; loadExtractions(); }}
              class="px-3 py-1.5 text-sm bg-braun-100 text-braun-700 rounded hover:bg-braun-200 transition"
            >
              Next
            </button>
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</section>
