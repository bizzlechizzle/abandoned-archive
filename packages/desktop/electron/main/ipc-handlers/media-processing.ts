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

export function registerMediaProcessingHandlers(
  db: Kysely<Database>,
  mediaRepo: SQLiteMediaRepository,
  exifToolService: ExifToolService,
  ffmpegService: FFmpegService
) {
  const mediaCacheService = new MediaCacheService();
  const preloadService = new PreloadService(mediaCacheService);

  const getArchivePath = async (): Promise<string> => {
    const result = await db.selectFrom('settings').select('value').where('key', '=', 'archive_folder').executeTakeFirst();
    if (!result?.value) throw new Error('Archive path not configured');
    return result.value;
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

  // Show file in Finder (Mac) / Files (Linux)
  ipcMain.handle('media:showInFolder', async (_event, filePath: unknown) => {
    try {
      const validatedPath = z.string().min(1).max(4096).parse(filePath);
      const archivePath = await db.selectFrom('settings').select('value').where('key', '=', 'archive_folder').executeTakeFirst();

      if (!archivePath?.value) throw new Error('Archive folder not configured');

      const normalizedFilePath = path.resolve(validatedPath);
      const normalizedArchivePath = path.resolve(archivePath.value);

      if (!normalizedFilePath.startsWith(normalizedArchivePath + path.sep)) {
        throw new Error('Access denied: file is outside the archive folder');
      }

      shell.showItemInFolder(validatedPath);
      return { success: true };
    } catch (error) {
      console.error('Error showing file in folder:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  // Get full metadata (ExifTool/FFprobe) for a media item
  // Used by MediaViewer's enhanced info panel
  ipcMain.handle('media:getFullMetadata', async (_event, hash: unknown, mediaType: unknown) => {
    try {
      const validHash = z.string().min(1).parse(hash);
      const validType = z.enum(['image', 'video', 'document']).parse(mediaType);

      let result: { meta_exiftool: string | null; meta_ffmpeg?: string | null } | undefined;

      if (validType === 'image') {
        result = await db
          .selectFrom('imgs')
          .select(['meta_exiftool'])
          .where('imgsha', '=', validHash)
          .executeTakeFirst();
      } else if (validType === 'video') {
        result = await db
          .selectFrom('vids')
          .select(['meta_exiftool', 'meta_ffmpeg'])
          .where('vidsha', '=', validHash)
          .executeTakeFirst();
      } else if (validType === 'document') {
        result = await db
          .selectFrom('docs')
          .select(['meta_exiftool'])
          .where('docsha', '=', validHash)
          .executeTakeFirst();
      }

      if (!result) {
        return { success: false, error: 'Media not found' };
      }

      // Parse JSON strings into objects
      let exiftool = null;
      let ffmpeg = null;

      if (result.meta_exiftool) {
        try {
          exiftool = JSON.parse(result.meta_exiftool);
        } catch {
          console.warn('Failed to parse meta_exiftool JSON');
        }
      }

      if ('meta_ffmpeg' in result && result.meta_ffmpeg) {
        try {
          ffmpeg = JSON.parse(result.meta_ffmpeg);
        } catch {
          console.warn('Failed to parse meta_ffmpeg JSON');
        }
      }

      return { success: true, exiftool, ffmpeg };
    } catch (error) {
      console.error('Error getting full metadata:', error);
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
  // When force=true, regenerates ALL thumbnails (useful after fixing extraction bugs)
  ipcMain.handle('media:regenerateAllThumbnails', async (_event, options?: unknown) => {
    const opts = z.object({ force: z.boolean().optional() }).optional().parse(options);
    const force = opts?.force ?? false;

    try {
      const archivePath = await getArchivePath();
      const mediaPathService = new MediaPathService(archivePath);
      const thumbnailService = new ThumbnailService(mediaPathService);
      const previewService = new PreviewExtractorService(mediaPathService, exifToolService);

      // Get images to process - all images if force=true, otherwise just missing
      const images = force
        ? await mediaRepo.getAllImages()
        : await mediaRepo.getImagesWithoutThumbnails();
      let generated = 0;
      let failed = 0;

      console.log(`[Kanye6] Regenerating thumbnails for ${images.length} images (force=${force})...`);

      for (const img of images) {
        try {
          // For RAW/HEIC files, extract preview first (sharp can't decode these directly)
          // For other files, ALWAYS use original when force=true to fix rotation
          let sourcePath = img.imgloc;
          const needsPreviewExtraction = /\.(nef|cr2|cr3|arw|srf|sr2|orf|pef|dng|rw2|raf|raw|rwl|3fr|fff|iiq|mrw|x3f|erf|mef|mos|kdc|dcr|heic|heif)$/i.test(img.imgloc);

          if (needsPreviewExtraction) {
            // Always re-extract preview when force=true (picks highest resolution)
            const preview = await previewService.extractPreview(img.imgloc, img.imgsha, force);
            if (preview) {
              sourcePath = preview;
              await mediaRepo.updateImagePreviewPath(img.imgsha, preview);
            }
          } else if (!force && img.preview_path) {
            // Only use existing preview when NOT forcing regeneration
            // When force=true, use original to apply correct EXIF rotation
            sourcePath = img.preview_path;
          }

          // Generate multi-tier thumbnails (400px, 800px, 1920px)
          const result = await thumbnailService.generateAllSizes(sourcePath, img.imgsha, force);

          if (result.thumb_sm) {
            // Update database with all thumbnail paths
            // FIX: Preserve RAW/HEIC preview_path, don't overwrite with thumbnail preview
            await db
              .updateTable('imgs')
              .set({
                thumb_path_sm: result.thumb_sm,
                thumb_path_lg: result.thumb_lg,
                // For RAW/HEIC files, keep extracted preview; for others, use thumbnail preview
                preview_path: needsPreviewExtraction ? (sourcePath !== img.imgloc ? sourcePath : img.preview_path) : (result.preview || img.preview_path),
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

  // DECISION-020: Regenerate video thumbnails (poster frames)
  // Generates poster frame from video, then multi-tier thumbnails from poster
  ipcMain.handle('media:regenerateVideoThumbnails', async (_event, options?: unknown) => {
    const opts = z.object({ force: z.boolean().optional() }).optional().parse(options);
    const force = opts?.force ?? false;

    try {
      const archivePath = await getArchivePath();
      const mediaPathService = new MediaPathService(archivePath);
      const thumbnailService = new ThumbnailService(mediaPathService);
      const posterService = new PosterFrameService(mediaPathService, ffmpegService);

      // Get videos without thumbnails (or all if force)
      const videos = force
        ? await mediaRepo.getAllVideos()
        : await mediaRepo.getVideosWithoutThumbnails();

      let generated = 0;
      let failed = 0;

      console.log(`[DECISION-020] Regenerating thumbnails for ${videos.length} videos (force=${force})...`);

      for (const vid of videos) {
        try {
          // Step 1: Generate poster frame from video
          const posterPath = await posterService.generatePoster(vid.vidloc, vid.vidsha);

          if (!posterPath) {
            console.warn(`[DECISION-020] No poster generated for ${vid.vidsha}`);
            failed++;
            continue;
          }

          // Step 2: Generate multi-tier thumbnails from poster
          const result = await thumbnailService.generateAllSizes(posterPath, vid.vidsha, force);

          if (result.thumb_sm) {
            // Update database with thumbnail paths
            await db
              .updateTable('vids')
              .set({
                thumb_path_sm: result.thumb_sm,
                thumb_path_lg: result.thumb_lg,
                preview_path: result.preview,
              })
              .where('vidsha', '=', vid.vidsha)
              .execute();

            generated++;
            console.log(`[DECISION-020] Generated thumbnails for video ${vid.vidsha}`);
          } else {
            failed++;
          }
        } catch (err) {
          console.error(`[DECISION-020] Failed to generate thumbnails for ${vid.vidsha}:`, err);
          failed++;
        }
      }

      console.log(`[DECISION-020] Video thumbnail regeneration complete: ${generated} generated, ${failed} failed`);

      return { generated, failed, total: videos.length };
    } catch (error) {
      console.error('Error regenerating video thumbnails:', error);
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

      // For RAW/HEIC files, extract preview first (sharp can't decode these directly)
      const needsPreviewExtraction = /\.(nef|cr2|cr3|arw|srf|sr2|orf|pef|dng|rw2|raf|raw|rwl|3fr|fff|iiq|mrw|x3f|erf|mef|mos|kdc|dcr|heic|heif)$/i.test(validPath);

      if (needsPreviewExtraction) {
        console.log(`[Kanye11] Extracting preview for RAW/HEIC file: ${validHash}`);
        previewPath = await previewService.extractPreview(validPath, validHash);
        if (previewPath) {
          sourcePath = previewPath;
          console.log(`[Kanye11] Preview extracted: ${previewPath}`);
        } else {
          console.warn(`[Kanye11] No embedded preview found in RAW/HEIC file`);
          return { success: false, error: 'No embedded preview found in RAW/HEIC file' };
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

  // Set hidden status for media items (user-initiated hide/unhide)
  ipcMain.handle('media:setHidden', async (_event, input: unknown) => {
    try {
      const validInput = z.object({
        hash: z.string().min(1),
        type: z.enum(['image', 'video', 'document']),
        hidden: z.boolean(),
        reason: z.string().optional(),
      }).parse(input);

      const { hash, type, hidden, reason } = validInput;

      if (type === 'image') {
        await mediaRepo.setImageHidden(hash, hidden, reason ?? 'user');
      } else if (type === 'video') {
        await mediaRepo.setVideoHidden(hash, hidden, reason ?? 'user');
      } else if (type === 'document') {
        await mediaRepo.setDocumentHidden(hash, hidden, reason ?? 'user');
      }

      console.log(`[media:setHidden] ${type} ${hash} hidden=${hidden} reason=${reason ?? 'user'}`);
      return { success: true };
    } catch (error) {
      console.error('Error setting hidden status:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  // Scan location for Live Photos and SDR duplicates (one-time or manual trigger)
  ipcMain.handle('media:detectLivePhotosAndSDR', async (_event, locid: unknown) => {
    try {
      const validLocid = z.string().uuid().parse(locid);

      // Get all images and videos for this location
      const images = await mediaRepo.getImageFilenamesByLocation(validLocid);
      const videos = await mediaRepo.getVideoFilenamesByLocation(validLocid);

      console.log(`[media:detectLivePhotosAndSDR] Scanning ${images.length} images and ${videos.length} videos`);

      // Build set of image base names for fast lookup
      const imageBaseNames = new Map<string, string>();
      for (const img of images) {
        const ext = path.extname(img.imgnamo);
        const baseName = path.basename(img.imgnamo, ext).toLowerCase();
        imageBaseNames.set(baseName, img.imgsha);
      }

      let livePhotosHidden = 0;
      let sdrHidden = 0;

      // Detect Live Photo videos
      for (const vid of videos) {
        const ext = path.extname(vid.vidnamo).toLowerCase();
        if (ext === '.mov' || ext === '.mp4') {
          const baseName = path.basename(vid.vidnamo, ext).toLowerCase();
          if (imageBaseNames.has(baseName)) {
            await mediaRepo.setVideoHidden(vid.vidsha, true, 'live_photo');
            await mediaRepo.setVideoLivePhoto(vid.vidsha, true);
            const imgsha = imageBaseNames.get(baseName);
            if (imgsha) {
              await mediaRepo.setImageLivePhoto(imgsha, true);
            }
            livePhotosHidden++;
          }
        }
      }

      // Detect SDR duplicates
      for (const img of images) {
        if (/_sdr\./i.test(img.imgnamo)) {
          const hdrBaseName = path.basename(img.imgnamo.replace(/_sdr\./i, '.'), path.extname(img.imgnamo)).toLowerCase();
          if (imageBaseNames.has(hdrBaseName)) {
            await mediaRepo.setImageHidden(img.imgsha, true, 'sdr_duplicate');
            sdrHidden++;
          }
        }
      }

      // Check for Android Motion Photos (EXIF flag)
      for (const img of images) {
        try {
          const imgData = await mediaRepo.findImageByHash(img.imgsha);
          if (imgData?.meta_exiftool) {
            const exif = JSON.parse(imgData.meta_exiftool);
            if (exif.MotionPhoto === 1 || exif.MicroVideo || exif.MicroVideoOffset) {
              await mediaRepo.setImageLivePhoto(img.imgsha, true);
            }
          }
        } catch {
          // Ignore parse errors
        }
      }

      console.log(`[media:detectLivePhotosAndSDR] Done: ${livePhotosHidden} Live Photo videos, ${sdrHidden} SDR duplicates`);
      return { success: true, livePhotosHidden, sdrHidden };
    } catch (error) {
      console.error('Error detecting Live Photos/SDR:', error);
      throw error;
    }
  });

  // Migration 30: Regenerate DNG previews using LibRaw for full-quality rendering
  // This fixes "potato quality" drone shots where embedded preview is tiny (960x720 for 5376x3956 image)
  ipcMain.handle('media:regenerateDngPreviews', async (_event) => {
    try {
      const archivePath = await getArchivePath();
      const mediaPathService = new MediaPathService(archivePath);
      const previewService = new PreviewExtractorService(mediaPathService, exifToolService);

      // Get DNG files that need LibRaw rendering
      const dngFiles = await mediaRepo.getDngImagesNeedingLibraw();
      let rendered = 0;
      let failed = 0;

      console.log(`[Migration30] Found ${dngFiles.length} DNG files needing LibRaw rendering...`);

      for (const img of dngFiles) {
        try {
          // Use extractPreviewWithQuality which automatically uses LibRaw when embedded preview is low-quality
          const result = await previewService.extractPreviewWithQuality(
            img.imgloc,
            img.imgsha,
            img.meta_width,
            img.meta_height,
            true  // force re-extraction
          );

          if (result.previewPath) {
            await mediaRepo.updateImagePreviewWithQuality(img.imgsha, result.previewPath, result.qualityLevel);
            rendered++;
            console.log(`[Migration30] Rendered ${img.imgsha}: quality=${result.qualityLevel}`);
          } else {
            failed++;
            console.warn(`[Migration30] No preview generated for ${img.imgsha}`);
          }
        } catch (err) {
          console.error(`[Migration30] Failed to render ${img.imgsha}:`, err);
          failed++;
        }
      }

      console.log(`[Migration30] DNG rendering complete: ${rendered} rendered, ${failed} failed`);
      return { success: true, rendered, failed, total: dngFiles.length };
    } catch (error) {
      console.error('Error regenerating DNG previews:', error);
      throw error;
    }
  });

}
