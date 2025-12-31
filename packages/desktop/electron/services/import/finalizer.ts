/**
 * Finalizer - Database commit and job queue population (Step 5)
 *
 * Per Import Spec v2.0:
 * - Batch DB transaction for final records
 * - Status update (status='imported')
 * - Sidecar/RAW+JPEG/Live Photo relationship linking
 * - Bulk job queue population with dependencies
 * - Import session recording
 * - Progress reporting (95-100%)
 *
 * @module services/import/finalizer
 */

import { generateId } from '../../main/ipc-validation';
import path from 'path';
import type { Kysely } from 'kysely';
import type { Database } from '../../main/database.types';
import type { ValidatedFile } from './validator';
import type { ScanResult } from './scanner';
import { getDispatchClient, type JobSubmission, type JobPriority } from '@aa/services';
import type { LocationInfo } from './types';
import { perceptualHashService } from '../image-downloader/perceptual-hash-service';

// Map local priorities to dispatch priorities
const DISPATCH_PRIORITY: Record<string, JobPriority> = {
  HIGH: 'HIGH',
  NORMAL: 'NORMAL',
  LOW: 'LOW',
  BACKGROUND: 'BULK',
};

// Map local queue names to dispatch plugins
const DISPATCH_PLUGINS: Record<string, string> = {
  exiftool: 'national-treasure', // Metadata extraction
  ffprobe: 'national-treasure',  // Video metadata
  thumbnail: 'shoemaker',        // Thumbnail generation
  'video-proxy': 'shoemaker',    // Video proxy generation
  'xmp-sidecar': 'wake-n-blake', // XMP sidecar
  'gps-enrichment': 'mapsh-pit', // GPS enrichment
  'live-photo': 'wake-n-blake',  // Live photo detection
  'srt-telemetry': 'father-time', // SRT telemetry
  'location-stats': 'wake-n-blake', // Location stats
  'bagit': 'wake-n-blake',       // BagIt manifest
  'ml-thumbnail': 'shoemaker',   // ML thumbnail
  'visual-buffet': 'visual-buffet', // ML tagging
};

/**
 * Finalized file with DB record info
 */
export interface FinalizedFile extends ValidatedFile {
  dbRecordId: string | null;
  finalizeError: string | null;
}

/**
 * Finalization result summary
 */
export interface FinalizationResult {
  files: FinalizedFile[];
  totalFinalized: number;
  totalErrors: number;
  jobsQueued: number;
  importRecordId: string;
  finalizeTimeMs: number;
}

/**
 * Finalizer options
 */
export interface FinalizerOptions {
  /**
   * Progress callback (95-100% range)
   */
  onProgress?: (percent: number, phase: string) => void;

  /**
   * Abort signal for cancellation
   */
  signal?: AbortSignal;

  /**
   * User info for activity tracking
   */
  user?: {
    userId: string;
    username: string;
  };

  /**
   * Scan result for relationship linking
   */
  scanResult?: ScanResult;
}

// LocationInfo imported from ./types - single source of truth
// Re-export for backwards compatibility
export type { LocationInfo } from './types';

/**
 * Finalizer class for database commits
 */
export class Finalizer {
  // Use getter to get fresh client each time (client may be recreated during auth detection)
  private get dispatchClient() {
    return getDispatchClient();
  }

  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Finalize import: commit to DB and queue background jobs
   */
  async finalize(
    files: ValidatedFile[],
    location: LocationInfo,
    options?: FinalizerOptions
  ): Promise<FinalizationResult> {
    const startTime = Date.now();

    // Filter valid files
    const validFiles = files.filter(f => f.isValid && f.archivePath);

    const results: FinalizedFile[] = [];
    let totalFinalized = 0;
    let totalErrors = 0;
    let jobsQueued = 0;

    // Report progress: Starting DB transaction
    options?.onProgress?.(95, 'Committing to database');

    // Create import record
    const importRecordId = generateId();
    const now = new Date().toISOString();

    // Transaction for all DB operations
    await this.db.transaction().execute(async (trx) => {
      // Insert import record
      await trx
        .insertInto('imports')
        .values({
          import_id: importRecordId,
          locid: location.locid,
          import_date: now,
          auth_imp: options?.user?.username ?? null,
          img_count: validFiles.filter(f => f.mediaType === 'image').length,
          vid_count: validFiles.filter(f => f.mediaType === 'video').length,
          doc_count: validFiles.filter(f => f.mediaType === 'document').length,
          map_count: validFiles.filter(f => f.mediaType === 'map').length,
          notes: null,
        })
        .execute();

      // Check for cancellation before batch insert
      if (options?.signal?.aborted) {
        throw new Error('Finalize cancelled');
      }

      // Batch insert by media type for efficiency
      // SQLite supports up to 500 variables per statement, so batch in chunks
      const BATCH_SIZE = 50; // Conservative to avoid SQLite limits

      // Group files by media type
      const imageFiles = validFiles.filter(f => f.mediaType === 'image');
      const videoFiles = validFiles.filter(f => f.mediaType === 'video');
      const docFiles = validFiles.filter(f => f.mediaType === 'document');
      const mapFiles = validFiles.filter(f => f.mediaType === 'map');

      // Batch insert images
      if (imageFiles.length > 0) {
        const inserted = await this.batchInsertImages(trx, imageFiles, location, options);
        for (const file of inserted.successful) {
          results.push({ ...file, dbRecordId: file.hash!, finalizeError: null });
          totalFinalized++;
        }
        for (const file of inserted.failed) {
          results.push({ ...file, dbRecordId: null, finalizeError: file.error });
          totalErrors++;
        }
      }

      // Batch insert videos
      if (videoFiles.length > 0) {
        const inserted = await this.batchInsertVideos(trx, videoFiles, location, options);
        for (const file of inserted.successful) {
          results.push({ ...file, dbRecordId: file.hash!, finalizeError: null });
          totalFinalized++;
        }
        for (const file of inserted.failed) {
          results.push({ ...file, dbRecordId: null, finalizeError: file.error });
          totalErrors++;
        }
      }

      // Batch insert documents
      if (docFiles.length > 0) {
        const inserted = await this.batchInsertDocs(trx, docFiles, location, options);
        for (const file of inserted.successful) {
          results.push({ ...file, dbRecordId: file.hash!, finalizeError: null });
          totalFinalized++;
        }
        for (const file of inserted.failed) {
          results.push({ ...file, dbRecordId: null, finalizeError: file.error });
          totalErrors++;
        }
      }

      // Batch insert maps
      if (mapFiles.length > 0) {
        const inserted = await this.batchInsertMaps(trx, mapFiles, location, options);
        for (const file of inserted.successful) {
          results.push({ ...file, dbRecordId: file.hash!, finalizeError: null });
          totalFinalized++;
        }
        for (const file of inserted.failed) {
          results.push({ ...file, dbRecordId: null, finalizeError: file.error });
          totalErrors++;
        }
      }

      // Link relationships (RAW+JPEG pairs, Live Photos)
      if (options?.scanResult) {
        await this.linkRelationships(trx, results, options.scanResult);
      }
    });

    // Report progress: Queueing background jobs
    options?.onProgress?.(98, 'Queueing background jobs');

    // Submit background jobs to dispatch for each successfully imported file
    const successfulFiles = results.filter(f => f.dbRecordId);
    const jobs = this.buildDispatchJobs(successfulFiles, location);
    if (jobs.length > 0) {
      await this.submitJobsToDispatch(jobs);
      jobsQueued = jobs.length;
    }

    // Auto-set hero image if location has no hero and we imported images
    // This ensures dashboard thumbnails appear immediately after first import
    if (totalFinalized > 0) {
      await this.autoSetHeroImage(location.locid, location.subid, results);
    }

    // Add non-imported files to results (duplicates, errors)
    for (const file of files) {
      if (!file.isValid || !file.archivePath) {
        results.push({
          ...file,
          dbRecordId: null,
          finalizeError: file.validationError || 'Not validated',
        });
      }
    }

    // Report progress: Complete
    options?.onProgress?.(100, 'Import complete');

    const finalizeTimeMs = Date.now() - startTime;

    return {
      files: results,
      totalFinalized,
      totalErrors,
      jobsQueued,
      importRecordId,
      finalizeTimeMs,
    };
  }

  /**
   * Progressive persistence: Finalize a single file immediately after validation
   * This ensures files are visible in UI even if later files fail
   *
   * @param file - The validated file to finalize
   * @param location - Location info for the file
   * @param options - Finalizer options
   * @returns The finalized file with DB record info
   */
  async finalizeFile(
    file: ValidatedFile,
    location: LocationInfo,
    options?: FinalizerOptions
  ): Promise<FinalizedFile> {
    // Skip if file is not valid or has no archive path
    if (!file.isValid || !file.archivePath || !file.hash) {
      return {
        ...file,
        dbRecordId: null,
        finalizeError: file.validationError || 'Not validated',
      };
    }

    try {
      // Insert single file to DB (no transaction needed for single insert)
      await this.insertMediaRecord(this.db, file, location, options);

      // Submit background jobs to dispatch for this single file
      const jobs = this.buildDispatchJobs([{ ...file, dbRecordId: file.hash, finalizeError: null }], location);
      if (jobs.length > 0) {
        await this.submitJobsToDispatch(jobs);
      }

      return {
        ...file,
        dbRecordId: file.hash,
        finalizeError: null,
      };
    } catch (error) {
      // Check if it's a duplicate key error (file already exists)
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('UNIQUE constraint') || errorMessage.includes('PRIMARY KEY')) {
        // File already exists - this is OK for progressive persistence
        // (could happen on resume)
        return {
          ...file,
          dbRecordId: file.hash,
          finalizeError: null,
        };
      }

      return {
        ...file,
        dbRecordId: null,
        finalizeError: errorMessage,
      };
    }
  }

  /**
   * Finalize remaining tasks after progressive persistence:
   * - Link relationships (RAW+JPEG pairs, Live Photos)
   * - Auto-set hero image
   * - Record import summary
   *
   * Call this after all files have been progressively finalized
   */
  async finalizePostProcessing(
    files: FinalizedFile[],
    location: LocationInfo,
    importRecordId: string,
    options?: FinalizerOptions
  ): Promise<void> {
    const now = new Date().toISOString();
    const successfulFiles = files.filter(f => f.dbRecordId);

    // Create or update import record
    await this.db
      .insertInto('imports')
      .values({
        import_id: importRecordId,
        locid: location.locid,
        import_date: now,
        auth_imp: options?.user?.username ?? null,
        img_count: successfulFiles.filter(f => f.mediaType === 'image').length,
        vid_count: successfulFiles.filter(f => f.mediaType === 'video').length,
        doc_count: successfulFiles.filter(f => f.mediaType === 'document').length,
        map_count: successfulFiles.filter(f => f.mediaType === 'map').length,
        notes: null,
      })
      .onConflict(oc => oc.column('import_id').doUpdateSet({
        img_count: successfulFiles.filter(f => f.mediaType === 'image').length,
        vid_count: successfulFiles.filter(f => f.mediaType === 'video').length,
        doc_count: successfulFiles.filter(f => f.mediaType === 'document').length,
        map_count: successfulFiles.filter(f => f.mediaType === 'map').length,
      }))
      .execute();

    // Link relationships (RAW+JPEG pairs, Live Photos)
    if (options?.scanResult && successfulFiles.length > 0) {
      await this.linkRelationships(this.db, successfulFiles, options.scanResult);
    }

    // Auto-set hero image if needed
    if (successfulFiles.length > 0) {
      await this.autoSetHeroImage(location.locid, location.subid, successfulFiles);
    }
  }

  /**
   * Insert a media record into the appropriate table
   * Calculates perceptual hash (pHash) for images during import
   */
  private async insertMediaRecord(
    trx: Kysely<Database>,
    file: ValidatedFile,
    location: LocationInfo,
    options?: FinalizerOptions
  ): Promise<string> {
    const now = new Date().toISOString();
    const archiveName = `${file.hash}${file.extension}`;

    switch (file.mediaType) {
      case 'image': {
        // Calculate perceptual hash for duplicate detection
        let phash: string | null = null;
        if (file.archivePath) {
          try {
            const result = await perceptualHashService.hashFile(file.archivePath);
            phash = result.hash;
          } catch {
            // pHash calculation failed - continue without it
            // Can be backfilled later via phash-backfill-job
          }
        }

        await trx
          .insertInto('imgs')
          .values({
            imghash: file.hash!,
            imgnam: archiveName,
            imgnamo: file.filename,
            imgloc: file.archivePath!,
            imgloco: file.originalPath,
            locid: location.locid,
            subid: location.subid,
            auth_imp: options?.user?.username ?? null,
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
            xmp_synced: 0,
            xmp_modified_at: null,
            hidden: file.shouldHide ? 1 : 0,
            hidden_reason: file.shouldHide ? 'metadata_sidecar' : null,
            is_live_photo: 0,
            imported_by_id: options?.user?.userId ?? null,
            imported_by: options?.user?.username ?? null,
            media_source: null,
            is_contributed: 0,
            contribution_source: null,
            preview_quality: null,
            file_size_bytes: file.size,
            extracted_from_web: 0,
            phash,
          })
          .execute();
        return file.hash!;
      }

      case 'video':
        await trx
          .insertInto('vids')
          .values({
            vidhash: file.hash!,
            vidnam: archiveName,
            vidnamo: file.filename,
            vidloc: file.archivePath!,
            vidloco: file.originalPath,
            locid: location.locid,
            subid: location.subid,
            auth_imp: options?.user?.username ?? null,
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
            xmp_synced: 0,
            xmp_modified_at: null,
            hidden: file.shouldHide ? 1 : 0,
            hidden_reason: file.shouldHide ? 'metadata_sidecar' : null,
            is_live_photo: 0,
            imported_by_id: options?.user?.userId ?? null,
            imported_by: options?.user?.username ?? null,
            media_source: null,
            is_contributed: 0,
            contribution_source: null,
            file_size_bytes: file.size,
            srt_telemetry: null,
            extracted_from_web: 0,
            needs_deinterlace: 0,
          })
          .execute();
        return file.hash!;

      case 'document':
        await trx
          .insertInto('docs')
          .values({
            dochash: file.hash!,
            docnam: archiveName,
            docnamo: file.filename,
            docloc: file.archivePath!,
            docloco: file.originalPath,
            locid: location.locid,
            subid: location.subid,
            auth_imp: options?.user?.username ?? null,
            docadd: now,
            meta_exiftool: null,
            meta_page_count: null,
            meta_author: null,
            meta_title: null,
            hidden: file.shouldHide ? 1 : 0,
            hidden_reason: file.shouldHide ? 'metadata_sidecar' : null,
            imported_by_id: options?.user?.userId ?? null,
            imported_by: options?.user?.username ?? null,
            media_source: null,
            is_contributed: 0,
            contribution_source: null,
            file_size_bytes: file.size,
          })
          .execute();
        return file.hash!;

      case 'map':
        await trx
          .insertInto('maps')
          .values({
            maphash: file.hash!,
            mapnam: archiveName,
            mapnamo: file.filename,
            maploc: file.archivePath!,
            maploco: file.originalPath,
            locid: location.locid,
            subid: location.subid,
            auth_imp: options?.user?.username ?? null,
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
            imported_by_id: options?.user?.userId ?? null,
            imported_by: options?.user?.username ?? null,
            media_source: null,
            file_size_bytes: file.size,
          })
          .execute();
        return file.hash!;

      default:
        throw new Error(`Unsupported media type: ${file.mediaType}`);
    }
  }

  /**
   * Link RAW+JPEG pairs and Live Photo relationships
   */
  private async linkRelationships(
    trx: Kysely<Database>,
    files: FinalizedFile[],
    scanResult: ScanResult
  ): Promise<void> {
    // Create lookup map from scan file ID to finalized file
    const fileById = new Map<string, FinalizedFile>();
    for (const file of files) {
      fileById.set(file.id, file);
    }

    // Note: RAW+JPEG pairing and Live Photo detection are handled post-import
    // by the LivePhotoDetector job using ContentIdentifier from EXIF metadata
    // This method is a placeholder for future relationship linking
  }

  /**
   * Batch insert images into the imgs table
   * Uses single INSERT with multiple VALUES for efficiency
   * Calculates perceptual hash (pHash) for each image during import
   */
  private async batchInsertImages(
    trx: Kysely<Database>,
    files: ValidatedFile[],
    location: LocationInfo,
    options?: FinalizerOptions
  ): Promise<{ successful: ValidatedFile[]; failed: Array<ValidatedFile & { error: string }> }> {
    const now = new Date().toISOString();
    const successful: ValidatedFile[] = [];
    const failed: Array<ValidatedFile & { error: string }> = [];

    // Pre-calculate perceptual hashes for all files
    // pHash calculation is async and may fail for some formats
    const pHashMap = new Map<string, string | null>();
    for (const file of files) {
      if (file.archivePath) {
        try {
          const result = await perceptualHashService.hashFile(file.archivePath);
          pHashMap.set(file.hash!, result.hash);
        } catch {
          // pHash calculation failed (unsupported format, corrupted file, etc.)
          // Continue without pHash - it can be backfilled later
          pHashMap.set(file.hash!, null);
        }
      }
    }

    // Build batch insert values with pHash
    const insertValues = files.map(file => ({
      imghash: file.hash!,
      imgnam: `${file.hash}${file.extension}`,
      imgnamo: file.filename,
      imgloc: file.archivePath!,
      imgloco: file.originalPath,
      locid: location.locid,
      subid: location.subid,
      auth_imp: options?.user?.username ?? null,
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
      xmp_synced: 0,
      xmp_modified_at: null,
      hidden: file.shouldHide ? 1 : 0,
      hidden_reason: file.shouldHide ? 'metadata_sidecar' : null,
      is_live_photo: 0,
      imported_by_id: options?.user?.userId ?? null,
      imported_by: options?.user?.username ?? null,
      media_source: null,
      is_contributed: 0,
      contribution_source: null,
      preview_quality: null,
      file_size_bytes: file.size,
      extracted_from_web: 0,
      phash: pHashMap.get(file.hash!) ?? null,
    }));

    // Single batch insert
    try {
      if (insertValues.length > 0) {
        await trx.insertInto('imgs').values(insertValues).execute();
        successful.push(...files);
      }
    } catch (error) {
      // If batch fails, fall back to individual inserts to identify failures
      for (let i = 0; i < files.length; i++) {
        try {
          await trx.insertInto('imgs').values(insertValues[i]).execute();
          successful.push(files[i]);
        } catch (individualError) {
          failed.push({
            ...files[i],
            error: individualError instanceof Error ? individualError.message : 'Insert failed',
          });
        }
      }
    }

    return { successful, failed };
  }

  /**
   * Batch insert videos into the vids table
   * Uses single INSERT with multiple VALUES for efficiency
   */
  private async batchInsertVideos(
    trx: Kysely<Database>,
    files: ValidatedFile[],
    location: LocationInfo,
    options?: FinalizerOptions
  ): Promise<{ successful: ValidatedFile[]; failed: Array<ValidatedFile & { error: string }> }> {
    const now = new Date().toISOString();
    const successful: ValidatedFile[] = [];
    const failed: Array<ValidatedFile & { error: string }> = [];

    // Build batch insert values
    const insertValues = files.map(file => ({
      vidhash: file.hash!,
      vidnam: `${file.hash}${file.extension}`,
      vidnamo: file.filename,
      vidloc: file.archivePath!,
      vidloco: file.originalPath,
      locid: location.locid,
      subid: location.subid,
      auth_imp: options?.user?.username ?? null,
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
      xmp_synced: 0,
      xmp_modified_at: null,
      hidden: file.shouldHide ? 1 : 0,
      hidden_reason: file.shouldHide ? 'metadata_sidecar' : null,
      is_live_photo: 0,
      imported_by_id: options?.user?.userId ?? null,
      imported_by: options?.user?.username ?? null,
      media_source: null,
      is_contributed: 0,
      contribution_source: null,
      file_size_bytes: file.size,
      srt_telemetry: null,
      extracted_from_web: 0,
      needs_deinterlace: 0,
    }));

    // Single batch insert
    try {
      if (insertValues.length > 0) {
        await trx.insertInto('vids').values(insertValues).execute();
        successful.push(...files);
      }
    } catch (error) {
      // If batch fails, fall back to individual inserts to identify failures
      for (let i = 0; i < files.length; i++) {
        try {
          await trx.insertInto('vids').values(insertValues[i]).execute();
          successful.push(files[i]);
        } catch (individualError) {
          failed.push({
            ...files[i],
            error: individualError instanceof Error ? individualError.message : 'Insert failed',
          });
        }
      }
    }

    return { successful, failed };
  }

  /**
   * Batch insert documents into the docs table
   * Uses single INSERT with multiple VALUES for efficiency
   */
  private async batchInsertDocs(
    trx: Kysely<Database>,
    files: ValidatedFile[],
    location: LocationInfo,
    options?: FinalizerOptions
  ): Promise<{ successful: ValidatedFile[]; failed: Array<ValidatedFile & { error: string }> }> {
    const now = new Date().toISOString();
    const successful: ValidatedFile[] = [];
    const failed: Array<ValidatedFile & { error: string }> = [];

    // Build batch insert values
    const insertValues = files.map(file => ({
      dochash: file.hash!,
      docnam: `${file.hash}${file.extension}`,
      docnamo: file.filename,
      docloc: file.archivePath!,
      docloco: file.originalPath,
      locid: location.locid,
      subid: location.subid,
      auth_imp: options?.user?.username ?? null,
      docadd: now,
      meta_exiftool: null,
      meta_page_count: null,
      meta_author: null,
      meta_title: null,
      hidden: file.shouldHide ? 1 : 0,
      hidden_reason: file.shouldHide ? 'metadata_sidecar' : null,
      imported_by_id: options?.user?.userId ?? null,
      imported_by: options?.user?.username ?? null,
      media_source: null,
      is_contributed: 0,
      contribution_source: null,
      file_size_bytes: file.size,
    }));

    // Single batch insert
    try {
      if (insertValues.length > 0) {
        await trx.insertInto('docs').values(insertValues).execute();
        successful.push(...files);
      }
    } catch (error) {
      // If batch fails, fall back to individual inserts to identify failures
      for (let i = 0; i < files.length; i++) {
        try {
          await trx.insertInto('docs').values(insertValues[i]).execute();
          successful.push(files[i]);
        } catch (individualError) {
          failed.push({
            ...files[i],
            error: individualError instanceof Error ? individualError.message : 'Insert failed',
          });
        }
      }
    }

    return { successful, failed };
  }

  /**
   * Batch insert maps into the maps table
   * Uses single INSERT with multiple VALUES for efficiency
   */
  private async batchInsertMaps(
    trx: Kysely<Database>,
    files: ValidatedFile[],
    location: LocationInfo,
    options?: FinalizerOptions
  ): Promise<{ successful: ValidatedFile[]; failed: Array<ValidatedFile & { error: string }> }> {
    const now = new Date().toISOString();
    const successful: ValidatedFile[] = [];
    const failed: Array<ValidatedFile & { error: string }> = [];

    // Build batch insert values
    const insertValues = files.map(file => ({
      maphash: file.hash!,
      mapnam: `${file.hash}${file.extension}`,
      mapnamo: file.filename,
      maploc: file.archivePath!,
      maploco: file.originalPath,
      locid: location.locid,
      subid: location.subid,
      auth_imp: options?.user?.username ?? null,
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
      imported_by_id: options?.user?.userId ?? null,
      imported_by: options?.user?.username ?? null,
      media_source: null,
      file_size_bytes: file.size,
    }));

    // Single batch insert
    try {
      if (insertValues.length > 0) {
        await trx.insertInto('maps').values(insertValues).execute();
        successful.push(...files);
      }
    } catch (error) {
      // If batch fails, fall back to individual inserts to identify failures
      for (let i = 0; i < files.length; i++) {
        try {
          await trx.insertInto('maps').values(insertValues[i]).execute();
          successful.push(files[i]);
        } catch (individualError) {
          failed.push({
            ...files[i],
            error: individualError instanceof Error ? individualError.message : 'Insert failed',
          });
        }
      }
    }

    return { successful, failed };
  }

  /**
   * Submit jobs to dispatch hub
   */
  private async submitJobsToDispatch(jobs: JobSubmission[]): Promise<void> {
    for (const job of jobs) {
      try {
        await this.dispatchClient.submitJob(job);
      } catch (error) {
        console.error(`[Finalizer] Failed to submit job to dispatch:`, error);
        // Continue with other jobs - don't fail entire import for job submission errors
      }
    }
  }

  /**
   * Build dispatch job list for background processing
   *
   * Per Import Spec v2.0:
   * - Per-file jobs: Metadata extraction, Thumbnail, Video Proxy
   * - Per-location jobs: GPS Enrichment, Location Stats
   *
   * All jobs are submitted to dispatch hub for processing by workers.
   */
  private buildDispatchJobs(files: FinalizedFile[], location: LocationInfo): JobSubmission[] {
    const jobs: JobSubmission[] = [];
    const { locid, subid } = location;

    // ============ Per-File Jobs ============

    for (const file of files) {
      if (!file.dbRecordId || !file.archivePath) continue;

      const baseOptions = {
        hash: file.hash!,
        mediaType: file.mediaType,
        locid,
        subid,
      };

      // Metadata extraction job (ExifTool/FFprobe)
      jobs.push({
        type: 'metadata',
        plugin: 'national-treasure',
        priority: 'HIGH',
        data: {
          source: file.archivePath,
          options: baseOptions,
        },
      });

      // Thumbnail job
      if (file.mediaType === 'image' || file.mediaType === 'video') {
        jobs.push({
          type: 'thumbnail',
          plugin: 'shoemaker',
          priority: 'NORMAL',
          data: {
            source: file.archivePath,
            options: {
              ...baseOptions,
              width: 400,
              height: 400,
              format: 'webp',
              quality: 80,
            },
          },
        });
      }

      // Video proxy job
      if (file.mediaType === 'video') {
        jobs.push({
          type: 'thumbnail',
          plugin: 'shoemaker',
          priority: 'LOW',
          data: {
            source: file.archivePath,
            options: {
              ...baseOptions,
              width: 1280,
              format: 'mp4',
              isProxy: true,
            },
          },
        });
      }

      // XMP sidecar job
      if (file.mediaType === 'image' || file.mediaType === 'video' || file.mediaType === 'document') {
        jobs.push({
          type: 'metadata',
          plugin: 'wake-n-blake',
          priority: 'NORMAL',
          data: {
            source: file.archivePath,
            options: {
              ...baseOptions,
              originalPath: file.originalPath,
              action: 'xmp-sidecar',
            },
          },
        });
      }
    }

    // ============ Per-Location Jobs ============
    if (files.length === 0) {
      return jobs;
    }

    const locationOptions = { locid, subid };

    // GPS Enrichment
    jobs.push({
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

    // Location Stats
    jobs.push({
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

    // BagIt Manifest
    jobs.push({
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

    return jobs;
  }

  /**
   * Auto-set hero image for location or sub-location
   * Per Import Spec v2.0: Sets first successfully imported image as hero
   * Non-fatal: failures are logged but don't fail the import
   *
   * OPT-093: Added sub-location hero support
   * - If subid is provided, sets hero on slocs table
   * - Otherwise sets hero on locs table (host location)
   */
  private async autoSetHeroImage(
    locid: string,
    subid: string | null,
    results: FinalizedFile[]
  ): Promise<void> {
    try {
      // Find the first successfully imported image (not hidden)
      const firstImage = results.find(
        f => f.mediaType === 'image' && f.dbRecordId && !f.shouldHide
      );

      if (!firstImage || !firstImage.hash) {
        return; // No eligible images to set as hero
      }

      if (subid) {
        // OPT-093: Set hero on sub-location
        const subloc = await this.db
          .selectFrom('slocs')
          .select(['subid', 'hero_imghash'])
          .where('subid', '=', subid)
          .executeTakeFirst();

        if (subloc && !subloc.hero_imghash) {
          await this.db
            .updateTable('slocs')
            .set({ hero_imghash: firstImage.hash })
            .where('subid', '=', subid)
            .execute();
          console.log(`[Finalizer] Auto-set sub-location hero: ${firstImage.hash.slice(0, 12)}...`);
        }
      } else {
        // Set hero on host location
        const location = await this.db
          .selectFrom('locs')
          .select(['locid', 'hero_imghash'])
          .where('locid', '=', locid)
          .executeTakeFirst();

        if (location && !location.hero_imghash) {
          await this.db
            .updateTable('locs')
            .set({ hero_imghash: firstImage.hash })
            .where('locid', '=', locid)
            .execute();
          console.log(`[Finalizer] Auto-set location hero: ${firstImage.hash.slice(0, 12)}...`);
        }
      }
    } catch (error) {
      // Non-fatal - don't fail import if auto-hero fails
      console.warn('[Finalizer] Auto-hero failed (non-fatal):', error);
    }
  }
}

/**
 * Create a Finalizer instance
 */
export function createFinalizer(db: Kysely<Database>): Finalizer {
  return new Finalizer(db);
}
