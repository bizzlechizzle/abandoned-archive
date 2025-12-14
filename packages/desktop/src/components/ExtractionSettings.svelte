<script lang="ts">
  /**
   * Extraction Settings Component
   *
   * Manages extraction providers (spaCy, Ollama) for the Document Intelligence system.
   * Allows users to configure Ollama host/port/model and test connections.
   */
  import { onMount } from 'svelte';

  interface ProviderConfig {
    id: string;
    name: string;
    type: 'spacy' | 'ollama' | 'anthropic' | 'google' | 'openai';
    enabled: boolean;
    priority: number;
    settings: {
      host?: string;
      port?: number;
      model?: string;
      executablePath?: string;
      timeout?: number;
      temperature?: number;
      maxTokens?: number;
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
      quantization?: string;
    };
  }

  interface OllamaModel {
    name: string;
    size: number;
  }

  // State
  let providers = $state<ProviderConfig[]>([]);
  let statuses = $state<Record<string, ProviderStatus>>({});
  let loading = $state(true);
  let testingProvider = $state<string | null>(null);
  let testResult = $state<{ success: boolean; message: string } | null>(null);

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
    await loadProviders();
    await refreshStatuses();
    loading = false;
  });

  async function loadProviders() {
    try {
      const result = await window.electronAPI.extraction.getProviders();
      if (result.success) {
        providers = result.providers;

        // Find existing Ollama config to populate form
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
          message: `Extracted ${result.result.dates?.length || 0} dates, ${result.result.people?.length || 0} people in ${result.result.processingTimeMs}ms`
        };
      } else {
        testResult = { success: false, message: result.error || 'Test failed' };
      }
    } catch (error) {
      testResult = { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    } finally {
      testingProvider = null;
    }

    // Refresh status after test
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
          message: `Connected! Ollama v${result.result.ollamaVersion || 'unknown'}, ${result.result.availableModels.length} models available`
        };
        // Refresh model list
        await loadOllamaModels();
      } else {
        testResult = { success: false, message: result.result?.error || result.error || 'Connection failed' };
      }
    } catch (error) {
      testResult = { success: false, message: error instanceof Error ? error.message : 'Connection failed' };
    } finally {
      testingProvider = null;
    }
  }

  async function addNetworkOllama() {
    if (!newOllamaName || !newOllamaHost) return;

    addingOllama = true;
    try {
      const config: ProviderConfig = {
        id: `ollama-${newOllamaHost.replace(/\./g, '-')}`,
        name: newOllamaName,
        type: 'ollama',
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

      // Reset form
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

  function formatBytes(bytes: number): string {
    if (!bytes) return 'unknown';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) {
      size /= 1024;
      i++;
    }
    return `${size.toFixed(1)} ${units[i]}`;
  }

  function getStatusBadge(status: ProviderStatus | undefined) {
    if (!status) return { class: 'bg-braun-100 text-braun-600', text: 'Unknown' };
    if (status.available) return { class: 'bg-green-100 text-green-800', text: 'Available' };
    return { class: 'bg-red-100 text-red-800', text: 'Unavailable' };
  }
</script>

<div class="space-y-6">
  <!-- Header with refresh button -->
  <div class="flex items-center justify-between">
    <h3 class="text-sm font-medium text-braun-800">Extraction Providers</h3>
    <button
      onclick={refreshStatuses}
      class="text-xs text-braun-600 hover:text-braun-900 transition flex items-center gap-1"
    >
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      Refresh
    </button>
  </div>

  {#if loading}
    <div class="text-sm text-braun-600">Loading providers...</div>
  {:else}
    <!-- Provider List -->
    <div class="space-y-3">
      {#each providers as provider}
        {@const status = statuses[provider.id]}
        {@const badge = getStatusBadge(status)}
        <div class="border border-braun-200 rounded p-4">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <span class="font-medium text-sm text-foreground">{provider.name}</span>
                <span class="px-2 py-0.5 rounded text-xs {badge.class}">{badge.text}</span>
                {#if !provider.enabled}
                  <span class="px-2 py-0.5 rounded text-xs bg-braun-100 text-braun-600">Disabled</span>
                {/if}
              </div>
              <div class="text-xs text-braun-600 mt-1">
                {#if provider.type === 'spacy'}
                  Offline NER extraction (dates, people, organizations)
                {:else if provider.type === 'ollama'}
                  {provider.settings.host || 'localhost'}:{provider.settings.port || 11434} — {provider.settings.model || 'default'}
                {:else}
                  {provider.type} provider
                {/if}
              </div>
              {#if status?.modelInfo}
                <div class="text-xs text-braun-500 mt-1">
                  Model: {status.modelInfo.name}
                  {#if status.modelInfo.size}
                    ({status.modelInfo.size})
                  {/if}
                </div>
              {/if}
              {#if status?.lastError}
                <div class="text-xs text-red-600 mt-1">{status.lastError}</div>
              {/if}
            </div>

            <div class="flex items-center gap-2">
              {#if provider.type === 'ollama'}
                <button
                  onclick={openOllamaConfig}
                  class="text-xs px-2 py-1 text-braun-600 hover:text-braun-900 hover:bg-braun-50 rounded transition"
                >
                  Configure
                </button>
              {/if}
              <button
                onclick={() => testProvider(provider.id)}
                disabled={testingProvider === provider.id}
                class="text-xs px-2 py-1 bg-braun-50 hover:bg-braun-100 text-braun-700 rounded transition disabled:opacity-50"
              >
                {testingProvider === provider.id ? 'Testing...' : 'Test'}
              </button>
              <button
                onclick={() => toggleProvider(provider.id)}
                class="text-xs px-2 py-1 {provider.enabled ? 'text-braun-600 hover:text-braun-900' : 'text-green-600 hover:text-green-700'} transition"
              >
                {provider.enabled ? 'Disable' : 'Enable'}
              </button>
              {#if provider.id !== 'spacy-local' && provider.id !== 'ollama-local'}
                <button
                  onclick={() => removeProvider(provider.id)}
                  class="text-xs px-2 py-1 text-red-600 hover:text-red-700 transition"
                >
                  Remove
                </button>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    </div>

    <!-- Test Result -->
    {#if testResult}
      <div class="p-3 rounded text-sm {testResult.success ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}">
        {testResult.message}
      </div>
    {/if}

    <!-- Add Network Ollama Button -->
    <div class="pt-4 border-t border-braun-200">
      <button
        onclick={() => showAddOllama = true}
        class="text-sm text-braun-700 hover:text-braun-900 flex items-center gap-1 transition"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        Add Network Ollama
      </button>
      <p class="text-xs text-braun-500 mt-1">
        Connect to Ollama running on another machine (e.g., M2 Ultra server)
      </p>
    </div>
  {/if}
</div>

<!-- Ollama Configuration Modal -->
{#if showOllamaConfig}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-white rounded border border-braun-300 w-full max-w-md mx-4">
      <div class="px-5 py-4 border-b border-braun-200">
        <h3 class="text-base font-semibold text-foreground">Configure Ollama</h3>
      </div>

      <div class="p-5 space-y-4">
        <div>
          <label class="block text-sm font-medium text-braun-700 mb-1">Host</label>
          <input
            type="text"
            bind:value={ollamaHost}
            class="w-full px-3 py-2 border border-braun-300 rounded text-sm focus:outline-none focus:border-braun-500"
            placeholder="localhost or IP address"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-braun-700 mb-1">Port</label>
          <input
            type="number"
            bind:value={ollamaPort}
            class="w-full px-3 py-2 border border-braun-300 rounded text-sm focus:outline-none focus:border-braun-500"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-braun-700 mb-1">Model</label>
          {#if loadingModels}
            <div class="text-sm text-braun-600">Loading models...</div>
          {:else if availableModels.length > 0}
            <select
              bind:value={ollamaModel}
              class="w-full px-3 py-2 border border-braun-300 rounded text-sm focus:outline-none focus:border-braun-500"
            >
              {#each availableModels as model}
                <option value={model.name}>{model.name} ({formatBytes(model.size)})</option>
              {/each}
            </select>
          {:else}
            <input
              type="text"
              bind:value={ollamaModel}
              class="w-full px-3 py-2 border border-braun-300 rounded text-sm focus:outline-none focus:border-braun-500"
              placeholder="qwen2.5:7b"
            />
            <p class="text-xs text-braun-500 mt-1">Test connection to load available models</p>
          {/if}
        </div>

        <div class="flex gap-2">
          <button
            onclick={testOllamaConnection}
            disabled={testingProvider === 'test-ollama'}
            class="flex-1 px-3 py-2 bg-braun-50 hover:bg-braun-100 text-braun-700 rounded text-sm transition disabled:opacity-50"
          >
            {testingProvider === 'test-ollama' ? 'Testing...' : 'Test Connection'}
          </button>
        </div>

        {#if testResult && showOllamaConfig}
          <div class="p-3 rounded text-sm {testResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}">
            {testResult.message}
          </div>
        {/if}
      </div>

      <div class="px-5 py-4 border-t border-braun-200 flex justify-end gap-3">
        <button
          onclick={() => showOllamaConfig = false}
          class="px-4 py-2 text-sm text-braun-600 hover:text-braun-900 transition"
        >
          Cancel
        </button>
        <button
          onclick={saveOllamaConfig}
          disabled={savingConfig}
          class="px-4 py-2 text-sm bg-braun-900 text-white rounded hover:bg-braun-800 transition disabled:opacity-50"
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
        <h3 class="text-base font-semibold text-foreground">Add Network Ollama</h3>
      </div>

      <div class="p-5 space-y-4">
        <p class="text-sm text-braun-600">
          Connect to Ollama running on another machine on your network. This is useful when you have a powerful GPU server (e.g., M2 Ultra) that you want to use from other computers.
        </p>

        <div>
          <label class="block text-sm font-medium text-braun-700 mb-1">Display Name</label>
          <input
            type="text"
            bind:value={newOllamaName}
            class="w-full px-3 py-2 border border-braun-300 rounded text-sm focus:outline-none focus:border-braun-500"
            placeholder="My M2 Ultra Server"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-braun-700 mb-1">Host (IP or hostname)</label>
          <input
            type="text"
            bind:value={newOllamaHost}
            class="w-full px-3 py-2 border border-braun-300 rounded text-sm focus:outline-none focus:border-braun-500"
            placeholder="192.168.1.100 or my-server.local"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-braun-700 mb-1">Port</label>
          <input
            type="number"
            bind:value={newOllamaPort}
            class="w-full px-3 py-2 border border-braun-300 rounded text-sm focus:outline-none focus:border-braun-500"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-braun-700 mb-1">Model</label>
          <input
            type="text"
            bind:value={newOllamaModel}
            class="w-full px-3 py-2 border border-braun-300 rounded text-sm focus:outline-none focus:border-braun-500"
            placeholder="qwen2.5:32b"
          />
          <p class="text-xs text-braun-500 mt-1">Recommended: qwen2.5:32b for M2 Ultra 64GB</p>
        </div>
      </div>

      <div class="px-5 py-4 border-t border-braun-200 flex justify-end gap-3">
        <button
          onclick={() => showAddOllama = false}
          class="px-4 py-2 text-sm text-braun-600 hover:text-braun-900 transition"
        >
          Cancel
        </button>
        <button
          onclick={addNetworkOllama}
          disabled={addingOllama || !newOllamaName || !newOllamaHost}
          class="px-4 py-2 text-sm bg-braun-900 text-white rounded hover:bg-braun-800 transition disabled:opacity-50"
        >
          {addingOllama ? 'Adding...' : 'Add Provider'}
        </button>
      </div>
    </div>
  </div>
{/if}
