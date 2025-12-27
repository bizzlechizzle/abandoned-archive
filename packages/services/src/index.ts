/**
 * @aa/services - Shared services for Abandoned Archive
 *
 * CLI-first architecture: All business logic accessible via services
 */

// Shared utilities
export * from './shared';

// Location services
export * from './location';

// Pipeline orchestration
export * from './pipeline';

// Re-export service classes for convenience
export { LocationService } from './location/location-service';

// Re-export pipeline classes for convenience
export {
  PipelineOrchestrator,
  createPipelineOrchestrator,
  PipelineHelpers,
  ProgressServer,
  createProgressServer,
} from './pipeline';

// Dispatch hub integration
export * from './dispatch';
