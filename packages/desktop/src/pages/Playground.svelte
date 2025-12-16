<script lang="ts">
  /**
   * Developer Playground - AI Model Comparison Interface
   *
   * Test and compare AI models side-by-side:
   * - Text completion comparison
   * - Vision analysis comparison (with image upload)
   * - Performance metrics display
   *
   * @version 1.0
   * @see docs/plans/adaptive-brewing-cherny.md Phase 4
   */
  import { onMount } from 'svelte';

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
  }

  interface ComparisonResult {
    modelId: string;
    content: string;
    duration: number;
    tokens?: number;
    tokensPerSecond?: number;
    error?: string;
  }

  // Mode
  let mode = $state<'text' | 'vision'>('text');

  // Models
  let availableModels = $state<Model[]>([]);
  let selectedModels = $state<string[]>([]);
  let loading = $state(true);

  // Input
  let textInput = $state('Describe an abandoned hospital in 2-3 sentences.');
  let imageFile = $state<File | null>(null);
  let imagePreview = $state<string | null>(null);

  // Results
  let results = $state<Map<string, ComparisonResult>>(new Map());
  let isRunning = $state(false);
  let error = $state<string | null>(null);

  onMount(async () => {
    await loadModels();
    loading = false;
  });

  async function loadModels() {
    try {
      const result = await window.electronAPI.ai.listModels();
      if (result.success && result.models) {
        // Filter to only ready models with completion capability
        availableModels = result.models.filter(
          (m: Model) => m.state === 'ready' && m.capabilities.completion
        );
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load models';
    }
  }

  function toggleModel(modelId: string) {
    if (selectedModels.includes(modelId)) {
      selectedModels = selectedModels.filter((id) => id !== modelId);
    } else if (selectedModels.length < 4) {
      selectedModels = [...selectedModels, modelId];
    }
  }

  function handleImageSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (file) {
      imageFile = file;

      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        imagePreview = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  function clearImage() {
    imageFile = null;
    imagePreview = null;
  }

  async function runComparison() {
    if (selectedModels.length === 0) {
      error = 'Please select at least one model';
      return;
    }

    if (mode === 'text' && !textInput.trim()) {
      error = 'Please enter a prompt';
      return;
    }

    if (mode === 'vision' && !imageFile) {
      error = 'Please select an image';
      return;
    }

    isRunning = true;
    error = null;
    results = new Map();

    // Run models in parallel
    const promises = selectedModels.map(async (modelId) => {
      const startTime = performance.now();

      try {
        let response;
        if (mode === 'text') {
          response = await window.electronAPI.ai.complete({
            model: modelId,
            messages: [{ role: 'user', content: textInput }],
            temperature: 0.7,
            maxTokens: 500,
          });
        } else {
          // Vision mode - convert file to base64
          const base64 = await fileToBase64(imageFile!);
          response = await window.electronAPI.ai.analyzeImage({
            model: modelId,
            image: base64,
            prompt: textInput || 'Describe this image in detail.',
          });
        }

        const duration = performance.now() - startTime;

        if (response.success && response.result) {
          const result: ComparisonResult = {
            modelId,
            content: mode === 'text'
              ? response.result.content
              : (response.result.description || response.result.tags?.join(', ') || 'No response'),
            duration,
            tokens: response.result.usage?.totalTokens,
            tokensPerSecond: response.result.usage?.totalTokens
              ? response.result.usage.totalTokens / (duration / 1000)
              : undefined,
          };
          results = new Map(results.set(modelId, result));
        } else {
          const result: ComparisonResult = {
            modelId,
            content: '',
            duration,
            error: response.error || 'Unknown error',
          };
          results = new Map(results.set(modelId, result));
        }
      } catch (err) {
        const duration = performance.now() - startTime;
        const result: ComparisonResult = {
          modelId,
          content: '',
          duration,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
        results = new Map(results.set(modelId, result));
      }
    });

    await Promise.allSettled(promises);
    isRunning = false;
  }

  async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  function getModelName(modelId: string): string {
    const model = availableModels.find((m) => m.id === modelId);
    return model?.name || modelId;
  }

  // Filter models based on mode
  let filteredModels = $derived(
    mode === 'vision'
      ? availableModels.filter((m) => m.capabilities.vision)
      : availableModels.filter((m) => m.capabilities.completion)
  );
</script>

<div class="p-6 space-y-6">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-xl font-bold text-braun-900">Developer Playground</h1>
      <p class="text-sm text-braun-500 mt-1">Compare AI models side-by-side</p>
    </div>
    <button
      onclick={loadModels}
      class="px-3 py-1.5 text-sm bg-braun-100 text-braun-700 rounded hover:bg-braun-200 transition"
    >
      Refresh Models
    </button>
  </div>

  <!-- Mode Tabs -->
  <div class="flex gap-2 border-b border-braun-200 pb-2">
    <button
      onclick={() => mode = 'text'}
      class="px-4 py-2 text-sm font-medium rounded-t transition {mode === 'text'
        ? 'bg-braun-900 text-white'
        : 'text-braun-600 hover:bg-braun-100'}"
    >
      Text Completion
    </button>
    <button
      onclick={() => mode = 'vision'}
      class="px-4 py-2 text-sm font-medium rounded-t transition {mode === 'vision'
        ? 'bg-braun-900 text-white'
        : 'text-braun-600 hover:bg-braun-100'}"
    >
      Vision Analysis
    </button>
  </div>

  <!-- Model Selection -->
  <div class="bg-braun-50 rounded border border-braun-200 p-4">
    <h3 class="text-sm font-medium text-braun-800 mb-3">
      Select Models (max 4)
      <span class="text-braun-400 ml-2">({selectedModels.length}/4 selected)</span>
    </h3>

    {#if loading}
      <p class="text-sm text-braun-500 animate-pulse">Loading models...</p>
    {:else if filteredModels.length === 0}
      <p class="text-sm text-braun-500">
        No {mode === 'vision' ? 'vision' : 'text'} models available. Install models from Settings &gt; AI Tools &gt; Model Repository.
      </p>
    {:else}
      <div class="flex flex-wrap gap-2">
        {#each filteredModels as model}
          <button
            onclick={() => toggleModel(model.id)}
            class="px-3 py-1.5 text-sm rounded border transition {selectedModels.includes(model.id)
              ? 'bg-braun-900 text-white border-braun-900'
              : 'bg-white text-braun-700 border-braun-300 hover:border-braun-500'}"
          >
            {model.name}
            <span class="text-xs opacity-70 ml-1">({model.provider})</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Input Section -->
  <div class="bg-white rounded border border-braun-200 p-4">
    {#if mode === 'vision'}
      <!-- Image Upload -->
      <div class="mb-4">
        <label class="block text-sm font-medium text-braun-700 mb-2">Image</label>
        {#if imagePreview}
          <div class="relative inline-block">
            <img src={imagePreview} alt="Preview" class="max-h-64 rounded border border-braun-200" />
            <button
              onclick={clearImage}
              class="absolute top-2 right-2 p-1 bg-black/50 text-white rounded hover:bg-black/70"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        {:else}
          <label class="flex flex-col items-center justify-center w-full h-32 border-2 border-braun-300 border-dashed rounded cursor-pointer hover:bg-braun-50">
            <div class="flex flex-col items-center justify-center pt-5 pb-6">
              <svg class="w-8 h-8 mb-2 text-braun-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p class="text-sm text-braun-500">Click to select an image</p>
            </div>
            <input type="file" class="hidden" accept="image/*" onchange={handleImageSelect} />
          </label>
        {/if}
      </div>
    {/if}

    <!-- Prompt Input -->
    <div>
      <label class="block text-sm font-medium text-braun-700 mb-2">
        {mode === 'vision' ? 'Prompt (optional)' : 'Prompt'}
      </label>
      <textarea
        bind:value={textInput}
        placeholder={mode === 'vision' ? 'Describe this image...' : 'Enter your prompt...'}
        rows="3"
        class="w-full px-3 py-2 border border-braun-300 rounded text-sm focus:outline-none focus:border-braun-600 resize-none"
      ></textarea>
    </div>

    <!-- Run Button -->
    <div class="flex justify-end mt-4">
      <button
        onclick={runComparison}
        disabled={isRunning || selectedModels.length === 0}
        class="px-6 py-2 bg-braun-900 text-white rounded font-medium hover:bg-braun-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {isRunning ? 'Running...' : 'Run Comparison'}
      </button>
    </div>
  </div>

  <!-- Error Message -->
  {#if error}
    <div class="p-3 bg-red-50 text-red-800 rounded text-sm">
      {error}
    </div>
  {/if}

  <!-- Results Section -->
  {#if results.size > 0}
    <div class="space-y-4">
      <h3 class="text-sm font-medium text-braun-800">Results</h3>

      <!-- Metrics Summary Table -->
      <div class="bg-braun-50 rounded border border-braun-200 overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-braun-100">
            <tr>
              <th class="px-4 py-2 text-left text-braun-700">Model</th>
              <th class="px-4 py-2 text-right text-braun-700">Latency</th>
              <th class="px-4 py-2 text-right text-braun-700">Tokens</th>
              <th class="px-4 py-2 text-right text-braun-700">Tok/s</th>
              <th class="px-4 py-2 text-center text-braun-700">Status</th>
            </tr>
          </thead>
          <tbody>
            {#each Array.from(results.values()) as result}
              <tr class="border-t border-braun-200">
                <td class="px-4 py-2 font-medium">{getModelName(result.modelId)}</td>
                <td class="px-4 py-2 text-right">{formatDuration(result.duration)}</td>
                <td class="px-4 py-2 text-right">{result.tokens || '-'}</td>
                <td class="px-4 py-2 text-right">
                  {result.tokensPerSecond ? result.tokensPerSecond.toFixed(1) : '-'}
                </td>
                <td class="px-4 py-2 text-center">
                  {#if result.error}
                    <span class="px-2 py-0.5 bg-red-100 text-red-800 rounded text-xs">Error</span>
                  {:else}
                    <span class="px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs">OK</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Side-by-Side Results -->
      <div class="grid gap-4 {results.size === 1 ? 'grid-cols-1' : results.size === 2 ? 'grid-cols-2' : results.size === 3 ? 'grid-cols-3' : 'grid-cols-2 lg:grid-cols-4'}">
        {#each Array.from(results.values()) as result}
          <div class="bg-white rounded border border-braun-200 p-4">
            <div class="flex items-center justify-between mb-2">
              <h4 class="text-sm font-medium text-braun-900">{getModelName(result.modelId)}</h4>
              <span class="text-xs text-braun-500">{formatDuration(result.duration)}</span>
            </div>

            {#if result.error}
              <p class="text-sm text-red-600">{result.error}</p>
            {:else}
              <p class="text-sm text-braun-700 whitespace-pre-wrap">{result.content}</p>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
