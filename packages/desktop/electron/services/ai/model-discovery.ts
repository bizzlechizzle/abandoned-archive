/**
 * Model Discovery - Provider-Specific Discovery Logic
 *
 * Discovers installed/available models for each provider:
 * - Ollama: Query API for installed models
 * - Cloud: Check LiteLLM configuration
 * - Python: Check venv existence and model files
 * - Local: Check ONNX model files
 *
 * @version 1.0
 * @see docs/plans/adaptive-brewing-cherny.md
 */

import type { Model, ModelCapabilities } from './types';
import { existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { app } from 'electron';

// ESM-compatible __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// =============================================================================
// CONSTANTS
// =============================================================================

const OLLAMA_API_URL = 'http://127.0.0.1:11434';

// =============================================================================
// OLLAMA DISCOVERY
// =============================================================================

interface OllamaModelInfo {
  name: string;
  size: number;
  modified_at: string;
  digest: string;
  details?: {
    parameter_size?: string;
    quantization_level?: string;
    family?: string;
  };
}

/**
 * Discover installed Ollama models via API.
 * Returns models with state 'ready'.
 */
export async function discoverOllamaModels(): Promise<Model[]> {
  const models: Model[] = [];

  try {
    // Check if Ollama is running by hitting the API
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${OLLAMA_API_URL}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.log('[ModelDiscovery] Ollama not responding');
      return models;
    }

    const data = await response.json();
    const installedModels: OllamaModelInfo[] = data.models || [];

    for (const m of installedModels) {
      const isVision = detectOllamaVisionModel(m.name);
      const isEmbed = m.name.includes('embed');

      models.push({
        id: `ollama/${m.name}`,
        name: m.name,
        provider: 'ollama',
        category: isEmbed ? 'embed' : isVision ? 'vision' : 'text',
        capabilities: {
          completion: !isEmbed,
          vision: isVision,
          embed: isEmbed,
          streaming: true,
        },
        state: 'ready',
        size: formatBytes(m.size),
        parameterCount: m.details?.parameter_size,
        description: buildOllamaDescription(m),
      });
    }

    console.log(`[ModelDiscovery] Found ${models.length} Ollama models`);
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      console.log('[ModelDiscovery] Ollama API timeout - not running');
    } else {
      console.log('[ModelDiscovery] Ollama discovery error:', (err as Error).message);
    }
  }

  return models;
}

/**
 * Detect if an Ollama model has vision capabilities.
 */
function detectOllamaVisionModel(name: string): boolean {
  const visionPatterns = [
    'llava',
    'bakllava',
    'vision',
    'llama3.2-vision',
    'moondream',
    'cogvlm',
    'yi-vl',
  ];
  const lowerName = name.toLowerCase();
  return visionPatterns.some((p) => lowerName.includes(p));
}

/**
 * Build description from Ollama model info.
 */
function buildOllamaDescription(m: OllamaModelInfo): string {
  const parts: string[] = [];
  if (m.details?.parameter_size) {
    parts.push(`${m.details.parameter_size} parameters`);
  }
  if (m.details?.quantization_level) {
    parts.push(`${m.details.quantization_level} quantization`);
  }
  return parts.length > 0 ? parts.join(', ') : 'Installed Ollama model';
}

// =============================================================================
// CLOUD DISCOVERY
// =============================================================================

/**
 * Discover configured cloud models via LiteLLM.
 * Returns models with state 'ready' if API keys are configured.
 */
export async function discoverCloudModels(): Promise<Model[]> {
  const models: Model[] = [];

  try {
    // Import LiteLLM status checker
    const { getLiteLLMStatus } = await import('../litellm-lifecycle-service');
    const status = await getLiteLLMStatus();

    if (!status.installed) {
      console.log('[ModelDiscovery] LiteLLM not installed');
      return models;
    }

    // Check which providers are configured via credentials
    const { hasCredential } = await import('../credential-service');

    // Check for API keys (these are async)
    const hasAnthropic = await hasCredential('anthropic');
    const hasOpenAI = await hasCredential('openai');
    const hasGoogle = await hasCredential('google');

    // Mark cloud models as ready if their provider is configured
    const providerModels: { id: string; provider: string }[] = [
      // Anthropic
      { id: 'cloud/claude-3-opus-20240229', provider: 'anthropic' },
      { id: 'cloud/claude-3-5-sonnet-20241022', provider: 'anthropic' },
      { id: 'cloud/claude-3-5-haiku-20241022', provider: 'anthropic' },
      // OpenAI
      { id: 'cloud/gpt-4o', provider: 'openai' },
      { id: 'cloud/gpt-4o-mini', provider: 'openai' },
      { id: 'cloud/gpt-4-turbo', provider: 'openai' },
      { id: 'cloud/text-embedding-3-large', provider: 'openai' },
      { id: 'cloud/text-embedding-3-small', provider: 'openai' },
      // Google
      { id: 'cloud/gemini-1.5-pro', provider: 'google' },
      { id: 'cloud/gemini-1.5-flash', provider: 'google' },
    ];

    for (const pm of providerModels) {
      let isReady = false;
      if (pm.provider === 'anthropic' && hasAnthropic) isReady = true;
      if (pm.provider === 'openai' && hasOpenAI) isReady = true;
      if (pm.provider === 'google' && hasGoogle) isReady = true;

      if (isReady) {
        const isEmbed = pm.id.includes('embedding');
        models.push({
          id: pm.id,
          name: pm.id.replace('cloud/', ''),
          provider: 'cloud',
          category: isEmbed ? 'embed' : 'vision',
          capabilities: {
            completion: !isEmbed,
            vision: !isEmbed,
            embed: isEmbed,
            streaming: true,
          },
          state: 'ready',
          description: `${pm.provider} API key configured`,
        });
      }
    }

    console.log(`[ModelDiscovery] Found ${models.length} configured cloud models`);
  } catch (err) {
    console.log('[ModelDiscovery] Cloud discovery error:', (err as Error).message);
  }

  return models;
}

// =============================================================================
// PYTHON DISCOVERY
// =============================================================================

interface PythonModelConfig {
  id: string;
  name: string;
  category: 'vision' | 'tagging' | 'preprocessing';
  venvPath: string;
  modelFile?: string; // Optional model weights file to check
  scriptFile: string; // Python script that runs this model
}

const PYTHON_MODELS: PythonModelConfig[] = [
  {
    id: 'python/florence-2-large',
    name: 'Florence-2 Large',
    category: 'vision',
    venvPath: 'scripts/ram-server/venv',
    scriptFile: 'scripts/florence_tagger.py',
  },
  {
    id: 'python/ram++',
    name: 'RAM++',
    category: 'tagging',
    venvPath: 'scripts/ram-server/venv',
    modelFile: 'scripts/ram-server/ram_plus_swin_large_14m.pth',
    scriptFile: 'scripts/ram_tagger.py',
  },
  {
    id: 'python/qwen2-vl-7b',
    name: 'Qwen2-VL 7B',
    category: 'vision',
    venvPath: 'scripts/vlm-server/venv',
    scriptFile: 'scripts/vlm_enhancer.py',
  },
  {
    id: 'python/spacy-en_core_web_sm',
    name: 'spaCy English',
    category: 'preprocessing',
    venvPath: 'scripts/spacy-server/venv',
    scriptFile: 'scripts/spacy-server/main.py',
  },
];

/**
 * Discover installed Python models by checking venv and model files.
 */
export async function discoverPythonModels(): Promise<Model[]> {
  const models: Model[] = [];

  const resourcesPath = app.isPackaged
    ? process.resourcesPath
    : join(__dirname, '..', '..', '..', '..', '..');

  for (const pm of PYTHON_MODELS) {
    const venvPath = join(resourcesPath, pm.venvPath);
    const scriptPath = join(resourcesPath, pm.scriptFile);

    // Check if venv exists
    const venvExists = existsSync(join(venvPath, 'bin', 'python'));
    const scriptExists = existsSync(scriptPath);

    // Check if model weights exist (if specified)
    let modelExists = true;
    if (pm.modelFile) {
      const modelPath = join(resourcesPath, pm.modelFile);
      modelExists = existsSync(modelPath);
    }

    const isReady = venvExists && scriptExists && modelExists;

    models.push({
      id: pm.id,
      name: pm.name,
      provider: 'python',
      category: pm.category,
      capabilities: {
        completion: false,
        vision: pm.category === 'vision' || pm.category === 'tagging',
        embed: false,
        streaming: false,
      },
      state: isReady ? 'ready' : 'available',
      requirements: { venv: pm.venvPath },
      lastError: !venvExists
        ? 'Python venv not found'
        : !scriptExists
        ? 'Script not found'
        : !modelExists
        ? 'Model weights not downloaded'
        : undefined,
    });
  }

  const readyCount = models.filter((m) => m.state === 'ready').length;
  console.log(`[ModelDiscovery] Found ${readyCount}/${models.length} Python models ready`);

  return models;
}

// =============================================================================
// LOCAL ONNX DISCOVERY
// =============================================================================

interface LocalModelConfig {
  id: string;
  name: string;
  modelPath: string;
  category: 'vision' | 'embed';
  hasVision: boolean;
  hasEmbed: boolean;
}

const LOCAL_MODELS: LocalModelConfig[] = [
  {
    id: 'local/siglip-base-patch16-224',
    name: 'SigLIP Base',
    modelPath: 'resources/models/siglip-base-patch16-224.onnx',
    category: 'vision',
    hasVision: true,
    hasEmbed: true,
  },
];

/**
 * Discover local ONNX models by checking model files.
 */
export async function discoverLocalModels(): Promise<Model[]> {
  const models: Model[] = [];

  const resourcesPath = app.isPackaged
    ? process.resourcesPath
    : join(__dirname, '..', '..', '..', '..', '..');

  for (const lm of LOCAL_MODELS) {
    const modelPath = join(resourcesPath, lm.modelPath);
    const modelExists = existsSync(modelPath);

    // Get file size if exists
    let size: string | undefined;
    if (modelExists) {
      try {
        const stats = statSync(modelPath);
        size = formatBytes(stats.size);
      } catch {
        // Ignore stat errors
      }
    }

    models.push({
      id: lm.id,
      name: lm.name,
      provider: 'local',
      category: lm.category,
      capabilities: {
        completion: false,
        vision: lm.hasVision,
        embed: lm.hasEmbed,
        streaming: false,
      },
      state: modelExists ? 'ready' : 'available',
      size,
      requirements: { modelPath: lm.modelPath },
      lastError: !modelExists ? 'ONNX model file not found' : undefined,
    });
  }

  const readyCount = models.filter((m) => m.state === 'ready').length;
  console.log(`[ModelDiscovery] Found ${readyCount}/${models.length} local models ready`);

  return models;
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Format bytes to human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
