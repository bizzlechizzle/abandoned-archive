/**
 * AI Service Types
 *
 * Shared types for the unified AI system covering:
 * - AIService (unified abstraction)
 * - ModelRegistry (central catalog)
 * - Provider routing (Ollama, LiteLLM, Python, ONNX)
 *
 * @version 1.0
 * @see docs/plans/adaptive-brewing-cherny.md
 */

// =============================================================================
// MODEL TYPES
// =============================================================================

/** Provider type for AI models */
export type ModelProvider = 'ollama' | 'cloud' | 'python' | 'local';

/** Category of AI model */
export type ModelCategory = 'text' | 'vision' | 'embed' | 'preprocessing';

/** Model state in the registry */
export type ModelState = 'available' | 'downloading' | 'ready' | 'running' | 'error';

/** Model capabilities */
export interface ModelCapabilities {
  /** Can generate text completions */
  completion: boolean;
  /** Can analyze images */
  vision: boolean;
  /** Can generate embeddings */
  embed: boolean;
  /** Supports streaming responses */
  streaming: boolean;
}

/** Model requirements */
export interface ModelRequirements {
  /** Minimum RAM required */
  minRAM?: string;
  /** GPU required */
  gpu?: boolean;
  /** Python venv path (for python models) */
  venv?: string;
  /** ONNX model path (for local models) */
  modelPath?: string;
}

/** Model definition in the registry */
export interface Model {
  /** Unique model ID (e.g., "ollama/llama3.2:8b") */
  id: string;
  /** Human-readable name */
  name: string;
  /** Provider type */
  provider: ModelProvider;
  /** Model category */
  category: ModelCategory;
  /** Model capabilities */
  capabilities: ModelCapabilities;
  /** Current state */
  state: ModelState;
  /** Download progress (0-100) when downloading */
  downloadProgress?: number;
  /** Model size (e.g., "4.7GB") */
  size?: string;
  /** Parameter count (e.g., "8B") */
  parameterCount?: string;
  /** Context window length */
  contextLength?: number;
  /** Model description */
  description?: string;
  /** Model requirements */
  requirements?: ModelRequirements;
  /** Last error message */
  lastError?: string;
}

/** Filter for querying models */
export interface ModelFilter {
  /** Filter by provider(s) */
  provider?: ModelProvider[];
  /** Filter by category(s) */
  category?: ModelCategory[];
  /** Filter by state(s) */
  state?: ModelState[];
  /** Filter by capability */
  capabilities?: (keyof ModelCapabilities)[];
}

// =============================================================================
// COMPLETION TYPES
// =============================================================================

/** Message role in a conversation */
export type MessageRole = 'system' | 'user' | 'assistant';

/** Message in a conversation */
export interface Message {
  role: MessageRole;
  content: string;
}

/** Request for text completion */
export interface CompletionRequest {
  /** Model ID (e.g., "ollama/llama3.2:8b", "cloud/claude-3-opus") */
  model: string;
  /** Conversation messages */
  messages: Message[];
  /** Temperature (0-2, default 0.7) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Stop sequences */
  stop?: string[];
  /** Timeout in milliseconds */
  timeout?: number;
}

/** Token usage statistics */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Result from text completion */
export interface CompletionResult {
  /** Generated text */
  content: string;
  /** Model used (may differ from request due to routing) */
  model: string;
  /** Token usage */
  usage?: TokenUsage;
  /** Finish reason */
  finishReason?: 'stop' | 'length' | 'error';
  /** Duration in milliseconds */
  durationMs: number;
}

// =============================================================================
// VISION TYPES
// =============================================================================

/** Request for image analysis */
export interface VisionRequest {
  /** Model ID (e.g., "python/florence-2-large", "ollama/llava:13b") */
  model: string;
  /** Image file path */
  imagePath: string;
  /** Optional prompt for the model */
  prompt?: string;
  /** Context from previous analysis (e.g., view type, location type) */
  context?: {
    viewType?: string;
    locationType?: string;
    locationName?: string;
    state?: string;
    existingTags?: string[];
  };
  /** Maximum tags to return */
  maxTags?: number;
  /** Timeout in milliseconds */
  timeout?: number;
}

/** Result from image analysis */
export interface VisionResult {
  /** Generated tags */
  tags: string[];
  /** Tag confidence scores */
  confidence: Record<string, number>;
  /** Generated caption (if model supports it) */
  caption?: string;
  /** Detailed description (from VLM models) */
  description?: string;
  /** Quality score (0-1) */
  qualityScore?: number;
  /** Detected view type */
  viewType?: string;
  /** Model used */
  model: string;
  /** Duration in milliseconds */
  durationMs: number;
}

// =============================================================================
// EMBEDDING TYPES
// =============================================================================

/** Request for text embedding */
export interface EmbedRequest {
  /** Model ID (e.g., "ollama/nomic-embed-text", "local/siglip") */
  model: string;
  /** Text to embed */
  text: string | string[];
  /** Timeout in milliseconds */
  timeout?: number;
}

/** Result from embedding */
export interface EmbedResult {
  /** Embedding vectors */
  embeddings: number[][];
  /** Model used */
  model: string;
  /** Duration in milliseconds */
  durationMs: number;
}

// =============================================================================
// HEALTH TYPES
// =============================================================================

/** Provider health status */
export interface ProviderHealth {
  /** Provider name */
  provider: ModelProvider;
  /** Is provider available */
  available: boolean;
  /** Provider-specific status */
  status: string;
  /** Error message if unavailable */
  error?: string;
  /** Last check timestamp */
  lastCheck: string;
}

/** Overall AI system health */
export interface AIHealthStatus {
  /** Overall status */
  status: 'healthy' | 'degraded' | 'unavailable';
  /** Per-provider health */
  providers: ProviderHealth[];
  /** Available models count */
  availableModels: number;
  /** Ready models count */
  readyModels: number;
  /** Last health check */
  lastCheck: string;
}

// =============================================================================
// DOWNLOAD TYPES
// =============================================================================

/** Download progress callback */
export type DownloadProgressCallback = (progress: DownloadProgress) => void;

/** Download progress event */
export interface DownloadProgress {
  /** Model being downloaded */
  modelId: string;
  /** Progress percentage (0-100) */
  progress: number;
  /** Download speed in bytes/second */
  speed?: number;
  /** Estimated time remaining in seconds */
  eta?: number;
  /** Current status */
  status: 'starting' | 'downloading' | 'extracting' | 'complete' | 'error';
  /** Error message if failed */
  error?: string;
}

// =============================================================================
// SERVICE INTERFACES
// =============================================================================

/** AI Service interface - unified abstraction */
export interface IAIService {
  /** Text completion */
  complete(request: CompletionRequest): Promise<CompletionResult>;
  /** Image analysis */
  analyzeImage(request: VisionRequest): Promise<VisionResult>;
  /** Text embedding */
  embed(request: EmbedRequest): Promise<EmbedResult>;
  /** Get available models */
  getAvailableModels(filter?: ModelFilter): Promise<Model[]>;
  /** Download a model */
  downloadModel(modelId: string, onProgress?: DownloadProgressCallback): Promise<void>;
  /** Delete a model */
  deleteModel(modelId: string): Promise<void>;
  /** Get model by ID */
  getModel(modelId: string): Promise<Model | undefined>;
  /** Check AI system health */
  checkHealth(): Promise<AIHealthStatus>;
}

/** Model Registry interface */
export interface IModelRegistry {
  /** Discover all available models */
  discoverModels(): Promise<void>;
  /** Get models with optional filter */
  getModels(filter?: ModelFilter): Model[];
  /** Get model by ID */
  getModel(id: string): Model | undefined;
  /** Check if model is downloaded */
  isDownloaded(id: string): boolean;
  /** Check if model is running */
  isRunning(id: string): boolean;
  /** Register model state change callback */
  onModelStateChange(callback: (model: Model) => void): () => void;
}

// =============================================================================
// DATABASE TYPES (for ai_models table)
// =============================================================================

/** Database row for ai_models table */
export interface AIModelRow {
  model_id: string;
  name: string;
  provider: string;
  category: string;
  state: string;
  download_progress: number | null;
  size_bytes: number | null;
  last_used_at: string | null;
  config_json: string | null;
  created_at: string;
  updated_at: string;
}
