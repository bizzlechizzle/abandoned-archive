/**
 * JobWorkerService - Background job processor
 *
 * Per Import Spec v2.0:
 * - Polls job queue for pending jobs
 * - Handles job priorities
 * - Respects concurrency limits per queue
 * - Checks dependencies before processing
 * - Emits progress events
 *
 * @module services/job-worker-service
 */

import { EventEmitter } from 'events';
import type { Kysely } from 'kysely';
import type { Database } from '../main/database.types';
import { JobQueue, IMPORT_QUEUES, type Job } from './job-queue';
import PQueue from 'p-queue';
import { getLogger } from './logger-service';
import { getMetricsCollector, MetricNames } from './monitoring/metrics-collector';
import { getTracer, OperationNames } from './monitoring/tracer';
import { getHardwareProfile, type HardwareProfile } from './hardware-profile';

const logger = getLogger();
const metrics = getMetricsCollector();
const tracer = getTracer();

/**
 * Job handler function signature
 */
export type JobHandler<T = unknown, R = unknown> = (
  payload: T,
  emit: (event: string, data: unknown) => void
) => Promise<R>;

/**
 * Queue configuration
 */
interface QueueConfig {
  concurrency: number;
  handler: JobHandler;
}

/**
 * Job worker events
 */
export interface JobWorkerEvents {
  'job:start': { queue: string; jobId: string };
  'job:complete': { queue: string; jobId: string; result: unknown };
  'job:error': { queue: string; jobId: string; error: string };
  'job:progress': { queue: string; jobId: string; progress: number; message?: string };
  'asset:thumbnail-ready': { hash: string; paths: { sm: string; lg: string; preview?: string } };
  'asset:metadata-complete': { hash: string; mediaType: string; metadata: unknown };
  'asset:proxy-ready': { hash: string; proxyPath: string };
}

/**
 * Job worker service for processing background jobs
 *
 * v2.1 AGGRESSIVE: Hardware-scaled concurrency, batch fetching, adaptive polling
 */
export class JobWorkerService extends EventEmitter {
  private jobQueue: JobQueue;
  private queues: Map<string, QueueConfig> = new Map();
  private pQueues: Map<string, PQueue> = new Map();
  private isRunning = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private readonly hwProfile: HardwareProfile;

  constructor(private readonly db: Kysely<Database>) {
    super();
    this.jobQueue = new JobQueue(db);
    this.hwProfile = getHardwareProfile();
    this.setupDefaultQueues();

    logger.info('JobWorker', `Initialized with ${this.hwProfile.tier} tier profile`, {
      pollMs: this.hwProfile.pollIntervalMs,
      pollIdleMs: this.hwProfile.pollIntervalIdleMs,
    });
  }

  /**
   * Set up default queue configurations
   * v2.1: HARDWARE-SCALED concurrency based on detected tier
   */
  private setupDefaultQueues(): void {
    const hw = this.hwProfile;

    // ExifTool queue - scaled to hardware
    this.registerQueue(IMPORT_QUEUES.EXIFTOOL, hw.exifToolWorkers, this.handleExifToolJob.bind(this) as JobHandler);

    // FFprobe queue - scaled to hardware
    this.registerQueue(IMPORT_QUEUES.FFPROBE, hw.ffprobeWorkers, this.handleFFprobeJob.bind(this) as JobHandler);

    // Thumbnail queue - scaled to hardware
    this.registerQueue(IMPORT_QUEUES.THUMBNAIL, hw.thumbnailWorkers, this.handleThumbnailJob.bind(this) as JobHandler);

    // Video proxy queue - scaled to hardware (heavy but modern machines can handle more)
    this.registerQueue(IMPORT_QUEUES.VIDEO_PROXY, hw.videoProxyWorkers, this.handleVideoProxyJob.bind(this) as JobHandler);

    // Live photo detection - scaled to hardware
    this.registerQueue(IMPORT_QUEUES.LIVE_PHOTO, hw.livePhotoWorkers, this.handleLivePhotoJob.bind(this) as JobHandler);

    // BagIt manifest updates - scaled to hardware
    this.registerQueue(IMPORT_QUEUES.BAGIT, hw.bagitWorkers, this.handleBagItJob.bind(this) as JobHandler);

    // Location stats - scaled to hardware
    this.registerQueue(IMPORT_QUEUES.LOCATION_STATS, hw.locationStatsWorkers, this.handleLocationStatsJob.bind(this) as JobHandler);

    // Log configuration
    logger.info('JobWorker', 'Queue configuration (hardware-scaled)', {
      exifTool: hw.exifToolWorkers,
      ffprobe: hw.ffprobeWorkers,
      thumbnail: hw.thumbnailWorkers,
      videoProxy: hw.videoProxyWorkers,
      livePhoto: hw.livePhotoWorkers,
      bagit: hw.bagitWorkers,
      locationStats: hw.locationStatsWorkers,
    });
  }

  /**
   * Register a queue with its handler
   */
  registerQueue(name: string, concurrency: number, handler: JobHandler): void {
    this.queues.set(name, { concurrency, handler });
    this.pQueues.set(name, new PQueue({ concurrency }));
  }

  /**
   * Start the job worker
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    logger.info('JobWorker', 'Starting background job processor');
    this.isRunning = true;

    // Record worker active metric
    metrics.gauge(MetricNames.WORKERS_ACTIVE, 1, { workerId: 'main' });

    // Start polling
    this.poll();
  }

  /**
   * Stop the job worker
   */
  async stop(): Promise<void> {
    logger.info('JobWorker', 'Stopping background job processor');
    this.isRunning = false;

    if (this.pollInterval) {
      clearTimeout(this.pollInterval);
      this.pollInterval = null;
    }

    // Wait for all queues to finish
    const waitPromises = Array.from(this.pQueues.values()).map(q => q.onIdle());
    await Promise.all(waitPromises);

    // Record worker stopped metric
    metrics.gauge(MetricNames.WORKERS_ACTIVE, 0, { workerId: 'main' });
    metrics.gauge(MetricNames.WORKERS_IDLE, 1, { workerId: 'main' });

    logger.info('JobWorker', 'Background job processor stopped');
  }

  /**
   * Poll for and process jobs
   *
   * v2.1 AGGRESSIVE:
   * - Batch fetch to fill ALL available worker slots
   * - Adaptive polling: fast when busy, slower when idle
   */
  private async poll(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    let totalJobsFetched = 0;

    try {
      // Process each queue - FILL ALL AVAILABLE SLOTS
      for (const [queueName, config] of this.queues) {
        const pQueue = this.pQueues.get(queueName)!;

        // Record queue depth metric
        metrics.gauge(MetricNames.JOBS_QUEUE_DEPTH, pQueue.pending, { queue: queueName });

        // Calculate available slots
        const availableSlots = config.concurrency - pQueue.pending;

        if (availableSlots > 0) {
          // BATCH FETCH - get multiple jobs at once to fill all slots
          const jobs = await this.jobQueue.getNextBatch(queueName, availableSlots);

          totalJobsFetched += jobs.length;

          // Add ALL jobs to p-queue for parallel processing
          for (const job of jobs) {
            pQueue.add(() => this.processJob(queueName, job, config.handler));
          }
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('JobWorker', 'Poll error', undefined, { error: errorMsg });
      metrics.incrementCounter(MetricNames.ERRORS_COUNT, 1, { source: 'job_worker_poll' });
    }

    // ADAPTIVE POLLING: fast when busy, slower when idle
    const nextPollMs = totalJobsFetched > 0
      ? this.hwProfile.pollIntervalMs      // Busy: poll fast
      : this.hwProfile.pollIntervalIdleMs; // Idle: poll slower

    this.pollInterval = setTimeout(() => this.poll(), nextPollMs);
  }

  /**
   * Process a single job
   */
  private async processJob(
    queueName: string,
    job: Job,
    handler: JobHandler
  ): Promise<void> {
    const startTime = Date.now();
    const timer = metrics.timer(MetricNames.JOBS_DURATION, { queue: queueName });

    // Start a trace span for this job
    const jobSpan = tracer.startSpan(OperationNames.JOB_PROCESS, {
      jobId: job.jobId,
      queue: queueName,
      priority: job.priority,
      attempt: job.attempts,
    });

    logger.info('JobWorker', 'Job processing started', {
      jobId: job.jobId,
      queue: queueName,
      priority: job.priority,
      attempt: job.attempts,
    });

    this.emit('job:start', { queue: queueName, jobId: job.jobId });

    try {
      // Create event emitter for job progress
      const emitProgress = (event: string, data: unknown) => {
        this.emit(event, data);
        if (event.startsWith('job:progress')) {
          this.emit('job:progress', {
            queue: queueName,
            jobId: job.jobId,
            ...data as object,
          });
        }
      };

      // Execute handler
      const result = await handler(job.payload, emitProgress);

      // Mark complete
      await this.jobQueue.complete(job.jobId, result, queueName);

      const duration = timer.end();
      logger.info('JobWorker', 'Job completed successfully', {
        jobId: job.jobId,
        queue: queueName,
        durationMs: duration,
      });

      // End trace span with success
      jobSpan.end('success', { durationMs: duration });

      this.emit('job:complete', { queue: queueName, jobId: job.jobId, result });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const duration = timer.end();

      logger.error('JobWorker', 'Job processing failed', undefined, {
        jobId: job.jobId,
        queue: queueName,
        error: errorMsg,
        durationMs: duration,
      });

      // End trace span with error
      jobSpan.end('error', { error: errorMsg, durationMs: duration });

      // Mark failed (will retry or move to dead letter)
      await this.jobQueue.fail(job.jobId, errorMsg);

      this.emit('job:error', { queue: queueName, jobId: job.jobId, error: errorMsg });
    }
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<Record<string, {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }>> {
    const stats: Record<string, { pending: number; processing: number; completed: number; failed: number }> = {};

    for (const queueName of this.queues.keys()) {
      const queueStats = await this.jobQueue.getStats(queueName);
      stats[queueName] = {
        pending: queueStats.pending,
        processing: queueStats.processing,
        completed: queueStats.completed,
        failed: queueStats.failed,
      };
    }

    return stats;
  }

  // ============ Job Handlers ============

  /**
   * ExifTool metadata extraction job
   */
  private async handleExifToolJob(
    payload: { hash: string; mediaType: string; archivePath: string },
    emit: (event: string, data: unknown) => void
  ): Promise<{ metadata: unknown }> {
    // Import and instantiate the ExifTool service
    const { ExifToolService } = await import('./exiftool-service');
    const exifToolService = new ExifToolService();

    const metadata = await exifToolService.extractMetadata(payload.archivePath);

    // Update database with metadata
    await this.updateMediaMetadata(payload.hash, payload.mediaType, metadata);

    // Emit event
    emit('asset:metadata-complete', {
      hash: payload.hash,
      mediaType: payload.mediaType,
      metadata,
    });

    return { metadata };
  }

  /**
   * FFprobe video metadata extraction job
   */
  private async handleFFprobeJob(
    payload: { hash: string; archivePath: string },
    emit: (event: string, data: unknown) => void
  ): Promise<{ videoMetadata: unknown }> {
    // Import and instantiate the FFmpeg service
    const { FFmpegService } = await import('./ffmpeg-service');
    const ffmpegService = new FFmpegService();

    const videoMetadata = await ffmpegService.extractMetadata(payload.archivePath);

    // Update database with video metadata
    await this.db
      .updateTable('vids')
      .set({
        meta_ffmpeg: JSON.stringify(videoMetadata),
        meta_duration: videoMetadata.duration,
        meta_width: videoMetadata.width,
        meta_height: videoMetadata.height,
        meta_codec: videoMetadata.codec,
        meta_fps: videoMetadata.fps,
      })
      .where('vidhash', '=', payload.hash)
      .execute();

    return { videoMetadata };
  }

  /**
   * Thumbnail generation job
   */
  private async handleThumbnailJob(
    payload: { hash: string; mediaType: string; archivePath: string },
    emit: (event: string, data: unknown) => void
  ): Promise<{ paths: { sm: string; lg: string; preview?: string } }> {
    // Import and instantiate the Thumbnail service
    const { ThumbnailService } = await import('./thumbnail-service');
    const { MediaPathService } = await import('./media-path-service');
    // Get archive path from settings
    const archiveSetting = await this.db
      .selectFrom('settings')
      .select('value')
      .where('key', '=', 'archive_folder')
      .executeTakeFirst();
    const mediaPathService = new MediaPathService(archiveSetting?.value || '');
    const thumbnailService = new ThumbnailService(mediaPathService);

    // Generate thumbnail (returns path to small thumbnail)
    const thumbPath = await thumbnailService.generateThumbnail(
      payload.archivePath,
      payload.hash
    );
    // Build paths object (thumbnail service creates sm/lg variants)
    const paths = {
      sm: mediaPathService.getThumbnailPath(payload.hash, 400),
      lg: mediaPathService.getThumbnailPath(payload.hash, 800),
      preview: thumbPath ?? undefined,
    };

    // Update database with thumbnail paths
    if (payload.mediaType === 'image') {
      await this.db
        .updateTable('imgs')
        .set({
          thumb_path_sm: paths.sm,
          thumb_path_lg: paths.lg,
          preview_path: paths.preview ?? null,
        })
        .where('imghash', '=', payload.hash)
        .execute();
    } else if (payload.mediaType === 'video') {
      await this.db
        .updateTable('vids')
        .set({
          thumb_path_sm: paths.sm,
          thumb_path_lg: paths.lg,
          preview_path: paths.preview ?? null,
          poster_extracted: 1,
        })
        .where('vidhash', '=', payload.hash)
        .execute();
    }

    // Emit event
    emit('asset:thumbnail-ready', { hash: payload.hash, paths });

    return { paths };
  }

  /**
   * Video proxy generation job
   */
  private async handleVideoProxyJob(
    payload: { hash: string; archivePath: string },
    emit: (event: string, data: unknown) => void
  ): Promise<{ proxyPath: string | null }> {
    // Import the video proxy functions
    const { generateProxy } = await import('./video-proxy-service');
    const { FFmpegService } = await import('./ffmpeg-service');
    // Get archive path from settings
    const archiveSetting = await this.db
      .selectFrom('settings')
      .select('value')
      .where('key', '=', 'archive_folder')
      .executeTakeFirst();

    // Get video metadata for proxy generation
    const ffmpegService = new FFmpegService();
    const metadata = await ffmpegService.extractMetadata(payload.archivePath);

    const result = await generateProxy(
      this.db,
      archiveSetting?.value || '',
      payload.hash,
      payload.archivePath,
      { width: metadata.width ?? 1920, height: metadata.height ?? 1080 }
    );
    const proxyPath = result.proxyPath ?? null;

    if (proxyPath) {
      // Emit event
      emit('asset:proxy-ready', { hash: payload.hash, proxyPath });
    }

    return { proxyPath };
  }

  /**
   * Live Photo detection job
   */
  private async handleLivePhotoJob(
    payload: { locid: string },
    emit: (event: string, data: unknown) => void
  ): Promise<{ linkedPairs: number }> {
    // This job runs the Live Photo detection for a location
    // Uses ContentIdentifier from EXIF metadata to match image/video pairs

    const linkedPairs = await this.detectLivePhotos(payload.locid);

    return { linkedPairs };
  }

  /**
   * BagIt manifest update job
   */
  private async handleBagItJob(
    payload: { locid: string },
    emit: (event: string, data: unknown) => void
  ): Promise<{ success: boolean }> {
    // Import and instantiate the BagIt services
    const { BagItIntegrityService } = await import('./bagit-integrity-service');
    const { BagItService } = await import('./bagit-service');
    // Get archive path from settings
    const archiveSetting = await this.db
      .selectFrom('settings')
      .select('value')
      .where('key', '=', 'archive_folder')
      .executeTakeFirst();
    const archivePath = archiveSetting?.value || '';
    const bagItService = new BagItService(archivePath);
    const bagItIntegrityService = new BagItIntegrityService(this.db, bagItService, archivePath);

    // Validate and update the bag for this location
    await bagItIntegrityService.validateSingleBag(payload.locid);

    return { success: true };
  }

  /**
   * Location stats recalculation job
   */
  private async handleLocationStatsJob(
    payload: { locid: string },
    emit: (event: string, data: unknown) => void
  ): Promise<{ stats: unknown }> {
    // Recalculate location statistics (media counts, date range, etc.)
    // This is a placeholder - actual implementation would aggregate from media tables

    return { stats: {} };
  }

  // ============ Helper Methods ============

  /**
   * Update media metadata in database
   */
  private async updateMediaMetadata(hash: string, mediaType: string, metadata: unknown): Promise<void> {
    const meta = metadata as Record<string, unknown>;
    const metaJson = JSON.stringify(metadata);

    switch (mediaType) {
      case 'image':
        await this.db
          .updateTable('imgs')
          .set({
            meta_exiftool: metaJson,
            meta_width: meta.ImageWidth as number ?? null,
            meta_height: meta.ImageHeight as number ?? null,
            meta_date_taken: meta.DateTimeOriginal as string ?? null,
            meta_camera_make: meta.Make as string ?? null,
            meta_camera_model: meta.Model as string ?? null,
            meta_gps_lat: meta.GPSLatitude as number ?? null,
            meta_gps_lng: meta.GPSLongitude as number ?? null,
          })
          .where('imghash', '=', hash)
          .execute();
        break;

      case 'video':
        await this.db
          .updateTable('vids')
          .set({
            meta_exiftool: metaJson,
            meta_date_taken: meta.DateTimeOriginal as string ?? meta.CreateDate as string ?? null,
            meta_gps_lat: meta.GPSLatitude as number ?? null,
            meta_gps_lng: meta.GPSLongitude as number ?? null,
          })
          .where('vidhash', '=', hash)
          .execute();
        break;

      case 'document':
        await this.db
          .updateTable('docs')
          .set({
            meta_exiftool: metaJson,
            meta_author: meta.Author as string ?? null,
            meta_title: meta.Title as string ?? null,
            meta_page_count: meta.PageCount as number ?? null,
          })
          .where('dochash', '=', hash)
          .execute();
        break;

      case 'map':
        await this.db
          .updateTable('maps')
          .set({
            meta_exiftool: metaJson,
          })
          .where('maphash', '=', hash)
          .execute();
        break;
    }
  }

  /**
   * Detect and link Live Photo pairs
   */
  private async detectLivePhotos(locid: string): Promise<number> {
    // Get all images and videos for this location with ContentIdentifier
    const images = await this.db
      .selectFrom('imgs')
      .select(['imghash', 'meta_exiftool'])
      .where('locid', '=', locid)
      .where('is_live_photo', '=', 0)
      .where('hidden', '=', 0)
      .execute();

    const videos = await this.db
      .selectFrom('vids')
      .select(['vidhash', 'meta_exiftool', 'vidnamo'])
      .where('locid', '=', locid)
      .where('is_live_photo', '=', 0)
      .where('hidden', '=', 0)
      .execute();

    // Extract ContentIdentifiers
    const imageIdentifiers = new Map<string, string>();
    for (const img of images) {
      if (img.meta_exiftool) {
        try {
          const meta = JSON.parse(img.meta_exiftool);
          if (meta.ContentIdentifier) {
            imageIdentifiers.set(meta.ContentIdentifier, img.imghash);
          }
        } catch {
          // Invalid JSON
        }
      }
    }

    // Match videos by ContentIdentifier
    let linkedPairs = 0;
    for (const vid of videos) {
      if (vid.meta_exiftool) {
        try {
          const meta = JSON.parse(vid.meta_exiftool);
          if (meta.ContentIdentifier && imageIdentifiers.has(meta.ContentIdentifier)) {
            // Found a Live Photo pair!
            const imageHash = imageIdentifiers.get(meta.ContentIdentifier)!;

            // Mark both as Live Photo
            await this.db
              .updateTable('imgs')
              .set({ is_live_photo: 1 })
              .where('imghash', '=', imageHash)
              .execute();

            await this.db
              .updateTable('vids')
              .set({
                is_live_photo: 1,
                hidden: 1,
                hidden_reason: 'live_photo_video',
              })
              .where('vidhash', '=', vid.vidhash)
              .execute();

            linkedPairs++;
          }
        } catch {
          // Invalid JSON
        }
      }
    }

    return linkedPairs;
  }
}

// Singleton instance
let workerServiceInstance: JobWorkerService | null = null;

/**
 * Get the singleton JobWorkerService instance
 */
export function getJobWorkerService(db: Kysely<Database>): JobWorkerService {
  if (!workerServiceInstance) {
    workerServiceInstance = new JobWorkerService(db);
  }
  return workerServiceInstance;
}

/**
 * Start the job worker service
 */
export function startJobWorker(db: Kysely<Database>): JobWorkerService {
  const service = getJobWorkerService(db);
  service.start();
  return service;
}

/**
 * Stop the job worker service
 */
export async function stopJobWorker(): Promise<void> {
  if (workerServiceInstance) {
    await workerServiceInstance.stop();
    workerServiceInstance = null;
  }
}
