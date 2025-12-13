<script lang="ts">
  /**
   * PatternEditor - Custom regex pattern management for Date Engine
   * Migration 73: Date Engine - NLP date extraction from web sources
   *
   * Premium UX Features:
   * - Live pattern testing with sample text
   * - Syntax validation with error feedback
   * - Test case management
   * - Category assignment
   * - Priority ordering
   */
  import { onMount } from 'svelte';

  interface DatePattern {
    pattern_id: string;
    name: string;
    regex: string;
    category: string | null;
    priority: number;
    enabled: number;
    test_cases: string | null;
    created_at: string;
  }

  interface Props {
    onClose?: () => void;
  }
  let { onClose }: Props = $props();

  // State
  let patterns = $state<DatePattern[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let selectedPattern = $state<DatePattern | null>(null);
  let isEditing = $state(false);
  let isTesting = $state(false);

  // Form state
  let formName = $state('');
  let formRegex = $state('');
  let formCategory = $state<string | null>(null);
  let formPriority = $state(0);
  let formEnabled = $state(true);
  let formTestCases = $state<Array<{ input: string; expected: string }>>([]);

  // Test state
  let testText = $state('');
  let testResults = $state<Array<{ fullMatch: string; groups: Record<string, string>; index: number }>>([]);
  let testError = $state<string | null>(null);
  let validationError = $state<string | null>(null);

  // Categories
  const categories = [
    { value: null, label: 'Any Category' },
    { value: 'build_date', label: 'Build Date' },
    { value: 'site_visit', label: 'Site Visit' },
    { value: 'obituary', label: 'Obituary' },
    { value: 'publication', label: 'Publication' },
    { value: 'closure', label: 'Closure' },
    { value: 'opening', label: 'Opening' },
    { value: 'demolition', label: 'Demolition' },
  ];

  // Load patterns
  async function loadPatterns() {
    try {
      loading = true;
      error = null;
      patterns = await window.electronAPI.dateEngine.getPatterns(false);
    } catch (err) {
      console.error('Error loading patterns:', err);
      error = err instanceof Error ? err.message : 'Failed to load patterns';
    } finally {
      loading = false;
    }
  }

  // Select pattern for editing
  function selectPattern(pattern: DatePattern) {
    selectedPattern = pattern;
    formName = pattern.name;
    formRegex = pattern.regex;
    formCategory = pattern.category;
    formPriority = pattern.priority;
    formEnabled = pattern.enabled === 1;
    formTestCases = pattern.test_cases ? JSON.parse(pattern.test_cases) : [];
    validationError = null;
    isEditing = true;
  }

  // Start new pattern
  function startNewPattern() {
    selectedPattern = null;
    formName = '';
    formRegex = '';
    formCategory = null;
    formPriority = 0;
    formEnabled = true;
    formTestCases = [];
    validationError = null;
    isEditing = true;
  }

  // Cancel editing
  function cancelEdit() {
    selectedPattern = null;
    isEditing = false;
    validationError = null;
  }

  // Validate regex
  function validateRegex(pattern: string): boolean {
    try {
      new RegExp(pattern);
      validationError = null;
      return true;
    } catch (err) {
      validationError = err instanceof Error ? err.message : 'Invalid regex';
      return false;
    }
  }

  // Save pattern
  async function savePattern() {
    if (!formName.trim()) {
      validationError = 'Pattern name is required';
      return;
    }

    if (!formRegex.trim()) {
      validationError = 'Regex pattern is required';
      return;
    }

    if (!validateRegex(formRegex)) {
      return;
    }

    try {
      loading = true;
      await window.electronAPI.dateEngine.savePattern(
        selectedPattern?.pattern_id || null,
        {
          name: formName.trim(),
          regex: formRegex.trim(),
          category: formCategory as 'unknown' | 'build_date' | 'site_visit' | 'obituary' | 'publication' | 'closure' | 'opening' | 'demolition' | null,
          priority: formPriority,
          enabled: formEnabled ? 1 : 0,
          test_cases: formTestCases.length > 0 ? JSON.stringify(formTestCases) : null,
        }
      );
      await loadPatterns();
      cancelEdit();
    } catch (err) {
      console.error('Error saving pattern:', err);
      validationError = err instanceof Error ? err.message : 'Failed to save pattern';
    } finally {
      loading = false;
    }
  }

  // Delete pattern
  async function deletePattern(patternId: string) {
    if (!confirm('Delete this pattern? This cannot be undone.')) return;

    try {
      loading = true;
      await window.electronAPI.dateEngine.deletePattern(patternId);
      await loadPatterns();
      if (selectedPattern?.pattern_id === patternId) {
        cancelEdit();
      }
    } catch (err) {
      console.error('Error deleting pattern:', err);
      error = err instanceof Error ? err.message : 'Failed to delete pattern';
    } finally {
      loading = false;
    }
  }

  // Toggle pattern enabled
  async function toggleEnabled(pattern: DatePattern) {
    try {
      await window.electronAPI.dateEngine.savePattern(pattern.pattern_id, {
        name: pattern.name,
        regex: pattern.regex,
        category: pattern.category as 'unknown' | 'build_date' | 'site_visit' | 'obituary' | 'publication' | 'closure' | 'opening' | 'demolition' | null,
        priority: pattern.priority,
        enabled: pattern.enabled === 1 ? 0 : 1,
        test_cases: pattern.test_cases,
      });
      await loadPatterns();
    } catch (err) {
      console.error('Error toggling pattern:', err);
    }
  }

  // Test pattern against sample text
  async function runTest() {
    if (!formRegex.trim() || !testText.trim()) {
      testError = 'Both pattern and test text are required';
      return;
    }

    if (!validateRegex(formRegex)) {
      testError = validationError;
      return;
    }

    try {
      isTesting = true;
      testError = null;
      const result = await window.electronAPI.dateEngine.testPattern(formRegex, testText);
      testResults = result.matches || [];
      if (testResults.length === 0) {
        testError = 'No matches found';
      }
    } catch (err) {
      console.error('Error testing pattern:', err);
      testError = err instanceof Error ? err.message : 'Test failed';
      testResults = [];
    } finally {
      isTesting = false;
    }
  }

  // Add test case
  function addTestCase() {
    formTestCases = [...formTestCases, { input: '', expected: '' }];
  }

  // Remove test case
  function removeTestCase(index: number) {
    formTestCases = formTestCases.filter((_, i) => i !== index);
  }

  // Update test case
  function updateTestCase(index: number, field: 'input' | 'expected', value: string) {
    formTestCases = formTestCases.map((tc, i) =>
      i === index ? { ...tc, [field]: value } : tc
    );
  }

  onMount(() => {
    loadPatterns();
  });

  // Reactive regex validation
  $effect(() => {
    if (formRegex) {
      validateRegex(formRegex);
    }
  });
</script>

<div class="bg-white border border-braun-200 rounded-lg overflow-hidden">
  <!-- Header -->
  <div class="flex items-center justify-between px-4 py-3 bg-braun-50 border-b border-braun-200">
    <div class="flex items-center gap-3">
      <svg class="w-5 h-5 text-braun-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
      <span class="font-medium text-braun-900">Custom Date Patterns</span>
      <span class="px-2 py-0.5 text-xs bg-braun-100 text-braun-700 border border-braun-200 rounded-full">
        {patterns.length} patterns
      </span>
    </div>
    <div class="flex items-center gap-2">
      {#if !isEditing}
        <button
          onclick={startNewPattern}
          class="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition"
        >
          New Pattern
        </button>
      {/if}
      {#if onClose}
        <button
          onclick={onClose}
          class="p-1.5 text-braun-500 hover:text-braun-700 transition"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      {/if}
    </div>
  </div>

  <div class="flex divide-x divide-braun-200" style="min-height: 400px;">
    <!-- Pattern List -->
    <div class="w-1/3 overflow-y-auto">
      {#if loading && patterns.length === 0}
        <div class="p-4 text-center text-braun-500">Loading patterns...</div>
      {:else if error}
        <div class="p-4 text-center text-red-500">{error}</div>
      {:else if patterns.length === 0}
        <div class="p-4 text-center text-braun-500">
          <p>No custom patterns defined.</p>
          <p class="text-sm mt-2">Create a pattern to enhance date extraction.</p>
        </div>
      {:else}
        <div class="divide-y divide-braun-100">
          {#each patterns as pattern}
            {@const isSelected = selectedPattern?.pattern_id === pattern.pattern_id}
            <div
              class="p-3 cursor-pointer transition {isSelected ? 'bg-blue-50' : 'hover:bg-braun-50'}"
              onclick={() => selectPattern(pattern)}
              role="button"
              tabindex={0}
            >
              <div class="flex items-center justify-between mb-1">
                <span class="font-medium text-braun-900 {!pattern.enabled ? 'opacity-50' : ''}">
                  {pattern.name}
                </span>
                <div class="flex items-center gap-2">
                  <button
                    onclick={(e) => { e.stopPropagation(); toggleEnabled(pattern); }}
                    class="p-1 rounded transition {pattern.enabled ? 'text-green-600 hover:bg-green-50' : 'text-braun-400 hover:bg-braun-100'}"
                    title={pattern.enabled ? 'Enabled' : 'Disabled'}
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {#if pattern.enabled}
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                      {:else}
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      {/if}
                    </svg>
                  </button>
                  <button
                    onclick={(e) => { e.stopPropagation(); deletePattern(pattern.pattern_id); }}
                    class="p-1 text-red-500 hover:bg-red-50 rounded transition"
                    title="Delete pattern"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
              <code class="text-xs text-braun-600 block truncate {!pattern.enabled ? 'opacity-50' : ''}">
                {pattern.regex}
              </code>
              <div class="flex items-center gap-2 mt-1">
                {#if pattern.category}
                  <span class="px-1.5 py-0.5 text-xs bg-braun-100 text-braun-700 rounded">
                    {pattern.category}
                  </span>
                {/if}
                <span class="text-xs text-braun-500">Priority: {pattern.priority}</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Editor Panel -->
    <div class="flex-1 overflow-y-auto">
      {#if isEditing}
        <div class="p-4 space-y-4">
          <h3 class="font-medium text-braun-900">
            {selectedPattern ? 'Edit Pattern' : 'New Pattern'}
          </h3>

          <!-- Validation Error -->
          {#if validationError}
            <div class="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {validationError}
            </div>
          {/if}

          <!-- Name -->
          <div>
            <label class="block text-sm font-medium text-braun-700 mb-1">Pattern Name</label>
            <input
              type="text"
              bind:value={formName}
              placeholder="e.g., Newspaper Date Format"
              class="w-full px-3 py-2 border border-braun-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <!-- Regex -->
          <div>
            <label class="block text-sm font-medium text-braun-700 mb-1">Regex Pattern</label>
            <textarea
              bind:value={formRegex}
              placeholder="e.g., (\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})"
              rows={3}
              class="w-full px-3 py-2 font-mono text-sm border border-braun-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent {validationError ? 'border-red-300' : ''}"
            ></textarea>
            <p class="text-xs text-braun-500 mt-1">
              Use JavaScript regex syntax. Named groups supported: (?&lt;year&gt;\d{4})
            </p>
          </div>

          <!-- Category -->
          <div>
            <label class="block text-sm font-medium text-braun-700 mb-1">Category (Optional)</label>
            <select
              bind:value={formCategory}
              class="w-full px-3 py-2 border border-braun-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {#each categories as cat}
                <option value={cat.value}>{cat.label}</option>
              {/each}
            </select>
          </div>

          <!-- Priority -->
          <div>
            <label class="block text-sm font-medium text-braun-700 mb-1">Priority</label>
            <input
              type="number"
              bind:value={formPriority}
              min={0}
              max={100}
              class="w-24 px-3 py-2 border border-braun-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <span class="text-xs text-braun-500 ml-2">Higher priority patterns are tried first</span>
          </div>

          <!-- Enabled -->
          <div class="flex items-center gap-2">
            <input
              type="checkbox"
              id="pattern-enabled"
              bind:checked={formEnabled}
              class="w-4 h-4 text-blue-600 border-braun-300 rounded focus:ring-blue-500"
            />
            <label for="pattern-enabled" class="text-sm text-braun-700">Enabled</label>
          </div>

          <!-- Test Area -->
          <div class="border-t border-braun-200 pt-4">
            <h4 class="font-medium text-braun-900 mb-2">Test Pattern</h4>
            <textarea
              bind:value={testText}
              placeholder="Enter sample text to test the pattern against..."
              rows={3}
              class="w-full px-3 py-2 border border-braun-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            ></textarea>
            <button
              onclick={runTest}
              disabled={isTesting || !formRegex || !testText}
              class="mt-2 px-4 py-2 bg-braun-600 text-white rounded hover:bg-braun-700 transition disabled:opacity-50"
            >
              {isTesting ? 'Testing...' : 'Run Test'}
            </button>

            {#if testError}
              <div class="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-700">
                {testError}
              </div>
            {/if}

            {#if testResults.length > 0}
              <div class="mt-2 p-2 bg-green-50 border border-green-200 rounded">
                <p class="text-sm font-medium text-green-700 mb-1">
                  {testResults.length} match{testResults.length !== 1 ? 'es' : ''} found:
                </p>
                {#each testResults as result, i}
                  <div class="text-sm text-green-800">
                    <span class="font-mono bg-green-100 px-1 rounded">{result.fullMatch}</span>
                    {#if Object.keys(result.groups || {}).length > 0}
                      <span class="text-green-600 ml-2">
                        Groups: {JSON.stringify(result.groups)}
                      </span>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Test Cases -->
          <div class="border-t border-braun-200 pt-4">
            <div class="flex items-center justify-between mb-2">
              <h4 class="font-medium text-braun-900">Test Cases (Optional)</h4>
              <button
                onclick={addTestCase}
                class="text-sm text-blue-600 hover:text-blue-700"
              >
                + Add Test Case
              </button>
            </div>
            {#if formTestCases.length === 0}
              <p class="text-sm text-braun-500">No test cases defined.</p>
            {:else}
              <div class="space-y-2">
                {#each formTestCases as testCase, index}
                  <div class="flex items-start gap-2">
                    <input
                      type="text"
                      value={testCase.input}
                      oninput={(e) => updateTestCase(index, 'input', e.currentTarget.value)}
                      placeholder="Input text"
                      class="flex-1 px-2 py-1 text-sm border border-braun-300 rounded"
                    />
                    <input
                      type="text"
                      value={testCase.expected}
                      oninput={(e) => updateTestCase(index, 'expected', e.currentTarget.value)}
                      placeholder="Expected match"
                      class="flex-1 px-2 py-1 text-sm border border-braun-300 rounded"
                    />
                    <button
                      onclick={() => removeTestCase(index)}
                      class="p-1 text-red-500 hover:bg-red-50 rounded"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-3 pt-4 border-t border-braun-200">
            <button
              onclick={savePattern}
              disabled={loading}
              class="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Pattern'}
            </button>
            <button
              onclick={cancelEdit}
              class="px-4 py-2 bg-braun-200 text-braun-700 rounded hover:bg-braun-300 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      {:else}
        <div class="flex items-center justify-center h-full text-braun-500">
          <div class="text-center">
            <svg class="w-12 h-12 mx-auto mb-3 text-braun-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            <p>Select a pattern to edit or create a new one.</p>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
