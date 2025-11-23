/**
 * Media Processing IPC Handlers
 * Handles media viewing, thumbnails, previews, caching, and XMP operations
 */
import { ipcMain, shell } from 'electron';
import { z } from 'zod';
import path from 'path';
import type { Kysely } from 'kysely';
import type { Database } from '../database';
import { SQLiteMediaRepository } from '../../repositories/sqlite-media-repository';
import { ExifToolService } from '../../services/exiftool-service';
import { FFmpegService } from '../../services/ffmpeg-service';
import { MediaPathService } from '../../services/media-path-service';
import { ThumbnailService } from '../../services/thumbnail-service';
import { PreviewExtractorService } from '../../services/preview-extractor-service';
import { PosterFrameService } from '../../services/poster-frame-service';
import { MediaCacheService } from '../../services/media-cache-service';
import { PreloadService } from '../../services/preload-service';
import { XmpService } from '../../services/xmp-service';
import { getConfigService } from '../../services/config-service';
// Kanye10: Darktable integration for premium RAW processing
import { DarktableService } from '../../services/darktable-service';
import { DarktableQueueService } from '../../services/darktable-queue-service';

export function registerMediaProcessingHandlers(
  db: Kysely<Database>,
  mediaRepo: SQLiteMediaRepository,
  exifToolService: ExifToolService,
  ffmpegService: FFmpegService
) {
  const mediaCacheService = new MediaCacheService();
  const preloadService = new PreloadService(mediaCacheService);

  const getArchivePath = async (): Promise<string> => {
    const archivePath = await getConfigService().get('archivePath');
    if (!archivePath) throw new Error('Archive path not configured');
    return archivePath;
  };

  ipcMain.handle('media:findByLocation', async (_event, locid: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(locid);
      return await mediaRepo.findAllMediaByLocation(validatedId);
    } catch (error) {
      console.error('Error finding media by location:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('media:openFile', async (_event, filePath: unknown) => {
    try {
      const validatedPath = z.string().min(1).max(4096).parse(filePath);
      const archivePath = await db.selectFrom('settings').select('value').where('key', '=', 'archive_folder').executeTakeFirst();

      if (!archivePath?.value) throw new Error('Archive folder not configured');

      const normalizedFilePath = path.resolve(validatedPath);
      const normalizedArchivePath = path.resolve(archivePath.value);

      if (!normalizedFilePath.startsWith(normalizedArchivePath + path.sep)) {
        throw new Error('Access denied: file is outside the archive folder');
      }

      await shell.openPath(validatedPath);
      return { success: true };
    } catch (error) {
      console.error('Error opening file:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('media:generateThumbnail', async (_event, sourcePath: unknown, hash: unknown) => {
    try {
      const validPath = z.string().min(1).parse(sourcePath);
      const validHash = z.string().min(1).parse(hash);
      const archivePath = await getArchivePath();
      const mediaPathService = new MediaPathService(archivePath);
      const thumbnailService = new ThumbnailService(mediaPathService);
      return await thumbnailService.generateThumbnail(validPath, validHash);
    } catch (error) {
      console.error('Error generating thumbnail:', error);
      return null;
    }
  });

  ipcMain.handle('media:extractPreview', async (_event, sourcePath: unknown, hash: unknown) => {
    try {
      const validPath = z.string().min(1).parse(sourcePath);
      const validHash = z.string().min(1).parse(hash);
      const archivePath = await getArchivePath();
      const mediaPathService = new MediaPathService(archivePath);
      const previewService = new PreviewExtractorService(mediaPathService, exifToolService);
      return await previewService.extractPreview(validPath, validHash);
    } catch (error) {
      console.error('Error extracting preview:', error);
      return null;
    }
  });

  ipcMain.handle('media:generatePoster', async (_event, sourcePath: unknown, hash: unknown) => {
    try {
      const validPath = z.string().min(1).parse(sourcePath);
      const validHash = z.string().min(1).parse(hash);
      const archivePath = await getArchivePath();
      const mediaPathService = new MediaPathService(archivePath);
      const posterService = new PosterFrameService(mediaPathService, ffmpegService);
      return await posterService.generatePoster(validPath, validHash);
    } catch (error) {
      console.error('Error generating poster:', error);
      return null;
    }
  });

  ipcMain.handle('media:getCached', async (_event, key: unknown) => {
    try {
      const validKey = z.string().min(1).parse(key);
      const data = mediaCacheService.get(validKey);
      return data ? data.toString('base64') : null;
    } catch (error) {
      console.error('Error getting cached media:', error);
      return null;
    }
  });

  ipcMain.handle('media:preload', async (_event, mediaList: unknown, currentIndex: unknown) => {
    try {
      const validList = z.array(z.object({ hash: z.string(), path: z.string() })).parse(mediaList);
      const validIndex = z.number().int().nonnegative().parse(currentIndex);
      preloadService.setMediaList(validList);
      preloadService.setCurrentIndex(validIndex);
      return { success: true };
    } catch (error) {
      console.error('Error preloading media:', error);
      return { success: false };
    }
  });

  ipcMain.handle('media:readXmp', async (_event, mediaPath: unknown) => {
    try {
      const validPath = z.string().min(1).parse(mediaPath);
      const archivePath = await getArchivePath();
      const mediaPathService = new MediaPathService(archivePath);
      const xmpService = new XmpService(mediaPathService);
      const xmpPath = mediaPathService.getXmpPath(validPath);
      return await xmpService.readXmp(xmpPath);
    } catch (error) {
      console.error('Error reading XMP:', error);
      return null;
    }
  });

  ipcMain.handle('media:writeXmp', async (_event, mediaPath: unknown, data: unknown) => {
    try {
      const validPath = z.string().min(1).parse(mediaPath);
      const validData = z.object({
        rating: z.number().optional(),
        label: z.string().optional(),
        keywords: z.array(z.string()).optional(),
        title: z.string().optional(),
        description: z.string().optional()
      }).parse(data);
      const archivePath = await getArchivePath();
      const mediaPathService = new MediaPathService(archivePath);
      const xmpService = new XmpService(mediaPathService);
      const xmpPath = mediaPathService.getXmpPath(validPath);
      await xmpService.writeXmp(xmpPath, validData);
      return { success: true };
    } catch (error) {
      console.error('Error writing XMP:', error);
      throw error;
    }
  });

  // Kanye6: Regenerate multi-tier thumbnails for all images missing thumb_path_sm
  ipcMain.handle('media:regenerateAllThumbnails', async () => {
    try {
      const archivePath = await getArchivePath();
      const mediaPathService = new MediaPathService(archivePath);
      const thumbnailService = new ThumbnailService(mediaPathService);
      const previewService = new PreviewExtractorService(mediaPathService, exifToolService);

      // Get images missing multi-tier thumbnails (thumb_path_sm is NULL)
      const images = await mediaRepo.getImagesWithoutThumbnails();
      let generated = 0;
      let failed = 0;

      console.log(`[Kanye6] Regenerating thumbnails for ${images.length} images...`);

      for (const img of images) {
        try {
          // For RAW files, extract preview first if needed
          let sourcePath = img.imgloc;
          const isRaw = /\.(nef|cr2|cr3|arw|srf|sr2|orf|pef|dng|rw2|raf|raw|rwl|3fr|fff|iiq|mrw|x3f|erf|mef|mos|kdc|dcr)$/i.test(img.imgloc);

          if (isRaw && !img.preview_path) {
            const preview = await previewService.extractPreview(img.imgloc, img.imgsha);
            if (preview) {
              sourcePath = preview;
              await mediaRepo.updateImagePreviewPath(img.imgsha, preview);
            }
          } else if (img.preview_path) {
            sourcePath = img.preview_path;
          }

          // Generate multi-tier thumbnails (400px, 800px, 1920px)
          const result = await thumbnailService.generateAllSizes(sourcePath, img.imgsha);

          if (result.thumb_sm) {
            // Update database with all thumbnail paths
            await db
              .updateTable('imgs')
              .set({
                thumb_path_sm: result.thumb_sm,
                thumb_path_lg: result.thumb_lg,
                preview_path: result.preview || img.preview_path,
              })
              .where('imgsha', '=', img.imgsha)
              .execute();

            generated++;
          } else {
            failed++;
          }
        } catch (err) {
          console.error(`[Kanye6] Failed to regenerate thumbnails for ${img.imgsha}:`, err);
          failed++;
        }
      }

      console.log(`[Kanye6] Thumbnail regeneration complete: ${generated} generated, ${failed} failed`);

      // Kanye9: Also process RAW files that have thumbnails but no preview
      // These files can't be displayed in MediaViewer without a preview
      const rawWithoutPreviews = await mediaRepo.getImagesWithoutPreviews();
      let previewsExtracted = 0;
      let previewsFailed = 0;

      console.log(`[Kanye9] Extracting previews for ${rawWithoutPreviews.length} RAW files missing previews...`);

      for (const img of rawWithoutPreviews) {
        try {
          const preview = await previewService.extractPreview(img.imgloc, img.imgsha);
          if (preview) {
            await mediaRepo.updateImagePreviewPath(img.imgsha, preview);
            previewsExtracted++;
            console.log(`[Kanye9] Extracted preview for ${img.imgsha}`);
          } else {
            previewsFailed++;
            console.warn(`[Kanye9] No preview available for ${img.imgloc}`);
          }
        } catch (err) {
          console.error(`[Kanye9] Failed to extract preview for ${img.imgsha}:`, err);
          previewsFailed++;
        }
      }

      console.log(`[Kanye9] Preview extraction complete: ${previewsExtracted} extracted, ${previewsFailed} failed`);

      return {
        generated,
        failed,
        total: images.length,
        previewsExtracted,
        previewsFailed,
        rawTotal: rawWithoutPreviews.length
      };
    } catch (error) {
      console.error('Error regenerating thumbnails:', error);
      throw error;
    }
  });

  // Kanye11: Regenerate preview/thumbnails for a single file
  // Used when MediaViewer can't display a file due to missing preview
  ipcMain.handle('media:regenerateSingleFile', async (_event, hash: unknown, filePath: unknown) => {
    try {
      const validHash = z.string().min(1).parse(hash);
      const validPath = z.string().min(1).parse(filePath);

      const archivePath = await getArchivePath();
      const mediaPathService = new MediaPathService(archivePath);
      const thumbnailService = new ThumbnailService(mediaPathService);
      const previewService = new PreviewExtractorService(mediaPathService, exifToolService);

      let sourcePath = validPath;
      let previewPath: string | null = null;

      // For RAW files, extract preview first
      const isRaw = /\.(nef|cr2|cr3|arw|srf|sr2|orf|pef|dng|rw2|raf|raw|rwl|3fr|fff|iiq|mrw|x3f|erf|mef|mos|kdc|dcr)$/i.test(validPath);

      if (isRaw) {
        console.log(`[Kanye11] Extracting preview for RAW file: ${validHash}`);
        previewPath = await previewService.extractPreview(validPath, validHash);
        if (previewPath) {
          sourcePath = previewPath;
          console.log(`[Kanye11] Preview extracted: ${previewPath}`);
        } else {
          console.warn(`[Kanye11] No embedded preview found in RAW file`);
          return { success: false, error: 'No embedded preview found in RAW file' };
        }
      }

      // Generate multi-tier thumbnails
      console.log(`[Kanye11] Generating thumbnails from: ${sourcePath}`);
      const result = await thumbnailService.generateAllSizes(sourcePath, validHash);

      if (result.thumb_sm) {
        // Update database
        await db
          .updateTable('imgs')
          .set({
            preview_path: previewPath || result.preview,
            thumb_path_sm: result.thumb_sm,
            thumb_path_lg: result.thumb_lg,
          })
          .where('imgsha', '=', validHash)
          .execute();

        console.log(`[Kanye11] Regeneration complete for ${validHash}`);
        return {
          success: true,
          previewPath: previewPath || result.preview,
          thumbPathSm: result.thumb_sm,
          thumbPathLg: result.thumb_lg,
        };
      }

      return { success: false, error: 'Failed to generate thumbnails' };
    } catch (error) {
      console.error('Error regenerating single file:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // ==================== DARKTABLE HANDLERS (Kanye10) ====================

  // Singleton instances for Darktable services
  let darktableService: DarktableService | null = null;
  let darktableQueueService: DarktableQueueService | null = null;

  const getDarktableServices = async () => {
    if (!darktableService) {
      const archivePath = await getArchivePath();
      const mediaPathService = new MediaPathService(archivePath);
      darktableService = new DarktableService(mediaPathService);

      // Create queue service with callback to update DB when processing completes
      darktableQueueService = new DarktableQueueService(
        darktableService,
        mediaPathService,
        async (hash: string, outputPath: string) => {
          // Update database with Darktable output path
          await mediaRepo.updateImageDarktablePath(hash, outputPath);
          console.log(`[Darktable] DB updated for ${hash}: ${outputPath}`);
        }
      );
    }
    return { darktableService, darktableQueueService };
  };

  // Check if Darktable CLI is available on this system
  ipcMain.handle('media:darktableAvailable', async () => {
    try {
      const { darktableService } = await getDarktableServices();
      const available = await darktableService!.isAvailable();
      const binaryPath = await darktableService!.findBinary();
      return { available, binaryPath };
    } catch (error) {
      console.error('Error checking Darktable availability:', error);
      return { available: false, binaryPath: null };
    }
  });

  // Get current Darktable queue status
  ipcMain.handle('media:darktableQueueStatus', async () => {
    try {
      const { darktableQueueService } = await getDarktableServices();
      return darktableQueueService!.getProgress();
    } catch (error) {
      console.error('Error getting Darktable queue status:', error);
      return { total: 0, completed: 0, failed: 0, currentHash: null, isProcessing: false };
    }
  });

  // Process all pending RAW files through Darktable
  ipcMain.handle('media:darktableProcessPending', async () => {
    try {
      const { darktableService, darktableQueueService } = await getDarktableServices();

      // Check if Darktable is available
      const available = await darktableService!.isAvailable();
      if (!available) {
        return { success: false, error: 'Darktable CLI not found', queued: 0 };
      }

      // Get RAW files that haven't been processed by Darktable
      const pendingFiles = await mediaRepo.getImagesForDarktableProcessing();
      console.log(`[Darktable] Found ${pendingFiles.length} RAW files pending processing`);

      if (pendingFiles.length === 0) {
        return { success: true, queued: 0, message: 'No RAW files pending' };
      }

      // Queue all files for processing
      const queued = await darktableQueueService!.enqueueBatch(
        pendingFiles.map(f => ({
          hash: f.imgsha,
          sourcePath: f.imgloc,
          locid: f.locid || '',
        }))
      );

      return { success: true, queued, total: pendingFiles.length };
    } catch (error) {
      console.error('Error processing pending Darktable files:', error);
      throw error;
    }
  });

  // Enable/disable Darktable processing
  ipcMain.handle('media:darktableSetEnabled', async (_event, enabled: unknown) => {
    try {
      const validEnabled = z.boolean().parse(enabled);
      const { darktableQueueService } = await getDarktableServices();
      darktableQueueService!.setEnabled(validEnabled);
      return { success: true };
    } catch (error) {
      console.error('Error setting Darktable enabled state:', error);
      throw error;
    }
  });
}
