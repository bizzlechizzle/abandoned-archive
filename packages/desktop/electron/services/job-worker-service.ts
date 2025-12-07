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
   *
   * Per-file jobs: Run for each imported file
   * Per-location jobs: Run once per location after all files processed
   */
  private setupDefaultQueues(): void {
    const hw = this.hwProfile;

    // ============ Per-File Jobs ============

    // ExifTool queue - scaled to hardware
    this.registerQueue(IMPORT_QUEUES.EXIFTOOL, hw.exifToolWorkers, this.handleExifToolJob.bind(this) as JobHandler);

    // FFprobe queue - scaled to hardware
    this.registerQueue(IMPORT_QUEUES.FFPROBE, hw.ffprobeWorkers, this.handleFFprobeJob.bind(this) as JobHandler);

    // Thumbnail queue - scaled to hardware
    this.registerQueue(IMPORT_QUEUES.THUMBNAIL, hw.thumbnailWorkers, this.handleThumbnailJob.bind(this) as JobHandler);

    // Video proxy queue - scaled to hardware (heavy but modern machines can handle more)
    this.registerQueue(IMPORT_QUEUES.VIDEO_PROXY, hw.videoProxyWorkers, this.handleVideoProxyJob.bind(this) as JobHandler);

    // ============ Per-Location Jobs ============

    // GPS enrichment - aggregate GPS from media → location (network-bound)
    this.registerQueue(IMPORT_QUEUES.GPS_ENRICHMENT, hw.gpsEnrichmentWorkers, this.handleGpsEnrichmentJob.bind(this) as JobHandler);

    // Live photo detection - match image/video pairs
    this.registerQueue(IMPORT_QUEUES.LIVE_PHOTO, hw.livePhotoWorkers, this.handleLivePhotoJob.bind(this) as JobHandler);

    // SRT telemetry - link DJI telemetry files to videos
    this.registerQueue(IMPORT_QUEUES.SRT_TELEMETRY, hw.srtTelemetryWorkers, this.handleSrtTelemetryJob.bind(this) as JobHandler);

    // Location stats - recalculate media counts, date ranges
    this.registerQueue(IMPORT_QUEUES.LOCATION_STATS, hw.locationStatsWorkers, this.handleLocationStatsJob.bind(this) as JobHandler);

    // BagIt manifest updates - RFC 8493 compliance
    this.registerQueue(IMPORT_QUEUES.BAGIT, hw.bagitWorkers, this.handleBagItJob.bind(this) as JobHandler);

    // Log configuration
    logger.info('JobWorker', 'Queue configuration (hardware-scaled)', {
      // Per-file
      exifTool: hw.exifToolWorkers,
      ffprobe: hw.ffprobeWorkers,
      thumbnail: hw.thumbnailWorkers,
      videoProxy: hw.videoProxyWorkers,
      // Per-location
      gpsEnrichment: hw.gpsEnrichmentWorkers,
      livePhoto: hw.livePhotoWorkers,
      srtTelemetry: hw.srtTelemetryWorkers,
      locationStats: hw.locationStatsWorkers,
      bagit: hw.bagitWorkers,
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
      // Check if we're shutting down (database closed, etc.)
      if (!this.isRunning) {
        return; // Silent exit during shutdown
      }
      const errorMsg = error instanceof Error ? error.message : String(error);
      // Only log if there's an actual error message (not undefined during shutdown)
      if (errorMsg && errorMsg !== 'undefined') {
        logger.error('JobWorker', 'Poll error', undefined, { error: errorMsg });
        metrics.incrementCounter(MetricNames.ERRORS_COUNT, 1, { source: 'job_worker_poll' });
      }
    }

    // Don't schedule next poll if we're stopping
    if (!this.isRunning) {
      return;
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
      const failResult = await this.jobQueue.fail(job.jobId, errorMsg);

      this.emit('job:error', { queue: queueName, jobId: job.jobId, error: errorMsg });

      // Emit dead letter event if job was moved to DLQ (for UI notification)
      if (failResult.movedToDeadLetter) {
        this.emit('job:deadLetter', {
          jobId: failResult.jobId,
          queue: failResult.queue,
          error: failResult.error,
          attempts: failResult.attempts,
          payload: failResult.payload,
          timestamp: new Date().toISOString(),
        });
      }
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
   *
   * OPT-085: Fixed to use generateAllSizes() for proper 400/800/1920 thumbnails
   * Previous bug: Called deprecated generateThumbnail() which only created 256px
   *
   * OPT-085 Part 2: Videos need poster frame extraction first
   * Sharp cannot process video files - must extract frame with FFmpeg first
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

    // OPT-085: For videos, extract a poster frame first since Sharp can't process video files
    let sourceForThumbnail = payload.archivePath;
    let posterPath: string | null = null;

    if (payload.mediaType === 'video') {
      const { FFmpegService } = await import('./ffmpeg-service');
      const ffmpegService = new FFmpegService();

      // Extract poster frame at 1 second mark (or start for very short videos)
      posterPath = mediaPathService.getPosterPath(payload.hash);

      // Ensure poster bucket directory exists
      await mediaPathService.ensureBucketDir(
        mediaPathService.getPosterDir(),
        payload.hash
      );

      try {
        await ffmpegService.extractFrame(payload.archivePath, posterPath, 1, 1920);
        sourceForThumbnail = posterPath;
        logger.info('JobWorker', 'Extracted video poster frame', {
          hash: payload.hash.slice(0, 12),
          posterPath,
        });
      } catch (error) {
        // If frame extraction fails, try at 0 seconds (start of video)
        try {
          await ffmpegService.extractFrame(payload.archivePath, posterPath, 0, 1920);
          sourceForThumbnail = posterPath;
          logger.warn('JobWorker', 'Extracted video poster at 0s (1s failed)', {
            hash: payload.hash.slice(0, 12),
          });
        } catch (fallbackError) {
          logger.error('JobWorker', 'Failed to extract video poster frame', undefined, {
            hash: payload.hash.slice(0, 12),
            error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
          });
          // Return empty paths - thumbnails will be missing but import continues
          return { paths: { sm: '', lg: '', preview: undefined } };
        }
      }
    }

    // OPT-085: Generate all three thumbnail sizes (400px, 800px, 1920px)
    // Previously called generateThumbnail() which only created 256px legacy thumbnail
    const thumbResult = await thumbnailService.generateAllSizes(
      sourceForThumbnail,
      payload.hash
    );

    // Build paths object from actual generated thumbnails
    const paths = {
      sm: thumbResult.thumb_sm ?? mediaPathService.getThumbnailPath(payload.hash, 400),
      lg: thumbResult.thumb_lg ?? mediaPathService.getThumbnailPath(payload.hash, 800),
      preview: thumbResult.preview ?? undefined,
    };

    // Update database with thumbnail paths
    if (payload.mediaType === 'image') {
      await this.db
        .updateTable('imgs')
        .set({
          thumb_path_sm: thumbResult.thumb_sm,
          thumb_path_lg: thumbResult.thumb_lg,
          preview_path: thumbResult.preview,
        })
        .where('imghash', '=', payload.hash)
        .execute();
    } else if (payload.mediaType === 'video') {
      await this.db
        .updateTable('vids')
        .set({
          thumb_path_sm: thumbResult.thumb_sm,
          thumb_path_lg: thumbResult.thumb_lg,
          preview_path: thumbResult.preview,
          poster_extracted: 1,
          // Also store the poster path in thumb_path for legacy compatibility
          thumb_path: posterPath,
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
   *
   * OPT-085: Fixed to pass rotation to generateProxy() for correct aspect ratio
   * Previous bug: Missing rotation caused portrait videos to be scaled incorrectly
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

    // Get video metadata for proxy generation (includes rotation)
    const ffmpegService = new FFmpegService();
    const metadata = await ffmpegService.extractMetadata(payload.archivePath);

    // OPT-085: Pass rotation for correct aspect ratio on portrait videos
    // Mobile devices record portrait as landscape pixels + rotation metadata
    const result = await generateProxy(
      this.db,
      archiveSetting?.value || '',
      payload.hash,
      payload.archivePath,
      {
        width: metadata.width ?? 1920,
        height: metadata.height ?? 1080,
        rotation: metadata.rotation,  // OPT-085: Critical for portrait video aspect ratio
      }
    );
    const proxyPath = result.proxyPath ?? null;

    if (proxyPath) {
      // Emit event
      emit('asset:proxy-ready', { hash: payload.hash, proxyPath });
    }

    return { proxyPath };
  }

  // ============ Per-Location Job Handlers ============

  /**
   * GPS Enrichment job - aggregate GPS from media and enrich location
   *
   * Per Import Spec v2.0:
   * - Finds media with GPS coordinates for this location
   * - Selects best GPS source (highest confidence)
   * - Enriches location with GPS + address + regions
   *
   * Priority: map_confirmed > photo_exif > video_exif
   */
  private async handleGpsEnrichmentJob(
    payload: { locid: string },
    emit: (event: string, data: unknown) => void
  ): Promise<{ enriched: boolean; source: string | null }> {
    const { locid } = payload;

    // Check if location already has GPS
    const location = await this.db
      .selectFrom('locs')
      .select(['locid', 'gps_lat', 'gps_lng', 'gps_source'])
      .where('locid', '=', locid)
      .executeTakeFirst();

    if (!location) {
      logger.warn('JobWorker', 'GPS enrichment: location not found', { locid });
      return { enriched: false, source: null };
    }

    // Skip if location already has map-confirmed GPS (highest confidence)
    if (location.gps_source === 'user_map_click') {
      logger.info('JobWorker', 'GPS enrichment: skipping, already map-confirmed', { locid });
      return { enriched: false, source: 'already_confirmed' };
    }

    // Find best GPS from imported media
    // Priority: images with GPS > videos with GPS (images typically more accurate)
    const imagesWithGps = await this.db
      .selectFrom('imgs')
      .select(['imghash', 'meta_gps_lat', 'meta_gps_lng', 'meta_date_taken'])
      .where('locid', '=', locid)
      .where('meta_gps_lat', 'is not', null)
      .where('meta_gps_lng', 'is not', null)
      .orderBy('meta_date_taken', 'asc') // Earliest photo first
      .limit(1)
      .execute();

    const videosWithGps = await this.db
      .selectFrom('vids')
      .select(['vidhash', 'meta_gps_lat', 'meta_gps_lng', 'meta_date_taken'])
      .where('locid', '=', locid)
      .where('meta_gps_lat', 'is not', null)
      .where('meta_gps_lng', 'is not', null)
      .orderBy('meta_date_taken', 'asc')
      .limit(1)
      .execute();

    // Select best source (prefer images)
    let gpsSource: { lat: number; lng: number; type: 'image' | 'video' } | null = null;

    if (imagesWithGps.length > 0) {
      const img = imagesWithGps[0];
      gpsSource = {
        lat: img.meta_gps_lat!,
        lng: img.meta_gps_lng!,
        type: 'image',
      };
    } else if (videosWithGps.length > 0) {
      const vid = videosWithGps[0];
      gpsSource = {
        lat: vid.meta_gps_lat!,
        lng: vid.meta_gps_lng!,
        type: 'video',
      };
    }

    if (!gpsSource) {
      logger.info('JobWorker', 'GPS enrichment: no media with GPS found', { locid });
      return { enriched: false, source: null };
    }

    // Only enrich if location has no GPS, or new source is higher confidence
    const shouldEnrich = !location.gps_lat || !location.gps_lng ||
      (location.gps_source !== 'media_gps' && location.gps_source !== 'user_map_click');

    if (!shouldEnrich) {
      logger.info('JobWorker', 'GPS enrichment: location already has GPS from equal/higher source', { locid });
      return { enriched: false, source: 'already_enriched' };
    }

    // Use LocationEnrichmentService for full enrichment pipeline
    try {
      const { LocationEnrichmentService } = await import('./location-enrichment-service');
      const { GeocodingService } = await import('./geocoding-service');

      const geocodingService = new GeocodingService(this.db);
      const enrichmentService = new LocationEnrichmentService(this.db, geocodingService);

      const result = await enrichmentService.enrichFromGPS(locid, {
        lat: gpsSource.lat,
        lng: gpsSource.lng,
        source: 'media_gps',
      });

      if (result.success) {
        logger.info('JobWorker', 'GPS enrichment complete', {
          locid,
          source: gpsSource.type,
          address: result.updated.address,
          regions: result.updated.regions,
        });
        // OPT-087: Emit gps-enriched event so frontend (map) can update
        emit('location:gps-enriched', {
          locid,
          lat: gpsSource.lat,
          lng: gpsSource.lng,
          source: gpsSource.type,
        });
        return { enriched: true, source: gpsSource.type };
      } else {
        logger.warn('JobWorker', 'GPS enrichment failed', { locid, error: result.error });
        return { enriched: false, source: null };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('JobWorker', 'GPS enrichment error', undefined, { locid, error: errorMsg });
      throw error; // Re-throw to trigger retry
    }
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
   * SRT Telemetry job - link DJI telemetry files to matching videos
   *
   * Per Import Spec v2.0:
   * - Finds .srt files imported for this location
   * - Parses DJI telemetry format (GPS, altitude, speed)
   * - Links telemetry to matching video by filename
   * - Hides .srt files after processing
   */
  private async handleSrtTelemetryJob(
    payload: { locid: string },
    emit: (event: string, data: unknown) => void
  ): Promise<{ filesLinked: number; filesHidden: number }> {
    const { locid } = payload;

    // Import SRT telemetry service
    const { isDjiTelemetry, parseDjiSrt, findMatchingVideoHash } = await import('./srt-telemetry-service');
    const fs = await import('fs/promises');
    const path = await import('path');

    // Get all documents for this location that could be SRT files
    const docs = await this.db
      .selectFrom('docs')
      .select(['dochash', 'docnamo', 'docloc', 'hidden'])
      .where('locid', '=', locid)
      .where('hidden', '=', 0)
      .execute();

    // Filter to .srt files
    const srtDocs = docs.filter(doc =>
      doc.docnamo.toLowerCase().endsWith('.srt')
    );

    if (srtDocs.length === 0) {
      logger.info('JobWorker', 'SRT telemetry: no SRT files found', { locid });
      return { filesLinked: 0, filesHidden: 0 };
    }

    // Get all videos for this location to match against
    const videos = await this.db
      .selectFrom('vids')
      .select(['vidhash', 'vidnamo'])
      .where('locid', '=', locid)
      .execute();

    let filesLinked = 0;
    let filesHidden = 0;

    for (const doc of srtDocs) {
      try {
        // Read and check if it's DJI telemetry
        const content = await fs.default.readFile(doc.docloc, 'utf-8');

        if (!isDjiTelemetry(content)) {
          logger.debug('JobWorker', 'SRT file is not DJI telemetry', { file: doc.docnamo });
          continue;
        }

        // Parse the telemetry
        const telemetry = parseDjiSrt(content, doc.docnamo);

        // Find matching video
        const matchingVideoHash = findMatchingVideoHash(doc.docnamo, videos);

        if (matchingVideoHash) {
          // Link telemetry to video
          await this.db
            .updateTable('vids')
            .set({ srt_telemetry: JSON.stringify(telemetry) })
            .where('vidhash', '=', matchingVideoHash)
            .execute();

          filesLinked++;
          logger.info('JobWorker', 'SRT telemetry linked to video', {
            srt: doc.docnamo,
            video: matchingVideoHash.slice(0, 12),
            frames: telemetry.frames,
          });
        }

        // Hide the SRT file (it's metadata, not user-visible content)
        await this.db
          .updateTable('docs')
          .set({
            hidden: 1,
            hidden_reason: 'srt_telemetry',
          })
          .where('dochash', '=', doc.dochash)
          .execute();

        filesHidden++;

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.warn('JobWorker', 'SRT telemetry processing failed', {
          file: doc.docnamo,
          error: errorMsg,
        });
        // Continue with other files, don't fail entire job
      }
    }

    logger.info('JobWorker', 'SRT telemetry job complete', {
      locid,
      filesLinked,
      filesHidden,
    });

    return { filesLinked, filesHidden };
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
   *
   * Per Import Spec v2.0:
   * - Recalculates media counts (images, videos, documents, maps)
   * - Calculates date range from media metadata
   * - Updates location record with aggregated stats
   *
   * This ensures accurate counts after import, even if individual file
   * operations failed or were retried.
   */
  private async handleLocationStatsJob(
    payload: { locid: string },
    emit: (event: string, data: unknown) => void
  ): Promise<{
    stats: {
      imgCount: number;
      vidCount: number;
      docCount: number;
      mapCount: number;
      earliestDate: string | null;
      latestDate: string | null;
      totalSizeBytes: number;
    };
  }> {
    const { locid } = payload;

    // Count images (excluding hidden)
    const imgResult = await this.db
      .selectFrom('imgs')
      .select([
        eb => eb.fn.count<number>('imghash').as('count'),
        eb => eb.fn.sum<number>('file_size_bytes').as('totalSize'),
        eb => eb.fn.min<string>('meta_date_taken').as('earliestDate'),
        eb => eb.fn.max<string>('meta_date_taken').as('latestDate'),
      ])
      .where('locid', '=', locid)
      .where('hidden', '=', 0)
      .executeTakeFirst();

    // Count videos (excluding hidden)
    const vidResult = await this.db
      .selectFrom('vids')
      .select([
        eb => eb.fn.count<number>('vidhash').as('count'),
        eb => eb.fn.sum<number>('file_size_bytes').as('totalSize'),
        eb => eb.fn.min<string>('meta_date_taken').as('earliestDate'),
        eb => eb.fn.max<string>('meta_date_taken').as('latestDate'),
      ])
      .where('locid', '=', locid)
      .where('hidden', '=', 0)
      .executeTakeFirst();

    // Count documents (excluding hidden)
    const docResult = await this.db
      .selectFrom('docs')
      .select([
        eb => eb.fn.count<number>('dochash').as('count'),
        eb => eb.fn.sum<number>('file_size_bytes').as('totalSize'),
      ])
      .where('locid', '=', locid)
      .where('hidden', '=', 0)
      .executeTakeFirst();

    // Count maps
    const mapResult = await this.db
      .selectFrom('maps')
      .select([
        eb => eb.fn.count<number>('maphash').as('count'),
        eb => eb.fn.sum<number>('file_size_bytes').as('totalSize'),
      ])
      .where('locid', '=', locid)
      .executeTakeFirst();

    // Calculate aggregated stats
    const imgCount = Number(imgResult?.count ?? 0);
    const vidCount = Number(vidResult?.count ?? 0);
    const docCount = Number(docResult?.count ?? 0);
    const mapCount = Number(mapResult?.count ?? 0);

    const totalSizeBytes =
      Number(imgResult?.totalSize ?? 0) +
      Number(vidResult?.totalSize ?? 0) +
      Number(docResult?.totalSize ?? 0) +
      Number(mapResult?.totalSize ?? 0);

    // Calculate date range across all media types
    const allDates = [
      imgResult?.earliestDate,
      imgResult?.latestDate,
      vidResult?.earliestDate,
      vidResult?.latestDate,
    ].filter((d): d is string => d !== null && d !== undefined);

    const earliestDate = allDates.length > 0
      ? allDates.reduce((a, b) => (a < b ? a : b))
      : null;
    const latestDate = allDates.length > 0
      ? allDates.reduce((a, b) => (a > b ? a : b))
      : null;

    // Update location record with stats
    await this.db
      .updateTable('locs')
      .set({
        img_count: imgCount,
        vid_count: vidCount,
        doc_count: docCount,
        map_count: mapCount,
        total_size_bytes: totalSizeBytes,
        earliest_media_date: earliestDate,
        latest_media_date: latestDate,
        stats_updated_at: new Date().toISOString(),
      })
      .where('locid', '=', locid)
      .execute();

    const stats = {
      imgCount,
      vidCount,
      docCount,
      mapCount,
      earliestDate,
      latestDate,
      totalSizeBytes,
    };

    logger.info('JobWorker', 'Location stats recalculated', {
      locid,
      ...stats,
    });

    return { stats };
  }

  // ============ Helper Methods ============

  /**
   * Update media metadata in database
   * OPT-087: Fixed GPS extraction to use correct nested path from ExifToolService
   */
  private async updateMediaMetadata(hash: string, mediaType: string, metadata: unknown): Promise<void> {
    // OPT-087: ExifToolService returns { gps: { lat, lng, altitude? } | null }
    // Previously used GPSLatitude/GPSLongitude which don't exist in the returned object
    const meta = metadata as {
      width?: number;
      height?: number;
      dateTaken?: string;
      cameraMake?: string;
      cameraModel?: string;
      gps?: { lat: number; lng: number; altitude?: number } | null;
      rawExif?: string;
    };
    const metaJson = JSON.stringify(metadata);

    switch (mediaType) {
      case 'image':
        await this.db
          .updateTable('imgs')
          .set({
            meta_exiftool: metaJson,
            meta_width: meta.width ?? null,
            meta_height: meta.height ?? null,
            meta_date_taken: meta.dateTaken ?? null,
            meta_camera_make: meta.cameraMake ?? null,
            meta_camera_model: meta.cameraModel ?? null,
            // OPT-087: Fixed GPS path - use nested gps object
            meta_gps_lat: meta.gps?.lat ?? null,
            meta_gps_lng: meta.gps?.lng ?? null,
          })
          .where('imghash', '=', hash)
          .execute();
        break;

      case 'video':
        await this.db
          .updateTable('vids')
          .set({
            meta_exiftool: metaJson,
            meta_date_taken: meta.dateTaken ?? null,
            // OPT-087: Fixed GPS path - use nested gps object
            meta_gps_lat: meta.gps?.lat ?? null,
            meta_gps_lng: meta.gps?.lng ?? null,
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
