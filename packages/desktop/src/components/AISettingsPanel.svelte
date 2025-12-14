<script lang="ts">
  /**
   * AI Settings Panel
   *
   * Configure LiteLLM providers, API keys, and privacy settings.
   * Follows Braun/Ulm design language per docs/plans/litellm-integration-plan.md.
   *
   * Features:
   * - LiteLLM proxy status and control
   * - API key management (encrypted storage)
   * - Provider testing
   * - Cost tracking dashboard
   * - Privacy controls for cloud processing
   */
  import { onMount } from 'svelte';

  // Types
  interface LiteLLMStatus {
    installed: boolean;
    running: boolean;
    managedByApp: boolean;
    port: number;
    configuredModels: string[];
    idleTimeoutMs: number;
    idleTimeRemainingMs: number | null;
    lastError: string | null;
  }

  interface ProviderInfo {
    id: string;
    name: string;
    hasKey: boolean;
    available: boolean;
    description: string;
  }

  interface CostData {
    today: number;
    month: number;
    requestsToday: number;
    byProvider: Record<string, { cost: number; tokens: number; requests: number }>;
    byModel: Record<string, { cost: number; tokens: number; requests: number }>;
  }

  interface PrivacySettings {
    enabled: boolean;
    redactGps: boolean;
    redactAddresses: boolean;
    redactPhones: boolean;
    redactEmails: boolean;
  }

  // State
  let litellmStatus = $state<LiteLLMStatus | null>(null);
  let providers = $state<ProviderInfo[]>([]);
  let costs = $state<CostData | null>(null);
  let privacy = $state<PrivacySettings>({
    enabled: true,
    redactGps: true,
    redactAddresses: true,
    redactPhones: false,
    redactEmails: false,
  });

  let loading = $state(true);
  let loadingCosts = $state(false);
  let testing = $state<string | null>(null);
  let testResult = $state<{ success: boolean; message: string } | null>(null);
  let savingPrivacy = $state(false);

  // API Key modal
  let showKeyModal = $state(false);
  let keyModalProvider = $state('');
  let keyModalProviderName = $state('');
  let apiKeyInput = $state('');
  let savingKey = $state(false);
  let keyError = $state('');

  // Cloud provider definitions
  const cloudProviders: ProviderInfo[] = [
    { id: 'anthropic', name: 'Anthropic (Claude)', hasKey: false, available: false, description: 'claude-3.5-sonnet, claude-3.5-haiku' },
    { id: 'openai', name: 'OpenAI (GPT)', hasKey: false, available: false, description: 'gpt-4o, gpt-4o-mini' },
    { id: 'google', name: 'Google (Gemini)', hasKey: false, available: false, description: 'gemini-1.5-pro' },
    { id: 'groq', name: 'Groq (Llama)', hasKey: false, available: false, description: 'llama-3.1-70b' },
  ];

  onMount(async () => {
    await loadAll();
    loading = false;
  });

  async function loadAll() {
    await Promise.all([
      loadLiteLLMStatus(),
      loadCredentials(),
      loadPrivacySettings(),
      loadCosts(),
    ]);
  }

  async function loadLiteLLMStatus() {
    try {
      const result = await window.electronAPI.litellm.status();
      if (result.success) {
        litellmStatus = result.status;
      }
    } catch (error) {
      console.error('Failed to load LiteLLM status:', error);
    }
  }

  async function loadCredentials() {
    try {
      const result = await window.electronAPI.credentials.list();
      if (result.success) {
        const storedProviders = result.providers;
        providers = cloudProviders.map(p => ({
          ...p,
          hasKey: storedProviders.includes(p.id),
        }));
      } else {
        providers = [...cloudProviders];
      }
    } catch (error) {
      console.error('Failed to load credentials:', error);
      providers = [...cloudProviders];
    }
  }

  async function loadPrivacySettings() {
    try {
      const result = await window.electronAPI.litellm.settings.get();
      if (result.success && result.settings) {
        privacy = {
          enabled: result.settings.privacy_enabled !== 'false',
          redactGps: result.settings.privacy_redact_gps !== 'false',
          redactAddresses: result.settings.privacy_redact_addresses !== 'false',
          redactPhones: result.settings.privacy_redact_phones === 'true',
          redactEmails: result.settings.privacy_redact_emails === 'true',
        };
      }
    } catch (error) {
      console.error('Failed to load privacy settings:', error);
    }
  }

  async function loadCosts() {
    loadingCosts = true;
    try {
      // Get summary from costs API (Migration 88)
      const [summaryResult, dailyResult] = await Promise.all([
        window.electronAPI.costs.getSummary(),
        window.electronAPI.costs.getDailyCosts(1), // Today only
      ]);

      if (summaryResult.success && summaryResult.summary) {
        const summary = summaryResult.summary;
        const todayCost = dailyResult.success && dailyResult.costs?.length
          ? dailyResult.costs.reduce((sum, d) => sum + d.cost, 0)
          : 0;
        const todayRequests = dailyResult.success && dailyResult.costs?.length
          ? dailyResult.costs.reduce((sum, d) => sum + d.requests, 0)
          : 0;

        costs = {
          today: todayCost,
          month: summary.totalCost,
          requestsToday: todayRequests,
          byProvider: summary.byProvider,
          byModel: summary.byModel,
        };
      }
    } catch (error) {
      console.error('Failed to load costs:', error);
    }
    loadingCosts = false;
  }

  async function startLiteLLM() {
    testResult = null;
    const result = await window.electronAPI.litellm.start();
    if (result.success) {
      await loadLiteLLMStatus();
      await loadCosts();
    } else {
      testResult = { success: false, message: result.error || 'Failed to start LiteLLM' };
    }
  }

  async function stopLiteLLM() {
    await window.electronAPI.litellm.stop();
    await loadLiteLLMStatus();
    costs = null;
  }

  function openKeyModal(providerId: string, providerName: string) {
    keyModalProvider = providerId;
    keyModalProviderName = providerName;
    apiKeyInput = '';
    keyError = '';
    showKeyModal = true;
  }

  async function saveApiKey() {
    if (!apiKeyInput.trim()) {
      keyError = 'API key is required';
      return;
    }

    if (apiKeyInput.length < 10) {
      keyError = 'API key is too short';
      return;
    }

    savingKey = true;
    keyError = '';

    try {
      const result = await window.electronAPI.credentials.store(keyModalProvider, apiKeyInput.trim());

      if (result.success) {
        showKeyModal = false;
        apiKeyInput = '';

        // Reload config
        await window.electronAPI.litellm.reload();
        await loadCredentials();
        await loadLiteLLMStatus();

        // Show success with auto-enable and response time info
        let message = `API key saved for ${keyModalProviderName}`;
        if (result.autoEnabled) {
          message += ' (provider auto-enabled)';
        }
        if (result.responseTimeMs) {
          message += ` - Connection verified in ${result.responseTimeMs}ms`;
        }
        testResult = { success: true, message };
      } else {
        // Show detailed error for connection test failures
        if (result.testFailed) {
          keyError = `Connection test failed: ${result.error || 'Invalid API key'}. Key not saved.`;
        } else {
          keyError = result.error || 'Failed to save API key';
        }
      }
    } catch (error) {
      keyError = error instanceof Error ? error.message : 'Unknown error';
    }

    savingKey = false;
  }

  async function deleteApiKey(providerId: string) {
    if (!confirm(`Remove API key for this provider?`)) return;

    await window.electronAPI.credentials.delete(providerId);
    await window.electronAPI.litellm.reload();
    await loadCredentials();
    await loadLiteLLMStatus();
  }

  async function testProvider(providerId: string) {
    testing = providerId;
    testResult = null;

    try {
      // For cloud providers, use credentials:test (more direct)
      if (['anthropic', 'openai', 'google', 'groq'].includes(providerId)) {
        const result = await window.electronAPI.credentials.test(providerId);
        if (result.success) {
          const timeMsg = result.responseTimeMs ? ` (${result.responseTimeMs}ms)` : '';
          testResult = { success: true, message: `Connection successful${timeMsg}` };
        } else {
          testResult = { success: false, message: result.error || 'Connection test failed' };
        }
      } else {
        // For local Ollama, use the LiteLLM test
        const result = await window.electronAPI.litellm.test('extraction-local');
        if (result.success) {
          testResult = { success: true, message: `Ollama responding - "${result.response || 'OK'}"` };
        } else {
          testResult = { success: false, message: result.error || 'Ollama test failed' };
        }
      }
    } catch (error) {
      testResult = { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }

    testing = null;
  }

  async function savePrivacySettings() {
    savingPrivacy = true;

    try {
      const settings = [
        ['privacy_enabled', String(privacy.enabled)],
        ['privacy_redact_gps', String(privacy.redactGps)],
        ['privacy_redact_addresses', String(privacy.redactAddresses)],
        ['privacy_redact_phones', String(privacy.redactPhones)],
        ['privacy_redact_emails', String(privacy.redactEmails)],
      ];

      for (const [key, value] of settings) {
        await window.electronAPI.litellm.settings.set(key, value);
      }

      testResult = { success: true, message: 'Privacy settings saved' };
    } catch (error) {
      testResult = { success: false, message: 'Failed to save privacy settings' };
    }

    savingPrivacy = false;
  }

  function getStatusColor(provider: ProviderInfo): string {
    if (!provider.hasKey) return 'bg-braun-300';
    if (provider.available) return 'bg-green-500';
    return 'bg-amber-500';
  }

  function formatCurrency(value: number): string {
    return `$${value.toFixed(2)}`;
  }
</script>

{#if loading}
  <div class="p-8 text-center text-braun-500">
    <span class="animate-pulse">Loading AI settings...</span>
  </div>
{:else}
  <div class="space-y-6">
    <!-- LiteLLM Gateway Status -->
    <div class="bg-white rounded border border-braun-200 p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-braun-800">AI Gateway Status</h3>
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full {litellmStatus?.running ? 'bg-green-500' : 'bg-braun-300'}"></span>
          <span class="text-xs text-braun-600">
            {litellmStatus?.running ? 'Running' : 'Stopped'}
          </span>
        </div>
      </div>

      {#if !litellmStatus?.installed}
        <div class="bg-amber-50 border border-amber-200 rounded p-4 mb-4">
          <p class="text-sm text-amber-800">
            LiteLLM not installed. Install with:
          </p>
          <code class="block mt-2 bg-braun-100 px-3 py-2 rounded text-xs text-braun-800 font-mono">
            pip install "litellm[proxy]"
          </code>
        </div>
      {:else}
        <div class="flex gap-2 mb-4">
          {#if litellmStatus?.running}
            <button
              onclick={stopLiteLLM}
              class="text-xs px-3 py-1.5 border border-braun-300 rounded hover:bg-braun-50 transition"
            >
              Stop Gateway
            </button>
            <button
              onclick={loadCosts}
              class="text-xs px-3 py-1.5 border border-braun-300 rounded hover:bg-braun-50 transition"
            >
              Refresh Stats
            </button>
          {:else}
            <button
              onclick={startLiteLLM}
              class="text-xs px-3 py-1.5 bg-braun-900 text-white rounded hover:bg-braun-800 transition"
            >
              Start Gateway
            </button>
          {/if}
        </div>

        {#if litellmStatus?.running && litellmStatus.configuredModels.length > 0}
          <div class="text-xs text-braun-500">
            <span class="font-medium">Models:</span>
            {litellmStatus.configuredModels.join(', ')}
          </div>
        {/if}
      {/if}

      {#if litellmStatus?.lastError}
        <p class="text-xs text-red-600 mt-2">{litellmStatus.lastError}</p>
      {/if}
    </div>

    <!-- Cloud Providers -->
    <div class="bg-white rounded border border-braun-200 p-6">
      <h3 class="text-sm font-medium text-braun-800 mb-4">Cloud LLM Providers</h3>
      <p class="text-xs text-braun-500 mb-4">
        Add API keys to enable cloud-based extraction. Keys are encrypted locally.
      </p>

      <div class="space-y-3">
        {#each providers as provider}
          <div class="flex items-center justify-between py-3 border-b border-braun-100 last:border-0">
            <div class="flex items-center gap-3">
              <span class="w-2 h-2 rounded-full {getStatusColor(provider)}"></span>
              <div>
                <span class="text-sm text-braun-900">{provider.name}</span>
                <span class="text-xs text-braun-500 ml-2">
                  {provider.hasKey ? 'Key configured' : 'No API key'}
                </span>
                <p class="text-xs text-braun-400">{provider.description}</p>
              </div>
            </div>

            <div class="flex items-center gap-2">
              {#if provider.hasKey}
                <button
                  onclick={() => deleteApiKey(provider.id)}
                  class="text-xs px-2 py-1 text-red-600 hover:text-red-700"
                >
                  Remove
                </button>
                <button
                  onclick={() => testProvider(provider.id)}
                  disabled={testing === provider.id || !litellmStatus?.running}
                  class="text-xs px-2 py-1 bg-braun-50 hover:bg-braun-100 text-braun-700 rounded transition disabled:opacity-50"
                >
                  {testing === provider.id ? 'Testing...' : 'Test'}
                </button>
              {:else}
                <button
                  onclick={() => openKeyModal(provider.id, provider.name)}
                  class="text-xs px-3 py-1.5 bg-braun-900 text-white rounded hover:bg-braun-800 transition"
                >
                  Add Key
                </button>
              {/if}
            </div>
          </div>
        {/each}

        <!-- Local Ollama (always available) -->
        <div class="flex items-center justify-between py-3 border-t border-braun-200 mt-4 pt-4">
          <div class="flex items-center gap-3">
            <span class="w-2 h-2 rounded-full bg-blue-500"></span>
            <div>
              <span class="text-sm text-braun-900">Ollama (Local)</span>
              <span class="text-xs text-braun-500 ml-2">No API key required</span>
              <p class="text-xs text-braun-400">qwen2.5, llama3, etc. (free, offline)</p>
            </div>
          </div>

          <button
            onclick={() => testProvider('local')}
            disabled={testing === 'local' || !litellmStatus?.running}
            class="text-xs px-2 py-1 bg-braun-50 hover:bg-braun-100 text-braun-700 rounded transition disabled:opacity-50"
          >
            {testing === 'local' ? 'Testing...' : 'Test'}
          </button>
        </div>
      </div>

      {#if testResult}
        <div class="mt-4 p-3 rounded text-sm {testResult.success ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}">
          {testResult.message}
        </div>
      {/if}
    </div>

    <!-- Usage & Costs -->
    <div class="bg-white rounded border border-braun-200 p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-braun-800">Usage & Costs</h3>
        <button
          onclick={loadCosts}
          disabled={loadingCosts}
          class="text-xs text-braun-500 hover:text-braun-700"
        >
          {loadingCosts ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {#if costs}
        <div class="grid grid-cols-3 gap-4 mb-4">
          <div>
            <p class="text-xs text-braun-500 uppercase tracking-wide">Today</p>
            <p class="text-xl font-medium text-braun-900">{formatCurrency(costs.today)}</p>
          </div>
          <div>
            <p class="text-xs text-braun-500 uppercase tracking-wide">This Month</p>
            <p class="text-xl font-medium text-braun-900">{formatCurrency(costs.month)}</p>
          </div>
          <div>
            <p class="text-xs text-braun-500 uppercase tracking-wide">Requests Today</p>
            <p class="text-xl font-medium text-braun-900">{costs.requestsToday}</p>
          </div>
        </div>

        <!-- Cost breakdown by provider -->
        {#if Object.keys(costs.byProvider || {}).length > 0}
          <div class="border-t border-braun-100 pt-4">
            <p class="text-xs text-braun-500 uppercase tracking-wide mb-2">By Provider</p>
            <div class="space-y-1">
              {#each Object.entries(costs.byProvider) as [provider, data]}
                <div class="flex justify-between text-xs">
                  <span class="text-braun-600 capitalize">{provider}</span>
                  <span class="text-braun-900">
                    {formatCurrency(data.cost)} ({data.requests} requests)
                  </span>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      {:else}
        <p class="text-sm text-braun-500">
          {loadingCosts ? 'Loading cost data...' : 'No cost data available yet'}
        </p>
      {/if}
    </div>

    <!-- Privacy Controls -->
    <div class="bg-white rounded border border-braun-200 p-6">
      <h3 class="text-sm font-medium text-braun-800 mb-2">Privacy Controls</h3>
      <p class="text-xs text-braun-500 mb-4">
        Sensitive data is automatically removed before sending to cloud providers.
        Local models (Ollama) receive unmodified text.
      </p>

      <div class="space-y-3">
        <label class="flex items-center gap-3">
          <input
            type="checkbox"
            bind:checked={privacy.enabled}
            onchange={savePrivacySettings}
            class="rounded border-braun-300 text-braun-900 focus:ring-braun-500"
          />
          <span class="text-sm text-braun-700">Enable privacy sanitization for cloud providers</span>
        </label>

        <div class="ml-6 space-y-2">
          <label class="flex items-center gap-3">
            <input
              type="checkbox"
              bind:checked={privacy.redactGps}
              onchange={savePrivacySettings}
              disabled={!privacy.enabled}
              class="rounded border-braun-300 text-braun-900 focus:ring-braun-500 disabled:opacity-50"
            />
            <span class="text-sm text-braun-700">Redact GPS coordinates</span>
          </label>

          <label class="flex items-center gap-3">
            <input
              type="checkbox"
              bind:checked={privacy.redactAddresses}
              onchange={savePrivacySettings}
              disabled={!privacy.enabled}
              class="rounded border-braun-300 text-braun-900 focus:ring-braun-500 disabled:opacity-50"
            />
            <span class="text-sm text-braun-700">Redact street addresses & ZIP codes</span>
          </label>

          <label class="flex items-center gap-3">
            <input
              type="checkbox"
              bind:checked={privacy.redactPhones}
              onchange={savePrivacySettings}
              disabled={!privacy.enabled}
              class="rounded border-braun-300 text-braun-900 focus:ring-braun-500 disabled:opacity-50"
            />
            <span class="text-sm text-braun-700">Redact phone numbers</span>
          </label>

          <label class="flex items-center gap-3">
            <input
              type="checkbox"
              bind:checked={privacy.redactEmails}
              onchange={savePrivacySettings}
              disabled={!privacy.enabled}
              class="rounded border-braun-300 text-braun-900 focus:ring-braun-500 disabled:opacity-50"
            />
            <span class="text-sm text-braun-700">Redact email addresses</span>
          </label>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- API Key Modal -->
{#if showKeyModal}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-white rounded border border-braun-300 w-full max-w-md mx-4">
      <div class="px-5 py-4 border-b border-braun-200">
        <h3 class="text-base font-semibold text-braun-900">Add API Key</h3>
      </div>

      <div class="p-5 space-y-4">
        <p class="text-sm text-braun-600">
          Enter your API key for <strong>{keyModalProviderName}</strong>.
          Keys are encrypted and stored locally on your machine.
        </p>

        <div>
          <label class="block text-sm font-medium text-braun-700 mb-1">API Key</label>
          <input
            type="password"
            bind:value={apiKeyInput}
            placeholder="sk-..."
            class="w-full px-3 py-2 border border-braun-300 rounded text-sm focus:outline-none focus:border-braun-500 focus:ring-1 focus:ring-braun-500"
            onkeydown={(e) => e.key === 'Enter' && saveApiKey()}
          />
          {#if keyError}
            <p class="text-xs text-red-600 mt-1">{keyError}</p>
          {/if}
        </div>

        <div class="bg-braun-50 rounded p-3 text-xs text-braun-600">
          <p class="font-medium mb-1">Security Note</p>
          <p>Your API key is encrypted using your operating system's secure storage (Keychain on macOS, DPAPI on Windows). It never leaves your machine unencrypted.</p>
        </div>
      </div>

      <div class="px-5 py-4 border-t border-braun-200 flex justify-end gap-3">
        <button
          onclick={() => showKeyModal = false}
          class="px-4 py-2 text-sm text-braun-600 hover:text-braun-900"
        >
          Cancel
        </button>
        <button
          onclick={saveApiKey}
          disabled={savingKey || !apiKeyInput.trim()}
          class="px-4 py-2 text-sm bg-braun-900 text-white rounded hover:bg-braun-800 disabled:opacity-50"
        >
          {savingKey ? 'Saving...' : 'Save Key'}
        </button>
      </div>
    </div>
  </div>
{/if}
