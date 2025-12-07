/**
 * Copier - Atomic file copy (Step 3)
 *
 * v2.1 AGGRESSIVE: Parallel copy with hardware-scaled concurrency
 *
 * Philosophy: WE ARE AN ARCHIVE APP. WE COPY DATA. PERIOD.
 * - fs.copyFile() for all copies
 * - Atomic temp-file-then-rename
 * - PARALLEL I/O with PQueue
 * - SMB-aware: slightly less parallelism for network
 * - Pre-create directories in batch to reduce SMB round-trips
 *
 * @module services/import/copier
 */

import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import PQueue from 'p-queue';
import type { HashedFile } from './hasher';
import { getHardwareProfile } from '../hardware-profile';
import type { LocationInfo } from './types';

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
  throughputMBps: number;
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

  /**
   * Override concurrency (for testing)
   */
  concurrency?: number;
}

// LocationInfo imported from ./types - single source of truth
// Re-export for backwards compatibility
export type { LocationInfo } from './types';

/**
 * Copier class with AGGRESSIVE parallel operations
 * v2.1: Hardware-scaled, SMB-aware
 */
export class Copier {
  private readonly copyQueue: PQueue;
  private readonly isNetworkPath: boolean;
  private readonly concurrency: number;

  constructor(
    private readonly archiveBasePath: string,
    concurrency?: number
  ) {
    // Detect if archive is on network (SMB/NFS)
    this.isNetworkPath = this.detectNetworkPath(archiveBasePath);

    // Get hardware-scaled concurrency
    const hw = getHardwareProfile();
    const defaultConcurrency = this.isNetworkPath
      ? hw.copyWorkersNetwork
      : hw.copyWorkers;

    this.concurrency = concurrency ?? defaultConcurrency;
    this.copyQueue = new PQueue({ concurrency: this.concurrency });

    console.log(`[Copier] Initialized: ${this.concurrency} parallel workers, network: ${this.isNetworkPath}`);
  }

  /**
   * Detect if path is on network storage (SMB/NFS/AFP)
   */
  private detectNetworkPath(archivePath: string): boolean {
    // macOS network paths typically under /Volumes/ (mounted shares)
    // or explicitly //server/share or smb:// style
    if (archivePath.startsWith('/Volumes/')) {
      // /Volumes/Macintosh HD is local, others are likely network
      // Conservative: treat all /Volumes/ as network except boot
      const volumeName = archivePath.split('/')[2] || '';
      if (volumeName === 'Macintosh HD' || volumeName.includes('SSD') || volumeName.includes('Internal')) {
        return false;
      }
      return true;
    }
    if (archivePath.startsWith('//') || archivePath.startsWith('smb://') || archivePath.startsWith('nfs://')) {
      return true;
    }
    return false;
  }

  /**
   * Copy files in PARALLEL - slam the I/O subsystem
   *
   * v2.1 AGGRESSIVE:
   * - PQueue with hardware-scaled concurrency
   * - Pre-create all directories in batch
   * - Parallel copy of all files
   */
  async copy(
    files: HashedFile[],
    location: LocationInfo,
    options?: CopierOptions
  ): Promise<CopyResult> {
    const startTime = Date.now();

    // Filter out duplicates and errored files
    const filesToCopy = files.filter(f => !f.isDuplicate && f.hash !== null && !f.hashError);

    if (filesToCopy.length === 0) {
      // Handle skipped files
      const skippedResults: CopiedFile[] = files
        .filter(f => f.isDuplicate || f.hashError)
        .map(file => ({
          ...file,
          archivePath: null,
          copyError: file.isDuplicate ? 'Duplicate' : file.hashError,
          copyStrategy: null,
          bytesCopied: 0,
        }));

      return {
        files: skippedResults,
        totalCopied: 0,
        totalBytes: 0,
        totalErrors: 0,
        strategy: 'copy',
        copyTimeMs: 0,
        throughputMBps: 0,
      };
    }

    // PRE-CREATE all destination directories in batch
    // This reduces SMB round-trips significantly
    await this.ensureDirectoriesBatch(filesToCopy, location);

    const totalBytes = filesToCopy.reduce((sum, f) => sum + f.size, 0);
    let bytesCopied = 0;
    let totalCopied = 0;
    let totalErrors = 0;
    let completedCount = 0;

    const results: CopiedFile[] = [];

    console.log(`[Copier] Starting parallel copy: ${filesToCopy.length} files, ${(totalBytes / 1024 / 1024).toFixed(1)} MB, ${this.concurrency} workers`);

    // Override queue concurrency if specified in options
    if (options?.concurrency) {
      this.copyQueue.concurrency = options.concurrency;
    }

    // Queue ALL files for PARALLEL copy
    const copyPromises = filesToCopy.map((file, index) =>
      this.copyQueue.add(async () => {
        // Check cancellation
        if (options?.signal?.aborted) {
          throw new Error('Copy cancelled');
        }

        // Copy the file
        const result = await this.copyFileFast(file, location);

        // Update counters (atomic operations in JS single-threaded model)
        if (result.copyError) {
          totalErrors++;
        } else {
          totalCopied++;
          bytesCopied += file.size;
        }

        results.push(result);
        completedCount++;

        // Progress callback (40-80% range)
        if (options?.onProgress) {
          const percent = 40 + ((bytesCopied / totalBytes) * 40);
          options.onProgress(percent, file.filename, bytesCopied, totalBytes);
        }

        // Streaming callback for incremental persistence
        if (options?.onFileComplete) {
          await options.onFileComplete(result, index, filesToCopy.length);
        }

        return result;
      })
    );

    // Wait for ALL copies to complete (they're running in parallel)
    await Promise.all(copyPromises);

    // Add skipped files (duplicates, hash errors) to results
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
    const throughputMBps = copyTimeMs > 0
      ? (bytesCopied / 1024 / 1024) / (copyTimeMs / 1000)
      : 0;

    console.log(`[Copier] Completed: ${totalCopied} files, ${(bytesCopied / 1024 / 1024).toFixed(1)} MB in ${(copyTimeMs / 1000).toFixed(1)}s`);
    console.log(`[Copier] Throughput: ${throughputMBps.toFixed(1)} MB/s (${totalErrors} errors)`);

    return {
      files: results,
      totalCopied,
      totalBytes: bytesCopied,
      totalErrors,
      strategy: 'copy',
      copyTimeMs,
      throughputMBps,
    };
  }

  /**
   * Pre-create all destination directories in a batch
   * Reduces SMB round-trips significantly
   */
  private async ensureDirectoriesBatch(files: HashedFile[], location: LocationInfo): Promise<void> {
    const dirs = new Set<string>();

    for (const file of files) {
      const destPath = this.buildFilePath(file, location);
      dirs.add(path.dirname(destPath));
    }

    // Create all directories in parallel
    const mkdirPromises = Array.from(dirs).map(dir =>
      fs.mkdir(dir, { recursive: true }).catch(() => {
        // Ignore errors (directory might already exist or race condition)
      })
    );

    await Promise.all(mkdirPromises);
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
   * Copy a single file - FAST path
   * No strategy detection, just copy the damn file.
   */
  private async copyFileFast(
    file: HashedFile,
    location: LocationInfo
  ): Promise<CopiedFile> {
    const result: CopiedFile = {
      ...file,
      archivePath: null,
      copyError: null,
      copyStrategy: 'copy',
      bytesCopied: 0,
    };

    try {
      const destPath = this.buildFilePath(file, location);

      // Temp file for atomic operation
      const tempPath = `${destPath}.${randomUUID().slice(0, 8)}.tmp`;

      try {
        // COPY. That's it. We're an archive app.
        await fs.copyFile(file.originalPath, tempPath);

        // Atomic rename from temp to final
        await fs.rename(tempPath, destPath);

        result.archivePath = destPath;
        result.bytesCopied = file.size;

      } catch (copyError) {
        // Clean up temp file on failure
        await fs.unlink(tempPath).catch(() => {});
        throw copyError;
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
   * Sub-location format: [locationPath]/org-[type]-[LOC12]-[SUB12]/[hash].[ext]
   *
   * OPT-093: Added sub-location folder support
   */
  private buildFilePath(file: HashedFile, location: LocationInfo): string {
    const locationPath = this.buildLocationPath(location);
    const loc12 = location.loc12;

    // Determine subfolder suffix: include sub-location ID if provided
    // Sub-location media goes to separate folder for organization
    const subSuffix = location.subid
      ? `-${location.sub12 || location.subid.substring(0, 12)}`
      : '';

    // Determine subfolder based on media type
    let subfolder: string;
    switch (file.mediaType) {
      case 'image':
        subfolder = `org-img-${loc12}${subSuffix}`;
        break;
      case 'video':
        subfolder = `org-vid-${loc12}${subSuffix}`;
        break;
      case 'document':
        subfolder = `org-doc-${loc12}${subSuffix}`;
        break;
      case 'map':
        subfolder = `org-map-${loc12}${subSuffix}`;
        break;
      default:
        subfolder = `org-misc-${loc12}${subSuffix}`;
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

  /**
   * Get current queue stats
   */
  getStats(): { pending: number; concurrency: number; isNetwork: boolean } {
    return {
      pending: this.copyQueue.pending,
      concurrency: this.concurrency,
      isNetwork: this.isNetworkPath,
    };
  }
}

/**
 * Create a Copier instance
 */
export function createCopier(archiveBasePath: string, concurrency?: number): Copier {
  return new Copier(archiveBasePath, concurrency);
}
