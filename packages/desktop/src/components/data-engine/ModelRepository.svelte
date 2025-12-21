<script lang="ts">
  /**
   * Model Repository - Browse and manage all AI models
   *
   * Unified model browser for all providers:
   * - Ollama (downloadable)
   * - Cloud (API key configured)
   * - Python (venv-based)
   * - Local (ONNX files)
   *
   * Features:
   * - Filter by provider, category, state
   * - Download Ollama models with progress
   * - Real-time model discovery
   * - Summary statistics
   */
  import { onMount, onDestroy } from 'svelte';
  import ModelCard from './ModelCard.svelte';

  interface Model {
    id: string;
    name: string;
    provider: 'ollama' | 'cloud' | 'python' | 'local';
    category: 'text' | 'vision' | 'embed' | 'preprocessing' | 'tagging';
    capabilities: {
      completion: boolean;
      vision: boolean;
      embed: boolean;
      streaming: boolean;
    };
    state: 'available' | 'downloading' | 'ready' | 'running' | 'error';
    downloadProgress?: number;
    size?: string;
    parameterCount?: string;
    contextLength?: number;
    description?: string;
    requirements?: {
      minRAM?: string;
      gpu?: boolean;
      venv?: string;
      modelPath?: string;
    };
    lastError?: string;
  }

  interface ModelSummary {
    total: number;
    byProvider: { ollama: number; cloud: number; python: number; local: number };
    byState: {
      available: number;
      downloading: number;
      ready: number;
      running: number;
      error: number;
    };
    byCategory: {
      text: number;
      vision: number;
      embed: number;
      preprocessing: number;
      tagging: number;
    };
  }

  interface Props {
    expanded?: boolean;
    onToggle?: () => void;
  }

  let { expanded = false, onToggle }: Props = $props();

  // State
  let models = $state<Model[]>([]);
  let summary = $state<ModelSummary | null>(null);
  let loading = $state(true);
  let refreshing = $state(false);
  let error = $state<string | null>(null);

  // Filters
  let providerFilter = $state<string>('');
  let categoryFilter = $state<string>('');
  let stateFilter = $state<string>('');
  let searchQuery = $state('');

  // Download progress tracking
  let downloadingModels = $state<Set<string>>(new Set());
  let progressPollInterval: ReturnType<typeof setInterval> | null = null;

  // Message feedback
  let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);

  onMount(async () => {
    if (expanded) {
      await loadModels();
    }
  });

  onDestroy(() => {
    if (progressPollInterval) {
      clearInterval(progressPollInterval);
      progressPollInterval = null;
    }
  });

  $effect(() => {
    if (expanded && models.length === 0) {
      loadModels();
    }
  });

  // Start/stop progress polling based on downloading models
  $effect(() => {
    if (downloadingModels.size > 0 && !progressPollInterval) {
      // Poll for model state updates while downloading
      progressPollInterval = setInterval(async () => {
        await refreshSummary();
        // Check if any models finished downloading
        const result = await window.electronAPI.ai.listModels();
        if (result.success && result.models) {
          models = result.models;
          // Remove finished downloads from tracking
          const stillDownloading = new Set<string>();
          for (const id of downloadingModels) {
            const model = result.models.find((m: Model) => m.id === id);
            if (model && model.state === 'downloading') {
              stillDownloading.add(id);
            }
          }
          downloadingModels = stillDownloading;
        }
      }, 2000);
    } else if (downloadingModels.size === 0 && progressPollInterval) {
      clearInterval(progressPollInterval);
      progressPollInterval = null;
    }
  });

  async function loadModels() {
    loading = true;
    error = null;

    try {
      const [modelsResult, summaryResult] = await Promise.all([
        window.electronAPI.ai.listModels(),
        window.electronAPI.ai.modelsSummary(),
      ]);

      if (modelsResult.success && modelsResult.models) {
        models = modelsResult.models;
      } else {
        error = modelsResult.error || 'Failed to load models';
      }

      if (summaryResult.success && summaryResult.summary) {
        summary = summaryResult.summary;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load models';
    } finally {
      loading = false;
    }
  }

  async function refreshModels() {
    refreshing = true;
    error = null;

    try {
      const result = await window.electronAPI.ai.refreshModels();
      if (result.success) {
        await loadModels();
        message = { type: 'success', text: 'Models refreshed' };
        setTimeout(() => (message = null), 3000);
      } else {
        error = result.error || 'Failed to refresh models';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to refresh models';
    } finally {
      refreshing = false;
    }
  }

  async function refreshSummary() {
    try {
      const result = await window.electronAPI.ai.modelsSummary();
      if (result.success && result.summary) {
        summary = result.summary;
      }
    } catch {
      // Silently fail for summary refresh
    }
  }

  async function handleDownload(model: Model) {
    if (model.provider !== 'ollama') return;

    try {
      // Mark as downloading
      downloadingModels = new Set([...downloadingModels, model.id]);

      // Update local state optimistically
      models = models.map((m) =>
        m.id === model.id ? { ...m, state: 'downloading' as const, downloadProgress: 0 } : m
      );

      // Start download
      const result = await window.electronAPI.ai.downloadModel(model.id);

      if (result.success) {
        message = { type: 'success', text: `Downloaded ${model.name}` };
        // Refresh to get updated state
        await loadModels();
      } else {
        message = { type: 'error', text: result.error || 'Download failed' };
        // Revert state
        models = models.map((m) =>
          m.id === model.id ? { ...m, state: 'available' as const, downloadProgress: undefined } : m
        );
      }
    } catch (err) {
      message = { type: 'error', text: err instanceof Error ? err.message : 'Download failed' };
    } finally {
      downloadingModels = new Set([...downloadingModels].filter((id) => id !== model.id));
      setTimeout(() => (message = null), 5000);
    }
  }

  async function handleDelete(model: Model) {
    if (model.provider !== 'ollama') return;

    if (!confirm(`Remove ${model.name}? This will delete the model from Ollama.`)) return;

    try {
      const result = await window.electronAPI.ai.deleteModel(model.id);
      if (result.success) {
        message = { type: 'success', text: `Removed ${model.name}` };
        await loadModels();
      } else {
        message = { type: 'error', text: result.error || 'Failed to remove model' };
      }
    } catch (err) {
      message = { type: 'error', text: err instanceof Error ? err.message : 'Failed to remove' };
    } finally {
      setTimeout(() => (message = null), 3000);
    }
  }

  // Filtered models
  let filteredModels = $derived(models.filter((model) => {
    if (providerFilter && model.provider !== providerFilter) return false;
    if (categoryFilter && model.category !== categoryFilter) return false;
    if (stateFilter && model.state !== stateFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        model.name.toLowerCase().includes(query) ||
        model.id.toLowerCase().includes(query) ||
        model.description?.toLowerCase().includes(query)
      );
    }
    return true;
  }));

  // Group models by provider for display
  let modelsByProvider = $derived(filteredModels.reduce(
    (acc, model) => {
      if (!acc[model.provider]) acc[model.provider] = [];
      acc[model.provider].push(model);
      return acc;
    },
    {} as Record<string, Model[]>
  ));
</script>

<div class="border-b border-braun-200 last:border-b-0">
  <!-- Section Header -->
  <button
    onclick={onToggle}
    class="w-full py-4 flex items-center justify-between text-left hover:bg-braun-50 transition-colors"
  >
    <div class="flex items-center gap-2">
      <span class="text-base font-semibold text-braun-900">Model Repository</span>
      {#if summary}
        <span class="px-2 py-0.5 text-xs bg-braun-100 text-braun-600 rounded">
          {summary.byState.ready} ready
        </span>
      {/if}
    </div>
    <svg
      class="w-5 h-5 text-braun-400 transition-transform duration-200 {expanded ? 'rotate-180' : ''}"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  {#if expanded}
    <div class="pl-4 pb-4 space-y-4">
      <p class="text-xs text-braun-500">
        Browse all available AI models. Download Ollama models, configure cloud providers, or check Python/ONNX requirements.
      </p>

      <!-- Summary Stats -->
      {#if summary}
        <div class="grid grid-cols-4 gap-2 text-center py-3 px-4 bg-braun-50 rounded border border-braun-200">
          <div>
            <p class="text-xs text-braun-400">Total</p>
            <p class="text-base font-medium text-braun-900">{summary.total}</p>
          </div>
          <div>
            <p class="text-xs text-braun-400">Ready</p>
            <p class="text-base font-medium text-green-600">{summary.byState.ready}</p>
          </div>
          <div>
            <p class="text-xs text-braun-400">Available</p>
            <p class="text-base font-medium text-braun-600">{summary.byState.available}</p>
          </div>
          <div>
            <p class="text-xs text-braun-400">Downloading</p>
            <p class="text-base font-medium text-amber-600">{summary.byState.downloading}</p>
          </div>
        </div>
      {/if}

      <!-- Filters Row -->
      <div class="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search models..."
          class="flex-1 min-w-[150px] px-2 py-1.5 text-sm border border-braun-300 rounded focus:outline-none focus:border-braun-600"
        />

        <select
          bind:value={providerFilter}
          class="px-2 py-1.5 text-sm border border-braun-300 rounded focus:outline-none focus:border-braun-600"
        >
          <option value="">All Providers</option>
          <option value="ollama">Ollama</option>
          <option value="cloud">Cloud</option>
          <option value="python">Python</option>
          <option value="local">Local</option>
        </select>

        <select
          bind:value={categoryFilter}
          class="px-2 py-1.5 text-sm border border-braun-300 rounded focus:outline-none focus:border-braun-600"
        >
          <option value="">All Categories</option>
          <option value="text">Text</option>
          <option value="vision">Vision</option>
          <option value="embed">Embed</option>
          <option value="preprocessing">Preprocessing</option>
          <option value="tagging">Tagging</option>
        </select>

        <select
          bind:value={stateFilter}
          class="px-2 py-1.5 text-sm border border-braun-300 rounded focus:outline-none focus:border-braun-600"
        >
          <option value="">All States</option>
          <option value="ready">Ready</option>
          <option value="available">Available</option>
          <option value="downloading">Downloading</option>
          <option value="error">Error</option>
        </select>

        <button
          onclick={refreshModels}
          disabled={refreshing}
          class="px-3 py-1.5 text-sm bg-braun-900 text-white rounded hover:bg-braun-700 disabled:opacity-50"
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <!-- Message -->
      {#if message}
        <div
          class="p-2 rounded text-sm {message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}"
        >
          {message.text}
        </div>
      {/if}

      <!-- Error -->
      {#if error}
        <div class="p-2 rounded text-sm bg-red-50 text-red-800">
          {error}
        </div>
      {/if}

      <!-- Loading -->
      {#if loading}
        <div class="text-sm text-braun-500 animate-pulse py-4 text-center">Loading models...</div>
      {:else if filteredModels.length === 0}
        <div class="text-sm text-braun-500 py-4 text-center">
          {searchQuery || providerFilter || categoryFilter || stateFilter
            ? 'No models match your filters'
            : 'No models found'}
        </div>
      {:else}
        <!-- Models Grid - Grouped by Provider -->
        <div class="space-y-4">
          {#each Object.entries(modelsByProvider) as [provider, providerModels]}
            <div class="border border-braun-200 rounded overflow-hidden">
              <div class="bg-braun-50 px-3 py-2 border-b border-braun-200">
                <span class="text-sm font-medium text-braun-700 capitalize">{provider}</span>
                <span class="text-xs text-braun-400 ml-2">({providerModels.length} models)</span>
              </div>
              <div class="p-3 grid gap-2 grid-cols-1 md:grid-cols-2">
                {#each providerModels as model (model.id)}
                  <ModelCard
                    {model}
                    compact={providerModels.length > 4}
                    onDownload={handleDownload}
                    onDelete={handleDelete}
                  />
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
