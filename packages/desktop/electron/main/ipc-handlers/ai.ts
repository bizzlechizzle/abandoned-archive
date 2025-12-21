/**
 * AI IPC Handlers
 *
 * Handles AI operations from the renderer process.
 * Unified interface for text completion, image analysis, embeddings,
 * and model management across all providers.
 *
 * @version 1.0
 * @see docs/plans/adaptive-brewing-cherny.md
 */

import { ipcMain, BrowserWindow } from 'electron';
import { z } from 'zod';
import { getAIService } from '../../services/ai/ai-service';
import { getModelRegistry, initializeModelRegistry } from '../../services/ai/model-registry';
import type {
  CompletionRequest,
  VisionRequest,
  EmbedRequest,
  ModelFilter,
} from '../../services/ai/types';

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const MessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
});

const CompletionRequestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(MessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
  stop: z.array(z.string()).optional(),
  timeout: z.number().positive().optional(),
});

const VisionRequestSchema = z.object({
  model: z.string().min(1),
  imagePath: z.string().min(1),
  prompt: z.string().optional(),
  context: z
    .object({
      viewType: z.string().optional(),
      locationType: z.string().optional(),
      state: z.string().optional(),
      existingTags: z.array(z.string()).optional(),
    })
    .optional(),
  maxTags: z.number().positive().optional(),
  timeout: z.number().positive().optional(),
});

const EmbedRequestSchema = z.object({
  model: z.string().min(1),
  text: z.union([z.string(), z.array(z.string())]),
  timeout: z.number().positive().optional(),
});

const ModelFilterSchema = z
  .object({
    provider: z.array(z.enum(['ollama', 'cloud', 'python', 'local'])).optional(),
    category: z
      .array(z.enum(['text', 'vision', 'embed', 'preprocessing', 'tagging']))
      .optional(),
    state: z
      .array(z.enum(['available', 'downloading', 'ready', 'running', 'error']))
      .optional(),
    capabilities: z
      .array(z.enum(['completion', 'vision', 'embed', 'streaming']))
      .optional(),
  })
  .optional();

// =============================================================================
// HANDLER REGISTRATION
// =============================================================================

/**
 * Register all AI-related IPC handlers.
 */
export function registerAIHandlers(): void {
  const aiService = getAIService();

  // ---------------------------------------------------------------------------
  // ai:complete - Text completion
  // ---------------------------------------------------------------------------
  ipcMain.handle('ai:complete', async (_, request: unknown) => {
    try {
      const validated = CompletionRequestSchema.parse(request);
      const result = await aiService.complete(validated as CompletionRequest);
      return { success: true, result };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: `Invalid request: ${error.errors.map((e) => e.message).join(', ')}`,
        };
      }
      console.error('[AI IPC] Complete error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // ---------------------------------------------------------------------------
  // ai:analyzeImage - Image analysis
  // ---------------------------------------------------------------------------
  ipcMain.handle('ai:analyzeImage', async (_, request: unknown) => {
    try {
      const validated = VisionRequestSchema.parse(request);
      const result = await aiService.analyzeImage(validated as VisionRequest);
      return { success: true, result };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: `Invalid request: ${error.errors.map((e) => e.message).join(', ')}`,
        };
      }
      console.error('[AI IPC] AnalyzeImage error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // ---------------------------------------------------------------------------
  // ai:embed - Text embeddings
  // ---------------------------------------------------------------------------
  ipcMain.handle('ai:embed', async (_, request: unknown) => {
    try {
      const validated = EmbedRequestSchema.parse(request);
      const result = await aiService.embed(validated as EmbedRequest);
      return { success: true, result };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: `Invalid request: ${error.errors.map((e) => e.message).join(', ')}`,
        };
      }
      console.error('[AI IPC] Embed error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // ---------------------------------------------------------------------------
  // ai:models:list - List available models
  // ---------------------------------------------------------------------------
  ipcMain.handle('ai:models:list', async (_, filter: unknown) => {
    try {
      const validated = ModelFilterSchema.parse(filter);
      const models = await aiService.getAvailableModels(validated as ModelFilter);
      return { success: true, models };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          models: [],
          error: `Invalid filter: ${error.errors.map((e) => e.message).join(', ')}`,
        };
      }
      console.error('[AI IPC] Models list error:', error);
      return {
        success: false,
        models: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // ---------------------------------------------------------------------------
  // ai:models:get - Get single model by ID
  // ---------------------------------------------------------------------------
  ipcMain.handle('ai:models:get', async (_, modelId: string) => {
    try {
      if (!modelId || typeof modelId !== 'string') {
        return { success: false, error: 'Invalid model ID' };
      }
      const model = await aiService.getModel(modelId);
      return { success: true, model };
    } catch (error) {
      console.error('[AI IPC] Models get error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // ---------------------------------------------------------------------------
  // ai:models:download - Download a model
  // ---------------------------------------------------------------------------
  ipcMain.handle('ai:models:download', async (event, modelId: string) => {
    try {
      if (!modelId || typeof modelId !== 'string') {
        return { success: false, error: 'Invalid model ID' };
      }

      // Get the window to send progress events
      const win = BrowserWindow.fromWebContents(event.sender);

      await aiService.downloadModel(modelId, (progress) => {
        // Emit progress event to renderer
        if (win && !win.isDestroyed()) {
          win.webContents.send('ai:download:progress', progress);
        }
      });

      // Emit completion event
      if (win && !win.isDestroyed()) {
        win.webContents.send('ai:download:complete', { modelId });
      }

      return { success: true };
    } catch (error) {
      console.error('[AI IPC] Models download error:', error);

      // Emit error event
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !win.isDestroyed()) {
        win.webContents.send('ai:download:error', {
          modelId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // ---------------------------------------------------------------------------
  // ai:models:delete - Delete a model
  // ---------------------------------------------------------------------------
  ipcMain.handle('ai:models:delete', async (_, modelId: string) => {
    try {
      if (!modelId || typeof modelId !== 'string') {
        return { success: false, error: 'Invalid model ID' };
      }
      await aiService.deleteModel(modelId);
      return { success: true };
    } catch (error) {
      console.error('[AI IPC] Models delete error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // ---------------------------------------------------------------------------
  // ai:health - Check AI system health
  // ---------------------------------------------------------------------------
  ipcMain.handle('ai:health', async () => {
    try {
      const health = await aiService.checkHealth();
      return { success: true, health };
    } catch (error) {
      console.error('[AI IPC] Health error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // ---------------------------------------------------------------------------
  // ai:models:refresh - Force model re-discovery
  // ---------------------------------------------------------------------------
  ipcMain.handle('ai:models:refresh', async () => {
    try {
      const registry = getModelRegistry();
      await registry.refresh();
      const summary = registry.getSummary();
      return {
        success: true,
        summary: {
          total: summary.total,
          ready: summary.byState.ready,
          byProvider: summary.byProvider,
        },
      };
    } catch (error) {
      console.error('[AI IPC] Models refresh error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // ---------------------------------------------------------------------------
  // ai:models:summary - Get model registry summary
  // ---------------------------------------------------------------------------
  ipcMain.handle('ai:models:summary', async () => {
    try {
      const registry = getModelRegistry();
      const summary = registry.getSummary();
      return { success: true, summary };
    } catch (error) {
      console.error('[AI IPC] Models summary error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Initialize model registry in background (don't block handler registration)
  initializeModelRegistry().catch((err) => {
    console.error('[AI IPC] Model registry initialization failed:', err);
  });

  console.log('[IPC] AI handlers registered');
}

export default registerAIHandlers;
