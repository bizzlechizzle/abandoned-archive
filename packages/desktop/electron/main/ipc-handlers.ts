import { ipcMain, shell, dialog, app } from 'electron';
import { getDatabase, getDatabasePath, getDefaultDbPath, closeDatabase } from './database';
import { SQLiteLocationRepository } from '../repositories/sqlite-location-repository';
import {
  getCustomDatabasePath,
  setCustomDatabasePath,
  getEffectiveDatabasePath,
} from '../services/bootstrap-config';
import { SQLiteImportRepository } from '../repositories/sqlite-import-repository';
import { SQLiteMediaRepository } from '../repositories/sqlite-media-repository';
import { SQLiteNotesRepository } from '../repositories/sqlite-notes-repository';
import { SQLiteProjectsRepository } from '../repositories/sqlite-projects-repository';
import { SQLiteBookmarksRepository } from '../repositories/sqlite-bookmarks-repository';
import { SQLiteUsersRepository } from '../repositories/sqlite-users-repository';
import { CryptoService } from '../services/crypto-service';
import { ExifToolService } from '../services/exiftool-service';
import { FFmpegService } from '../services/ffmpeg-service';
import { FileImportService } from '../services/file-import-service';
import { getHealthMonitor } from '../services/health-monitor';
import { getBackupScheduler } from '../services/backup-scheduler';
import { getIntegrityChecker } from '../services/integrity-checker';
import { getDiskSpaceMonitor } from '../services/disk-space-monitor';
import { getMaintenanceScheduler } from '../services/maintenance-scheduler';
import { getRecoverySystem } from '../services/recovery-system';
import { getConfigService } from '../services/config-service';
import { GeocodingService } from '../services/geocoding-service';
import { LocationInputSchema } from '@au-archive/core';
import type { LocationInput, LocationFilters } from '@au-archive/core';
import { z } from 'zod';
import fs from 'fs/promises';

// FIX 4.3: Track active imports for cancellation support
const activeImports: Map<string, AbortController> = new Map();
import path from 'path';
import { validate, UuidSchema, LimitSchema, FilePathSchema, UrlSchema, SettingKeySchema } from './ipc-validation';

export function registerIpcHandlers() {
  const db = getDatabase();
  const locationRepo = new SQLiteLocationRepository(db);
  const importRepo = new SQLiteImportRepository(db);
  const mediaRepo = new SQLiteMediaRepository(db);
  const notesRepo = new SQLiteNotesRepository(db);
  const projectsRepo = new SQLiteProjectsRepository(db);
  const bookmarksRepo = new SQLiteBookmarksRepository(db);
  const usersRepo = new SQLiteUsersRepository(db);

  // Initialize services
  const cryptoService = new CryptoService();
  const exifToolService = new ExifToolService();
  const ffmpegService = new FFmpegService();

  // Location queries
  ipcMain.handle('location:findAll', async (_event, filters?: LocationFilters) => {
    try {
      return await locationRepo.findAll(filters);
    } catch (error) {
      console.error('Error finding locations:', error);
      throw error;
    }
  });

  ipcMain.handle('location:findById', async (_event, id: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(id);
      return await locationRepo.findById(validatedId);
    } catch (error) {
      console.error('Error finding location:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('location:create', async (_event, input: unknown) => {
    try {
      const validatedInput = LocationInputSchema.parse(input);
      return await locationRepo.create(validatedInput);
    } catch (error) {
      console.error('Error creating location:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('location:update', async (_event, id: unknown, input: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(id);
      const validatedInput = LocationInputSchema.partial().parse(input);
      return await locationRepo.update(validatedId, validatedInput);
    } catch (error) {
      console.error('Error updating location:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('location:delete', async (_event, id: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(id);
      await locationRepo.delete(validatedId);
    } catch (error) {
      console.error('Error deleting location:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('location:count', async (_event, filters?: LocationFilters) => {
    try {
      return await locationRepo.count(filters);
    } catch (error) {
      console.error('Error counting locations:', error);
      throw error;
    }
  });

  // Special filters
  ipcMain.handle('location:random', async () => {
    try {
      const count = await db.selectFrom('locs').select((eb) => eb.fn.count('locid').as('count')).executeTakeFirst();
      const total = Number(count?.count || 0);
      if (total === 0) return null;

      const randomOffset = Math.floor(Math.random() * total);
      const result = await db
        .selectFrom('locs')
        .selectAll()
        .limit(1)
        .offset(randomOffset)
        .executeTakeFirst();

      if (!result) return null;
      return await locationRepo.findById(result.locid);
    } catch (error) {
      console.error('Error getting random location:', error);
      throw error;
    }
  });

  ipcMain.handle('location:undocumented', async () => {
    try {
      return await locationRepo.findAll({ documented: false });
    } catch (error) {
      console.error('Error getting undocumented locations:', error);
      throw error;
    }
  });

  ipcMain.handle('location:historical', async () => {
    try {
      // Use a single query instead of N+1 queries via findById loop
      return await locationRepo.findAll({ historic: true });
    } catch (error) {
      console.error('Error getting historical locations:', error);
      throw error;
    }
  });

  ipcMain.handle('location:favorites', async () => {
    try {
      // Use a single query instead of N+1 queries via findById loop
      return await locationRepo.findAll({ favorite: true });
    } catch (error) {
      console.error('Error getting favorite locations:', error);
      throw error;
    }
  });

  ipcMain.handle('location:toggleFavorite', async (_event, id: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(id);
      const location = await locationRepo.findById(validatedId);
      if (!location) {
        throw new Error('Location not found');
      }
      const newFavoriteState = !location.favorite;
      await locationRepo.update(validatedId, { favorite: newFavoriteState });
      return newFavoriteState;
    } catch (error) {
      console.error('Error toggling favorite:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  // Stats queries
  ipcMain.handle('stats:topStates', async (_event, limit: unknown = 5) => {
    try {
      const validatedLimit = validate(LimitSchema, limit);
      const result = await db
        .selectFrom('locs')
        .select(['address_state as state', (eb) => eb.fn.count('locid').as('count')])
        .where('address_state', 'is not', null)
        .groupBy('address_state')
        .orderBy('count', 'desc')
        .limit(validatedLimit)
        .execute();
      return result;
    } catch (error) {
      console.error('Error getting top states:', error);
      throw error;
    }
  });

  ipcMain.handle('stats:topTypes', async (_event, limit: unknown = 5) => {
    try {
      const validatedLimit = validate(LimitSchema, limit);
      const result = await db
        .selectFrom('locs')
        .select(['type', (eb) => eb.fn.count('locid').as('count')])
        .where('type', 'is not', null)
        .groupBy('type')
        .orderBy('count', 'desc')
        .limit(validatedLimit)
        .execute();
      return result;
    } catch (error) {
      console.error('Error getting top types:', error);
      throw error;
    }
  });

  // Settings queries
  ipcMain.handle('settings:get', async (_event, key: unknown) => {
    try {
      const validatedKey = z.string().min(1).parse(key);
      const result = await db
        .selectFrom('settings')
        .select('value')
        .where('key', '=', validatedKey)
        .executeTakeFirst();
      return result?.value ?? null;
    } catch (error) {
      console.error('Error getting setting:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('settings:getAll', async () => {
    try {
      const results = await db
        .selectFrom('settings')
        .selectAll()
        .execute();
      return results.reduce((acc, row) => {
        acc[row.key] = row.value;
        return acc;
      }, {} as Record<string, string>);
    } catch (error) {
      console.error('Error getting all settings:', error);
      throw error;
    }
  });

  ipcMain.handle('settings:set', async (_event, key: unknown, value: unknown) => {
    try {
      // Security: Only allow whitelisted settings keys
      const validatedKey = SettingKeySchema.parse(key);
      const validatedValue = z.string().parse(value);
      await db
        .insertInto('settings')
        .values({ key: validatedKey, value: validatedValue })
        .onConflict((oc) => oc.column('key').doUpdateSet({ value: validatedValue }))
        .execute();
    } catch (error) {
      console.error('Error setting value:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  // Shell operations
  ipcMain.handle('shell:openExternal', async (_event, url: unknown) => {
    try {
      const validatedUrl = z.string().url().parse(url);
      // Security: Only allow http, https, and mailto protocols
      if (!validatedUrl.match(/^(https?|mailto):/)) {
        throw new Error('Only http, https, and mailto URLs are allowed');
      }
      await shell.openExternal(validatedUrl);
    } catch (error) {
      console.error('Error opening external URL:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  // Dialog operations
  ipcMain.handle('dialog:selectFolder', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select Archive Folder',
        buttonLabel: 'Select Folder',
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return result.filePaths[0];
    } catch (error) {
      console.error('Error selecting folder:', error);
      throw error;
    }
  });

  // Import operations
  ipcMain.handle('imports:create', async (_event, input: unknown) => {
    try {
      const ImportInputSchema = z.object({
        locid: z.string().uuid().nullable(),
        auth_imp: z.string().nullable(),
        img_count: z.number().int().min(0).optional(),
        vid_count: z.number().int().min(0).optional(),
        doc_count: z.number().int().min(0).optional(),
        map_count: z.number().int().min(0).optional(),
        notes: z.string().nullable().optional(),
      });

      const validatedInput = ImportInputSchema.parse(input);
      return await importRepo.create(validatedInput);
    } catch (error) {
      console.error('Error creating import record:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('imports:findRecent', async (_event, limit: unknown = 5) => {
    try {
      const validatedLimit = validate(LimitSchema, limit);
      return await importRepo.findRecent(validatedLimit);
    } catch (error) {
      console.error('Error finding recent imports:', error);
      throw error;
    }
  });

  ipcMain.handle('imports:findByLocation', async (_event, locid: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(locid);
      return await importRepo.findByLocation(validatedId);
    } catch (error) {
      console.error('Error finding imports by location:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('imports:findAll', async () => {
    try {
      return await importRepo.findAll();
    } catch (error) {
      console.error('Error finding all imports:', error);
      throw error;
    }
  });

  ipcMain.handle('imports:getTotalMediaCount', async () => {
    try {
      return await importRepo.getTotalMediaCount();
    } catch (error) {
      console.error('Error getting total media count:', error);
      throw error;
    }
  });

  // Media operations
  ipcMain.handle('media:selectFiles', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        title: 'Select Media Files',
        filters: [
          { name: 'Images', extensions: [
            // Standard + RAW formats (ExifTool supported)
            'jpg', 'jpeg', 'jpe', 'jfif', 'png', 'gif', 'bmp', 'tiff', 'tif', 'webp',
            'jp2', 'jpx', 'j2k', 'j2c', 'jxl', 'heic', 'heif', 'hif', 'avif',
            'psd', 'psb', 'ai', 'eps', 'epsf', 'svg', 'svgz',
            'nef', 'nrw', 'cr2', 'cr3', 'crw', 'ciff', 'arw', 'arq', 'srf', 'sr2', 'dng',
            'orf', 'ori', 'raf', 'rw2', 'raw', 'rwl', 'pef', 'ptx', 'srw', 'x3f',
            '3fr', 'fff', 'dcr', 'k25', 'kdc', 'mef', 'mos', 'mrw', 'erf', 'iiq', 'rwz', 'gpr'
          ]},
          { name: 'Videos', extensions: [
            // FFprobe/FFmpeg supported
            'mp4', 'm4v', 'm4p', 'mov', 'qt', 'avi', 'divx', 'mkv', 'webm',
            'wmv', 'asf', 'flv', 'f4v', 'mpg', 'mpeg', 'mpe', 'mpv', 'm2v',
            'ts', 'mts', 'm2ts', 'vob', '3gp', '3g2', 'ogv', 'ogg', 'rm', 'rmvb',
            'dv', 'dif', 'mxf', 'gxf'
          ]},
          { name: 'Documents', extensions: [
            'pdf', 'doc', 'docx', 'docm', 'xls', 'xlsx', 'xlsm', 'xlsb',
            'ppt', 'pptx', 'pptm', 'odt', 'ods', 'odp', 'odg', 'rtf',
            'txt', 'text', 'log', 'csv', 'tsv', 'epub', 'mobi', 'djvu', 'djv'
          ]},
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return result.filePaths;
    } catch (error) {
      console.error('Error selecting files:', error);
      throw error;
    }
  });

  // Expand paths - handles both files and directories, returns all valid media file paths
  ipcMain.handle('media:expandPaths', async (_event, paths: unknown) => {
    const PathsSchema = z.array(z.string());
    const validatedPaths = PathsSchema.parse(paths);

    // Comprehensive format support based on ExifTool and FFprobe capabilities
    const supportedExts = new Set([
      // === IMAGES (ExifTool supported) ===
      // Standard formats
      'jpg', 'jpeg', 'jpe', 'jfif', 'png', 'gif', 'bmp', 'tiff', 'tif', 'webp',
      'jp2', 'jpx', 'j2k', 'j2c',       // JPEG 2000
      'jxl',                            // JPEG XL
      'heic', 'heif', 'hif',            // Apple HEIF/HEVC
      'avif',                           // AV1 Image
      'psd', 'psb',                     // Photoshop
      'ai', 'eps', 'epsf',              // Adobe Illustrator/PostScript
      'svg', 'svgz',                    // Vector
      'ico', 'cur',                     // Icons
      'pcx', 'dcx',                     // PC Paintbrush
      'ppm', 'pgm', 'pbm', 'pnm',       // Netpbm
      'tga', 'icb', 'vda', 'vst',       // Targa
      'dds',                            // DirectDraw Surface
      'exr',                            // OpenEXR
      'hdr',                            // Radiance HDR
      'dpx', 'cin',                     // Digital Picture Exchange
      'fits', 'fit', 'fts',             // Flexible Image Transport
      // RAW camera formats (ExifTool supported - comprehensive list)
      'nef', 'nrw',                     // Nikon
      'cr2', 'cr3', 'crw', 'ciff',      // Canon
      'arw', 'arq', 'srf', 'sr2',       // Sony
      'dng',                            // Adobe DNG (universal)
      'orf', 'ori',                     // Olympus
      'raf',                            // Fujifilm
      'rw2', 'raw', 'rwl',              // Panasonic/Leica
      'pef', 'ptx',                     // Pentax
      'srw',                            // Samsung
      'x3f',                            // Sigma
      '3fr', 'fff',                     // Hasselblad
      'dcr', 'k25', 'kdc',              // Kodak
      'mef', 'mos',                     // Mamiya/Leaf
      'mrw',                            // Minolta
      'erf',                            // Epson
      'iiq',                            // Phase One
      'rwz',                            // Rawzor
      'gpr',                            // GoPro RAW
      // === VIDEOS (FFprobe/FFmpeg supported) ===
      'mp4', 'm4v', 'm4p',              // MPEG-4
      'mov', 'qt',                      // QuickTime
      'avi', 'divx',                    // AVI
      'mkv', 'mka', 'mks', 'mk3d',      // Matroska
      'webm',                           // WebM
      'wmv', 'wma', 'asf',              // Windows Media
      'flv', 'f4v', 'f4p', 'f4a', 'f4b',// Flash Video
      'mpg', 'mpeg', 'mpe', 'mpv', 'm2v',// MPEG
      'ts', 'mts', 'm2ts', 'tsv', 'tsa',// MPEG Transport Stream
      'vob', 'ifo',                     // DVD Video
      '3gp', '3g2',                     // 3GPP
      'ogv', 'ogg', 'ogm', 'oga', 'ogx', 'spx', 'opus', // Ogg/Vorbis
      'rm', 'rmvb', 'rv',               // RealMedia
      'dv', 'dif',                      // DV Video
      'mxf',                            // Material eXchange Format
      'gxf',                            // General eXchange Format
      'nut',                            // NUT
      'roq',                            // id RoQ
      'nsv',                            // Nullsoft
      'amv',                            // AMV
      'swf',                            // Flash
      'yuv', 'y4m',                     // Raw YUV
      'bik', 'bk2',                     // Bink
      'smk',                            // Smacker
      'dpg',                            // Nintendo DS
      'pva',                            // TechnoTrend PVA
      // === DOCUMENTS ===
      'pdf',                            // Portable Document Format
      'doc', 'docx', 'docm',            // Microsoft Word
      'xls', 'xlsx', 'xlsm', 'xlsb',    // Microsoft Excel
      'ppt', 'pptx', 'pptm',            // Microsoft PowerPoint
      'odt', 'ods', 'odp', 'odg',       // OpenDocument
      'rtf',                            // Rich Text Format
      'txt', 'text', 'log',             // Plain text
      'csv', 'tsv',                     // Data files
      'epub', 'mobi', 'azw', 'azw3',    // E-books
      'djvu', 'djv',                    // DjVu
      'xps', 'oxps',                    // XML Paper Specification
    ]);

    const expandedPaths: string[] = [];

    // System files to always skip (even if visible)
    const systemFiles = new Set(['thumbs.db', 'desktop.ini', 'icon\r', '.ds_store']);

    async function processPath(filePath: string): Promise<void> {
      try {
        const stat = await fs.stat(filePath);
        const fileName = path.basename(filePath).toLowerCase();

        if (stat.isFile()) {
          // Skip system files
          if (systemFiles.has(fileName)) return;

          // Check if file has known extension OR accept unknown extensions as documents
          // The file-import-service will categorize: image -> video -> map -> document (default)
          const ext = path.extname(filePath).toLowerCase().slice(1);

          // Accept all files with extensions (let import service categorize them)
          // Only reject files with no extension at all (likely system/temp files)
          if (ext || supportedExts.has(ext)) {
            expandedPaths.push(filePath);
          }
        } else if (stat.isDirectory()) {
          const entries = await fs.readdir(filePath, { withFileTypes: true });
          for (const entry of entries) {
            // Skip hidden files/folders
            if (entry.name.startsWith('.')) continue;
            await processPath(path.join(filePath, entry.name));
          }
        }
      } catch (error) {
        console.error(`Error processing path ${filePath}:`, error);
      }
    }

    for (const p of validatedPaths) {
      await processPath(p);
    }

    return expandedPaths;
  });

  ipcMain.handle('media:import', async (_event, input: unknown) => {
    try {
      console.log('[media:import] Starting import with input:', JSON.stringify(input, null, 2));

      const ImportInputSchema = z.object({
        files: z.array(
          z.object({
            filePath: z.string(),
            originalName: z.string(),
          })
        ),
        locid: z.string().uuid(),
        subid: z.string().uuid().nullable().optional(),
        auth_imp: z.string().nullable(),
        deleteOriginals: z.boolean().default(false),
      });

      const validatedInput = ImportInputSchema.parse(input);
      console.log('[media:import] Validated input, files count:', validatedInput.files.length);

      // Get archive path from settings
      const archivePath = await db
        .selectFrom('settings')
        .select('value')
        .where('key', '=', 'archive_folder')
        .executeTakeFirst();

      console.log('[media:import] Archive path:', archivePath?.value);

      if (!archivePath?.value) {
        throw new Error('Archive folder not configured. Please set it in Settings.');
      }

      // FIX 3.3: Create geocoding service for #import_address
      const geocodingService = new GeocodingService(db);

      // Initialize FileImportService with all required dependencies
      const fileImportService = new FileImportService(
        db,
        cryptoService,
        exifToolService,
        ffmpegService,
        mediaRepo,
        importRepo,
        locationRepo,
        archivePath.value,
        [], // allowedImportDirs - empty means only archive path is allowed
        geocodingService // FIX 3.3: Pass geocoding service for #import_address
      );

      // Prepare files for import
      const filesForImport = validatedInput.files.map((f) => ({
        filePath: f.filePath,
        originalName: f.originalName,
        locid: validatedInput.locid,
        subid: validatedInput.subid || null,
        auth_imp: validatedInput.auth_imp,
      }));

      // FIX 4.3: Create abort controller for this import
      const importId = `import-${Date.now()}`;
      const abortController = new AbortController();
      activeImports.set(importId, abortController);

      // Import files with progress callback
      // FIX 1.4: Validate IPC sender before sending to prevent crash if window closed
      // FIX 4.1: Include filename in progress updates
      // FIX 4.3: Pass abort signal for cancellation
      let result;
      try {
        result = await fileImportService.importFiles(
          filesForImport,
          validatedInput.deleteOriginals,
          (current, total, filename) => {
            try {
              // Check if sender is still valid (window not closed during import)
              if (_event.sender && !_event.sender.isDestroyed()) {
                _event.sender.send('media:import:progress', { current, total, filename, importId });
              }
            } catch (e) {
              console.warn('[media:import] Failed to send progress (window may have closed):', e);
            }
          },
          abortController.signal
        );
      } finally {
        // FIX 4.3: Clean up abort controller
        activeImports.delete(importId);
      }

      // FIX 5.2: Auto backup after import (if enabled and successful)
      if (result.imported > 0) {
        try {
          const configService = getConfigService();
          const config = configService.get();
          if (config.backup.enabled && config.backup.backupAfterImport) {
            const backupScheduler = getBackupScheduler();
            await backupScheduler.createBackup();
            console.log('[media:import] Post-import backup created');
          }
        } catch (backupError) {
          // Non-fatal: log but don't fail the import
          console.warn('[media:import] Failed to create post-import backup:', backupError);
        }
      }

      return result;
    } catch (error) {
      console.error('Error importing media:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  // FIX 4.3: Cancel import handler
  ipcMain.handle('media:import:cancel', async (_event, importId: unknown) => {
    try {
      const validatedId = z.string().min(1).parse(importId);
      const controller = activeImports.get(validatedId);

      if (controller) {
        controller.abort();
        console.log('[media:import:cancel] Import cancelled:', validatedId);
        return { success: true, message: 'Import cancelled' };
      } else {
        console.log('[media:import:cancel] No active import found:', validatedId);
        return { success: false, message: 'No active import found with that ID' };
      }
    } catch (error) {
      console.error('Error cancelling import:', error);
      throw error;
    }
  });

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

      // Security: Only allow opening files from the archive folder
      const archivePath = await db
        .selectFrom('settings')
        .select('value')
        .where('key', '=', 'archive_folder')
        .executeTakeFirst();

      if (!archivePath?.value) {
        throw new Error('Archive folder not configured');
      }

      // Normalize paths and check if file is within archive folder
      const path = await import('path');
      const normalizedFilePath = path.resolve(validatedPath);
      const normalizedArchivePath = path.resolve(archivePath.value);

      if (!normalizedFilePath.startsWith(normalizedArchivePath + path.sep)) {
        throw new Error('Access denied: file is outside the archive folder');
      }

      await shell.openPath(validatedPath);
    } catch (error) {
      console.error('Error opening file:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  // Notes operations
  ipcMain.handle('notes:create', async (_event, input: unknown) => {
    try {
      const NoteInputSchema = z.object({
        locid: z.string().uuid(),
        note_text: z.string().min(1),
        auth_imp: z.string().nullable().optional(),
        note_type: z.string().optional(),
      });

      const validatedInput = NoteInputSchema.parse(input);
      return await notesRepo.create(validatedInput);
    } catch (error) {
      console.error('Error creating note:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('notes:findById', async (_event, note_id: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(note_id);
      return await notesRepo.findById(validatedId);
    } catch (error) {
      console.error('Error finding note:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('notes:findByLocation', async (_event, locid: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(locid);
      return await notesRepo.findByLocation(validatedId);
    } catch (error) {
      console.error('Error finding notes by location:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('notes:findRecent', async (_event, limit: unknown = 10) => {
    try {
      const validatedLimit = validate(LimitSchema, limit);
      return await notesRepo.findRecent(validatedLimit);
    } catch (error) {
      console.error('Error finding recent notes:', error);
      throw error;
    }
  });

  ipcMain.handle('notes:update', async (_event, note_id: unknown, updates: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(note_id);
      const NoteUpdateSchema = z.object({
        note_text: z.string().min(1).optional(),
        note_type: z.string().optional(),
      });
      const validatedUpdates = NoteUpdateSchema.parse(updates);
      return await notesRepo.update(validatedId, validatedUpdates);
    } catch (error) {
      console.error('Error updating note:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('notes:delete', async (_event, note_id: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(note_id);
      await notesRepo.delete(validatedId);
    } catch (error) {
      console.error('Error deleting note:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('notes:countByLocation', async (_event, locid: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(locid);
      return await notesRepo.countByLocation(validatedId);
    } catch (error) {
      console.error('Error counting notes:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  // Projects operations
  ipcMain.handle('projects:create', async (_event, input: unknown) => {
    try {
      const ProjectInputSchema = z.object({
        project_name: z.string().min(1),
        description: z.string().nullable().optional(),
        auth_imp: z.string().nullable().optional(),
      });

      const validatedInput = ProjectInputSchema.parse(input);
      return await projectsRepo.create(validatedInput);
    } catch (error) {
      console.error('Error creating project:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('projects:findById', async (_event, project_id: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(project_id);
      return await projectsRepo.findById(validatedId);
    } catch (error) {
      console.error('Error finding project:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('projects:findByIdWithLocations', async (_event, project_id: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(project_id);
      return await projectsRepo.findByIdWithLocations(validatedId);
    } catch (error) {
      console.error('Error finding project with locations:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('projects:findAll', async () => {
    try {
      return await projectsRepo.findAll();
    } catch (error) {
      console.error('Error finding all projects:', error);
      throw error;
    }
  });

  ipcMain.handle('projects:findRecent', async (_event, limit: unknown = 5) => {
    try {
      const validatedLimit = validate(LimitSchema, limit);
      return await projectsRepo.findRecent(validatedLimit);
    } catch (error) {
      console.error('Error finding recent projects:', error);
      throw error;
    }
  });

  ipcMain.handle('projects:findTopByLocationCount', async (_event, limit: unknown = 5) => {
    try {
      const validatedLimit = validate(LimitSchema, limit);
      return await projectsRepo.findTopByLocationCount(validatedLimit);
    } catch (error) {
      console.error('Error finding top projects:', error);
      throw error;
    }
  });

  ipcMain.handle('projects:findByLocation', async (_event, locid: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(locid);
      return await projectsRepo.findByLocation(validatedId);
    } catch (error) {
      console.error('Error finding projects by location:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('projects:update', async (_event, project_id: unknown, updates: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(project_id);
      const ProjectUpdateSchema = z.object({
        project_name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
      });
      const validatedUpdates = ProjectUpdateSchema.parse(updates);
      return await projectsRepo.update(validatedId, validatedUpdates);
    } catch (error) {
      console.error('Error updating project:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('projects:delete', async (_event, project_id: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(project_id);
      await projectsRepo.delete(validatedId);
    } catch (error) {
      console.error('Error deleting project:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('projects:addLocation', async (_event, project_id: unknown, locid: unknown) => {
    try {
      const validatedProjectId = z.string().uuid().parse(project_id);
      const validatedLocId = z.string().uuid().parse(locid);
      await projectsRepo.addLocation(validatedProjectId, validatedLocId);
    } catch (error) {
      console.error('Error adding location to project:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('projects:removeLocation', async (_event, project_id: unknown, locid: unknown) => {
    try {
      const validatedProjectId = z.string().uuid().parse(project_id);
      const validatedLocId = z.string().uuid().parse(locid);
      await projectsRepo.removeLocation(validatedProjectId, validatedLocId);
    } catch (error) {
      console.error('Error removing location from project:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('projects:isLocationInProject', async (_event, project_id: unknown, locid: unknown) => {
    try {
      const validatedProjectId = z.string().uuid().parse(project_id);
      const validatedLocId = z.string().uuid().parse(locid);
      return await projectsRepo.isLocationInProject(validatedProjectId, validatedLocId);
    } catch (error) {
      console.error('Error checking if location is in project:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  // Bookmarks operations
  ipcMain.handle('bookmarks:create', async (_event, input: unknown) => {
    try {
      const BookmarkInputSchema = z.object({
        url: z.string().url(),
        title: z.string().nullable().optional(),
        locid: z.string().uuid().nullable().optional(),
        auth_imp: z.string().nullable().optional(),
        thumbnail_path: z.string().nullable().optional(),
      });

      const validatedInput = BookmarkInputSchema.parse(input);
      return await bookmarksRepo.create(validatedInput);
    } catch (error) {
      console.error('Error creating bookmark:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('bookmarks:findById', async (_event, bookmark_id: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(bookmark_id);
      return await bookmarksRepo.findById(validatedId);
    } catch (error) {
      console.error('Error finding bookmark:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('bookmarks:findByLocation', async (_event, locid: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(locid);
      return await bookmarksRepo.findByLocation(validatedId);
    } catch (error) {
      console.error('Error finding bookmarks by location:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('bookmarks:findRecent', async (_event, limit: unknown = 10) => {
    try {
      const validatedLimit = validate(LimitSchema, limit);
      return await bookmarksRepo.findRecent(validatedLimit);
    } catch (error) {
      console.error('Error finding recent bookmarks:', error);
      throw error;
    }
  });

  ipcMain.handle('bookmarks:findAll', async () => {
    try {
      return await bookmarksRepo.findAll();
    } catch (error) {
      console.error('Error finding all bookmarks:', error);
      throw error;
    }
  });

  ipcMain.handle('bookmarks:update', async (_event, bookmark_id: unknown, updates: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(bookmark_id);
      const BookmarkUpdateSchema = z.object({
        url: z.string().url().optional(),
        title: z.string().nullable().optional(),
        locid: z.string().uuid().nullable().optional(),
        thumbnail_path: z.string().nullable().optional(),
      });
      const validatedUpdates = BookmarkUpdateSchema.parse(updates);
      return await bookmarksRepo.update(validatedId, validatedUpdates);
    } catch (error) {
      console.error('Error updating bookmark:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('bookmarks:delete', async (_event, bookmark_id: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(bookmark_id);
      await bookmarksRepo.delete(validatedId);
    } catch (error) {
      console.error('Error deleting bookmark:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('bookmarks:count', async () => {
    try {
      return await bookmarksRepo.count();
    } catch (error) {
      console.error('Error counting bookmarks:', error);
      throw error;
    }
  });

  ipcMain.handle('bookmarks:countByLocation', async (_event, locid: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(locid);
      return await bookmarksRepo.countByLocation(validatedId);
    } catch (error) {
      console.error('Error counting bookmarks by location:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  // Database operations
  // Users operations
  ipcMain.handle('users:create', async (_event, input: unknown) => {
    try {
      const UserInputSchema = z.object({
        username: z.string().min(1),
        display_name: z.string().nullable().optional(),
      });
      const validatedInput = UserInputSchema.parse(input);
      return await usersRepo.create(validatedInput);
    } catch (error) {
      console.error('Error creating user:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('users:findAll', async () => {
    try {
      return await usersRepo.findAll();
    } catch (error) {
      console.error('Error finding users:', error);
      throw error;
    }
  });

  ipcMain.handle('users:findByUsername', async (_event, username: unknown) => {
    try {
      const validatedUsername = z.string().parse(username);
      return await usersRepo.findByUsername(validatedUsername);
    } catch (error) {
      console.error('Error finding user by username:', error);
      throw error;
    }
  });

  ipcMain.handle('users:delete', async (_event, user_id: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(user_id);
      await usersRepo.delete(validatedId);
    } catch (error) {
      console.error('Error deleting user:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('database:backup', async () => {
    try {
      const dbPath = getDatabasePath();

      // Create timestamped filename
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const defaultFilename = `au-archive-backup-${timestamp}.db`;

      // Show save dialog
      const result = await dialog.showSaveDialog({
        title: 'Backup Database',
        defaultPath: defaultFilename,
        filters: [
          { name: 'SQLite Database', extensions: ['db'] },
          { name: 'All Files', extensions: ['*'] }
        ],
      });

      if (result.canceled || !result.filePath) {
        return { success: false, message: 'Backup canceled' };
      }

      // Copy database file to selected location
      await fs.copyFile(dbPath, result.filePath);

      return { success: true, path: result.filePath };
    } catch (error) {
      console.error('Error backing up database:', error);
      throw error;
    }
  });

  ipcMain.handle('database:restore', async () => {
    try {
      const dbPath = getDatabasePath();

      // Show open dialog to select backup file
      const result = await dialog.showOpenDialog({
        title: 'Restore Database from Backup',
        filters: [
          { name: 'SQLite Database', extensions: ['db'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, message: 'Restore canceled' };
      }

      const backupPath = result.filePaths[0];

      // Verify the backup file is a valid SQLite database
      try {
        const Database = (await import('better-sqlite3')).default;
        const testDb = new Database(backupPath, { readonly: true });

        // Check if it has the expected tables
        const tables = testDb.pragma('table_list') as Array<{ name: string }>;
        const hasLocsTable = tables.some(t => t.name === 'locs');
        testDb.close();

        if (!hasLocsTable) {
          return { success: false, message: 'Invalid database file: missing required tables' };
        }
      } catch (error) {
        console.error('Error validating backup file:', error);
        return { success: false, message: 'Invalid database file: not a valid SQLite database' };
      }

      // Create a backup of current database before restoring
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const autoBackupPath = dbPath.replace('.db', `-pre-restore-${timestamp}.db`);
      await fs.copyFile(dbPath, autoBackupPath);

      // Close current database connection
      const { closeDatabase } = await import('./database.js');
      closeDatabase();

      // Copy backup file over current database
      await fs.copyFile(backupPath, dbPath);

      return {
        success: true,
        message: 'Database restored successfully. Please restart the application.',
        requiresRestart: true,
        autoBackupPath
      };
    } catch (error) {
      console.error('Error restoring database:', error);
      throw error;
    }
  });

  // Get current database location info
  ipcMain.handle('database:getLocation', async () => {
    try {
      const currentPath = getDatabasePath();
      const defaultPath = getDefaultDbPath();
      const customPath = getCustomDatabasePath();
      const isCustom = !!customPath;

      return {
        currentPath,
        defaultPath,
        customPath,
        isCustom,
      };
    } catch (error) {
      console.error('Error getting database location:', error);
      throw error;
    }
  });

  // Change database location
  ipcMain.handle('database:changeLocation', async () => {
    try {
      // Show folder selection dialog
      const result = await dialog.showOpenDialog({
        title: 'Select Database Location',
        properties: ['openDirectory', 'createDirectory'],
        message: 'Select a folder where the database file will be stored',
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, message: 'Selection canceled' };
      }

      const newFolder = result.filePaths[0];
      const newDbPath = path.join(newFolder, 'au-archive.db');
      const currentDbPath = getDatabasePath();

      // Check if trying to set same location
      if (newDbPath === currentDbPath) {
        return { success: false, message: 'Selected location is the same as current' };
      }

      // Check if database already exists at new location
      try {
        await fs.access(newDbPath);
        // File exists - ask user what to do
        const existsResult = await dialog.showMessageBox({
          type: 'question',
          buttons: ['Use Existing', 'Replace with Current', 'Cancel'],
          defaultId: 2,
          title: 'Database Exists',
          message: 'A database already exists at this location.',
          detail: 'Do you want to use the existing database or replace it with your current database?',
        });

        if (existsResult.response === 2) {
          return { success: false, message: 'Operation canceled' };
        }

        if (existsResult.response === 1) {
          // Replace: copy current database to new location
          closeDatabase();
          await fs.copyFile(currentDbPath, newDbPath);
        }
        // If response === 0, just use existing (don't copy)

      } catch {
        // File doesn't exist - copy current database to new location
        closeDatabase();
        await fs.copyFile(currentDbPath, newDbPath);
      }

      // Update bootstrap config with new path
      setCustomDatabasePath(newDbPath);

      return {
        success: true,
        message: 'Database location changed. Please restart the application.',
        newPath: newDbPath,
        requiresRestart: true,
      };
    } catch (error) {
      console.error('Error changing database location:', error);
      throw error;
    }
  });

  // Reset database location to default
  ipcMain.handle('database:resetLocation', async () => {
    try {
      const customPath = getCustomDatabasePath();

      if (!customPath) {
        return { success: false, message: 'Already using default location' };
      }

      const defaultPath = getDefaultDbPath();

      // Ask user if they want to copy the database back
      const result = await dialog.showMessageBox({
        type: 'question',
        buttons: ['Copy Database', 'Just Reset (Keep Data at Custom Location)', 'Cancel'],
        defaultId: 0,
        title: 'Reset Database Location',
        message: 'Reset to default database location?',
        detail: `Current: ${customPath}\nDefault: ${defaultPath}\n\nDo you want to copy your database to the default location?`,
      });

      if (result.response === 2) {
        return { success: false, message: 'Operation canceled' };
      }

      if (result.response === 0) {
        // Copy database to default location
        closeDatabase();
        await fs.copyFile(customPath, defaultPath);
      }

      // Clear custom path from config
      setCustomDatabasePath(undefined);

      return {
        success: true,
        message: 'Database location reset to default. Please restart the application.',
        newPath: defaultPath,
        requiresRestart: true,
      };
    } catch (error) {
      console.error('Error resetting database location:', error);
      throw error;
    }
  });

  // ========================================
  // Health Monitoring IPC Handlers
  // ========================================

  // Get complete health dashboard data
  ipcMain.handle('health:getDashboard', async () => {
    try {
      const healthMonitor = getHealthMonitor();
      return await healthMonitor.getDashboardData();
    } catch (error) {
      console.error('Error getting health dashboard:', error);
      throw error;
    }
  });

  // Get health status
  ipcMain.handle('health:getStatus', async () => {
    try {
      const healthMonitor = getHealthMonitor();
      return await healthMonitor.getHealthStatus();
    } catch (error) {
      console.error('Error getting health status:', error);
      throw error;
    }
  });

  // Run manual health check
  ipcMain.handle('health:runCheck', async () => {
    try {
      const healthMonitor = getHealthMonitor();
      return await healthMonitor.runHealthCheck();
    } catch (error) {
      console.error('Error running health check:', error);
      throw error;
    }
  });

  // Create backup manually
  ipcMain.handle('health:createBackup', async () => {
    try {
      const backupScheduler = getBackupScheduler();
      const result = await backupScheduler.createBackup();
      return result;
    } catch (error) {
      console.error('Error creating backup:', error);
      throw error;
    }
  });

  // Get backup statistics
  ipcMain.handle('health:getBackupStats', async () => {
    try {
      const backupScheduler = getBackupScheduler();
      return await backupScheduler.getBackupStats();
    } catch (error) {
      console.error('Error getting backup stats:', error);
      throw error;
    }
  });

  // Get disk space info
  ipcMain.handle('health:getDiskSpace', async () => {
    try {
      const diskSpaceMonitor = getDiskSpaceMonitor();
      return await diskSpaceMonitor.checkDiskSpace();
    } catch (error) {
      console.error('Error checking disk space:', error);
      throw error;
    }
  });

  // Run database integrity check
  ipcMain.handle('health:checkIntegrity', async () => {
    try {
      const integrityChecker = getIntegrityChecker();
      return await integrityChecker.runFullCheck();
    } catch (error) {
      console.error('Error checking database integrity:', error);
      throw error;
    }
  });

  // Run maintenance (VACUUM/ANALYZE)
  ipcMain.handle('health:runMaintenance', async () => {
    try {
      const maintenanceScheduler = getMaintenanceScheduler();
      return await maintenanceScheduler.runFullMaintenance('manual');
    } catch (error) {
      console.error('Error running maintenance:', error);
      throw error;
    }
  });

  // Get maintenance schedule
  ipcMain.handle('health:getMaintenanceSchedule', async () => {
    try {
      const maintenanceScheduler = getMaintenanceScheduler();
      return maintenanceScheduler.getSchedule();
    } catch (error) {
      console.error('Error getting maintenance schedule:', error);
      throw error;
    }
  });

  // Metrics handlers removed - metrics-collector service deleted as part of simplification

  // Get recovery system state
  ipcMain.handle('health:getRecoveryState', async () => {
    try {
      const recoverySystem = getRecoverySystem();
      return recoverySystem.getState();
    } catch (error) {
      console.error('Error getting recovery state:', error);
      throw error;
    }
  });

  // Attempt recovery
  ipcMain.handle('health:attemptRecovery', async () => {
    try {
      const recoverySystem = getRecoverySystem();
      return await recoverySystem.attemptRecovery();
    } catch (error) {
      console.error('Error attempting recovery:', error);
      throw error;
    }
  });

  // ============================================
  // Geocoding Operations (Nominatim + SQLite cache)
  // ============================================

  // Initialize geocoding service
  const geocodingService = new GeocodingService(db);

  // Initialize geocoding cache table
  geocodingService.initCache().catch((error) => {
    console.warn('Failed to initialize geocoding cache:', error);
  });

  // Reverse geocode: GPS coordinates -> address
  ipcMain.handle('geocode:reverse', async (_event, lat: unknown, lng: unknown) => {
    try {
      const GeoInputSchema = z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      });

      const { lat: validLat, lng: validLng } = GeoInputSchema.parse({ lat, lng });
      const result = await geocodingService.reverseGeocode(validLat, validLng);

      if (!result) {
        return null;
      }

      return {
        lat: result.lat,
        lng: result.lng,
        displayName: result.displayName,
        address: result.address,
        confidence: result.confidence,
        source: result.source,
      };
    } catch (error) {
      console.error('Error reverse geocoding:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  // Forward geocode: address string -> GPS coordinates
  ipcMain.handle('geocode:forward', async (_event, address: unknown) => {
    try {
      const validAddress = z.string().min(3).max(500).parse(address);
      const result = await geocodingService.forwardGeocode(validAddress);

      if (!result) {
        return null;
      }

      return {
        lat: result.lat,
        lng: result.lng,
        displayName: result.displayName,
        address: result.address,
        confidence: result.confidence,
        source: result.source,
      };
    } catch (error) {
      console.error('Error forward geocoding:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  // Clear old geocoding cache entries
  ipcMain.handle('geocode:clearCache', async (_event, daysOld: unknown = 90) => {
    try {
      const validDays = z.number().int().positive().max(365).parse(daysOld);
      const deleted = await geocodingService.clearOldCache(validDays);
      return { deleted };
    } catch (error) {
      console.error('Error clearing geocode cache:', error);
      throw error;
    }
  });

  console.log('IPC handlers registered');
}
