/**
 * Extraction Service IPC Handlers
 *
 * Handles extraction:* channels for Document Intelligence extraction.
 * Provides access to the multi-provider extraction system (spaCy, Ollama, cloud).
 *
 * Channels:
 * - extraction:extract - Extract from text
 * - extraction:extractBatch - Batch extraction
 * - extraction:getProviders - List all providers
 * - extraction:getProviderStatus - Get single provider status
 * - extraction:updateProvider - Update provider config
 * - extraction:testProvider - Test a provider
 * - extraction:healthCheck - System health check
 *
 * @version 1.0
 */

import { ipcMain } from 'electron';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { Kysely } from 'kysely';
import {
  getExtractionService,
  getExtractionQueueService,
  getAutoTaggerService,
  type ExtractionInput,
  type ExtractionOptions,
  type BatchExtractionRequest,
  type ProviderConfig,
} from '../../services/extraction';
import type { Database as DatabaseTypes } from '../database.types';

let dbInstance: SqliteDatabase | null = null;

/**
 * Register all extraction IPC handlers
 */
export function registerExtractionHandlers(
  db: Kysely<DatabaseTypes>,
  sqliteDb: SqliteDatabase
): void {
  dbInstance = sqliteDb;
  const service = getExtractionService(sqliteDb);

  // Initialize service in background
  service.initialize().catch((error) => {
    console.error('[ExtractionHandlers] Failed to initialize:', error);
  });

  // ==========================================================================
  // Extraction
  // ==========================================================================

  /**
   * Extract from text
   *
   * Input: {
   *   text: string,
   *   sourceType: 'web_source' | 'document' | 'note' | 'media_caption',
   *   sourceId: string,
   *   locid?: string,
   *   subid?: string,
   *   extractTypes?: Array<'dates' | 'people' | 'organizations' | 'locations' | 'summary' | 'title'>,
   *   articleDate?: string,
   *   locationName?: string,
   *   options?: ExtractionOptions
   * }
   */
  ipcMain.handle('extraction:extract', async (_, input: ExtractionInput & { options?: ExtractionOptions }) => {
    try {
      const { options, ...extractionInput } = input;
      const result = await service.extract(extractionInput, options);
      return { success: true, result };
    } catch (error) {
      console.error('[ExtractionHandlers] extraction:extract failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Extract from a web source by ID
   */
  ipcMain.handle('extraction:extractFromWebSource', async (_, sourceId: string, options?: ExtractionOptions) => {
    try {
      // Get the web source
      const source = db
        .selectFrom('web_sources')
        .select(['source_id', 'extracted_text', 'locid', 'subid', 'extracted_date', 'title'])
        .where('source_id', '=', sourceId)
        .executeTakeFirst();

      const sourceData = await source;

      if (!sourceData || !sourceData.extracted_text) {
        return {
          success: false,
          error: 'Web source not found or has no text',
        };
      }

      // Get location name for context
      let locationName: string | undefined;
      if (sourceData.locid) {
        const location = await db
          .selectFrom('locs')
          .select(['locnam'])
          .where('locid', '=', sourceData.locid)
          .executeTakeFirst();
        locationName = location?.locnam;
      }

      const result = await service.extract(
        {
          text: sourceData.extracted_text,
          sourceType: 'web_source',
          sourceId: sourceData.source_id,
          locid: sourceData.locid ?? undefined,
          subid: sourceData.subid ?? undefined,
          articleDate: sourceData.extracted_date ?? undefined,
          locationName,
        },
        options
      );

      return { success: true, result };
    } catch (error) {
      console.error('[ExtractionHandlers] extraction:extractFromWebSource failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Batch extraction
   */
  ipcMain.handle('extraction:extractBatch', async (_, request: BatchExtractionRequest) => {
    try {
      const result = await service.extractBatch(request);
      return { success: true, result };
    } catch (error) {
      console.error('[ExtractionHandlers] extraction:extractBatch failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // ==========================================================================
  // Provider Management
  // ==========================================================================

  /**
   * Get all provider configurations
   */
  ipcMain.handle('extraction:getProviders', async () => {
    try {
      const configs = service.getAllConfigs();
      return { success: true, providers: configs };
    } catch (error) {
      console.error('[ExtractionHandlers] extraction:getProviders failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Get provider statuses (with availability check)
   */
  ipcMain.handle('extraction:getProviderStatuses', async () => {
    try {
      const statuses = await service.getProviderStatuses();
      return { success: true, statuses };
    } catch (error) {
      console.error('[ExtractionHandlers] extraction:getProviderStatuses failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Update provider configuration
   */
  ipcMain.handle(
    'extraction:updateProvider',
    async (_, providerId: string, updates: Partial<ProviderConfig>) => {
      try {
        const config = await service.updateProviderConfig(providerId, updates);
        if (!config) {
          return { success: false, error: `Provider ${providerId} not found` };
        }
        return { success: true, config };
      } catch (error) {
        console.error('[ExtractionHandlers] extraction:updateProvider failed:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  /**
   * Add a new provider
   */
  ipcMain.handle('extraction:addProvider', async (_, config: ProviderConfig) => {
    try {
      await service.addProvider(config);
      return { success: true };
    } catch (error) {
      console.error('[ExtractionHandlers] extraction:addProvider failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Remove a provider
   */
  ipcMain.handle('extraction:removeProvider', async (_, providerId: string) => {
    try {
      await service.removeProvider(providerId);
      return { success: true };
    } catch (error) {
      console.error('[ExtractionHandlers] extraction:removeProvider failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Test a provider with sample text
   */
  ipcMain.handle('extraction:testProvider', async (_, providerId: string, testText?: string) => {
    const defaultText =
      'The Sterling Steel Factory was built in 1923 by John Sterling. ' +
      'It employed 500 workers at its peak before closing in 2008 due to foreign competition.';

    try {
      const result = await service.testProvider(providerId, testText || defaultText);
      return { success: true, result };
    } catch (error) {
      console.error('[ExtractionHandlers] extraction:testProvider failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // ==========================================================================
  // Health & Diagnostics
  // ==========================================================================

  /**
   * Health check
   */
  ipcMain.handle('extraction:healthCheck', async () => {
    try {
      const health = await service.healthCheck();
      return { success: true, health };
    } catch (error) {
      console.error('[ExtractionHandlers] extraction:healthCheck failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // ==========================================================================
  // Ollama-specific
  // ==========================================================================

  /**
   * Test Ollama connection
   */
  ipcMain.handle('extraction:testOllamaConnection', async (_, host?: string, port?: number) => {
    try {
      const { OllamaProvider } = await import('../../services/extraction/providers/ollama-provider');

      const testConfig: ProviderConfig = {
        id: 'test-ollama',
        name: 'Test Ollama',
        type: 'ollama',
        enabled: true,
        priority: 999,
        settings: {
          host: host || 'localhost',
          port: port || 11434,
          model: 'qwen2.5:7b',
          timeout: 10000,
        },
      };

      const provider = new OllamaProvider(testConfig);
      const result = await provider.testConnection();
      return { success: true, result };
    } catch (error) {
      console.error('[ExtractionHandlers] extraction:testOllamaConnection failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * List available Ollama models
   */
  ipcMain.handle('extraction:listOllamaModels', async (_, host?: string, port?: number) => {
    try {
      const url = `http://${host || 'localhost'}:${port || 11434}/api/tags`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Ollama returned ${response.status}`);
      }

      const data = (await response.json()) as { models: Array<{ name: string; size: number }> };
      return {
        success: true,
        models: (data.models || []).map((m) => ({
          name: m.name,
          size: m.size,
        })),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Pull an Ollama model
   */
  ipcMain.handle(
    'extraction:pullOllamaModel',
    async (_, modelName: string, host?: string, port?: number) => {
      try {
        const { OllamaProvider } = await import('../../services/extraction/providers/ollama-provider');

        const testConfig: ProviderConfig = {
          id: 'pull-ollama',
          name: 'Pull Ollama',
          type: 'ollama',
          enabled: true,
          priority: 999,
          settings: {
            host: host || 'localhost',
            port: port || 11434,
            model: modelName,
          },
        };

        const provider = new OllamaProvider(testConfig);
        const result = await provider.pullModel(modelName);
        return { success: result.success, message: result.message };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  // ==========================================================================
  // Extraction Queue (OPT-120)
  // ==========================================================================

  const queueService = getExtractionQueueService(sqliteDb);

  /**
   * Start the extraction queue background processor
   */
  ipcMain.handle('extraction:queue:start', async () => {
    try {
      await queueService.start();
      return { success: true };
    } catch (error) {
      console.error('[ExtractionHandlers] extraction:queue:start failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Stop the extraction queue background processor
   */
  ipcMain.handle('extraction:queue:stop', async () => {
    try {
      queueService.stop();
      return { success: true };
    } catch (error) {
      console.error('[ExtractionHandlers] extraction:queue:stop failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Manually enqueue an extraction job
   */
  ipcMain.handle(
    'extraction:queue:enqueue',
    async (
      _,
      sourceType: 'web_source' | 'document' | 'media',
      sourceId: string,
      locid: string | null,
      tasks?: string[],
      priority?: number
    ) => {
      try {
        const queueId = await queueService.enqueue(
          sourceType,
          sourceId,
          locid,
          tasks,
          priority
        );
        return { success: true, queueId };
      } catch (error) {
        console.error('[ExtractionHandlers] extraction:queue:enqueue failed:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  /**
   * Get queue status
   */
  ipcMain.handle('extraction:queue:status', async () => {
    try {
      const status = queueService.getStatus();
      return { success: true, status };
    } catch (error) {
      console.error('[ExtractionHandlers] extraction:queue:status failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Cleanup old completed/failed jobs
   */
  ipcMain.handle('extraction:queue:cleanup', async (_, olderThanDays?: number) => {
    try {
      const count = queueService.cleanup(olderThanDays);
      return { success: true, cleaned: count };
    } catch (error) {
      console.error('[ExtractionHandlers] extraction:queue:cleanup failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Start queue processor automatically
  queueService.start().catch((error) => {
    console.error('[ExtractionHandlers] Failed to start queue processor:', error);
  });

  // ==========================================================================
  // Auto-Tagger (OPT-120)
  // ==========================================================================

  const autoTagger = getAutoTaggerService(sqliteDb);

  /**
   * Detect tags from text
   */
  ipcMain.handle(
    'extraction:tagger:detectTags',
    async (_, text: string, buildYear?: number | string | null) => {
      try {
        const result = autoTagger.detectTags(text, buildYear);
        return { success: true, result };
      } catch (error) {
        console.error('[ExtractionHandlers] extraction:tagger:detectTags failed:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  /**
   * Tag a specific location
   */
  ipcMain.handle('extraction:tagger:tagLocation', async (_, locid: string) => {
    try {
      const result = await autoTagger.tagLocation(locid);
      return { success: true, result };
    } catch (error) {
      console.error('[ExtractionHandlers] extraction:tagger:tagLocation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Tag all untagged locations
   */
  ipcMain.handle('extraction:tagger:tagAllUntagged', async () => {
    try {
      const result = await autoTagger.tagAllUntagged();
      return { success: true, result };
    } catch (error) {
      console.error('[ExtractionHandlers] extraction:tagger:tagAllUntagged failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // ==========================================================================
  // Entity Queries (OPT-120)
  // ==========================================================================

  /**
   * Get entities (people, organizations) for a location
   */
  ipcMain.handle('extraction:entities:getByLocation', async (_, locid: string) => {
    try {
      const entities = sqliteDb.prepare(`
        SELECT
          extraction_id,
          entity_type,
          entity_name,
          entity_role,
          date_range,
          confidence,
          context_sentence,
          status,
          created_at
        FROM entity_extractions
        WHERE locid = ? AND status IN ('approved', 'pending')
        ORDER BY entity_type, entity_name
      `).all(locid);

      return { success: true, entities };
    } catch (error) {
      console.error('[ExtractionHandlers] extraction:entities:getByLocation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Update entity status (approve/reject)
   */
  ipcMain.handle(
    'extraction:entities:updateStatus',
    async (_, extractionId: string, status: 'approved' | 'rejected' | 'pending') => {
      try {
        sqliteDb.prepare(`
          UPDATE entity_extractions
          SET status = ?, updated_at = datetime('now')
          WHERE extraction_id = ?
        `).run(status, extractionId);

        return { success: true };
      } catch (error) {
        console.error('[ExtractionHandlers] extraction:entities:updateStatus failed:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );
}

/**
 * Shutdown extraction service
 */
export async function shutdownExtractionHandlers(): Promise<void> {
  const { shutdownExtractionService, shutdownExtractionQueueService } = await import('../../services/extraction');
  shutdownExtractionQueueService();
  await shutdownExtractionService();
}
