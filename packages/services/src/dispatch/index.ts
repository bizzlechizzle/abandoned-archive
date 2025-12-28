/**
 * Dispatch Module
 *
 * Platform-agnostic dispatch hub integration.
 * Works with both CLI and Electron.
 */

// Types
export type {
  DispatchConfig,
  TokenPair,
  TokenStorage,
  JobType,
  JobPriority,
  JobStatus,
  JobSubmission,
  JobProgress,
  JobUpdate,
  Worker,
  DispatchStatus,
  DispatchClientEvents,
  // Data API Types (prefixed with Api to avoid conflicts with core types)
  ApiLocation,
  ApiLocationFilters,
  ApiCreateLocationInput,
  ApiMedia,
  ApiMediaFilters,
  ApiCreateMediaInput,
  MediaTag,
  AddTagInput,
  Sublocation,
  LocationNote,
  MapPoint,
  ParsedMapResult,
  DedupResult,
  MatchResult,
  ExportResult,
  PaginatedResponse,
} from './types.js';

// Token Storage
export {
  KeytarStorage,
  FileStorage,
  MemoryStorage,
  createTokenStorage,
  createTokenStorageSync,
} from './token-storage.js';

// Dispatch Client
export {
  DispatchClient,
  getDispatchClient,
  destroyDispatchClient,
  type DispatchClientOptions,
  type CreateDispatchClientOptions,
} from './dispatch-client.js';

// ============================================
// Helper Functions
// ============================================

import { getDispatchClient, type CreateDispatchClientOptions } from './dispatch-client.js';
import type { JobSubmission } from './types.js';

/**
 * Check if dispatch is available for job submission.
 * Returns true if connected and authenticated.
 */
export function isDispatchAvailable(options?: CreateDispatchClientOptions): boolean {
  const client = getDispatchClient(options);
  return client.isConnected() && client.isAuthenticated();
}

/**
 * Submit a job to dispatch if available, otherwise return null.
 * Callers should fall back to local processing when this returns null.
 */
export async function submitToDispatchIfAvailable(
  job: JobSubmission,
  options?: CreateDispatchClientOptions
): Promise<string | null> {
  if (!isDispatchAvailable(options)) {
    return null;
  }

  try {
    const client = getDispatchClient(options);
    const jobId = await client.submitJob(job);
    return jobId;
  } catch (error) {
    console.error('[Dispatch] Failed to submit job:', error);
    return null;
  }
}

/**
 * Submit a tagging job to dispatch.
 */
export async function submitTaggingJob(
  imagePath: string,
  opts?: {
    models?: string[];
    priority?: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW' | 'BULK';
  },
  clientOptions?: CreateDispatchClientOptions
): Promise<string | null> {
  return submitToDispatchIfAvailable(
    {
      type: 'tag',
      plugin: 'visual-buffet',
      priority: opts?.priority || 'NORMAL',
      data: {
        source: imagePath,
        options: {
          models: opts?.models || ['rampp', 'florence2', 'siglip'],
        },
      },
    },
    clientOptions
  );
}

/**
 * Submit a thumbnail generation job to dispatch.
 */
export async function submitThumbnailJob(
  sourcePath: string,
  destinationPath: string,
  opts?: {
    size?: number;
    priority?: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW' | 'BULK';
  },
  clientOptions?: CreateDispatchClientOptions
): Promise<string | null> {
  return submitToDispatchIfAvailable(
    {
      type: 'thumbnail',
      plugin: 'sharp',
      priority: opts?.priority || 'NORMAL',
      data: {
        source: sourcePath,
        destination: destinationPath,
        options: {
          size: opts?.size || 200,
        },
      },
    },
    clientOptions
  );
}

/**
 * Submit an import job to dispatch.
 */
export async function submitImportJob(
  sourcePath: string,
  destinationPath: string,
  opts?: {
    generateThumbnails?: boolean;
    extractMetadata?: boolean;
    priority?: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW' | 'BULK';
  },
  clientOptions?: CreateDispatchClientOptions
): Promise<string | null> {
  return submitToDispatchIfAvailable(
    {
      type: 'import',
      plugin: 'media-import',
      priority: opts?.priority || 'NORMAL',
      data: {
        source: sourcePath,
        destination: destinationPath,
        options: {
          generateThumbnails: opts?.generateThumbnails ?? true,
          extractMetadata: opts?.extractMetadata ?? true,
        },
      },
    },
    clientOptions
  );
}

/**
 * Submit a capture job to dispatch (web source archiving).
 */
export async function submitCaptureJob(
  url: string,
  opts?: {
    priority?: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW' | 'BULK';
  },
  clientOptions?: CreateDispatchClientOptions
): Promise<string | null> {
  return submitToDispatchIfAvailable(
    {
      type: 'capture',
      plugin: 'puppeteer',
      priority: opts?.priority || 'NORMAL',
      data: {
        source: url,
      },
    },
    clientOptions
  );
}
