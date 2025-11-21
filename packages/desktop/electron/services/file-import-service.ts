import path from 'path';
import fs from 'fs/promises';
import { CryptoService } from './crypto-service';
import { ExifToolService } from './exiftool-service';
import { FFmpegService } from './ffmpeg-service';
import { PathValidator } from './path-validator';
import { GPSValidator } from './gps-validator';
import { SQLiteMediaRepository } from '../repositories/sqlite-media-repository';
import { SQLiteImportRepository } from '../repositories/sqlite-import-repository';
import { SQLiteLocationRepository } from '../repositories/sqlite-location-repository';
import type { ImgsTable, VidsTable, DocsTable } from '../main/database.types';
import type { Kysely } from 'kysely';
import type { Database } from '../main/database.types';

export interface ImportFileInput {
  filePath: string;
  originalName: string;
  locid: string;
  subid?: string | null;
  auth_imp: string | null;
}

export interface ImportResult {
  success: boolean;
  hash: string;
  type: 'image' | 'video' | 'document' | 'unknown';
  duplicate: boolean;
  archivePath?: string;
  error?: string;
  gpsWarning?: {
    message: string;
    distance: number;
    severity: 'minor' | 'major';
    locationGPS: { lat: number; lng: number };
    mediaGPS: { lat: number; lng: number };
  };
}

export interface ImportSessionResult {
  total: number;
  imported: number;
  duplicates: number;
  errors: number;
  results: ImportResult[];
  importId: string;
}

/**
 * Service for importing media files into the archive
 */
export class FileImportService {
  private readonly IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp'];
  private readonly VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.webm'];
  private readonly DOCUMENT_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt'];

  constructor(
    private readonly db: Kysely<Database>,
    private readonly cryptoService: CryptoService,
    private readonly exifToolService: ExifToolService,
    private readonly ffmpegService: FFmpegService,
    private readonly mediaRepo: SQLiteMediaRepository,
    private readonly importRepo: SQLiteImportRepository,
    private readonly locationRepo: SQLiteLocationRepository,
    private readonly archivePath: string,
    private readonly allowedImportDirs: string[] = [] // User's home dir, downloads, etc.
  ) {}

  /**
   * Import multiple files in a batch
   * CRITICAL: Wraps entire import in transaction for data integrity
   */
  async importFiles(
    files: ImportFileInput[],
    deleteOriginals: boolean = false,
    onProgress?: (current: number, total: number) => void
  ): Promise<ImportSessionResult> {
    // Validate all file paths before starting
    for (const file of files) {
      if (!PathValidator.isPathSafe(file.filePath, this.archivePath)) {
        // Check if file is in allowed import directories
        const isAllowed = this.allowedImportDirs.length === 0 ||
          this.allowedImportDirs.some(dir => PathValidator.isPathSafe(file.filePath, dir));

        if (!isAllowed) {
          throw new Error(`Security: File path not allowed: ${file.filePath}`);
        }
      }
    }

    // Use transaction to ensure atomicity
    return await this.db.transaction().execute(async (trx) => {
      const results: ImportResult[] = [];
      let imported = 0;
      let duplicates = 0;
      let errors = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Report progress
        if (onProgress) {
          onProgress(i + 1, files.length);
        }

        try {
          const result = await this.importSingleFile(file, deleteOriginals, trx);
          results.push(result);

          if (result.success) {
            if (result.duplicate) {
              duplicates++;
            } else {
              imported++;
            }
          } else {
            errors++;
          }
        } catch (error) {
          console.error(`Error importing file ${file.originalName}:`, error);
          results.push({
            success: false,
            hash: '',
            type: 'unknown',
            duplicate: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          errors++;
        }
      }

      // Create import record within same transaction
      const locid = files[0]?.locid || null;
      const auth_imp = files[0]?.auth_imp || null;
      const imgCount = results.filter((r) => r.type === 'image' && !r.duplicate).length;
      const vidCount = results.filter((r) => r.type === 'video' && !r.duplicate).length;
      const docCount = results.filter((r) => r.type === 'document' && !r.duplicate).length;

      // Use transaction context for import record creation
      const importId = await this.createImportRecordInTransaction(trx, {
        locid,
        auth_imp,
        img_count: imgCount,
        vid_count: vidCount,
        doc_count: docCount,
        notes: `Imported ${imported} files, ${duplicates} duplicates, ${errors} errors`,
      });

      return {
        total: files.length,
        imported,
        duplicates,
        errors,
        results,
        importId,
      };
    });
  }

  /**
   * Import a single file with transaction support
   * CRITICAL: Validates path, checks GPS mismatch, uses transaction
   */
  private async importSingleFile(
    file: ImportFileInput,
    deleteOriginal: boolean,
    trx: any // Transaction context
  ): Promise<ImportResult> {
    // 1. Validate file path security
    const sanitizedName = PathValidator.sanitizeFilename(file.originalName);

    // 2. Calculate SHA256 hash (only once)
    const hash = await this.cryptoService.calculateSHA256(file.filePath);

    // 3. Determine file type
    const ext = path.extname(sanitizedName).toLowerCase();
    const type = this.getFileType(ext);

    if (type === 'unknown') {
      return {
        success: false,
        hash,
        type,
        duplicate: false,
        error: `Unsupported file type: ${ext}`,
      };
    }

    // 4. Check for duplicates
    const isDuplicate = await this.checkDuplicateInTransaction(trx, hash, type);
    if (isDuplicate) {
      return {
        success: true,
        hash,
        type,
        duplicate: true,
      };
    }

    // 5. Extract metadata
    let metadata: any = null;
    let gpsWarning: ImportResult['gpsWarning'] = undefined;

    try {
      if (type === 'image') {
        metadata = await this.exifToolService.extractMetadata(file.filePath);

        // CRITICAL: Check GPS mismatch
        if (metadata.gps && GPSValidator.isValidGPS(metadata.gps.lat, metadata.gps.lng)) {
          const location = await this.locationRepo.findById(file.locid);

          if (location && location.gps?.lat && location.gps?.lng) {
            const mismatch = GPSValidator.checkGPSMismatch(
              { lat: location.gps.lat, lng: location.gps.lng },
              { lat: metadata.gps.lat, lng: metadata.gps.lng },
              10000 // 10km threshold
            );

            if (mismatch.mismatch && mismatch.distance) {
              gpsWarning = {
                message: `GPS coordinates differ by ${GPSValidator.formatDistance(mismatch.distance)}`,
                distance: mismatch.distance,
                severity: mismatch.severity as 'minor' | 'major',
                locationGPS: { lat: location.gps.lat, lng: location.gps.lng },
                mediaGPS: { lat: metadata.gps.lat, lng: metadata.gps.lng },
              };
            }
          }
        }
      } else if (type === 'video') {
        metadata = await this.ffmpegService.extractMetadata(file.filePath);
      }
    } catch (error) {
      console.warn('Failed to extract metadata:', error);
      // Continue without metadata
    }

    // 6. Organize file to archive (validate path)
    const archivePath = await this.organizeFile(file, hash, ext, type);

    // 7. Insert record in database using transaction
    await this.insertMediaRecordInTransaction(
      trx,
      file,
      hash,
      type,
      archivePath,
      sanitizedName,
      metadata
    );

    // 8. Delete original if requested (after DB success)
    if (deleteOriginal) {
      try {
        await fs.unlink(file.filePath);
      } catch (error) {
        console.warn('Failed to delete original file:', error);
        // Don't fail import if deletion fails
      }
    }

    return {
      success: true,
      hash,
      type,
      duplicate: false,
      archivePath,
      gpsWarning,
    };
  }

  /**
   * Determine file type from extension
   */
  private getFileType(ext: string): 'image' | 'video' | 'document' | 'unknown' {
    if (this.IMAGE_EXTENSIONS.includes(ext)) return 'image';
    if (this.VIDEO_EXTENSIONS.includes(ext)) return 'video';
    if (this.DOCUMENT_EXTENSIONS.includes(ext)) return 'document';
    return 'unknown';
  }

  /**
   * Check if file is a duplicate within transaction
   */
  private async checkDuplicateInTransaction(
    trx: any,
    hash: string,
    type: 'image' | 'video' | 'document'
  ): Promise<boolean> {
    if (type === 'image') {
      const result = await trx
        .selectFrom('imgs')
        .select('imgsha')
        .where('imgsha', '=', hash)
        .executeTakeFirst();
      return !!result;
    } else if (type === 'video') {
      const result = await trx
        .selectFrom('vids')
        .select('vidsha')
        .where('vidsha', '=', hash)
        .executeTakeFirst();
      return !!result;
    } else if (type === 'document') {
      const result = await trx
        .selectFrom('docs')
        .select('docsha')
        .where('docsha', '=', hash)
        .executeTakeFirst();
      return !!result;
    }
    return false;
  }

  /**
   * Organize file to archive folder with path validation
   * Archive structure: [archivePath]/[STATE]-[TYPE]/[SLOCNAM]-[LOC12]/org-[type]-[LOC12]/[SHA256].[ext]
   */
  private async organizeFile(
    file: ImportFileInput,
    hash: string,
    ext: string,
    type: 'image' | 'video' | 'document'
  ): Promise<string> {
    // For now, use a simplified structure until we have location data
    // TODO: Implement full path structure with STATE, TYPE, SLOCNAM, LOC12
    const typeFolder = type === 'image' ? 'images' : type === 'video' ? 'videos' : 'documents';
    const targetDir = path.join(this.archivePath, typeFolder, file.locid);
    const targetPath = path.join(targetDir, `${hash}${ext}`);

    // CRITICAL: Validate target path doesn't escape archive
    if (!PathValidator.validateArchivePath(targetPath, this.archivePath)) {
      throw new Error(`Security: Target path escapes archive directory: ${targetPath}`);
    }

    // Ensure directory exists
    await fs.mkdir(targetDir, { recursive: true });

    // Copy file
    await fs.copyFile(file.filePath, targetPath);

    return targetPath;
  }

  /**
   * Insert media record in database within transaction
   */
  private async insertMediaRecordInTransaction(
    trx: any,
    file: ImportFileInput,
    hash: string,
    type: 'image' | 'video' | 'document',
    archivePath: string,
    originalName: string,
    metadata: any
  ): Promise<void> {
    const timestamp = new Date().toISOString();

    if (type === 'image') {
      await trx
        .insertInto('imgs')
        .values({
          imgsha: hash,
          imgnam: path.basename(archivePath),
          imgnamo: originalName,
          imgloc: archivePath,
          imgloco: file.filePath,
          locid: file.locid,
          subid: file.subid || null,
          auth_imp: file.auth_imp,
          imgadd: timestamp,
          meta_exiftool: metadata?.rawExif || null,
          meta_width: metadata?.width || null,
          meta_height: metadata?.height || null,
          meta_date_taken: metadata?.dateTaken || null,
          meta_camera_make: metadata?.cameraMake || null,
          meta_camera_model: metadata?.cameraModel || null,
          meta_gps_lat: metadata?.gps?.lat || null,
          meta_gps_lng: metadata?.gps?.lng || null,
        })
        .execute();
    } else if (type === 'video') {
      await trx
        .insertInto('vids')
        .values({
          vidsha: hash,
          vidnam: path.basename(archivePath),
          vidnamo: originalName,
          vidloc: archivePath,
          vidloco: file.filePath,
          locid: file.locid,
          subid: file.subid || null,
          auth_imp: file.auth_imp,
          vidadd: timestamp,
          meta_ffmpeg: metadata?.rawMetadata || null,
          meta_exiftool: null,
          meta_duration: metadata?.duration || null,
          meta_width: metadata?.width || null,
          meta_height: metadata?.height || null,
          meta_codec: metadata?.codec || null,
          meta_fps: metadata?.fps || null,
          meta_date_taken: metadata?.dateTaken || null,
        })
        .execute();
    } else if (type === 'document') {
      await trx
        .insertInto('docs')
        .values({
          docsha: hash,
          docnam: path.basename(archivePath),
          docnamo: originalName,
          docloc: archivePath,
          docloco: file.filePath,
          locid: file.locid,
          subid: file.subid || null,
          auth_imp: file.auth_imp,
          docadd: timestamp,
          meta_exiftool: null,
          meta_page_count: null,
          meta_author: null,
          meta_title: null,
        })
        .execute();
    }
  }

  /**
   * Create import record within transaction
   */
  private async createImportRecordInTransaction(
    trx: any,
    input: {
      locid: string | null;
      auth_imp: string | null;
      img_count: number;
      vid_count: number;
      doc_count: number;
      notes: string;
    }
  ): Promise<string> {
    const importId = randomUUID();
    const importDate = new Date().toISOString();

    await trx
      .insertInto('imports')
      .values({
        import_id: importId,
        locid: input.locid,
        import_date: importDate,
        auth_imp: input.auth_imp,
        img_count: input.img_count,
        vid_count: input.vid_count,
        doc_count: input.doc_count,
        map_count: 0,
        notes: input.notes,
      })
      .execute();

    return importId;
  }
}

// Import randomUUID for transaction helper
import { randomUUID } from 'crypto';
