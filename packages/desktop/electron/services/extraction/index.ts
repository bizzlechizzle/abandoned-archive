/**
 * Extraction Service Public API
 *
 * This module exports the complete extraction system for use in the Electron main process.
 *
 * Usage:
 *   import { getExtractionService, ExtractionInput } from './services/extraction';
 *
 *   const service = getExtractionService(db);
 *   await service.initialize();
 *
 *   const result = await service.extract({
 *     text: 'The factory was built in 1923...',
 *     sourceType: 'web_source',
 *     sourceId: 'ws-123',
 *   });
 *
 * @version 1.0
 */

// =============================================================================
// SERVICE
// =============================================================================

export {
  ExtractionService,
  getExtractionService,
  shutdownExtractionService,
} from './extraction-service';

export {
  ExtractionQueueService,
  getExtractionQueueService,
  shutdownExtractionQueueService,
} from './extraction-queue-service';

export type {
  QueueJob,
  ExtractionQueueConfig,
} from './extraction-queue-service';

export {
  AutoTaggerService,
  getAutoTaggerService,
} from './auto-tagger-service';

export type {
  LocationType,
  Era,
  LocationStatus,
  TagResult,
} from './auto-tagger-service';

// =============================================================================
// TYPES
// =============================================================================

export type {
  // Input/Output
  ExtractionInput,
  ExtractionResult,
  ExtractionOptions,
  BatchExtractionRequest,
  BatchExtractionResult,

  // Date types
  ExtractedDate,
  DatePrecision,
  DateCategory,

  // Entity types
  ExtractedPerson,
  PersonRole,
  ExtractedOrganization,
  OrganizationType,
  ExtractedLocation,
  LocationRefType,

  // Summary types
  ExtractedSummary,

  // Provider types
  ProviderConfig,
  ProviderSettings,
  ProviderStatus,
  ProviderType,

  // Agent types
  AgentConfig,
  AgentType,

  // Job types
  ExtractionJob,
  JobStatus,

  // Storage types
  StoredExtraction,
  StoredSummary,
  ExtractionStatus,
  EntityType,

  // Health
  HealthCheckResult,
} from './extraction-types';

// =============================================================================
// PROVIDERS
// =============================================================================

export { BaseExtractionProvider } from './providers/base-provider';
export { OllamaProvider } from './providers/ollama-provider';
export { SpacyProvider } from './providers/spacy-provider';

// =============================================================================
// AGENTS
// =============================================================================

export {
  // Prompts
  DATE_EXTRACTION_SYSTEM_PROMPT,
  DATE_EXTRACTION_PROMPT,
  SUMMARY_TITLE_SYSTEM_PROMPT,
  SUMMARY_TITLE_PROMPT,
  COMBINED_EXTRACTION_PROMPT,

  // Builders
  buildDateExtractionPrompt,
  buildSummaryTitlePrompt,
  buildCombinedPrompt,

  // Parsing
  parseStructuredResponse,
  validateExtractions,
  recalibrateConfidence,
} from './agents/prompt-templates';
