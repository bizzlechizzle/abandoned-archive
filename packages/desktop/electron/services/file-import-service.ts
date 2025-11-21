import path from 'path';
import fs from 'fs/promises';
import { CryptoService } from './crypto-service';
import { ExifToolService } from './exiftool-service';
import { FFmpegService } from './ffmpeg-service';
import { SQLiteMediaRepository } from '../repositories/sqlite-media-repository';
import { SQLiteImportRepository } from '../repositories/sqlite-import-repository';
import type { ImgsTable, VidsTable, DocsTable } from '../main/database.types';

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
  gpsWarning?: string;
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
    private readonly cryptoService: CryptoService,
    private readonly exifToolService: ExifToolService,
    private readonly ffmpegService: FFmpegService,
    private readonly mediaRepo: SQLiteMediaRepository,
    private readonly importRepo: SQLiteImportRepository,
    private readonly archivePath: string
  ) {}

  /**
   * Import multiple files in a batch
   */
  async importFiles(
    files: ImportFileInput[],
    deleteOriginals: boolean = false
  ): Promise<ImportSessionResult> {
    const results: ImportResult[] = [];
    let imported = 0;
    let duplicates = 0;
    let errors = 0;

    for (const file of files) {
      try {
        const result = await this.importSingleFile(file, deleteOriginals);
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

    // Create import record
    const locid = files[0]?.locid || null;
    const auth_imp = files[0]?.auth_imp || null;
    const imgCount = results.filter((r) => r.type === 'image' && !r.duplicate).length;
    const vidCount = results.filter((r) => r.type === 'video' && !r.duplicate).length;
    const docCount = results.filter((r) => r.type === 'document' && !r.duplicate).length;

    const importRecord = await this.importRepo.create({
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
      importId: importRecord.import_id,
    };
  }

  /**
   * Import a single file
   */
  private async importSingleFile(
    file: ImportFileInput,
    deleteOriginal: boolean
  ): Promise<ImportResult> {
    // 1. Calculate SHA256 hash
    const hash = await this.cryptoService.calculateSHA256(file.filePath);

    // 2. Determine file type
    const ext = path.extname(file.originalName).toLowerCase();
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

    // 3. Check for duplicates
    const isDuplicate = await this.checkDuplicate(hash, type);
    if (isDuplicate) {
      return {
        success: true,
        hash,
        type,
        duplicate: true,
      };
    }

    // 4. Extract metadata
    let metadata: any = null;
    let gpsWarning: string | undefined;

    try {
      if (type === 'image') {
        metadata = await this.exifToolService.extractMetadata(file.filePath);

        // Check GPS mismatch
        if (metadata.gps) {
          gpsWarning = 'GPS data found in image EXIF';
        }
      } else if (type === 'video') {
        metadata = await this.ffmpegService.extractMetadata(file.filePath);
      }
    } catch (error) {
      console.warn('Failed to extract metadata:', error);
      // Continue without metadata
    }

    // 5. Organize file to archive
    const archivePath = await this.organizeFile(file, hash, ext, type);

    // 6. Insert record in database
    await this.insertMediaRecord(file, hash, type, archivePath, file.originalName, metadata);

    // 7. Delete original if requested
    if (deleteOriginal) {
      try {
        await fs.unlink(file.filePath);
      } catch (error) {
        console.warn('Failed to delete original file:', error);
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
   * Check if file is a duplicate
   */
  private async checkDuplicate(hash: string, type: 'image' | 'video' | 'document'): Promise<boolean> {
    if (type === 'image') {
      return await this.mediaRepo.imageExists(hash);
    } else if (type === 'video') {
      return await this.mediaRepo.videoExists(hash);
    } else if (type === 'document') {
      return await this.mediaRepo.documentExists(hash);
    }
    return false;
  }

  /**
   * Organize file to archive folder
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

    // Ensure directory exists
    await fs.mkdir(targetDir, { recursive: true });

    // Copy file
    await fs.copyFile(file.filePath, targetPath);

    return targetPath;
  }

  /**
   * Insert media record in database
   */
  private async insertMediaRecord(
    file: ImportFileInput,
    hash: string,
    type: 'image' | 'video' | 'document',
    archivePath: string,
    originalName: string,
    metadata: any
  ): Promise<void> {
    if (type === 'image') {
      const imageRecord: Omit<ImgsTable, 'imgadd'> = {
        imgsha: hash,
        imgnam: path.basename(archivePath),
        imgnamo: originalName,
        imgloc: archivePath,
        imgloco: file.filePath,
        locid: file.locid,
        subid: file.subid || null,
        auth_imp: file.auth_imp,
        meta_exiftool: metadata?.rawExif || null,
        meta_width: metadata?.width || null,
        meta_height: metadata?.height || null,
        meta_date_taken: metadata?.dateTaken || null,
        meta_camera_make: metadata?.cameraMake || null,
        meta_camera_model: metadata?.cameraModel || null,
        meta_gps_lat: metadata?.gps?.lat || null,
        meta_gps_lng: metadata?.gps?.lng || null,
      };
      await this.mediaRepo.createImage(imageRecord);
    } else if (type === 'video') {
      const videoRecord: Omit<VidsTable, 'vidadd'> = {
        vidsha: hash,
        vidnam: path.basename(archivePath),
        vidnamo: originalName,
        vidloc: archivePath,
        vidloco: file.filePath,
        locid: file.locid,
        subid: file.subid || null,
        auth_imp: file.auth_imp,
        meta_ffmpeg: metadata?.rawMetadata || null,
        meta_exiftool: null,
        meta_duration: metadata?.duration || null,
        meta_width: metadata?.width || null,
        meta_height: metadata?.height || null,
        meta_codec: metadata?.codec || null,
        meta_fps: metadata?.fps || null,
        meta_date_taken: metadata?.dateTaken || null,
      };
      await this.mediaRepo.createVideo(videoRecord);
    } else if (type === 'document') {
      const docRecord: Omit<DocsTable, 'docadd'> = {
        docsha: hash,
        docnam: path.basename(archivePath),
        docnamo: originalName,
        docloc: archivePath,
        docloco: file.filePath,
        locid: file.locid,
        subid: file.subid || null,
        auth_imp: file.auth_imp,
        meta_exiftool: null,
        meta_page_count: null,
        meta_author: null,
        meta_title: null,
      };
      await this.mediaRepo.createDocument(docRecord);
    }
  }
}
