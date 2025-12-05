/**
 * Copier - Atomic file copy with hardlink/reflink support (Step 3)
 *
 * Per Import Spec v2.0:
 * - Strategy detection (same device check)
 * - Hardlink operation (fs.link)
 * - Reflink operation (APFS copy-on-write)
 * - Copy fallback (fs.copyFile)
 * - Atomic temp-file-then-rename
 * - Archive path builder
 * - Progress reporting (40-80%)
 *
 * @module services/import/copier
 */

import { promises as fs, constants } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { HashedFile } from './hasher';

/**
 * Copy strategy types
 */
export type CopyStrategy = 'hardlink' | 'reflink' | 'copy';

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
   * Detect the best copy strategy for the given files
   */
  async detectStrategy(files: HashedFile[], location: LocationInfo): Promise<CopyStrategy> {
    if (files.length === 0) {
      return 'copy';
    }

    // Get the destination path
    const destPath = this.buildLocationPath(location);

    // Ensure destination directory exists
    await fs.mkdir(destPath, { recursive: true });

    // Check if source and destination are on the same device
    const sourcePath = files[0].originalPath;

    try {
      const [sourceStat, destStat] = await Promise.all([
        fs.stat(sourcePath),
        fs.stat(destPath),
      ]);

      if (sourceStat.dev === destStat.dev) {
        // Same device - try hardlink first
        return 'hardlink';
      }
    } catch {
      // If stat fails, fall back to copy
    }

    // Different devices - use regular copy
    return 'copy';
  }

  /**
   * Copy a single file using the specified strategy
   */
  private async copyFile(
    file: HashedFile,
    location: LocationInfo,
    strategy: CopyStrategy
  ): Promise<CopiedFile> {
    const result: CopiedFile = {
      ...file,
      archivePath: null,
      copyError: null,
      copyStrategy: strategy,
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
        // Try the selected strategy
        if (strategy === 'hardlink') {
          await this.tryHardlink(file.originalPath, tempPath);
        } else if (strategy === 'reflink') {
          await this.tryReflink(file.originalPath, tempPath);
        } else {
          await this.tryCopy(file.originalPath, tempPath);
        }

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

      // If hardlink failed, retry with copy
      if (strategy === 'hardlink') {
        console.warn(`[Copier] Hardlink failed for ${file.filename}, retrying with copy`);
        const retryResult = await this.copyFile(file, location, 'copy');
        return retryResult;
      }
    }

    return result;
  }

  /**
   * Try to create a hardlink
   */
  private async tryHardlink(source: string, dest: string): Promise<void> {
    await fs.link(source, dest);
  }

  /**
   * Try to create a reflink (copy-on-write clone)
   * Note: Node.js 18+ supports COPYFILE_FICLONE flag for CoW copies on APFS/Btrfs
   */
  private async tryReflink(source: string, dest: string): Promise<void> {
    // COPYFILE_FICLONE = Use copy-on-write if available
    await fs.copyFile(source, dest, constants.COPYFILE_FICLONE);
  }

  /**
   * Regular file copy
   */
  private async tryCopy(source: string, dest: string): Promise<void> {
    await fs.copyFile(source, dest);
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
