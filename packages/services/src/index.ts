/**
 * @aa/services - Shared services for Abandoned Archive
 *
 * CLI-first architecture: All business logic accessible via services
 */

// Shared utilities
export * from './shared/index.js';

// Location services
export * from './location/index.js';

// Pipeline orchestration
export * from './pipeline/index.js';

// Re-export service classes for convenience
export { LocationService } from './location/location-service.js';

// Re-export pipeline classes for convenience
export {
  PipelineOrchestrator,
  createPipelineOrchestrator,
  PipelineHelpers,
  ProgressServer,
  createProgressServer,
} from './pipeline/index.js';

// Dispatch hub integration
export * from './dispatch/index.js';
