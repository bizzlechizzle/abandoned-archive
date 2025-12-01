/**
 * Media Import IPC Handlers
 * Handles media selection, expansion, and import operations
 * Migration 25: Activity tracking - injects current user into imports
 * Migration 25 - Phase 3: Author attribution - tracks documenters in location_authors
 * OPT-031: Uses shared user service for getCurrentUser
 */
import { ipcMain, dialog } from 'electron';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import type { Kysely } from 'kysely';
import type { Database } from '../database';
import { SQLiteMediaRepository } from '../../repositories/sqlite-media-repository';
import { SQLiteImportRepository } from '../../repositories/sqlite-import-repository';
import { SQLiteLocationRepository } from '../../repositories/sqlite-location-repository';
import { SQLiteLocationAuthorsRepository } from '../../repositories/sqlite-location-authors-repository';
import { CryptoService } from '../../services/crypto-service';
import { ExifToolService } from '../../services/exiftool-service';
import { FFmpegService } from '../../services/ffmpeg-service';
import { FileImportService } from '../../services/file-import-service';
import { PhaseImportService } from '../../services/phase-import-service';
import { GeocodingService } from '../../services/geocoding-service';
import { getConfigService } from '../../services/config-service';
import { getBackupScheduler } from '../../services/backup-scheduler';
// OPT-031: Use shared user service
import { getCurrentUser } from '../../services/user-service';
// BagIt: Update manifest after imports
import { getBagItService } from './bagit';
import type { MediaFile } from '../../services/bagit-service';

// Track active imports for cancellation
const activeImports: Map<string, AbortController> = new Map();

/**
 * Helper to get media files for BagIt manifest update
 */
async function getMediaFilesForBagIt(
  db: Kysely<Database>,
  mediaRepo: SQLiteMediaRepository,
  locid: string
): Promise<MediaFile[]> {
  const files: MediaFile[] = [];
  const fsPromises = fs;

  // Get images
  const images = await db
    .selectFrom('imgs')
    .select(['imgsha', 'imgloc'])
    .where('locid', '=', locid)
    .where('hidden', '=', 0)
    .execute();

  for (const img of images) {
    try {
      const stats = await fsPromises.stat(img.imgloc);
      files.push({
        hash: img.imgsha,
        path: img.imgloc,
        type: 'image',
        size: stats.size,
      });
    } catch { /* File doesn't exist, skip */ }
  }

  // Get videos
  const videos = await db
    .selectFrom('vids')
    .select(['vidsha', 'vidloc'])
    .where('locid', '=', locid)
    .where('hidden', '=', 0)
    .execute();

  for (const vid of videos) {
    try {
      const stats = await fsPromises.stat(vid.vidloc);
      files.push({
        hash: vid.vidsha,
        path: vid.vidloc,
        type: 'video',
        size: stats.size,
      });
    } catch { /* File doesn't exist */ }
  }

  // Get documents
  const docs = await db
    .selectFrom('docs')
    .select(['docsha', 'docloc'])
    .where('locid', '=', locid)
    .where('hidden', '=', 0)
    .execute();

  for (const doc of docs) {
    try {
      const stats = await fsPromises.stat(doc.docloc);
      files.push({
        hash: doc.docsha,
        path: doc.docloc,
        type: 'document',
        size: stats.size,
      });
    } catch { /* File doesn't exist */ }
  }

  // Get maps
  const maps = await db
    .selectFrom('maps')
    .select(['mapsha', 'maploc'])
    .where('locid', '=', locid)
    .execute();

  for (const map of maps) {
    try {
      const stats = await fsPromises.stat(map.maploc);
      files.push({
        hash: map.mapsha,
        path: map.maploc,
        type: 'map',
        size: stats.size,
      });
    } catch { /* File doesn't exist */ }
  }

  return files;
}

/**
 * Migration 23 FIX: Auto-detect Live Photos and SDR duplicates for a location
 * This function matches IMG_xxxx.HEIC with IMG_xxxx.MOV and hides the video component
 * Also detects _sdr duplicate images and hides them
 */
async function detectLivePhotosForLocation(
  db: Kysely<Database>,
  mediaRepo: SQLiteMediaRepository,
  locid: string
): Promise<{ livePhotosHidden: number; sdrHidden: number }> {
  // Get all images and videos for this location
  const images = await mediaRepo.getImageFilenamesByLocation(locid);
  const videos = await mediaRepo.getVideoFilenamesByLocation(locid);

  console.log(`[detectLivePhotos] Scanning ${images.length} images and ${videos.length} videos for location ${locid}`);

  // Build set of image base names for fast lookup
  const imageBaseNames = new Map<string, string>();
  for (const img of images) {
    const ext = path.extname(img.imgnamo);
    const baseName = path.basename(img.imgnamo, ext).toLowerCase();
    imageBaseNames.set(baseName, img.imgsha);
  }

  let livePhotosHidden = 0;
  let sdrHidden = 0;

  // Detect Live Photo videos (IMG_xxxx.MOV paired with IMG_xxxx.HEIC)
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
        console.log(`[detectLivePhotos] Detected Live Photo pair: ${baseName}`);
      }
    }
  }

  // Detect SDR duplicates (filename_sdr.jpg paired with filename.jpg)
  for (const img of images) {
    if (/_sdr\./i.test(img.imgnamo)) {
      const hdrBaseName = path.basename(img.imgnamo.replace(/_sdr\./i, '.'), path.extname(img.imgnamo)).toLowerCase();
      if (imageBaseNames.has(hdrBaseName)) {
        await mediaRepo.setImageHidden(img.imgsha, true, 'sdr_duplicate');
        sdrHidden++;
        console.log(`[detectLivePhotos] Detected SDR duplicate: ${img.imgnamo}`);
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
          console.log(`[detectLivePhotos] Detected Android Motion Photo: ${img.imgnamo}`);
        }
      }
    } catch {
      // Ignore parse errors - non-fatal
    }
  }

  return { livePhotosHidden, sdrHidden };
}

// Extensions to skip entirely during import (not copied, not logged)
// .aae = Apple photo adjustments (sidecar metadata, not actual media)
// .psd/.psb = Photoshop project files (large, not archival media)
const SKIP_EXTENSIONS = new Set(['aae', 'psd', 'psb']);

// Supported file extensions (note: psd/psb removed - now in SKIP_EXTENSIONS)
const SUPPORTED_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'jpe', 'jfif', 'png', 'gif', 'bmp', 'tiff', 'tif', 'webp',
  'jp2', 'jpx', 'j2k', 'j2c', 'jxl', 'heic', 'heif', 'hif', 'avif',
  'nef', 'nrw', 'cr2', 'cr3', 'crw', 'arw', 'dng',
  'orf', 'raf', 'rw2', 'raw', 'pef', 'srw', 'x3f', '3fr', 'iiq', 'gpr',
  'mp4', 'm4v', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'flv', 'mpg', 'mpeg',
  'ts', 'mts', 'm2ts', 'vob', '3gp', 'ogv', 'rm', 'dv', 'mxf',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'csv'
]);

const SYSTEM_FILES = new Set(['thumbs.db', 'desktop.ini', 'icon\r', '.ds_store']);

export function registerMediaImportHandlers(
  db: Kysely<Database>,
  locationRepo: SQLiteLocationRepository,
  importRepo: SQLiteImportRepository
) {
  const mediaRepo = new SQLiteMediaRepository(db);
  const cryptoService = new CryptoService();
  const exifToolService = new ExifToolService();
  const ffmpegService = new FFmpegService();
  // Migration 25 - Phase 3: Location authors for documenter tracking
  const authorsRepo = new SQLiteLocationAuthorsRepository(db);

  ipcMain.handle('media:selectFiles', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        title: 'Select Media Files',
        filters: [
          { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp', 'heic', 'heif', 'nef', 'cr2', 'cr3', 'arw', 'dng', 'orf', 'raf', 'rw2', 'pef'] },
          { name: 'Videos', extensions: ['mp4', 'm4v', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'flv', 'mpg', 'mpeg'] },
          { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths;
    } catch (error) {
      console.error('Error selecting files:', error);
      throw error;
    }
  });

  ipcMain.handle('media:expandPaths', async (_event, paths: unknown) => {
    const validatedPaths = z.array(z.string()).parse(paths);
    const expandedPaths: string[] = [];
    let skippedCount = 0;  // Track skipped files for logging

    async function processPath(filePath: string): Promise<void> {
      try {
        const stat = await fs.stat(filePath);
        const fileName = path.basename(filePath).toLowerCase();

        if (stat.isFile()) {
          if (SYSTEM_FILES.has(fileName)) return;
          const ext = path.extname(filePath).toLowerCase().slice(1);

          // Skip excluded extensions (.aae, .psd, .psb)
          if (SKIP_EXTENSIONS.has(ext)) {
            skippedCount++;
            console.log(`[media:expandPaths] Skipping excluded extension: ${fileName}`);
            return;
          }

          if (ext || SUPPORTED_EXTENSIONS.has(ext)) {
            expandedPaths.push(filePath);
          }
        } else if (stat.isDirectory()) {
          const entries = await fs.readdir(filePath, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.name.startsWith('.')) continue;
            await processPath(path.join(filePath, entry.name));
          }
        }
      } catch (error) {
        console.error(`Error processing path ${filePath}:`, error);
      }
    }

    for (const p of validatedPaths) await processPath(p);

    if (skippedCount > 0) {
      console.log(`[media:expandPaths] Total files skipped (excluded extensions): ${skippedCount}`);
    }

    return expandedPaths;
  });

  ipcMain.handle('media:import', async (_event, input: unknown) => {
    try {
      const ImportInputSchema = z.object({
        files: z.array(z.object({ filePath: z.string(), originalName: z.string() })),
        locid: z.string().uuid(),
        subid: z.string().uuid().nullable().optional(),
        auth_imp: z.string().nullable(),
        deleteOriginals: z.boolean().default(false),
        // Migration 26: Contributor tracking
        is_contributed: z.number().default(0),
        contribution_source: z.string().nullable().optional(),
      });

      const validatedInput = ImportInputSchema.parse(input);
      const archivePath = await db.selectFrom('settings').select('value').where('key', '=', 'archive_folder').executeTakeFirst();

      if (!archivePath?.value) throw new Error('Archive folder not configured. Please set it in Settings.');

      const geocodingService = new GeocodingService(db);
      const fileImportService = new FileImportService(
        db, cryptoService, exifToolService, ffmpegService,
        mediaRepo, importRepo, locationRepo, archivePath.value, [], geocodingService
      );

      // Migration 25: Get current user for activity tracking
      const currentUser = await getCurrentUser(db);

      const filesForImport = validatedInput.files.map((f) => ({
        filePath: f.filePath, originalName: f.originalName,
        locid: validatedInput.locid, subid: validatedInput.subid || null,
        auth_imp: validatedInput.auth_imp,
        // Migration 25: Activity tracking
        imported_by_id: currentUser?.userId || null,
        imported_by: currentUser?.username || null,
        media_source: null, // Can be set in future for external sources
        // Migration 26: Contributor tracking
        is_contributed: validatedInput.is_contributed,
        contribution_source: validatedInput.contribution_source || null,
      }));

      const importId = `import-${Date.now()}`;
      const abortController = new AbortController();
      activeImports.set(importId, abortController);

      // FIX: Send importId immediately so cancel works before any file processing
      try {
        if (_event.sender && !_event.sender.isDestroyed()) {
          _event.sender.send('media:import:started', { importId });
        }
      } catch (e) { console.warn('[media:import] Failed to send started event:', e); }

      let result;
      try {
        result = await fileImportService.importFiles(
          filesForImport, validatedInput.deleteOriginals,
          (current, total, filename) => {
            try {
              if (_event.sender && !_event.sender.isDestroyed()) {
                _event.sender.send('media:import:progress', { current, total, filename, importId });
              }
            } catch (e) { console.warn('[media:import] Failed to send progress:', e); }
          },
          abortController.signal
        );
      } finally {
        activeImports.delete(importId);
      }

      if (result.imported > 0) {
        // Migration 25 - Phase 3: Track the documenter in location_authors table
        if (currentUser) {
          await authorsRepo.trackUserContribution(validatedInput.locid, currentUser.userId, 'import').catch((err) => {
            console.warn('[media:import] Failed to track documenter:', err);
            // Non-fatal - don't fail import
          });
        }

        // Migration 23 FIX: Auto-detect Live Photos and SDR duplicates after import
        // This runs automatically so users don't have to manually trigger detection
        try {
          const livePhotoResult = await detectLivePhotosForLocation(db, mediaRepo, validatedInput.locid);
          console.log(`[media:import] Auto-detected Live Photos: ${livePhotoResult.livePhotosHidden} hidden, ${livePhotoResult.sdrHidden} SDR duplicates`);
        } catch (e) { console.warn('[media:import] Live Photo auto-detection failed (non-fatal):', e); }

        try {
          const config = getConfigService().get();
          if (config.backup.enabled && config.backup.backupAfterImport) {
            await getBackupScheduler().createBackup();
          }
        } catch (e) { console.warn('[media:import] Failed to create post-import backup:', e); }

        // BagIt: Update manifest after successful import (non-blocking)
        try {
          const bagItService = getBagItService();
          if (bagItService) {
            const loc = await locationRepo.findById(validatedInput.locid);
            if (loc) {
              const mediaFiles = await getMediaFilesForBagIt(db, mediaRepo, validatedInput.locid);
              await bagItService.updateManifest({
                locid: loc.locid,
                loc12: loc.loc12,
                slocnam: loc.slocnam || '',
                address_state: loc.address?.state || null,
                type: loc.type || null,
              }, mediaFiles);
              console.log(`[BagIt] Updated manifest for location: ${loc.locnam} (${mediaFiles.length} files)`);
            }
          }
        } catch (e) { console.warn('[media:import] Failed to update BagIt manifest (non-fatal):', e); }
      }

      // FIX: Return importId immediately so cancel can work before progress events arrive
      return { ...result, importId };
    } catch (error) {
      console.error('Error importing media:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('media:phaseImport', async (_event, input: unknown) => {
    try {
      const ImportInputSchema = z.object({
        files: z.array(z.object({ filePath: z.string(), originalName: z.string() })),
        locid: z.string().uuid(),
        subid: z.string().uuid().nullable().optional(),
        auth_imp: z.string().nullable(),
        deleteOriginals: z.boolean().default(false),
        useHardlinks: z.boolean().default(false),
        verifyChecksums: z.boolean().default(true),
      });

      const validatedInput = ImportInputSchema.parse(input);
      const archivePath = await db.selectFrom('settings').select('value').where('key', '=', 'archive_folder').executeTakeFirst();

      if (!archivePath?.value) throw new Error('Archive folder not configured. Please set it in Settings.');

      const geocodingService = new GeocodingService(db);
      const phaseImportService = new PhaseImportService(
        db, cryptoService, exifToolService, ffmpegService,
        mediaRepo, importRepo, locationRepo, archivePath.value, [], geocodingService
      );

      // Migration 25: Get current user for activity tracking
      const currentUser = await getCurrentUser(db);

      const filesForImport = validatedInput.files.map((f) => ({
        filePath: f.filePath, originalName: f.originalName,
        locid: validatedInput.locid, subid: validatedInput.subid || null,
        auth_imp: validatedInput.auth_imp,
        // Migration 25: Activity tracking
        imported_by_id: currentUser?.userId || null,
        imported_by: currentUser?.username || null,
        media_source: null, // Can be set in future for external sources
      }));

      const importId = `phase-import-${Date.now()}`;
      const abortController = new AbortController();
      activeImports.set(importId, abortController);

      let result;
      try {
        result = await phaseImportService.importFiles(
          filesForImport,
          { deleteOriginals: validatedInput.deleteOriginals, useHardlinks: validatedInput.useHardlinks, verifyChecksums: validatedInput.verifyChecksums },
          (progress) => {
            try {
              if (_event.sender && !_event.sender.isDestroyed()) {
                _event.sender.send('media:phaseImport:progress', {
                  importId, phase: progress.phase, phaseProgress: progress.phaseProgress,
                  currentFile: progress.currentFile, filesProcessed: progress.filesProcessed,
                  totalFiles: progress.totalFiles,
                });
              }
            } catch (e) { console.warn('[media:phaseImport] Failed to send progress:', e); }
          },
          abortController.signal
        );
      } finally {
        activeImports.delete(importId);
      }

      if (result.success && result.summary.imported > 0) {
        // Migration 25 - Phase 3: Track the documenter in location_authors table
        if (currentUser) {
          await authorsRepo.trackUserContribution(validatedInput.locid, currentUser.userId, 'import').catch((err) => {
            console.warn('[media:phaseImport] Failed to track documenter:', err);
            // Non-fatal - don't fail import
          });
        }

        // Migration 23 FIX: Auto-detect Live Photos and SDR duplicates after import
        try {
          const livePhotoResult = await detectLivePhotosForLocation(db, mediaRepo, validatedInput.locid);
          console.log(`[media:phaseImport] Auto-detected Live Photos: ${livePhotoResult.livePhotosHidden} hidden, ${livePhotoResult.sdrHidden} SDR duplicates`);
        } catch (e) { console.warn('[media:phaseImport] Live Photo auto-detection failed (non-fatal):', e); }

        try {
          const config = getConfigService().get();
          if (config.backup.enabled && config.backup.backupAfterImport) {
            await getBackupScheduler().createBackup();
          }
        } catch (e) { console.warn('[media:phaseImport] Failed to create post-import backup:', e); }

        // BagIt: Update manifest after successful import (non-blocking)
        try {
          const bagItService = getBagItService();
          if (bagItService) {
            const loc = await locationRepo.findById(validatedInput.locid);
            if (loc) {
              const mediaFiles = await getMediaFilesForBagIt(db, mediaRepo, validatedInput.locid);
              await bagItService.updateManifest({
                locid: loc.locid,
                loc12: loc.loc12,
                slocnam: loc.slocnam || '',
                address_state: loc.address?.state || null,
                type: loc.type || null,
              }, mediaFiles);
              console.log(`[BagIt] Updated manifest for location: ${loc.locnam} (${mediaFiles.length} files)`);
            }
          }
        } catch (e) { console.warn('[media:phaseImport] Failed to update BagIt manifest (non-fatal):', e); }
      }

      return result;
    } catch (error) {
      console.error('Error in phase import:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('media:import:cancel', async (_event, importId: unknown) => {
    try {
      const validatedId = z.string().min(1).parse(importId);
      const controller = activeImports.get(validatedId);
      if (controller) {
        controller.abort();
        return { success: true, message: 'Import cancelled' };
      }
      return { success: false, message: 'No active import found with that ID' };
    } catch (error) {
      console.error('Error cancelling import:', error);
      throw error;
    }
  });

  return { mediaRepo, cryptoService, exifToolService, ffmpegService };
}
