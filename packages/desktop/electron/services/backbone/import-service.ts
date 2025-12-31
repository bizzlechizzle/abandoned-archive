/**
 * Import Service - Backbone Wrapper for wake-n-blake runImport()
 *
 * Provides the complete import pipeline through wake-n-blake's runImport().
 * This service replaces the scanner/hasher/copier/validator chain with a
 * single call that handles:
 * - File scanning and filtering
 * - Device detection (camera, USB, network)
 * - BLAKE3 hashing with dedup
 * - Verified copy with integrity check
 * - XMP sidecar generation (PREMIS custody chain)
 *
 * Architecture:
 * - wake-n-blake handles file operations (scan → hash → copy → validate → sidecar)
 * - This service integrates with abandoned-archive's database and job queue
 * - XMP sidecars are source of truth; database is populated FROM XMP
 */

import {
  runImport,
  type ImportOptions as WnbImportOptions,
  type ImportSession,
  type ImportFileState,
  type FileCategory,
} from 'wake-n-blake';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type { Kysely } from 'kysely';
import type { Database } from '../../main/database.types';
import { getDispatchClient, type JobSubmission } from '@aa/services';
import { generateId } from '../../main/ipc-validation.js';
import { getLogger } from '../logger-service.js';
import { getMetricsCollector, MetricNames } from '../monitoring/metrics-collector.js';
import { acquireLocationLock, releaseLocationLock } from '../import/location-lock.js';

/**
 * Find the common parent directory of multiple paths
 * Used when user selects multiple files via file picker
 */
function findCommonParent(paths: string[]): string {
  if (paths.length === 0) return '.';
  if (paths.length === 1) return paths[0];

  // Normalize and split all paths
  const allParts = paths.map(p => path.resolve(p).split(path.sep).filter(Boolean));

  // Find common prefix
  const commonParts: string[] = [];
  const minLength = Math.min(...allParts.map(parts => parts.length));

  for (let i = 0; i < minLength; i++) {
    const part = allParts[0][i];
    if (allParts.every(parts => parts[i] === part)) {
      commonParts.push(part);
    } else {
      break;
    }
  }

  return path.sep + commonParts.join(path.sep);
}

/**
 * Check if a path is a directory
 */
function isDirectory(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

const logger = getLogger();
const metrics = getMetricsCollector();

/**
 * Location info for import destination
 * Matches the LocationInfo from import/types.ts
 */
export interface ImportLocation {
  locid: string;
  subid: string | null;
  address_state: string | null;  // US state code for folder structure (from locs table)
}

/**
 * Import options for backbone import
 */
export interface BackboneImportOptions {
  /**
   * Source paths to import (files or directories)
   */
  sourcePaths: string[];

  /**
   * Target location for imported files
   */
  location: ImportLocation;

  /**
   * Archive base path
   */
  archivePath: string;

  /**
   * User info for activity tracking
   */
  user?: {
    userId: string;
    username: string;
  };

  /**
   * Progress callback
   */
  onProgress?: (progress: BackboneImportProgress) => void;

  /**
   * Abort signal for cancellation
   */
  signal?: AbortSignal;

  /**
   * Batch name for grouping imports
   */
  batchName?: string;

  /**
   * Enable dry run (no file operations)
   */
  dryRun?: boolean;
}

/**
 * Import progress event
 */
export interface BackboneImportProgress {
  sessionId: string;
  status: string;
  percent: number;
  currentFile: string;
  filesProcessed: number;
  filesTotal: number;
  bytesProcessed: number;
  bytesTotal: number;
  duplicatesFound: number;
  errorsFound: number;
  stepName?: string;  // Current pipeline step name (e.g., 'hashing', 'copying')
}

/**
 * Import result
 */
export interface BackboneImportResult {
  sessionId: string;
  status: 'completed' | 'cancelled' | 'failed';
  totalFiles: number;
  processedFiles: number;
  duplicateFiles: number;
  errorFiles: number;
  totalBytes: number;
  durationMs: number;
  error?: string;
}

/**
 * Media type based on file category
 */
type MediaType = 'image' | 'video' | 'document' | 'map';

/**
 * Import Service using wake-n-blake's runImport()
 *
 * NOTE: As of dispatch integration, all post-import jobs are submitted
 * to dispatch hub instead of local job queue.
 */
export class ImportService {
  // Use getter to get fresh client each time (client may be recreated during auth detection)
  private get dispatchClient() {
    return getDispatchClient();
  }

  constructor(private db: Kysely<Database>) {
    // NOTE: Local job queue disabled - using dispatch hub
    // this.jobQueue = new JobQueue(db);
  }

  /**
   * Run import using wake-n-blake's complete pipeline
   *
   * This replaces the old scanner/hasher/copier/validator chain with a single
   * call to runImport() that handles everything.
   */
  async import(options: BackboneImportOptions): Promise<BackboneImportResult> {
    const sessionId = generateId();
    const startTime = Date.now();
    const { location, archivePath, sourcePaths, user, signal, batchName, dryRun } = options;

    // Acquire location lock
    try {
      await acquireLocationLock(location.locid, sessionId, {
        waitIfLocked: false,
        user: user?.username,
      });
    } catch (lockError) {
      return {
        sessionId,
        status: 'failed',
        totalFiles: 0,
        processedFiles: 0,
        duplicateFiles: 0,
        errorFiles: 0,
        totalBytes: 0,
        durationMs: Date.now() - startTime,
        error: lockError instanceof Error ? lockError.message : 'Location is currently being imported to',
      };
    }

    logger.info('ImportService', 'Backbone import started', {
      sessionId,
      locationId: location.locid,
      pathCount: sourcePaths.length,
    });

    metrics.incrementCounter(MetricNames.IMPORT_STARTED, 1, { locationId: location.locid });

    // Get existing hashes from database for dedup
    const existingHashes = await this.getExistingHashes(location.locid);

    // Track finalized files for post-processing
    const finalizedFiles: Array<{
      hash: string;
      archivePath: string;
      mediaType: MediaType;
      originalPath: string;
    }> = [];

    let session: ImportSession;
    let error: string | undefined;

    // Build a set of allowed file paths for filtering (when specific files are selected)
    const allowedFilePaths = new Set<string>();
    let filterToSpecificFiles = false;

    try {
      // Determine source path based on what was passed
      let sourcePath: string;

      if (sourcePaths.length === 0) {
        throw new Error('No source paths provided');
      } else if (sourcePaths.length === 1) {
        // Single path - could be file or directory
        sourcePath = sourcePaths[0];
        if (!isDirectory(sourcePath)) {
          // Single file - use parent directory, filter to just this file
          filterToSpecificFiles = true;
          allowedFilePaths.add(path.resolve(sourcePath));
          sourcePath = path.dirname(sourcePath);
          logger.info('ImportService', 'Single file import - using parent directory', {
            file: sourcePaths[0],
            sourceDir: sourcePath,
          });
        }
      } else {
        // Multiple paths - find common parent and filter to selected files
        const firstIsDir = isDirectory(sourcePaths[0]);

        if (firstIsDir) {
          // Multiple directories selected - use first directory only
          // This is intentional: batch import processes one directory at a time
          // Users can run multiple imports sequentially if needed
          sourcePath = sourcePaths[0];
          logger.warn('ImportService', 'Multiple directories passed - using first only', {
            count: sourcePaths.length,
            first: sourcePaths[0],
          });
        } else {
          // Multiple files - find common parent and filter
          sourcePath = findCommonParent(sourcePaths);
          filterToSpecificFiles = true;

          for (const p of sourcePaths) {
            allowedFilePaths.add(path.resolve(p));
          }

          logger.info('ImportService', 'Multiple file import - using common parent', {
            fileCount: sourcePaths.length,
            commonParent: sourcePath,
          });
        }
      }

      // Build destination path for this location
      const destPath = this.buildLocationPath(archivePath, location);

      // Run wake-n-blake import pipeline
      session = await runImport(sourcePath, destPath, {
        // Enable all features
        verify: true,
        dedup: true,
        sidecar: true,
        detectDevice: true,
        dryRun: dryRun ?? false,
        batch: batchName,

        // Use existing hashes from database for dedup
        existingHashes,

        // Custom path builder for location-based folder structure
        pathBuilder: (file: ImportFileState, hash: string) => this.buildFilePath(archivePath, location, file, hash),

        // Progress callback
        onProgress: (wnbSession: ImportSession) => {
          // Use wake-n-blake's detailed progress tracking
          // currentFile from session's built-in tracking or fallback to file list
          const currentFile = wnbSession.currentFile ||
            wnbSession.files.find(f => f.status === 'pending' || f.status === 'hashed')?.path || '';

          // Count files at each stage for accurate progress display
          const hashingCount = wnbSession.files.filter(f => f.status === 'hashed' || f.status === 'copied' || f.status === 'validated').length;
          const copyingCount = wnbSession.files.filter(f => f.status === 'copied' || f.status === 'validated').length;
          const validatedCount = wnbSession.files.filter(f => f.status === 'validated').length;

          // Use stage-appropriate count based on current status
          let stageProcessed = 0;
          switch (wnbSession.status) {
            case 'hashing': stageProcessed = hashingCount; break;
            case 'copying': stageProcessed = copyingCount; break;
            case 'validating': stageProcessed = validatedCount; break;
            default: stageProcessed = wnbSession.processedFiles;
          }

          options.onProgress?.({
            sessionId,
            status: wnbSession.status,
            // Use wake-n-blake's weighted percent if available, fallback to our calculation
            percent: wnbSession.overallPercent ?? this.calculatePercent(wnbSession),
            currentFile,
            filesProcessed: stageProcessed,
            filesTotal: wnbSession.totalFiles,
            bytesProcessed: wnbSession.processedBytes || 0,
            bytesTotal: wnbSession.totalBytes || 0,
            duplicatesFound: wnbSession.duplicateFiles,
            errorsFound: wnbSession.errorFiles,
            // Pass step info for UI
            stepName: wnbSession.stepName,
          });
        },

        // Per-file callback for database integration
        onFile: async (file, action) => {
          // Filter to specific files if user selected individual files (not a folder)
          if (filterToSpecificFiles) {
            const resolvedPath = path.resolve(file.path);
            if (!allowedFilePaths.has(resolvedPath)) {
              // Skip this file - it wasn't in the user's selection
              // Mark as skipped so wake-n-blake doesn't process it further
              if (action === 'scanned' || action === 'pending') {
                file.status = 'skipped' as ImportFileState['status'];
              }
              return;
            }
          }

          if (action === 'validated' && file.destPath && file.hash) {
            try {
              // Determine media type from file category
              const mediaType = this.getMediaType(file);

              // Insert into database
              await this.insertMediaRecord(file, location, user);

              // Map XMP sidecar to database tables
              if (file.sidecarPath) {
                // Note: XmpMapperService handles device fingerprints and custody events
                // For now, we skip XMP mapping since it requires raw better-sqlite3
                // The sidecar is already written; DB will be updated via job queue
              }

              // Queue thumbnail job
              await this.queueThumbnailJob(file, location);

              // Track for post-processing
              finalizedFiles.push({
                hash: file.hash,
                archivePath: file.destPath,
                mediaType,
                originalPath: file.path,
              });
            } catch (err) {
              logger.error('ImportService', 'Failed to process validated file', err as Error, {
                sessionId,
                hash: file.hash,
                path: file.destPath,
              });
            }
          }
        },
      } as WnbImportOptions);

      // Check for cancellation
      if (signal?.aborted) {
        error = 'Import cancelled';
        logger.warn('ImportService', 'Import cancelled', { sessionId });
      }

    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      logger.error('ImportService', 'Import failed', err as Error, { sessionId });
      metrics.incrementCounter(MetricNames.IMPORT_FAILED, 1, { locationId: location.locid });

      return {
        sessionId,
        status: 'failed',
        totalFiles: 0,
        processedFiles: 0,
        duplicateFiles: 0,
        errorFiles: 0,
        totalBytes: 0,
        durationMs: Date.now() - startTime,
        error,
      };
    } finally {
      releaseLocationLock(location.locid, sessionId);
    }

    // Post-processing: queue location-level jobs
    if (finalizedFiles.length > 0) {
      await this.queueLocationJobs(location, finalizedFiles, user);
      await this.autoSetHeroImage(location, finalizedFiles);
    }

    // Create import record
    if (session.status === 'completed' && finalizedFiles.length > 0) {
      await this.createImportRecord(sessionId, location, finalizedFiles, user);
    }

    const durationMs = Date.now() - startTime;

    if (session.status === 'completed') {
      metrics.incrementCounter(MetricNames.IMPORT_COMPLETED, 1, { locationId: location.locid });
      metrics.incrementCounter(MetricNames.IMPORT_FILES_PROCESSED, session.processedFiles, { sessionId });
    }

    logger.info('ImportService', 'Backbone import completed', {
      sessionId,
      status: session.status,
      totalFiles: session.totalFiles,
      processedFiles: session.processedFiles,
      duplicateFiles: session.duplicateFiles,
      errorFiles: session.errorFiles,
      durationMs,
    });

    return {
      sessionId,
      status: error ? 'failed' : signal?.aborted ? 'cancelled' : 'completed',
      totalFiles: session.totalFiles,
      processedFiles: session.processedFiles,
      duplicateFiles: session.duplicateFiles,
      errorFiles: session.errorFiles,
      totalBytes: 0, // Not tracked
      durationMs,
      error,
    };
  }

  /**
   * Build the base path for a location's data directory
   */
  private buildLocationPath(archivePath: string, location: ImportLocation): string {
    const state = location.address_state || 'XX';  // Fallback for unknown state
    return path.join(archivePath, 'locations', state, location.locid, 'data');
  }

  /**
   * Build the full file path for an imported file
   * Uses location-based folder structure: /archive/locations/{state}/{locid}/data/{type}/{hash}.{ext}
   */
  private buildFilePath(
    archivePath: string,
    location: ImportLocation,
    file: ImportFileState,
    hash: string
  ): string {
    const ext = path.extname(file.path);
    const mediaType = this.getMediaType(file);
    const typeFolder = this.getTypeFolder(mediaType);
    const state = location.address_state || 'XX';  // Fallback for unknown state

    return path.join(
      archivePath,
      'locations',
      state,
      location.locid,
      'data',
      typeFolder,
      `${hash}${ext}`
    );
  }

  /**
   * Get the folder name for a media type
   */
  private getTypeFolder(mediaType: MediaType): string {
    switch (mediaType) {
      case 'image': return 'org-images';
      case 'video': return 'org-video';
      case 'document': return 'org-documents';
      case 'map': return 'org-maps';
    }
  }

  /**
   * Map wake-n-blake FileCategory to desktop MediaType
   *
   * Wake-n-blake is the source of truth for file categorization.
   * It uses magic bytes + extension analysis to determine file type.
   */
  private getMediaType(file: ImportFileState): MediaType {
    const category = file.category as FileCategory | undefined;

    switch (category) {
      // Direct mappings
      case 'image':
        return 'image';
      case 'video':
        return 'video';
      case 'geospatial':
        return 'map';

      // All other categories go to documents
      case 'document':
      case 'archive':
      case 'audio':
      case 'ebook':
      case 'email':
      case 'font':
      case 'model3d':
      case 'calendar':
      case 'contact':
      case 'subtitle':
      case 'executable':
      case 'data':
      case 'other':
      case 'sidecar':
        return 'document';

      default:
        // Fallback for unknown categories - log and default to document
        logger.warn('ImportService', 'Unknown file category from wake-n-blake', {
          path: file.path,
          category: category ?? 'undefined',
        });
        return 'document';
    }
  }

  /**
   * Calculate progress percentage from session state
   */
  private calculatePercent(session: ImportSession): number {
    if (session.totalFiles === 0) return 0;

    switch (session.status) {
      case 'scanning': return 5;
      case 'hashing': return 10 + (session.processedFiles / session.totalFiles) * 30;
      case 'copying': return 40 + (session.processedFiles / session.totalFiles) * 40;
      case 'validating': return 80 + (session.processedFiles / session.totalFiles) * 15;
      case 'completed': return 100;
      default: return 0;
    }
  }

  /**
   * Get existing hashes from database for dedup
   */
  private async getExistingHashes(locid: string): Promise<Set<string>> {
    const hashes = new Set<string>();

    // Query all media tables for hashes in this location
    const [imgs, vids, docs, maps] = await Promise.all([
      this.db.selectFrom('imgs').select('imghash').where('locid', '=', locid).execute(),
      this.db.selectFrom('vids').select('vidhash').where('locid', '=', locid).execute(),
      this.db.selectFrom('docs').select('dochash').where('locid', '=', locid).execute(),
      this.db.selectFrom('maps').select('maphash').where('locid', '=', locid).execute(),
    ]);

    for (const row of imgs) hashes.add(row.imghash);
    for (const row of vids) hashes.add(row.vidhash);
    for (const row of docs) hashes.add(row.dochash);
    for (const row of maps) hashes.add(row.maphash);

    return hashes;
  }

  /**
   * Insert a media record into the database
   */
  private async insertMediaRecord(
    file: ImportFileState,
    location: ImportLocation,
    user?: { userId: string; username: string }
  ): Promise<void> {
    if (!file.destPath || !file.hash) return;

    const now = new Date().toISOString();
    const mediaType = this.getMediaType(file);
    const ext = path.extname(file.path);
    const archiveName = `${file.hashShort || file.hash.slice(0, 16)}${ext}`;

    switch (mediaType) {
      case 'image':
        await this.db.insertInto('imgs').values({
          imghash: file.hash,
          imgnam: archiveName,
          imgnamo: file.originalName || path.basename(file.path),
          imgloc: file.destPath,
          imgloco: file.path,
          locid: location.locid,
          subid: location.subid,
          auth_imp: user?.username ?? null,
          imgadd: now,
          meta_exiftool: null,
          meta_width: null,
          meta_height: null,
          meta_date_taken: null,
          meta_camera_make: null,
          meta_camera_model: null,
          meta_gps_lat: null,
          meta_gps_lng: null,
          thumb_path: null,
          preview_path: null,
          preview_extracted: 0,
          thumb_path_sm: null,
          thumb_path_lg: null,
          xmp_synced: file.sidecarPath ? 1 : 0,
          xmp_modified_at: file.sidecarPath ? now : null,
          hidden: 0,
          hidden_reason: null,
          is_live_photo: 0,
          imported_by_id: user?.userId ?? null,
          imported_by: user?.username ?? null,
          media_source: null,
          is_contributed: 0,
          contribution_source: null,
          preview_quality: null,
          file_size_bytes: file.size ?? null,
          extracted_from_web: 0,
          phash: null,  // Will be computed via job queue
        }).execute();
        break;

      case 'video':
        await this.db.insertInto('vids').values({
          vidhash: file.hash,
          vidnam: archiveName,
          vidnamo: file.originalName || path.basename(file.path),
          vidloc: file.destPath,
          vidloco: file.path,
          locid: location.locid,
          subid: location.subid,
          auth_imp: user?.username ?? null,
          vidadd: now,
          meta_ffmpeg: null,
          meta_exiftool: null,
          meta_duration: null,
          meta_width: null,
          meta_height: null,
          meta_codec: null,
          meta_fps: null,
          meta_date_taken: null,
          meta_gps_lat: null,
          meta_gps_lng: null,
          thumb_path: null,
          poster_extracted: 0,
          thumb_path_sm: null,
          thumb_path_lg: null,
          preview_path: null,
          xmp_synced: file.sidecarPath ? 1 : 0,
          xmp_modified_at: file.sidecarPath ? now : null,
          hidden: 0,
          hidden_reason: null,
          is_live_photo: 0,
          imported_by_id: user?.userId ?? null,
          imported_by: user?.username ?? null,
          media_source: null,
          is_contributed: 0,
          contribution_source: null,
          file_size_bytes: file.size ?? null,
          srt_telemetry: null,
          extracted_from_web: 0,
          needs_deinterlace: 0,
        }).execute();
        break;

      case 'document':
        await this.db.insertInto('docs').values({
          dochash: file.hash,
          docnam: archiveName,
          docnamo: file.originalName || path.basename(file.path),
          docloc: file.destPath,
          docloco: file.path,
          locid: location.locid,
          subid: location.subid,
          auth_imp: user?.username ?? null,
          docadd: now,
          meta_exiftool: null,
          meta_page_count: null,
          meta_author: null,
          meta_title: null,
          hidden: 0,
          hidden_reason: null,
          imported_by_id: user?.userId ?? null,
          imported_by: user?.username ?? null,
          media_source: null,
          is_contributed: 0,
          contribution_source: null,
          file_size_bytes: file.size ?? null,
        }).execute();
        break;

      case 'map':
        await this.db.insertInto('maps').values({
          maphash: file.hash,
          mapnam: archiveName,
          mapnamo: file.originalName || path.basename(file.path),
          maploc: file.destPath,
          maploco: file.path,
          locid: location.locid,
          subid: location.subid,
          auth_imp: user?.username ?? null,
          mapadd: now,
          meta_exiftool: null,
          meta_map: null,
          meta_gps_lat: null,
          meta_gps_lng: null,
          reference: null,
          map_states: null,
          map_verified: 0,
          thumb_path_sm: null,
          thumb_path_lg: null,
          preview_path: null,
          imported_by_id: user?.userId ?? null,
          imported_by: user?.username ?? null,
          media_source: null,
          file_size_bytes: file.size ?? null,
        }).execute();
        break;
    }
  }

  /**
   * Queue thumbnail generation job for a file
   *
   * Submits jobs to dispatch hub:
   * - Metadata extraction (national-treasure plugin)
   * - Thumbnail generation (shoemaker plugin)
   * - ML tagging (visual-buffet plugin)
   * - Video proxy (shoemaker plugin) for videos
   */
  private async queueThumbnailJob(file: ImportFileState, location: ImportLocation): Promise<void> {
    if (!file.destPath || !file.hash) return;

    const mediaType = this.getMediaType(file);
    if (mediaType !== 'image' && mediaType !== 'video') return;

    const baseOptions = {
      hash: file.hash,
      mediaType,
      locid: location.locid,
      subid: location.subid,
    };

    try {
      // 1. Metadata extraction (national-treasure)
      await this.dispatchClient.submitJob({
        type: 'metadata',
        plugin: 'national-treasure',
        priority: 'HIGH',
        data: {
          source: file.destPath,
          options: baseOptions,
        },
      });

      // 2. Thumbnail generation (shoemaker)
      await this.dispatchClient.submitJob({
        type: 'thumbnail',
        plugin: 'shoemaker',
        priority: 'HIGH',
        data: {
          source: file.destPath,
          options: {
            ...baseOptions,
            width: 400,
            height: 400,
            format: 'webp',
            quality: 80,
          },
        },
      });

      // 3. ML tagging (visual-buffet)
      await this.dispatchClient.submitJob({
        type: 'tag',
        plugin: 'visual-buffet',
        priority: 'BULK',
        data: {
          source: file.destPath,
          options: {
            ...baseOptions,
            plugins: ['ram_plus', 'siglip', 'florence2'],
          },
        },
      });

      // 4. Video-specific jobs
      if (mediaType === 'video') {
        // Video proxy generation (uses thumbnail type for derivative media)
        await this.dispatchClient.submitJob({
          type: 'thumbnail',
          plugin: 'shoemaker',
          priority: 'BULK',
          data: {
            source: file.destPath,
            options: baseOptions,
          },
        });
      }

      logger.debug('ImportService', `Submitted processing jobs to dispatch for ${file.hash.slice(0, 8)}...`);
    } catch (error) {
      logger.error('ImportService', `Failed to submit dispatch jobs: ${error}`);
    }
  }

  /**
   * Queue location-level jobs after all files are imported
   *
   * Submits jobs to dispatch hub:
   * - GPS enrichment (mapsh-pit plugin)
   * - Location stats (wake-n-blake plugin)
   * - BagIt manifest (wake-n-blake plugin)
   *
   * Note: Live Photo detection and SRT telemetry require dispatch plugins (not yet implemented)
   */
  private async queueLocationJobs(
    location: ImportLocation,
    files: Array<{ hash: string; mediaType: MediaType }>,
    _user?: { userId: string; username: string }
  ): Promise<void> {
    const { locid, subid } = location;
    const locationOptions = { locid, subid };

    try {
      // 1. GPS Enrichment (mapsh-pit)
      await this.dispatchClient.submitJob({
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

      // 2. Live Photo Detection - requires dispatch plugin (not yet implemented)
      logger.debug('ImportService', 'Live Photo detection disabled - requires dispatch plugin');

      // 3. SRT Telemetry - requires dispatch plugin (not yet implemented)
      if (files.some(f => f.mediaType === 'document')) {
        logger.debug('ImportService', 'SRT telemetry disabled - requires dispatch plugin');
      }

      // 4. Location Stats (wake-n-blake)
      await this.dispatchClient.submitJob({
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

      // 5. BagIt Manifest (wake-n-blake)
      await this.dispatchClient.submitJob({
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

      logger.debug('ImportService', `Submitted location jobs to dispatch for ${locid.slice(0, 8)}...`);
    } catch (error) {
      logger.error('ImportService', `Failed to submit location dispatch jobs: ${error}`);
    }
  }

  /**
   * Auto-set hero image for location
   */
  private async autoSetHeroImage(
    location: ImportLocation,
    files: Array<{ hash: string; mediaType: MediaType }>
  ): Promise<void> {
    try {
      const firstImage = files.find(f => f.mediaType === 'image');
      if (!firstImage) return;

      if (location.subid) {
        // Set hero on sub-location
        const subloc = await this.db
          .selectFrom('slocs')
          .select(['subid', 'hero_imghash'])
          .where('subid', '=', location.subid)
          .executeTakeFirst();

        if (subloc && !subloc.hero_imghash) {
          await this.db
            .updateTable('slocs')
            .set({ hero_imghash: firstImage.hash })
            .where('subid', '=', location.subid)
            .execute();
          logger.debug('ImportService', 'Auto-set sub-location hero', { hash: firstImage.hash });
        }
      } else {
        // Set hero on host location
        const loc = await this.db
          .selectFrom('locs')
          .select(['locid', 'hero_imghash'])
          .where('locid', '=', location.locid)
          .executeTakeFirst();

        if (loc && !loc.hero_imghash) {
          await this.db
            .updateTable('locs')
            .set({ hero_imghash: firstImage.hash })
            .where('locid', '=', location.locid)
            .execute();
          logger.debug('ImportService', 'Auto-set location hero', { hash: firstImage.hash });
        }
      }
    } catch (err) {
      // Non-fatal
      logger.warn('ImportService', 'Auto-hero failed (non-fatal)', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Create import record
   */
  private async createImportRecord(
    sessionId: string,
    location: ImportLocation,
    files: Array<{ hash: string; mediaType: MediaType }>,
    user?: { userId: string; username: string }
  ): Promise<void> {
    const now = new Date().toISOString();

    await this.db.insertInto('imports').values({
      import_id: sessionId,
      locid: location.locid,
      import_date: now,
      auth_imp: user?.username ?? null,
      img_count: files.filter(f => f.mediaType === 'image').length,
      vid_count: files.filter(f => f.mediaType === 'video').length,
      doc_count: files.filter(f => f.mediaType === 'document').length,
      map_count: files.filter(f => f.mediaType === 'map').length,
      notes: null,
    }).execute();
  }
}

/**
 * Create an ImportService instance
 */
export function createImportService(db: Kysely<Database>): ImportService {
  return new ImportService(db);
}
