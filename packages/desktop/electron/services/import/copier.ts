/**
 * Copier - Atomic file copy (Step 3)
 *
 * OPT-082: Pure copy strategy
 * - fs.copyFile() for all copies
 * - Atomic temp-file-then-rename
 * - Archive path builder
 * - Progress reporting (40-80%)
 *
 * We are an archive app. We copy files. That's it.
 *
 * @module services/import/copier
 */

import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { HashedFile } from './hasher';

/**
 * Copy strategy type
 * OPT-082: Pure copy only
 */
export type CopyStrategy = 'copy';

/**
 * Copy result for a single file
 */
export interface CopiedFile extends HashedFile {
  archivePath: string | null;
  copyError: string | null;
  copyStrategy: CopyStrategy | null;
  bytesCopied: number;
}

/**
 * Copy result summary
 */
export interface CopyResult {
  files: CopiedFile[];
  totalCopied: number;
  totalBytes: number;
  totalErrors: number;
  strategy: CopyStrategy;
  copyTimeMs: number;
}

/**
 * Copier options
 */
export interface CopierOptions {
  /**
   * Progress callback (40-80% range)
   */
  onProgress?: (percent: number, currentFile: string, bytesCopied: number, totalBytes: number) => void;

  /**
   * Abort signal for cancellation
   */
  signal?: AbortSignal;

  /**
   * Force a specific copy strategy
   */
  forceStrategy?: CopyStrategy;

  /**
   * FIX 6: Streaming callback - called after each file is copied
   * Allows incremental result persistence to avoid memory bloat
   */
  onFileComplete?: (file: CopiedFile, index: number, total: number) => void | Promise<void>;
}

/**
 * Location info for path building
 */
export interface LocationInfo {
  locid: string;
  loc12: string;
  address_state: string | null;
  type: string | null;
  slocnam: string | null;
}

/**
 * Copier class for file operations
 */
export class Copier {
  constructor(private readonly archiveBasePath: string) {}

  /**
   * Copy files to archive with best available strategy
   */
  async copy(
    files: HashedFile[],
    location: LocationInfo,
    options?: CopierOptions
  ): Promise<CopyResult> {
    const startTime = Date.now();

    // Filter out duplicates and errored files
    const filesToCopy = files.filter(f => !f.isDuplicate && f.hash !== null && !f.hashError);

    // Detect best copy strategy
    const strategy = options?.forceStrategy ?? await this.detectStrategy(filesToCopy, location);

    // Calculate total bytes for progress
    const totalBytes = filesToCopy.reduce((sum, f) => sum + f.size, 0);
    let bytesCopied = 0;
    let totalCopied = 0;
    let totalErrors = 0;

    const results: CopiedFile[] = [];

    // Copy each file
    for (const file of filesToCopy) {
      if (options?.signal?.aborted) {
        throw new Error('Copy cancelled');
      }

      const result = await this.copyFile(file, location, strategy);

      if (result.copyError) {
        totalErrors++;
      } else {
        totalCopied++;
        bytesCopied += file.size;
      }

      results.push(result);

      // Report progress (40-80% range)
      if (options?.onProgress) {
        const percent = 40 + ((bytesCopied / totalBytes) * 40);
        options.onProgress(percent, file.filename, bytesCopied, totalBytes);
      }

      // FIX 6: Stream result to caller for incremental persistence
      if (options?.onFileComplete) {
        await options.onFileComplete(result, results.length - 1, filesToCopy.length);
      }
    }

    // Add skipped files (duplicates, errors) to results
    for (const file of files) {
      if (file.isDuplicate || file.hashError) {
        results.push({
          ...file,
          archivePath: null,
          copyError: file.isDuplicate ? 'Duplicate' : file.hashError,
          copyStrategy: null,
          bytesCopied: 0,
        });
      }
    }

    const copyTimeMs = Date.now() - startTime;

    return {
      files: results,
      totalCopied,
      totalBytes: bytesCopied,
      totalErrors,
      strategy,
      copyTimeMs,
    };
  }

  /**
   * Detect the copy strategy for the given files
   * OPT-082: Pure copy only
   */
  async detectStrategy(_files: HashedFile[], location: LocationInfo): Promise<CopyStrategy> {
    // Ensure destination directory exists
    const destPath = this.buildLocationPath(location);
    await fs.mkdir(destPath, { recursive: true });

    return 'copy';
  }

  /**
   * Copy a single file
   * OPT-082: Pure copy, no strategy variants
   */
  private async copyFile(
    file: HashedFile,
    location: LocationInfo,
    _strategy: CopyStrategy
  ): Promise<CopiedFile> {
    const result: CopiedFile = {
      ...file,
      archivePath: null,
      copyError: null,
      copyStrategy: 'copy',
      bytesCopied: 0,
    };

    try {
      // Build destination path
      const destPath = this.buildFilePath(file, location);
      const destDir = path.dirname(destPath);

      // Ensure destination directory exists
      await fs.mkdir(destDir, { recursive: true });

      // Use temp file for atomic operation
      const tempPath = `${destPath}.${randomUUID().slice(0, 8)}.tmp`;

      try {
        // OPT-082: Pure copy
        await fs.copyFile(file.originalPath, tempPath);

        // Atomic rename from temp to final
        await fs.rename(tempPath, destPath);

        result.archivePath = destPath;
        result.bytesCopied = file.size;

      } catch (error) {
        // Clean up temp file if it exists
        try {
          await fs.unlink(tempPath);
        } catch {
          // Ignore cleanup errors
        }
        throw error;
      }

    } catch (error) {
      result.copyError = error instanceof Error ? error.message : String(error);
    }

    return result;
  }

  /**
   * Build the location folder path
   * Format: [archive]/locations/[STATE]-[TYPE]/[SLOCNAM]-[LOC12]/
   */
  private buildLocationPath(location: LocationInfo): string {
    const state = (location.address_state || 'XX').toUpperCase();
    const type = (location.type || 'unknown').toLowerCase().replace(/\s+/g, '-');
    const slocnam = (location.slocnam || 'location').toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const loc12 = location.loc12;

    const stateType = `${state}-${type}`;
    const locFolder = `${slocnam}-${loc12}`;

    return path.join(this.archiveBasePath, 'locations', stateType, locFolder);
  }

  /**
   * Build the full file path including media type subfolder
   * Format: [locationPath]/org-[type]-[LOC12]/[hash].[ext]
   */
  private buildFilePath(file: HashedFile, location: LocationInfo): string {
    const locationPath = this.buildLocationPath(location);
    const loc12 = location.loc12;

    // Determine subfolder based on media type
    let subfolder: string;
    switch (file.mediaType) {
      case 'image':
        subfolder = `org-img-${loc12}`;
        break;
      case 'video':
        subfolder = `org-vid-${loc12}`;
        break;
      case 'document':
        subfolder = `org-doc-${loc12}`;
        break;
      case 'map':
        subfolder = `org-map-${loc12}`;
        break;
      default:
        subfolder = `org-misc-${loc12}`;
    }

    // Filename is hash + original extension
    const filename = `${file.hash}${file.extension}`;

    return path.join(locationPath, subfolder, filename);
  }

  /**
   * Rollback a failed copy (delete the file)
   */
  async rollback(archivePath: string): Promise<void> {
    try {
      await fs.unlink(archivePath);
    } catch {
      // Ignore errors during rollback
    }
  }
}

/**
 * Create a Copier instance
 */
export function createCopier(archiveBasePath: string): Copier {
  return new Copier(archiveBasePath);
}
