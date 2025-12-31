/**
 * Job Builder - Unified image processing job queue builder
 *
 * SINGLE SOURCE OF TRUTH for image processing jobs.
 * All import paths (local files, web images) MUST use these functions.
 *
 * NOTE: As of dispatch integration, all jobs are submitted to dispatch hub
 * instead of local job queue. Workers on silo-1 process the jobs.
 *
 * - queueImageProcessingJobs(): Per-file jobs (Metadata, Thumbnail)
 * - queueLocationPostProcessing(): Per-location jobs (GPS, Stats, BagIt, etc.)
 * - needsProcessing(): Skip logic for already-processed images
 *
 * @module services/import/job-builder
 */

import { generateId } from '../../main/ipc-validation';
import type { Kysely } from 'kysely';
import type { Database } from '../../main/database.types';
import { getDispatchClient, type JobSubmission } from '@aa/services';
import { getLogger } from '../logger-service';

const logger = getLogger();

// ============================================================================
// Type Definitions
// ============================================================================

export interface ImageJobParams {
  imghash: string;
  archivePath: string;
  locid: string;
  subid: string | null;
}

export interface ImageJobResult {
  /** Job IDs that were queued */
  jobs: string[];
  /** Job types that were skipped (already processed) */
  skipped: string[];
  /** The ExifTool job ID (needed for dependency chain) */
  exifJobId: string | null;
}

export interface LocationJobParams {
  locid: string;
  subid: string | null;
  /** Last ExifTool job ID for dependency chain (optional) */
  lastExifJobId?: string;
  /** Whether documents were imported (affects SRT telemetry) */
  hasDocuments?: boolean;
}

export interface LocationJobResult {
  /** Job IDs that were queued */
  jobs: string[];
}

export interface ProcessingStatus {
  exiftool: boolean;
  thumbnail: boolean;
}

// ============================================================================
// Processing Status Check
// ============================================================================

/**
 * Check if an image needs processing for each stage.
 *
 * Used to skip jobs for already-processed images (e.g., re-imports, backfill).
 *
 * @param image - Image record with processing status fields
 * @returns Object indicating which stages need processing
 */
export function needsProcessing(image: {
  meta_exiftool: string | null;
  thumb_path_sm: string | null;
}): ProcessingStatus {
  return {
    exiftool: image.meta_exiftool === null,
    thumbnail: image.thumb_path_sm === null,
  };
}

// ============================================================================
// Per-File Job Builder
// ============================================================================

/**
 * Queue all standard processing jobs for an imported image.
 *
 * This is the SINGLE SOURCE OF TRUTH for image processing.
 * Call this from ANY import path after successful DB insert.
 *
 * Jobs submitted to dispatch hub:
 * 1. Metadata extraction (national-treasure plugin) - HIGH priority
 * 2. Thumbnail generation (shoemaker plugin) - NORMAL priority
 *
 * @param db - Database connection
 * @param params - Image parameters
 * @param options - Optional settings
 * @returns Job IDs and skipped stages
 */
export async function queueImageProcessingJobs(
  db: Kysely<Database>,
  params: ImageJobParams,
  options?: {
    /** Skip processing check and always queue all jobs */
    forceAll?: boolean;
    /** Check existing processing status before queueing */
    checkExisting?: boolean;
  }
): Promise<ImageJobResult> {
  const { imghash, archivePath, locid, subid } = params;
  const { forceAll = false, checkExisting = true } = options ?? {};

  const jobs: string[] = [];
  const skipped: string[] = [];
  let exifJobId: string | null = null;

  // Check existing processing status if requested
  let status: ProcessingStatus = { exiftool: true, thumbnail: true };

  if (checkExisting && !forceAll) {
    const image = await db
      .selectFrom('imgs')
      .select(['meta_exiftool', 'thumb_path_sm'])
      .where('imghash', '=', imghash)
      .executeTakeFirst();

    if (image) {
      status = needsProcessing(image);
    }
  }

  const dispatchClient = getDispatchClient();

  const baseOptions = {
    hash: imghash,
    mediaType: 'image' as const,
    locid,
    subid,
  };

  // 1. Metadata extraction (HIGH priority) - national-treasure plugin
  if (forceAll || status.exiftool) {
    try {
      exifJobId = await dispatchClient.submitJob({
        type: 'metadata',
        plugin: 'national-treasure',
        priority: 'HIGH',
        data: {
          source: archivePath,
          options: baseOptions,
        },
      });
      jobs.push(exifJobId);
      logger.debug('JobBuilder', `Submitted metadata job to dispatch for ${imghash.slice(0, 8)}...`);
    } catch (error) {
      logger.error('JobBuilder', `Failed to submit metadata job: ${error}`);
    }
  } else {
    skipped.push('exiftool');
  }

  // 2. Thumbnail generation (NORMAL priority) - shoemaker plugin
  if (forceAll || status.thumbnail) {
    try {
      const thumbJobId = await dispatchClient.submitJob({
        type: 'thumbnail',
        plugin: 'shoemaker',
        priority: 'NORMAL',
        data: {
          source: archivePath,
          options: {
            ...baseOptions,
            width: 400,
            height: 400,
            format: 'webp',
            quality: 80,
          },
        },
      });
      jobs.push(thumbJobId);
      logger.debug('JobBuilder', `Submitted thumbnail job to dispatch for ${imghash.slice(0, 8)}...`);
    } catch (error) {
      logger.error('JobBuilder', `Failed to submit thumbnail job: ${error}`);
    }
  } else {
    skipped.push('thumbnail');
  }

  if (jobs.length > 0) {
    logger.info('JobBuilder', `Submitted ${jobs.length} jobs to dispatch for image ${imghash.slice(0, 8)}...${skipped.length > 0 ? ` (skipped: ${skipped.join(', ')})` : ''}`);
  }

  return { jobs, skipped, exifJobId };
}

// ============================================================================
// Per-Location Job Builder
// ============================================================================

/**
 * Queue location-level jobs after an import batch completes.
 *
 * Should be called ONCE per import session, not per image.
 * These jobs aggregate data across all media in a location.
 *
 * Jobs submitted to dispatch hub:
 * 1. GPS enrichment (mapsh-pit plugin) - NORMAL priority
 * 2. Location stats (wake-n-blake plugin) - BULK priority
 * 3. BagIt manifest (wake-n-blake plugin) - BULK priority
 *
 * Note: Live Photo detection and SRT telemetry require dispatch plugins (not yet implemented)
 *
 * @param db - Database connection
 * @param params - Location parameters
 * @returns Job IDs that were queued
 */
export async function queueLocationPostProcessing(
  db: Kysely<Database>,
  params: LocationJobParams
): Promise<LocationJobResult> {
  const { locid, subid, hasDocuments = false } = params;

  const jobs: string[] = [];
  const dispatchClient = getDispatchClient();

  const locationOptions = { locid, subid };

  // 1. GPS_ENRICHMENT (NORMAL priority) - mapsh-pit plugin
  // Aggregates GPS from media to location/sub-location
  try {
    const gpsJobId = await dispatchClient.submitJob({
      type: 'metadata',
      plugin: 'mapsh-pit',
      priority: 'NORMAL',
      data: {
        source: locid,
        options: {
          ...locationOptions,
          action: 'gps-enrichment',
        },
      },
    });
    jobs.push(gpsJobId);
    logger.debug('JobBuilder', `Submitted GPS enrichment job to dispatch for ${locid.slice(0, 8)}...`);
  } catch (error) {
    logger.error('JobBuilder', `Failed to submit GPS enrichment job: ${error}`);
  }

  // 2. Live Photo detection - requires dispatch plugin (not yet implemented)
  logger.debug('JobBuilder', `Live Photo detection disabled - requires dispatch plugin`);

  // 3. SRT Telemetry - requires dispatch plugin (not yet implemented)
  if (hasDocuments) {
    logger.debug('JobBuilder', `SRT telemetry disabled - requires dispatch plugin`);
  }

  // 4. LOCATION_STATS (BULK priority) - wake-n-blake plugin
  // Recalculates media counts and date ranges
  try {
    const statsJobId = await dispatchClient.submitJob({
      type: 'metadata',
      plugin: 'wake-n-blake',
      priority: 'BULK',
      data: {
        source: locid,
        options: {
          ...locationOptions,
          action: 'location-stats',
        },
      },
    });
    jobs.push(statsJobId);
    logger.debug('JobBuilder', `Submitted location stats job to dispatch for ${locid.slice(0, 8)}...`);
  } catch (error) {
    logger.error('JobBuilder', `Failed to submit location stats job: ${error}`);
  }

  // 5. BAGIT (BULK priority) - wake-n-blake plugin
  // Updates RFC 8493 archive manifest
  try {
    const bagitJobId = await dispatchClient.submitJob({
      type: 'metadata',
      plugin: 'wake-n-blake',
      priority: 'BULK',
      data: {
        source: locid,
        options: {
          ...locationOptions,
          action: 'bagit',
        },
      },
    });
    jobs.push(bagitJobId);
    logger.debug('JobBuilder', `Submitted BagIt job to dispatch for ${locid.slice(0, 8)}...`);
  } catch (error) {
    logger.error('JobBuilder', `Failed to submit BagIt job: ${error}`);
  }

  logger.info('JobBuilder', `Submitted ${jobs.length} location jobs to dispatch for ${locid.slice(0, 8)}...`);

  return { jobs };
}

// ============================================================================
// Batch Helpers
// ============================================================================

/**
 * Queue processing jobs for multiple images in a batch.
 *
 * More efficient than calling queueImageProcessingJobs() in a loop
 * because it batches the job queue inserts.
 *
 * @param db - Database connection
 * @param images - Array of image parameters
 * @returns Combined results with last ExifTool job ID for dependencies
 */
export async function queueImageBatchProcessing(
  db: Kysely<Database>,
  images: ImageJobParams[],
  options?: {
    forceAll?: boolean;
    checkExisting?: boolean;
  }
): Promise<{
  totalJobs: number;
  totalSkipped: number;
  lastExifJobId: string | null;
}> {
  let totalJobs = 0;
  let totalSkipped = 0;
  let lastExifJobId: string | null = null;

  for (const image of images) {
    const result = await queueImageProcessingJobs(db, image, options);
    totalJobs += result.jobs.length;
    totalSkipped += result.skipped.length;
    if (result.exifJobId) {
      lastExifJobId = result.exifJobId;
    }
  }

  return { totalJobs, totalSkipped, lastExifJobId };
}
