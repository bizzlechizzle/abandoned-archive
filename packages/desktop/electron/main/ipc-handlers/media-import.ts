/**
 * Media Import IPC Handlers
 *
 * REFACTORED: V1 import handlers removed - use import-v2.ts (wake-n-blake + shoemaker)
 *
 * Remaining handlers:
 * - media:selectFiles - File picker dialog
 * - media:expandPaths - Expand directories to file list
 * - media:import:cancel - Cancel active imports
 *
 * Services created here are shared with media-processing.ts
 */
import { ipcMain, dialog } from 'electron';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import type { Kysely } from 'kysely';
import type { Database } from '../database.types';
import { SQLiteMediaRepository } from '../../repositories/sqlite-media-repository';
import { SQLiteImportRepository } from '../../repositories/sqlite-import-repository';
import { SQLiteLocationRepository } from '../../repositories/sqlite-location-repository';
import { CryptoService } from '../../services/crypto-service';
import { ExifToolService } from '../../services/exiftool-service';
import { FFmpegService } from '../../services/ffmpeg-service';

// Track active imports for cancellation (shared with import-v2)
const activeImports: Map<string, AbortController> = new Map();

// Extensions to skip entirely during import (not copied, not logged)
// .aae = Apple photo adjustments (sidecar metadata, not actual media)
// .psd/.psb = Photoshop project files (large, not archival media)
const SKIP_EXTENSIONS = new Set(['aae', 'psd', 'psb']);

// Supported file extensions
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

  /**
   * Open file picker dialog for media selection
   */
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
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  /**
   * Expand paths (directories → files) for import preview
   */
  ipcMain.handle('media:expandPaths', async (_event, paths: unknown) => {
    try {
      console.log('[media:expandPaths] Called with paths:', paths);
      const validatedPaths = z.array(z.string()).parse(paths);
      console.log('[media:expandPaths] Validated paths:', validatedPaths.length);
      const expandedPaths: string[] = [];
      let skippedCount = 0;

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

      console.log('[media:expandPaths] Returning', expandedPaths.length, 'paths');
      return expandedPaths;
    } catch (error) {
      console.error('[media:expandPaths] Error:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  /**
   * Cancel active import by ID
   * Works with both V1 (legacy) and V2 imports
   */
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
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  // Return services needed by media-processing.ts
  return { mediaRepo, cryptoService, exifToolService, ffmpegService };
}

/**
 * Register an abort controller for import cancellation
 * Called by import-v2.ts orchestrator
 */
export function registerImportAbortController(importId: string, controller: AbortController): void {
  activeImports.set(importId, controller);
}

/**
 * Unregister an abort controller after import completes
 * Called by import-v2.ts orchestrator
 */
export function unregisterImportAbortController(importId: string): void {
  activeImports.delete(importId);
}
