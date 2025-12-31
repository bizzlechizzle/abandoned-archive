/**
 * Backbone Services
 *
 * Unified interface layer for backbone packages (wake-n-blake, shoemaker).
 * All backbone functionality should be accessed through these services.
 *
 * Usage:
 *   import { HashService, ScanService, DeviceService, ThumbnailService } from './backbone';
 */

export { HashService } from './hash-service.js';
export type { HashServiceOptions, HashResult, CopyResult, FastHashResult, Algorithm, BatchHashResult } from './hash-service.js';

export { ScanService } from './scan-service.js';
export type {
  ScanOptions,
  ScanResult,
  ScanError,
  FileCategory,
  MediaCategory,
} from './scan-service.js';

export { DeviceService } from './device-service.js';
export type {
  DeviceDetectionOptions,
  DetectedDevice,
  DeviceDetectionResult,
  MountedVolume,
  DeviceChain,
  CameraMatch,
  CameraSignature,
  ImportSourceDevice,
  SourceType,
  StorageType,
} from './device-service.js';

export { ThumbnailService } from './thumbnail-service.js';
export type {
  ThumbnailSizes,
  ThumbnailOptions,
  ThumbnailResult,
  Config,
  Preset,
  GenerationResult,
  PreviewAnalysis,
  ProgressInfo,
} from './thumbnail-service.js';

export { XmpMapperService } from './xmp-mapper-service.js';
export type {
  XmpMappingResult,
  RebuildResult,
} from './xmp-mapper-service.js';

export { ImportService, createImportService } from './import-service.js';
export type {
  ImportLocation,
  BackboneImportOptions,
  BackboneImportProgress,
  BackboneImportResult,
} from './import-service.js';

/**
 * Initialize all backbone services
 * Call this once at application startup
 */
export async function initializeBackbone(dataDir: string): Promise<void> {
  const { DeviceService } = await import('./device-service.js');
  const { ThumbnailService } = await import('./thumbnail-service.js');

  await Promise.all([
    DeviceService.initialize(dataDir),
    ThumbnailService.initialize(),
  ]);

  console.log('[Backbone] All services initialized');
}
