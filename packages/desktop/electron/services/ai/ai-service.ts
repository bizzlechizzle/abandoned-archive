/**
 * AI Service - Unified Abstraction
 *
 * Single entry point for all AI operations. Routes requests to appropriate
 * providers based on model ID prefix:
 * - ollama/* -> Ollama lifecycle + direct API
 * - cloud/* -> LiteLLM lifecycle + proxy
 * - local/* -> ONNX runtime (SigLIP)
 *
 * Note: Legacy Python vision models (RAM++, Florence-2) have been replaced
 * by visual-buffet, which handles all ML tagging externally.
 *
 * @version 1.1
 * @see docs/plans/adaptive-brewing-cherny.md
 */

import {
  IAIService,
  CompletionRequest,
  CompletionResult,
  VisionRequest,
  VisionResult,
  EmbedRequest,
  EmbedResult,
  Model,
  ModelFilter,
  AIHealthStatus,
  DownloadProgressCallback,
  ProviderHealth,
} from './types';
import {
  ensureOllamaRunning,
  resetIdleTimer as resetOllamaIdleTimer,
  getOllamaLifecycleStatus,
} from '../ollama-lifecycle-service';
import {
  ensureLiteLLMRunning,
  getLiteLLMStatus,
} from '../litellm-lifecycle-service';
import { getModelRegistry } from './model-registry';

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_TIMEOUT_MS = 60000; // 1 minute default
const OLLAMA_API_URL = 'http://127.0.0.1:11434';

// =============================================================================
// SINGLETON STATE
// =============================================================================

let instance: AIService | null = null;

// =============================================================================
// AI SERVICE IMPLEMENTATION
// =============================================================================

class AIService implements IAIService {
  // ---------------------------------------------------------------------------
  // TEXT COMPLETION
  // ---------------------------------------------------------------------------

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const startTime = Date.now();
    const [providerType, modelName] = this.parseModelId(request.model);

    try {
      switch (providerType) {
        case 'ollama':
          return await this.ollamaComplete(modelName, request, startTime);
        case 'cloud':
          return await this.cloudComplete(modelName, request, startTime);
        case 'python':
          throw new Error(
            'Python AI backend deprecated. Use ollama/* for local models or cloud/* for API providers.'
          );
        case 'local':
          throw new Error(
            'Local ONNX text completion not available. Use ollama/* for local models.'
          );
        default:
          throw new Error(`Unknown provider type: ${providerType}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`AI completion failed (${request.model}): ${errorMsg}`);
    }
  }

  private async ollamaComplete(
    modelName: string,
    request: CompletionRequest,
    startTime: number
  ): Promise<CompletionResult> {
    // Ensure Ollama is running
    const running = await ensureOllamaRunning();
    if (!running) {
      throw new Error('Failed to start Ollama. Is it installed?');
    }

    const timeout = request.timeout || DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${OLLAMA_API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          messages: request.messages,
          stream: false,
          options: {
            temperature: request.temperature ?? 0.7,
            num_predict: request.maxTokens,
            stop: request.stop,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama error ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      // Reset idle timer since we made a request
      resetOllamaIdleTimer();

      return {
        content: data.message?.content || '',
        model: `ollama/${modelName}`,
        usage: data.prompt_eval_count
          ? {
              promptTokens: data.prompt_eval_count,
              completionTokens: data.eval_count || 0,
              totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
            }
          : undefined,
        finishReason: data.done ? 'stop' : undefined,
        durationMs: Date.now() - startTime,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async cloudComplete(
    modelName: string,
    request: CompletionRequest,
    startTime: number
  ): Promise<CompletionResult> {
    // Ensure LiteLLM is running
    const started = await ensureLiteLLMRunning();
    if (!started) {
      throw new Error('Failed to start LiteLLM proxy. Cloud AI unavailable.');
    }

    const status = await getLiteLLMStatus();
    if (!status.running) {
      throw new Error('LiteLLM proxy not running');
    }

    const timeout = request.timeout || DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(
        `http://localhost:${status.port}/chat/completions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modelName,
            messages: request.messages,
            temperature: request.temperature ?? 0.7,
            max_tokens: request.maxTokens,
            stop: request.stop,
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LiteLLM error ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      return {
        content: data.choices?.[0]?.message?.content || '',
        model: `cloud/${data.model || modelName}`,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            }
          : undefined,
        finishReason: data.choices?.[0]?.finish_reason,
        durationMs: Date.now() - startTime,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ---------------------------------------------------------------------------
  // VISION / IMAGE ANALYSIS
  // ---------------------------------------------------------------------------

  async analyzeImage(request: VisionRequest): Promise<VisionResult> {
    const startTime = Date.now();
    const [providerType, modelName] = this.parseModelId(request.model);

    try {
      switch (providerType) {
        case 'ollama':
          return await this.ollamaVision(modelName, request, startTime);
        case 'python':
          throw new Error(
            'Python vision models deprecated. Use visual-buffet dispatch worker for ML tagging, or ollama/* for local vision models like llava.'
          );
        case 'local':
          throw new Error(
            'Local ONNX vision not available. Use ollama/llava for local vision or cloud/* for API providers.'
          );
        case 'cloud':
          return await this.cloudVision(modelName, request, startTime);
        default:
          throw new Error(`Unknown provider type: ${providerType}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`AI vision failed (${request.model}): ${errorMsg}`);
    }
  }

  private async ollamaVision(
    modelName: string,
    request: VisionRequest,
    startTime: number
  ): Promise<VisionResult> {
    // Ensure Ollama is running
    const running = await ensureOllamaRunning();
    if (!running) {
      throw new Error('Failed to start Ollama. Is it installed?');
    }

    const fs = await import('fs');
    const imageBase64 = fs.readFileSync(request.imagePath).toString('base64');

    const prompt =
      request.prompt ||
      'Describe this image in detail. List any notable objects, text, conditions, or features you observe.';

    const timeout = request.timeout || DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${OLLAMA_API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          messages: [
            {
              role: 'user',
              content: prompt,
              images: [imageBase64],
            },
          ],
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama vision error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const description = data.message?.content || '';

      // Reset idle timer
      resetOllamaIdleTimer();

      // Extract tags from description (simple word extraction)
      const tags = this.extractTagsFromText(description);

      return {
        tags,
        confidence: tags.reduce(
          (acc, tag) => ({ ...acc, [tag]: 0.8 }),
          {} as Record<string, number>
        ),
        description,
        model: `ollama/${modelName}`,
        durationMs: Date.now() - startTime,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async cloudVision(
    modelName: string,
    request: VisionRequest,
    startTime: number
  ): Promise<VisionResult> {
    // Ensure LiteLLM is running
    const started = await ensureLiteLLMRunning();
    if (!started) {
      throw new Error('Failed to start LiteLLM proxy. Cloud AI unavailable.');
    }

    const status = await getLiteLLMStatus();
    if (!status.running) {
      throw new Error('LiteLLM proxy not running');
    }

    const fs = await import('fs');
    const imageBase64 = fs.readFileSync(request.imagePath).toString('base64');
    const mimeType = request.imagePath.endsWith('.png')
      ? 'image/png'
      : 'image/jpeg';

    const prompt =
      request.prompt ||
      'Describe this image in detail. List notable objects, conditions, and features.';

    const timeout = request.timeout || DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(
        `http://localhost:${status.port}/chat/completions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modelName,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: prompt },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:${mimeType};base64,${imageBase64}`,
                    },
                  },
                ],
              },
            ],
            max_tokens: 1000,
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Cloud vision error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const description = data.choices?.[0]?.message?.content || '';

      // Extract tags from description
      const tags = this.extractTagsFromText(description);

      return {
        tags,
        confidence: tags.reduce(
          (acc, tag) => ({ ...acc, [tag]: 0.8 }),
          {} as Record<string, number>
        ),
        description,
        model: `cloud/${data.model || modelName}`,
        durationMs: Date.now() - startTime,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ---------------------------------------------------------------------------
  // EMBEDDINGS
  // ---------------------------------------------------------------------------

  async embed(request: EmbedRequest): Promise<EmbedResult> {
    const startTime = Date.now();
    const [providerType, modelName] = this.parseModelId(request.model);

    try {
      switch (providerType) {
        case 'ollama':
          return await this.ollamaEmbed(modelName, request, startTime);
        case 'cloud':
          return await this.cloudEmbed(modelName, request, startTime);
        default:
          throw new Error(`Embedding not supported for provider: ${providerType}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`AI embed failed (${request.model}): ${errorMsg}`);
    }
  }

  private async ollamaEmbed(
    modelName: string,
    request: EmbedRequest,
    startTime: number
  ): Promise<EmbedResult> {
    const running = await ensureOllamaRunning();
    if (!running) {
      throw new Error('Failed to start Ollama. Is it installed?');
    }

    const texts = Array.isArray(request.text) ? request.text : [request.text];
    const embeddings: number[][] = [];

    for (const text of texts) {
      const response = await fetch(`${OLLAMA_API_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          prompt: text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama embed error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      embeddings.push(data.embedding);
    }

    resetOllamaIdleTimer();

    return {
      embeddings,
      model: `ollama/${modelName}`,
      durationMs: Date.now() - startTime,
    };
  }

  private async cloudEmbed(
    modelName: string,
    request: EmbedRequest,
    startTime: number
  ): Promise<EmbedResult> {
    const started = await ensureLiteLLMRunning();
    if (!started) {
      throw new Error('Failed to start LiteLLM proxy');
    }

    const status = await getLiteLLMStatus();
    const texts = Array.isArray(request.text) ? request.text : [request.text];

    const response = await fetch(
      `http://localhost:${status.port}/embeddings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          input: texts,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cloud embed error ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    return {
      embeddings: data.data.map((d: { embedding: number[] }) => d.embedding),
      model: `cloud/${modelName}`,
      durationMs: Date.now() - startTime,
    };
  }

  // ---------------------------------------------------------------------------
  // MODEL MANAGEMENT
  // ---------------------------------------------------------------------------

  async getAvailableModels(filter?: ModelFilter): Promise<Model[]> {
    // Delegate to ModelRegistry for centralized model catalog
    const registry = getModelRegistry();

    // Ensure discovery has run at least once
    if (registry.getModels().length === 0) {
      await registry.discoverModels();
    }

    return registry.getModels(filter);
  }

  async downloadModel(
    modelId: string,
    onProgress?: DownloadProgressCallback
  ): Promise<void> {
    const [providerType, modelName] = this.parseModelId(modelId);
    const registry = getModelRegistry();

    if (providerType !== 'ollama') {
      throw new Error(`Download only supported for Ollama models, got: ${providerType}`);
    }

    // Use existing Ollama pull functionality
    const running = await ensureOllamaRunning();
    if (!running) {
      throw new Error('Failed to start Ollama');
    }

    // Mark model as downloading in registry
    registry.setDownloading(modelId, 0);

    const response = await fetch(`${OLLAMA_API_URL}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName, stream: true }),
    });

    if (!response.ok) {
      registry.setError(modelId, `Failed to start download: ${response.statusText}`);
      throw new Error(`Failed to start download: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      registry.setError(modelId, 'No response body');
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let totalSize = 0;
    let downloadedSize = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            const data = JSON.parse(line);

            if (data.total) totalSize = data.total;
            if (data.completed) downloadedSize = data.completed;

            const progress = totalSize ? (downloadedSize / totalSize) * 100 : 0;

            // Update registry state
            registry.setDownloading(modelId, progress);

            if (onProgress) {
              onProgress({
                modelId,
                progress,
                status: data.status === 'success' ? 'complete' : 'downloading',
              });
            }

            if (data.status === 'success') {
              // Mark as ready in registry
              registry.setReady(modelId);
              return;
            }
          } catch {
            // Ignore parse errors for incomplete lines
          }
        }
      }

      // If we exit loop without success, mark as ready (download complete)
      registry.setReady(modelId);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      registry.setError(modelId, errorMsg);
      throw error;
    }
  }

  async deleteModel(modelId: string): Promise<void> {
    const [providerType, modelName] = this.parseModelId(modelId);
    const registry = getModelRegistry();

    if (providerType !== 'ollama') {
      throw new Error(`Delete only supported for Ollama models`);
    }

    const running = await ensureOllamaRunning();
    if (!running) {
      throw new Error('Failed to start Ollama');
    }

    const response = await fetch(`${OLLAMA_API_URL}/api/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to delete model: ${errorText}`);
    }

    // Update registry - model goes back to 'available' state
    registry.updateModel(modelId, { state: 'available' });
  }

  async getModel(modelId: string): Promise<Model | undefined> {
    const registry = getModelRegistry();

    // Ensure discovery has run
    if (registry.getModels().length === 0) {
      await registry.discoverModels();
    }

    return registry.getModel(modelId);
  }

  // ---------------------------------------------------------------------------
  // HEALTH CHECK
  // ---------------------------------------------------------------------------

  async checkHealth(): Promise<AIHealthStatus> {
    const providers: ProviderHealth[] = [];
    const now = new Date().toISOString();

    // Check Ollama
    const ollamaStatus = await getOllamaLifecycleStatus();
    providers.push({
      provider: 'ollama',
      available: ollamaStatus.installed,
      status: ollamaStatus.running
        ? 'running'
        : ollamaStatus.installed
        ? 'installed'
        : 'not installed',
      error: ollamaStatus.lastError ?? undefined,
      lastCheck: now,
    });

    // Check LiteLLM
    const litellmStatus = await getLiteLLMStatus();
    providers.push({
      provider: 'cloud',
      available: litellmStatus.installed,
      status: litellmStatus.running
        ? 'running'
        : litellmStatus.installed
        ? 'installed'
        : 'not installed',
      error: litellmStatus.lastError ?? undefined,
      lastCheck: now,
    });

    // Python provider deprecated - visual-buffet handles ML tagging externally
    // Keeping provider entry for API compatibility but always unavailable
    const fs = await import('fs');
    const { join } = await import('path');
    const { app } = await import('electron');
    const resourcesPath = app.isPackaged
      ? process.resourcesPath
      : join(__dirname, '..', '..', '..', '..', '..');

    providers.push({
      provider: 'python',
      available: false,
      status: 'deprecated - use visual-buffet',
      lastCheck: now,
    });

    // Check local ONNX models
    const onnxPath = join(resourcesPath, 'resources', 'models');
    const localAvailable = fs.existsSync(onnxPath);

    providers.push({
      provider: 'local',
      available: localAvailable,
      status: localAvailable ? 'available' : 'not installed',
      lastCheck: now,
    });

    // Calculate overall status
    const availableCount = providers.filter((p) => p.available).length;
    const status: AIHealthStatus['status'] =
      availableCount === 0
        ? 'unavailable'
        : availableCount < providers.length
        ? 'degraded'
        : 'healthy';

    // Get model counts from registry
    const registry = getModelRegistry();
    if (registry.getModels().length === 0) {
      await registry.discoverModels();
    }
    const summary = registry.getSummary();

    return {
      status,
      providers,
      availableModels: summary.total,
      readyModels: summary.byState.ready,
      lastCheck: now,
    };
  }

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  private parseModelId(modelId: string): [string, string] {
    const parts = modelId.split('/');
    if (parts.length < 2) {
      // Assume Ollama if no prefix
      return ['ollama', modelId];
    }
    return [parts[0], parts.slice(1).join('/')];
  }

  private extractTagsFromText(text: string): string[] {
    // Simple tag extraction from descriptive text
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3);

    // Common stop words to exclude
    const stopWords = new Set([
      'this',
      'that',
      'with',
      'from',
      'have',
      'been',
      'were',
      'what',
      'when',
      'where',
      'which',
      'there',
      'their',
      'about',
      'would',
      'could',
      'should',
      'image',
      'shows',
      'appears',
      'seems',
      'looks',
      'very',
      'also',
      'some',
      'more',
      'other',
      'they',
    ]);

    const uniqueTags = [...new Set(words.filter((w) => !stopWords.has(w)))];
    return uniqueTags.slice(0, 20); // Limit to 20 tags
  }
}

// =============================================================================
// SINGLETON EXPORTS
// =============================================================================

/**
 * Get the AI service singleton instance.
 */
export function getAIService(): AIService {
  if (!instance) {
    instance = new AIService();
    console.log('[AIService] Instance created');
  }
  return instance;
}

export default getAIService;
