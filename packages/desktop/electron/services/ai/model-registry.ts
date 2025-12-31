/**
 * Model Registry - Central Model Catalog
 *
 * Tracks all available models across providers with state management
 * and discovery capabilities.
 *
 * Features:
 * - Curated catalog of recommended models
 * - Runtime discovery of installed models
 * - State tracking (available, downloading, ready, running, error)
 * - Event emission for state changes
 *
 * @version 1.0
 * @see docs/plans/adaptive-brewing-cherny.md
 */

import type {
  Model,
  ModelFilter,
  ModelProvider,
  ModelCategory,
  ModelState,
  ModelCapabilities,
  IModelRegistry,
} from './types';
import { discoverOllamaModels } from './model-discovery';
import { discoverCloudModels } from './model-discovery';
import { discoverPythonModels } from './model-discovery';
import { discoverLocalModels } from './model-discovery';

// =============================================================================
// SINGLETON STATE
// =============================================================================

let instance: ModelRegistry | null = null;

// =============================================================================
// CURATED MODEL CATALOG
// =============================================================================

/**
 * Curated catalog of recommended Ollama models.
 * These are always shown as "available" for download.
 */
const OLLAMA_CATALOG: Omit<Model, 'state'>[] = [
  // Text models
  {
    id: 'ollama/llama3.2:8b',
    name: 'Llama 3.2 8B',
    provider: 'ollama',
    category: 'text',
    capabilities: { completion: true, vision: false, embed: false, streaming: true },
    size: '4.7GB',
    parameterCount: '8B',
    contextLength: 128000,
    description: 'Meta\'s latest open model. Fast and capable for general tasks.',
  },
  {
    id: 'ollama/llama3.2:3b',
    name: 'Llama 3.2 3B',
    provider: 'ollama',
    category: 'text',
    capabilities: { completion: true, vision: false, embed: false, streaming: true },
    size: '2.0GB',
    parameterCount: '3B',
    contextLength: 128000,
    description: 'Smaller Llama for quick responses on limited hardware.',
  },
  {
    id: 'ollama/qwen2.5:7b',
    name: 'Qwen 2.5 7B',
    provider: 'ollama',
    category: 'text',
    capabilities: { completion: true, vision: false, embed: false, streaming: true },
    size: '4.4GB',
    parameterCount: '7B',
    contextLength: 32768,
    description: 'Alibaba\'s latest. Excellent for coding and structured output.',
  },
  {
    id: 'ollama/mistral:7b',
    name: 'Mistral 7B',
    provider: 'ollama',
    category: 'text',
    capabilities: { completion: true, vision: false, embed: false, streaming: true },
    size: '4.1GB',
    parameterCount: '7B',
    contextLength: 32768,
    description: 'Fast European model. Great balance of speed and quality.',
  },
  {
    id: 'ollama/gemma2:9b',
    name: 'Gemma 2 9B',
    provider: 'ollama',
    category: 'text',
    capabilities: { completion: true, vision: false, embed: false, streaming: true },
    size: '5.4GB',
    parameterCount: '9B',
    contextLength: 8192,
    description: 'Google\'s open model. Strong reasoning and instruction following.',
  },
  {
    id: 'ollama/phi3:medium',
    name: 'Phi-3 Medium',
    provider: 'ollama',
    category: 'text',
    capabilities: { completion: true, vision: false, embed: false, streaming: true },
    size: '7.9GB',
    parameterCount: '14B',
    contextLength: 128000,
    description: 'Microsoft\'s efficient model. Great for structured tasks.',
  },

  // Vision models
  {
    id: 'ollama/llava:7b',
    name: 'LLaVA 7B',
    provider: 'ollama',
    category: 'vision',
    capabilities: { completion: true, vision: true, embed: false, streaming: true },
    size: '4.7GB',
    parameterCount: '7B',
    description: 'Open vision model. Good for basic image understanding.',
  },
  {
    id: 'ollama/llava:13b',
    name: 'LLaVA 13B',
    provider: 'ollama',
    category: 'vision',
    capabilities: { completion: true, vision: true, embed: false, streaming: true },
    size: '8.0GB',
    parameterCount: '13B',
    description: 'Larger LLaVA with better image analysis.',
  },
  {
    id: 'ollama/llama3.2-vision:11b',
    name: 'Llama 3.2 Vision 11B',
    provider: 'ollama',
    category: 'vision',
    capabilities: { completion: true, vision: true, embed: false, streaming: true },
    size: '8.0GB',
    parameterCount: '11B',
    description: 'Meta\'s latest multimodal model. Strong vision understanding.',
  },
  {
    id: 'ollama/bakllava:7b',
    name: 'BakLLaVA 7B',
    provider: 'ollama',
    category: 'vision',
    capabilities: { completion: true, vision: true, embed: false, streaming: true },
    size: '4.7GB',
    parameterCount: '7B',
    description: 'Improved LLaVA variant with better visual grounding.',
  },

  // Embedding models
  {
    id: 'ollama/nomic-embed-text',
    name: 'Nomic Embed Text',
    provider: 'ollama',
    category: 'embed',
    capabilities: { completion: false, vision: false, embed: true, streaming: false },
    size: '274MB',
    description: 'Efficient text embeddings for search and similarity.',
  },
  {
    id: 'ollama/mxbai-embed-large',
    name: 'MixedBread Embed Large',
    provider: 'ollama',
    category: 'embed',
    capabilities: { completion: false, vision: false, embed: true, streaming: false },
    size: '670MB',
    description: 'High-quality embeddings for semantic search.',
  },
];

/**
 * Cloud models available via LiteLLM proxy.
 */
const CLOUD_CATALOG: Omit<Model, 'state'>[] = [
  // Anthropic
  {
    id: 'cloud/claude-3-opus-20240229',
    name: 'Claude 3 Opus',
    provider: 'cloud',
    category: 'vision',
    capabilities: { completion: true, vision: true, embed: false, streaming: true },
    description: 'Anthropic\'s most capable model. Best for complex analysis.',
    contextLength: 200000,
  },
  {
    id: 'cloud/claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    provider: 'cloud',
    category: 'vision',
    capabilities: { completion: true, vision: true, embed: false, streaming: true },
    description: 'Fast and capable. Best balance of speed and quality.',
    contextLength: 200000,
  },
  {
    id: 'cloud/claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    provider: 'cloud',
    category: 'vision',
    capabilities: { completion: true, vision: true, embed: false, streaming: true },
    description: 'Fastest Claude model. Good for quick tasks.',
    contextLength: 200000,
  },

  // OpenAI
  {
    id: 'cloud/gpt-4o',
    name: 'GPT-4o',
    provider: 'cloud',
    category: 'vision',
    capabilities: { completion: true, vision: true, embed: false, streaming: true },
    description: 'OpenAI\'s flagship multimodal model.',
    contextLength: 128000,
  },
  {
    id: 'cloud/gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'cloud',
    category: 'vision',
    capabilities: { completion: true, vision: true, embed: false, streaming: true },
    description: 'Smaller, faster GPT-4o for quick tasks.',
    contextLength: 128000,
  },
  {
    id: 'cloud/gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'cloud',
    category: 'vision',
    capabilities: { completion: true, vision: true, embed: false, streaming: true },
    description: 'Previous flagship with vision support.',
    contextLength: 128000,
  },

  // Google
  {
    id: 'cloud/gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    provider: 'cloud',
    category: 'vision',
    capabilities: { completion: true, vision: true, embed: false, streaming: true },
    description: 'Google\'s advanced multimodal model.',
    contextLength: 1000000,
  },
  {
    id: 'cloud/gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    provider: 'cloud',
    category: 'vision',
    capabilities: { completion: true, vision: true, embed: false, streaming: true },
    description: 'Fast Gemini for quick multimodal tasks.',
    contextLength: 1000000,
  },

  // Embedding models
  {
    id: 'cloud/text-embedding-3-large',
    name: 'OpenAI Embedding Large',
    provider: 'cloud',
    category: 'embed',
    capabilities: { completion: false, vision: false, embed: true, streaming: false },
    description: 'OpenAI\'s latest embedding model.',
  },
  {
    id: 'cloud/text-embedding-3-small',
    name: 'OpenAI Embedding Small',
    provider: 'cloud',
    category: 'embed',
    capabilities: { completion: false, vision: false, embed: true, streaming: false },
    description: 'Smaller, cheaper OpenAI embeddings.',
  },
];

/**
 * Python models that run via subprocess.
 */
const PYTHON_CATALOG: Omit<Model, 'state'>[] = [
  {
    id: 'python/qwen2-vl-7b',
    name: 'Qwen2-VL 7B',
    provider: 'python',
    category: 'vision',
    capabilities: { completion: true, vision: true, embed: false, streaming: false },
    size: '7GB',
    parameterCount: '7B',
    description: 'Large VLM for deep image analysis. High RAM/GPU required.',
    requirements: { venv: 'scripts/vlm-server/venv', minRAM: '16GB', gpu: true },
  },
  {
    id: 'python/spacy-en_core_web_sm',
    name: 'spaCy English (Small)',
    provider: 'python',
    category: 'preprocessing',
    capabilities: { completion: false, vision: false, embed: false, streaming: false },
    size: '50MB',
    description: 'NLP preprocessing for text extraction.',
    requirements: { venv: 'scripts/spacy-server/venv' },
  },
];

/**
 * Local ONNX models that run natively.
 */
const LOCAL_CATALOG: Omit<Model, 'state'>[] = [
  {
    id: 'local/siglip-base-patch16-224',
    name: 'SigLIP Base',
    provider: 'local',
    category: 'vision',
    capabilities: { completion: false, vision: true, embed: true, streaming: false },
    size: '354MB',
    description: 'Scene classification via ONNX. Fast view type detection.',
    requirements: { modelPath: 'resources/models/siglip-base-patch16-224.onnx' },
  },
];

// =============================================================================
// MODEL REGISTRY IMPLEMENTATION
// =============================================================================

type ModelStateChangeCallback = (model: Model) => void;

class ModelRegistry implements IModelRegistry {
  private models: Map<string, Model> = new Map();
  private stateChangeCallbacks: Set<ModelStateChangeCallback> = new Set();
  private discoveryPromise: Promise<void> | null = null;
  private lastDiscovery: Date | null = null;

  // ---------------------------------------------------------------------------
  // DISCOVERY
  // ---------------------------------------------------------------------------

  /**
   * Discover all available models across all providers.
   * Merges discovered models with curated catalog.
   */
  async discoverModels(): Promise<void> {
    // Deduplicate concurrent discovery calls
    if (this.discoveryPromise) {
      return this.discoveryPromise;
    }

    this.discoveryPromise = this.performDiscovery();

    try {
      await this.discoveryPromise;
    } finally {
      this.discoveryPromise = null;
    }
  }

  private async performDiscovery(): Promise<void> {
    console.log('[ModelRegistry] Starting model discovery...');
    const startTime = Date.now();

    // Start with curated catalogs (all marked as 'available')
    this.initializeCatalogs();

    // Run provider-specific discovery in parallel
    const [ollamaInstalled, cloudConfigured, pythonVenvs, localModels] =
      await Promise.all([
        discoverOllamaModels().catch((err) => {
          console.warn('[ModelRegistry] Ollama discovery failed:', err.message);
          return [] as Model[];
        }),
        discoverCloudModels().catch((err) => {
          console.warn('[ModelRegistry] Cloud discovery failed:', err.message);
          return [] as Model[];
        }),
        discoverPythonModels().catch((err) => {
          console.warn('[ModelRegistry] Python discovery failed:', err.message);
          return [] as Model[];
        }),
        discoverLocalModels().catch((err) => {
          console.warn('[ModelRegistry] Local discovery failed:', err.message);
          return [] as Model[];
        }),
      ]);

    // Merge discovered models - update state of catalog models
    for (const discovered of [
      ...ollamaInstalled,
      ...cloudConfigured,
      ...pythonVenvs,
      ...localModels,
    ]) {
      const existing = this.models.get(discovered.id);
      if (existing) {
        // Update state of catalog model
        this.updateModel(discovered.id, {
          state: discovered.state,
          size: discovered.size || existing.size,
          downloadProgress: discovered.downloadProgress,
          lastError: discovered.lastError,
        });
      } else {
        // Add newly discovered model not in catalog
        this.models.set(discovered.id, discovered);
      }
    }

    this.lastDiscovery = new Date();
    const duration = Date.now() - startTime;
    const readyCount = this.getModels({ state: ['ready'] }).length;
    console.log(
      `[ModelRegistry] Discovery complete: ${this.models.size} models, ${readyCount} ready (${duration}ms)`
    );
  }

  private initializeCatalogs(): void {
    // Initialize with all catalog models as 'available'
    for (const model of OLLAMA_CATALOG) {
      this.models.set(model.id, { ...model, state: 'available' });
    }
    for (const model of CLOUD_CATALOG) {
      this.models.set(model.id, { ...model, state: 'available' });
    }
    for (const model of PYTHON_CATALOG) {
      this.models.set(model.id, { ...model, state: 'available' });
    }
    for (const model of LOCAL_CATALOG) {
      this.models.set(model.id, { ...model, state: 'available' });
    }
  }

  // ---------------------------------------------------------------------------
  // QUERIES
  // ---------------------------------------------------------------------------

  /**
   * Get models matching optional filter criteria.
   */
  getModels(filter?: ModelFilter): Model[] {
    const models = Array.from(this.models.values());

    if (!filter) return models;

    return models.filter((m) => {
      if (filter.provider && !filter.provider.includes(m.provider)) return false;
      if (filter.category && !filter.category.includes(m.category)) return false;
      if (filter.state && !filter.state.includes(m.state)) return false;
      if (filter.capabilities) {
        for (const cap of filter.capabilities) {
          if (!m.capabilities[cap]) return false;
        }
      }
      return true;
    });
  }

  /**
   * Get single model by ID.
   */
  getModel(id: string): Model | undefined {
    return this.models.get(id);
  }

  /**
   * Check if model is downloaded (ready or running).
   */
  isDownloaded(id: string): boolean {
    const model = this.models.get(id);
    return model?.state === 'ready' || model?.state === 'running';
  }

  /**
   * Check if model is currently running.
   */
  isRunning(id: string): boolean {
    const model = this.models.get(id);
    return model?.state === 'running';
  }

  // ---------------------------------------------------------------------------
  // STATE MANAGEMENT
  // ---------------------------------------------------------------------------

  /**
   * Update model state and notify listeners.
   */
  updateModel(
    id: string,
    updates: Partial<Pick<Model, 'state' | 'downloadProgress' | 'lastError' | 'size'>>
  ): void {
    const model = this.models.get(id);
    if (!model) {
      console.warn(`[ModelRegistry] Cannot update unknown model: ${id}`);
      return;
    }

    const updated: Model = { ...model, ...updates };
    this.models.set(id, updated);

    // Notify listeners
    for (const callback of this.stateChangeCallbacks) {
      try {
        callback(updated);
      } catch (err) {
        console.error('[ModelRegistry] State change callback error:', err);
      }
    }
  }

  /**
   * Set model to downloading state with progress.
   */
  setDownloading(id: string, progress: number): void {
    this.updateModel(id, { state: 'downloading', downloadProgress: progress });
  }

  /**
   * Set model to ready state.
   */
  setReady(id: string): void {
    this.updateModel(id, { state: 'ready', downloadProgress: undefined });
  }

  /**
   * Set model to error state.
   */
  setError(id: string, error: string): void {
    this.updateModel(id, { state: 'error', lastError: error });
  }

  // ---------------------------------------------------------------------------
  // EVENT SUBSCRIPTION
  // ---------------------------------------------------------------------------

  /**
   * Register callback for model state changes.
   * Returns unsubscribe function.
   */
  onModelStateChange(callback: ModelStateChangeCallback): () => void {
    this.stateChangeCallbacks.add(callback);
    return () => {
      this.stateChangeCallbacks.delete(callback);
    };
  }

  // ---------------------------------------------------------------------------
  // UTILITIES
  // ---------------------------------------------------------------------------

  /**
   * Get summary statistics.
   */
  getSummary(): {
    total: number;
    byProvider: Record<ModelProvider, number>;
    byState: Record<ModelState, number>;
    byCategory: Record<ModelCategory, number>;
  } {
    const models = Array.from(this.models.values());

    const byProvider = { ollama: 0, cloud: 0, python: 0, local: 0 };
    const byState = {
      available: 0,
      downloading: 0,
      ready: 0,
      running: 0,
      error: 0,
    };
    const byCategory = {
      text: 0,
      vision: 0,
      embed: 0,
      preprocessing: 0,
    };

    for (const m of models) {
      byProvider[m.provider]++;
      byState[m.state]++;
      byCategory[m.category]++;
    }

    return {
      total: models.length,
      byProvider,
      byState,
      byCategory,
    };
  }

  /**
   * Get time since last discovery.
   */
  getLastDiscoveryTime(): Date | null {
    return this.lastDiscovery;
  }

  /**
   * Force re-discovery (ignores cache).
   */
  async refresh(): Promise<void> {
    this.models.clear();
    await this.discoverModels();
  }
}

// =============================================================================
// SINGLETON EXPORTS
// =============================================================================

/**
 * Get the ModelRegistry singleton instance.
 */
export function getModelRegistry(): ModelRegistry {
  if (!instance) {
    instance = new ModelRegistry();
    console.log('[ModelRegistry] Instance created');
  }
  return instance;
}

/**
 * Initialize the registry and run discovery.
 * Call this at app startup.
 */
export async function initializeModelRegistry(): Promise<void> {
  const registry = getModelRegistry();
  await registry.discoverModels();
}

export default getModelRegistry;
