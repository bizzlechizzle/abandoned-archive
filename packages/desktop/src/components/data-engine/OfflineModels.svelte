<script lang="ts">
  /**
   * Offline AI Models Configuration
   *
   * Local Language Models (Ollama, spaCy).
   * Ollama runs seamlessly in the background - auto-starts when needed,
   * auto-stops after idle timeout. Zero manual intervention required.
   */
  import { onMount, onDestroy } from 'svelte';

  // Types
  interface ProviderConfig {
    id: string;
    name: string;
    type: 'spacy' | 'ollama';
    enabled: boolean;
    priority: number;
    settings: {
      host?: string;
      port?: number;
      model?: string;
    };
  }

  interface ProviderStatus {
    id: string;
    available: boolean;
    lastCheck: string;
    lastError?: string;
    responseTimeMs?: number;
    modelInfo?: {
      name: string;
      size?: string;
    };
  }

  interface OllamaModel {
    name: string;
    size: number;
  }

  interface OllamaLifecycleStatus {
    installed: boolean;
    binaryPath: string | null;
    running: boolean;
    managedByApp: boolean;
    idleTimeoutMs: number;
    idleTimeRemainingMs: number | null;
    lastError: string | null;
  }

  interface Props {
    expanded?: boolean;
    onToggle?: () => void;
  }

  let { expanded = false, onToggle }: Props = $props();

  // Sub-accordion state
  let languageModelsExpanded = $state(true);

  // Language Models State (from ExtractionSettings)
  let providers = $state<ProviderConfig[]>([]);
  let statuses = $state<Record<string, ProviderStatus>>({});
  let loading = $state(true);
  let testingProvider = $state<string | null>(null);
  let testResult = $state<{ success: boolean; message: string } | null>(null);

  // Ollama Lifecycle State (auto-managed background service)
  let ollamaLifecycle = $state<OllamaLifecycleStatus | null>(null);
  let lifecyclePollingInterval: ReturnType<typeof setInterval> | null = null;

  // Ollama configuration modal
  let showOllamaConfig = $state(false);
  let ollamaHost = $state('localhost');
  let ollamaPort = $state(11434);
  let ollamaModel = $state('qwen2.5:7b');
  let availableModels = $state<OllamaModel[]>([]);
  let loadingModels = $state(false);
  let savingConfig = $state(false);

  // Add network Ollama modal
  let showAddOllama = $state(false);
  let newOllamaName = $state('');
  let newOllamaHost = $state('');
  let newOllamaPort = $state(11434);
  let newOllamaModel = $state('qwen2.5:7b');
  let addingOllama = $state(false);

  onMount(async () => {
    if (expanded) {
      await loadAll();
    }
    loading = false;
  });

  onDestroy(() => {
    // Clean up lifecycle polling
    if (lifecyclePollingInterval) {
      clearInterval(lifecyclePollingInterval);
      lifecyclePollingInterval = null;
    }
  });

  $effect(() => {
    if (expanded && providers.length === 0) {
      loadAll();
    }
  });

  // Start/stop lifecycle polling based on expanded state
  $effect(() => {
    if (expanded) {
      // Poll lifecycle status every 5 seconds when expanded
      loadOllamaLifecycleStatus();
      lifecyclePollingInterval = setInterval(loadOllamaLifecycleStatus, 5000);
    } else {
      if (lifecyclePollingInterval) {
        clearInterval(lifecyclePollingInterval);
        lifecyclePollingInterval = null;
      }
    }
  });

  async function loadAll() {
    await Promise.all([
      loadProviders(),
      refreshStatuses(),
      loadOllamaLifecycleStatus(),
    ]);
  }

  // Ollama Lifecycle functions
  async function loadOllamaLifecycleStatus() {
    try {
      const status = await window.electronAPI.ollama.getStatus();
      ollamaLifecycle = status;
    } catch (error) {
      console.error('Failed to load Ollama lifecycle status:', error);
    }
  }

  // Language Models functions
  async function loadProviders() {
    try {
      const result = await window.electronAPI.extraction.getProviders();
      if (result.success) {
        // Filter to only local providers (spacy, ollama)
        providers = result.providers.filter(
          (p: ProviderConfig) => p.type === 'spacy' || p.type === 'ollama'
        );

        const ollamaProvider = providers.find(p => p.type === 'ollama');
        if (ollamaProvider) {
          ollamaHost = ollamaProvider.settings.host || 'localhost';
          ollamaPort = ollamaProvider.settings.port || 11434;
          ollamaModel = ollamaProvider.settings.model || 'qwen2.5:7b';
        }
      }
    } catch (error) {
      console.error('Failed to load providers:', error);
    }
  }

  async function refreshStatuses() {
    try {
      const result = await window.electronAPI.extraction.getProviderStatuses();
      if (result.success) {
        statuses = Object.fromEntries(result.statuses.map((s: ProviderStatus) => [s.id, s]));
      }
    } catch (error) {
      console.error('Failed to refresh statuses:', error);
    }
  }

  async function testProvider(providerId: string) {
    testingProvider = providerId;
    testResult = null;

    try {
      const result = await window.electronAPI.extraction.testProvider(providerId);
      if (result.success) {
        testResult = {
          success: true,
          message: `OK (${result.result.processingTimeMs}ms)`
        };
      } else {
        testResult = { success: false, message: result.error || 'Test failed' };
      }
    } catch (error) {
      testResult = { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    } finally {
      testingProvider = null;
    }

    await refreshStatuses();
  }

  async function toggleProvider(providerId: string) {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;

    try {
      await window.electronAPI.extraction.updateProvider(providerId, {
        enabled: !provider.enabled
      });
      await loadProviders();
    } catch (error) {
      console.error('Failed to toggle provider:', error);
    }
  }

  async function openOllamaConfig() {
    showOllamaConfig = true;
    await loadOllamaModels();
  }

  async function loadOllamaModels() {
    loadingModels = true;
    try {
      const result = await window.electronAPI.extraction.listOllamaModels(ollamaHost, ollamaPort);
      if (result.success) {
        availableModels = result.models || [];
      } else {
        availableModels = [];
      }
    } catch {
      availableModels = [];
    } finally {
      loadingModels = false;
    }
  }

  async function saveOllamaConfig() {
    savingConfig = true;
    try {
      const ollamaProvider = providers.find(p => p.type === 'ollama');
      if (ollamaProvider) {
        await window.electronAPI.extraction.updateProvider(ollamaProvider.id, {
          settings: {
            host: ollamaHost,
            port: ollamaPort,
            model: ollamaModel,
          }
        });
      }
      await loadProviders();
      await refreshStatuses();
      showOllamaConfig = false;
    } catch (error) {
      console.error('Failed to save Ollama config:', error);
    } finally {
      savingConfig = false;
    }
  }

  async function testOllamaConnection() {
    testResult = null;
    testingProvider = 'test-ollama';

    try {
      const result = await window.electronAPI.extraction.testOllamaConnection(ollamaHost, ollamaPort);
      if (result.success && result.result.connected) {
        testResult = {
          success: true,
          message: `Connected! ${result.result.availableModels.length} models`
        };
        await loadOllamaModels();
      } else {
        testResult = { success: false, message: result.result?.error || result.error || 'Failed' };
      }
    } catch (error) {
      testResult = { success: false, message: error instanceof Error ? error.message : 'Failed' };
    } finally {
      testingProvider = null;
    }
  }

  async function addNetworkOllama() {
    if (!newOllamaName || !newOllamaHost) return;

    addingOllama = true;
    try {
      const config = {
        id: `ollama-${newOllamaHost.replace(/\./g, '-')}`,
        name: newOllamaName,
        type: 'ollama' as const,
        enabled: true,
        priority: providers.length + 1,
        settings: {
          host: newOllamaHost,
          port: newOllamaPort,
          model: newOllamaModel,
          timeout: 120000,
        }
      };

      await window.electronAPI.extraction.addProvider(config);
      await loadProviders();
      await refreshStatuses();

      showAddOllama = false;
      newOllamaName = '';
      newOllamaHost = '';
      newOllamaPort = 11434;
      newOllamaModel = 'qwen2.5:7b';
    } catch (error) {
      console.error('Failed to add Ollama:', error);
    } finally {
      addingOllama = false;
    }
  }

  async function removeProvider(providerId: string) {
    if (!confirm('Remove this provider?')) return;

    try {
      await window.electronAPI.extraction.removeProvider(providerId);
      await loadProviders();
    } catch (error) {
      console.error('Failed to remove provider:', error);
    }
  }

  function getStatusBadge(status: ProviderStatus | undefined) {
    if (!status) return { class: 'bg-braun-100 text-braun-600', text: 'Unknown' };
    if (status.available) return { class: 'bg-green-100 text-green-800', text: 'Available' };
    return { class: 'bg-red-100 text-red-800', text: 'Unavailable' };
  }

  function formatBytes(bytes: number): string {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) {
      size /= 1024;
      i++;
    }
    return `${size.toFixed(1)} ${units[i]}`;
  }
</script>

<div class="border-b border-braun-200 last:border-b-0">
  <!-- Section Header -->
  <button
    onclick={onToggle}
    class="w-full py-4 flex items-center justify-between text-left hover:bg-braun-50 transition-colors"
  >
    <span class="text-base font-semibold text-braun-900">Offline</span>
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
        Local AI models that work without internet. Privacy-first processing.
      </p>

      <!-- Language Models Sub-accordion -->
      <div class="border border-braun-200 rounded overflow-hidden">
        <button
          onclick={() => languageModelsExpanded = !languageModelsExpanded}
          class="w-full py-3 px-4 flex items-center justify-between text-left hover:bg-braun-50 transition-colors bg-white"
        >
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-braun-900">Language Models</span>
            {#if ollamaLifecycle?.running && ollamaLifecycle?.managedByApp}
              <div class="flex items-center gap-1" title="Ollama running (auto-managed)">
                <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                <span class="text-xs text-braun-400">active</span>
              </div>
            {:else if ollamaLifecycle?.running}
              <div class="flex items-center gap-1" title="Ollama running (external)">
                <span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                <span class="text-xs text-braun-400">external</span>
              </div>
            {:else if ollamaLifecycle?.installed}
              <div class="flex items-center gap-1" title="Ollama installed, not running">
                <span class="w-1.5 h-1.5 rounded-full bg-braun-300"></span>
                <span class="text-xs text-braun-400">ready</span>
              </div>
            {/if}
          </div>
          <svg
            class="w-4 h-4 text-braun-400 transition-transform duration-200 {languageModelsExpanded ? 'rotate-180' : ''}"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {#if languageModelsExpanded}
          <div class="p-4 space-y-3 border-t border-braun-200 bg-braun-50">
            {#if loading}
              <div class="text-sm text-braun-500 animate-pulse">Loading...</div>
            {:else}
              <!-- Provider List -->
              {#each providers as provider}
                {@const status = statuses[provider.id]}
                {@const badge = getStatusBadge(status)}
                <div class="bg-white border border-braun-200 rounded p-3">
                  <div class="flex items-start justify-between">
                    <div class="flex-1">
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-medium text-braun-900">{provider.name}</span>
                        <span class="px-1.5 py-0.5 rounded text-xs {badge.class}">{badge.text}</span>
                        {#if !provider.enabled}
                          <span class="px-1.5 py-0.5 rounded text-xs bg-braun-100 text-braun-600">Off</span>
                        {/if}
                      </div>
                      <div class="text-xs text-braun-500 mt-0.5">
                        {#if provider.type === 'spacy'}
                          Offline NER (dates, people, orgs)
                        {:else if provider.type === 'ollama'}
                          {provider.settings.host || 'localhost'}:{provider.settings.port || 11434}
                        {/if}
                      </div>
                    </div>

                    <div class="flex items-center gap-1">
                      {#if provider.type === 'ollama'}
                        <button
                          onclick={openOllamaConfig}
                          class="text-xs px-2 py-1 text-braun-600 hover:bg-braun-50 rounded"
                        >
                          Config
                        </button>
                      {/if}
                      <button
                        onclick={() => testProvider(provider.id)}
                        disabled={testingProvider === provider.id}
                        class="text-xs px-2 py-1 bg-braun-50 hover:bg-braun-100 rounded disabled:opacity-50"
                      >
                        {testingProvider === provider.id ? '...' : 'Test'}
                      </button>
                      <button
                        onclick={() => toggleProvider(provider.id)}
                        class="text-xs px-2 py-1 {provider.enabled ? 'text-braun-600' : 'text-green-600'}"
                      >
                        {provider.enabled ? 'Off' : 'On'}
                      </button>
                    </div>
                  </div>
                </div>
              {/each}

              <!-- Add Network Ollama -->
              <button
                onclick={() => showAddOllama = true}
                class="text-xs text-braun-700 hover:text-braun-900 flex items-center gap-1"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
                Add Network Ollama
              </button>

              {#if testResult}
                <div class="p-2 rounded text-xs {testResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}">
                  {testResult.message}
                </div>
              {/if}
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<!-- Ollama Configuration Modal -->
{#if showOllamaConfig}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-white rounded border border-braun-300 w-full max-w-md mx-4">
      <div class="px-5 py-4 border-b border-braun-200">
        <h3 class="text-base font-semibold text-braun-900">Configure Ollama</h3>
      </div>

      <div class="p-5 space-y-4">
        <div>
          <label class="block text-sm font-medium text-braun-700 mb-1">Host</label>
          <input
            type="text"
            bind:value={ollamaHost}
            class="w-full px-3 py-2 border border-braun-300 rounded text-sm focus:outline-none focus:border-braun-600"
            placeholder="localhost"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-braun-700 mb-1">Port</label>
          <input
            type="number"
            bind:value={ollamaPort}
            class="w-full px-3 py-2 border border-braun-300 rounded text-sm focus:outline-none focus:border-braun-600"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-braun-700 mb-1">Model</label>
          {#if loadingModels}
            <div class="text-sm text-braun-600">Loading models...</div>
          {:else if availableModels.length > 0}
            <select
              bind:value={ollamaModel}
              class="w-full px-3 py-2 border border-braun-300 rounded text-sm focus:outline-none focus:border-braun-600"
            >
              {#each availableModels as model}
                <option value={model.name}>{model.name} ({formatBytes(model.size)})</option>
              {/each}
            </select>
          {:else}
            <input
              type="text"
              bind:value={ollamaModel}
              class="w-full px-3 py-2 border border-braun-300 rounded text-sm focus:outline-none focus:border-braun-600"
              placeholder="qwen2.5:7b"
            />
          {/if}
        </div>

        <button
          onclick={testOllamaConnection}
          disabled={testingProvider === 'test-ollama'}
          class="w-full px-3 py-2 bg-braun-50 hover:bg-braun-100 text-braun-700 rounded text-sm disabled:opacity-50"
        >
          {testingProvider === 'test-ollama' ? 'Testing...' : 'Test Connection'}
        </button>

        {#if testResult && showOllamaConfig}
          <div class="p-2 rounded text-sm {testResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}">
            {testResult.message}
          </div>
        {/if}
      </div>

      <div class="px-5 py-4 border-t border-braun-200 flex justify-end gap-3">
        <button
          onclick={() => showOllamaConfig = false}
          class="px-4 py-2 text-sm text-braun-600 hover:text-braun-900"
        >
          Cancel
        </button>
        <button
          onclick={saveOllamaConfig}
          disabled={savingConfig}
          class="px-4 py-2 text-sm bg-braun-900 text-white rounded hover:bg-braun-700 disabled:opacity-50"
        >
          {savingConfig ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Add Network Ollama Modal -->
{#if showAddOllama}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-white rounded border border-braun-300 w-full max-w-md mx-4">
      <div class="px-5 py-4 border-b border-braun-200">
        <h3 class="text-base font-semibold text-braun-900">Add Network Ollama</h3>
      </div>

      <div class="p-5 space-y-4">
        <p class="text-sm text-braun-600">
          Connect to Ollama on another machine (e.g., M2 Ultra server).
        </p>

        <div>
          <label class="block text-sm font-medium text-braun-700 mb-1">Display Name</label>
          <input
            type="text"
            bind:value={newOllamaName}
            class="w-full px-3 py-2 border border-braun-300 rounded text-sm focus:outline-none focus:border-braun-600"
            placeholder="My M2 Ultra Server"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-braun-700 mb-1">Host</label>
          <input
            type="text"
            bind:value={newOllamaHost}
            class="w-full px-3 py-2 border border-braun-300 rounded text-sm focus:outline-none focus:border-braun-600"
            placeholder="192.168.1.100"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-braun-700 mb-1">Port</label>
          <input
            type="number"
            bind:value={newOllamaPort}
            class="w-full px-3 py-2 border border-braun-300 rounded text-sm focus:outline-none focus:border-braun-600"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-braun-700 mb-1">Model</label>
          <input
            type="text"
            bind:value={newOllamaModel}
            class="w-full px-3 py-2 border border-braun-300 rounded text-sm focus:outline-none focus:border-braun-600"
            placeholder="qwen2.5:32b"
          />
        </div>
      </div>

      <div class="px-5 py-4 border-t border-braun-200 flex justify-end gap-3">
        <button
          onclick={() => showAddOllama = false}
          class="px-4 py-2 text-sm text-braun-600 hover:text-braun-900"
        >
          Cancel
        </button>
        <button
          onclick={addNetworkOllama}
          disabled={addingOllama || !newOllamaName || !newOllamaHost}
          class="px-4 py-2 text-sm bg-braun-900 text-white rounded hover:bg-braun-700 disabled:opacity-50"
        >
          {addingOllama ? 'Adding...' : 'Add'}
        </button>
      </div>
    </div>
  </div>
{/if}
