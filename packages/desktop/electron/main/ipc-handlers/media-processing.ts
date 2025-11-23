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
      return { generated, failed, total: images.length };
    } catch (error) {
      console.error('Error regenerating thumbnails:', error);
      throw error;
    }
  });
}
