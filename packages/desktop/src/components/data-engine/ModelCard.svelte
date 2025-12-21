<script lang="ts">
  /**
   * ModelCard - Individual model display with actions
   *
   * Displays model information from ModelRegistry with:
   * - Name, provider, category badges
   * - State indicator (available, downloading, ready, error)
   * - Download progress bar when downloading
   * - Action buttons (download, delete, configure)
   */

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

  interface Props {
    model: Model;
    compact?: boolean;
    onDownload?: (model: Model) => void;
    onDelete?: (model: Model) => void;
  }

  let { model, compact = false, onDownload, onDelete }: Props = $props();

  function getStateIndicator(state: string) {
    switch (state) {
      case 'ready':
        return { color: 'bg-green-500', label: 'Ready', pulse: false };
      case 'running':
        return { color: 'bg-green-500', label: 'Running', pulse: true };
      case 'downloading':
        return { color: 'bg-amber-500', label: 'Downloading', pulse: true };
      case 'available':
        return { color: 'bg-braun-400', label: 'Available', pulse: false };
      case 'error':
        return { color: 'bg-red-500', label: 'Error', pulse: false };
      default:
        return { color: 'bg-braun-300', label: 'Unknown', pulse: false };
    }
  }

  function getProviderBadge(provider: string) {
    switch (provider) {
      case 'ollama':
        return { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Ollama' };
      case 'cloud':
        return { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Cloud' };
      case 'python':
        return { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Python' };
      case 'local':
        return { bg: 'bg-green-100', text: 'text-green-800', label: 'Local' };
      default:
        return { bg: 'bg-braun-100', text: 'text-braun-800', label: provider };
    }
  }

  function getCategoryBadge(category: string) {
    switch (category) {
      case 'text':
        return { bg: 'bg-braun-100', text: 'text-braun-700', label: 'Text' };
      case 'vision':
        return { bg: 'bg-teal-100', text: 'text-teal-800', label: 'Vision' };
      case 'embed':
        return { bg: 'bg-indigo-100', text: 'text-indigo-800', label: 'Embed' };
      case 'preprocessing':
        return { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Preprocess' };
      case 'tagging':
        return { bg: 'bg-pink-100', text: 'text-pink-800', label: 'Tagging' };
      default:
        return { bg: 'bg-braun-100', text: 'text-braun-700', label: category };
    }
  }

  let state = $derived(getStateIndicator(model.state));
  let providerBadge = $derived(getProviderBadge(model.provider));
  let categoryBadge = $derived(getCategoryBadge(model.category));
  let canDownload = $derived(model.provider === 'ollama' && model.state === 'available');
  let canDelete = $derived(model.provider === 'ollama' && model.state === 'ready');
  let isDownloading = $derived(model.state === 'downloading');
</script>

<div class="bg-white border border-braun-200 rounded p-3 {compact ? 'p-2' : 'p-3'}">
  <!-- Header Row -->
  <div class="flex items-start justify-between gap-2">
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-1.5 flex-wrap">
        <h4 class="text-sm font-medium text-braun-900 truncate">{model.name}</h4>

        <!-- State Indicator -->
        <span
          class="w-2 h-2 rounded-full {state.color} {state.pulse ? 'animate-pulse' : ''}"
          title={state.label}
        ></span>
      </div>

      <!-- Badges Row -->
      <div class="flex items-center gap-1 mt-1 flex-wrap">
        <span class="px-1.5 py-0.5 rounded text-xs {providerBadge.bg} {providerBadge.text}">
          {providerBadge.label}
        </span>
        <span class="px-1.5 py-0.5 rounded text-xs {categoryBadge.bg} {categoryBadge.text}">
          {categoryBadge.label}
        </span>
        {#if model.size}
          <span class="text-xs text-braun-400">{model.size}</span>
        {/if}
        {#if model.parameterCount}
          <span class="text-xs text-braun-400">{model.parameterCount}</span>
        {/if}
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="flex items-center gap-1 flex-shrink-0">
      {#if canDownload && onDownload}
        <button
          onclick={() => onDownload(model)}
          class="text-xs px-2 py-1 bg-braun-900 text-white rounded hover:bg-braun-700 transition"
        >
          Download
        </button>
      {:else if canDelete && onDelete}
        <button
          onclick={() => onDelete(model)}
          class="text-xs px-2 py-1 text-red-600 hover:text-red-800"
        >
          Remove
        </button>
      {:else if model.state === 'error'}
        <span class="text-xs text-red-600" title={model.lastError}>Error</span>
      {/if}
    </div>
  </div>

  <!-- Download Progress Bar -->
  {#if isDownloading}
    <div class="mt-2">
      <div class="h-1.5 bg-braun-200 rounded-full overflow-hidden">
        <div
          class="h-full bg-blue-500 transition-all duration-300"
          style="width: {model.downloadProgress || 0}%"
        ></div>
      </div>
      <p class="text-xs text-braun-500 mt-1">{model.downloadProgress || 0}% downloaded</p>
    </div>
  {/if}

  <!-- Capabilities (expanded view) -->
  {#if !compact}
    <div class="flex gap-1 mt-2 flex-wrap">
      {#if model.capabilities.completion}
        <span class="px-1 py-0.5 text-xs bg-braun-50 text-braun-600 rounded">completion</span>
      {/if}
      {#if model.capabilities.vision}
        <span class="px-1 py-0.5 text-xs bg-braun-50 text-braun-600 rounded">vision</span>
      {/if}
      {#if model.capabilities.embed}
        <span class="px-1 py-0.5 text-xs bg-braun-50 text-braun-600 rounded">embed</span>
      {/if}
      {#if model.capabilities.streaming}
        <span class="px-1 py-0.5 text-xs bg-braun-50 text-braun-600 rounded">stream</span>
      {/if}
    </div>
  {/if}

  <!-- Description -->
  {#if !compact && model.description}
    <p class="text-xs text-braun-500 mt-2 line-clamp-2">{model.description}</p>
  {/if}

  <!-- Error Message -->
  {#if model.state === 'error' && model.lastError}
    <p class="text-xs text-red-600 mt-2">{model.lastError}</p>
  {/if}

  <!-- Requirements (for non-ready models) -->
  {#if !compact && model.state === 'available' && model.requirements}
    <div class="text-xs text-braun-400 mt-2">
      {#if model.requirements.venv}
        <span>Requires: Python venv</span>
      {/if}
      {#if model.requirements.modelPath}
        <span>Requires: ONNX model</span>
      {/if}
    </div>
  {/if}
</div>
