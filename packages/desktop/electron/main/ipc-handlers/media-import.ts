/**
 * Media Import IPC Handlers
 * Handles media selection, expansion, and import operations
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
import { CryptoService } from '../../services/crypto-service';
import { ExifToolService } from '../../services/exiftool-service';
import { FFmpegService } from '../../services/ffmpeg-service';
import { FileImportService } from '../../services/file-import-service';
import { PhaseImportService } from '../../services/phase-import-service';
import { GeocodingService } from '../../services/geocoding-service';
import { getConfigService } from '../../services/config-service';
import { getBackupScheduler } from '../../services/backup-scheduler';

// Track active imports for cancellation
const activeImports: Map<string, AbortController> = new Map();

// Supported file extensions
const SUPPORTED_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'jpe', 'jfif', 'png', 'gif', 'bmp', 'tiff', 'tif', 'webp',
  'jp2', 'jpx', 'j2k', 'j2c', 'jxl', 'heic', 'heif', 'hif', 'avif',
  'psd', 'psb', 'nef', 'nrw', 'cr2', 'cr3', 'crw', 'arw', 'dng',
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

    async function processPath(filePath: string): Promise<void> {
      try {
        const stat = await fs.stat(filePath);
        const fileName = path.basename(filePath).toLowerCase();

        if (stat.isFile()) {
          if (SYSTEM_FILES.has(fileName)) return;
          const ext = path.extname(filePath).toLowerCase().slice(1);
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
      });

      const validatedInput = ImportInputSchema.parse(input);
      const archivePath = await db.selectFrom('settings').select('value').where('key', '=', 'archive_folder').executeTakeFirst();

      if (!archivePath?.value) throw new Error('Archive folder not configured. Please set it in Settings.');

      const geocodingService = new GeocodingService(db);
      const fileImportService = new FileImportService(
        db, cryptoService, exifToolService, ffmpegService,
        mediaRepo, importRepo, locationRepo, archivePath.value, [], geocodingService
      );

      const filesForImport = validatedInput.files.map((f) => ({
        filePath: f.filePath, originalName: f.originalName,
        locid: validatedInput.locid, subid: validatedInput.subid || null,
        auth_imp: validatedInput.auth_imp,
      }));

      const importId = `import-${Date.now()}`;
      const abortController = new AbortController();
      activeImports.set(importId, abortController);

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
        try {
          const config = getConfigService().get();
          if (config.backup.enabled && config.backup.backupAfterImport) {
            await getBackupScheduler().createBackup();
          }
        } catch (e) { console.warn('[media:import] Failed to create post-import backup:', e); }
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

      const filesForImport = validatedInput.files.map((f) => ({
        filePath: f.filePath, originalName: f.originalName,
        locid: validatedInput.locid, subid: validatedInput.subid || null,
        auth_imp: validatedInput.auth_imp,
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
        try {
          const config = getConfigService().get();
          if (config.backup.enabled && config.backup.backupAfterImport) {
            await getBackupScheduler().createBackup();
          }
        } catch (e) { console.warn('[media:phaseImport] Failed to create post-import backup:', e); }
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
