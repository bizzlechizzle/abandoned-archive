/**
 * Copier - Atomic file copy (Step 3)
 *
 * v2.3 BACKBONE: Uses wake-n-blake copyWithHash for inline hashing
 *
 * Philosophy: WE ARE AN ARCHIVE APP. WE COPY DATA. PERIOD.
 * - Streaming copy with inline BLAKE3 hash via wake-n-blake (single read)
 * - PARALLEL I/O with PQueue + hardware-scaled concurrency
 * - SMB-aware: throttled concurrency for network paths
 * - Pre-create directories in batch to reduce SMB round-trips
 * - Retry with exponential backoff (handled by wake-n-blake)
 *
 * ADR: ADR-046-smb-optimized-import
 *
 * @module services/import/copier
 */

import { promises as fs } from 'fs';
import path from 'path';
import PQueue from 'p-queue';
import type { HashedFile } from './hasher';
import { getHardwareProfile } from '../hardware-profile';
import type { LocationInfo } from './types';
import { isNetworkPath } from './storage-detection';
import { HashService } from '../backbone/hash-service.js';

/**
 * Network failure error - thrown when sustained network failure is detected
 * Allows orchestrator to pause import instead of marking as failed
 */
export class NetworkFailureError extends Error {
  constructor(
    message: string,
    public readonly consecutiveErrors: number,
    public readonly lastError: string
  ) {
    super(message);
    this.name = 'NetworkFailureError';
  }
}

/**
 * Comprehensive list of network-related error codes for SMB/NFS
 * Used for both retry logic and sustained failure detection
 */
const NETWORK_ERROR_CODES = [
  'EAGAIN',       // Resource temporarily unavailable
  'ECONNRESET',   // Connection reset
  'ETIMEDOUT',    // Connection timed out
  'EBUSY',        // Resource busy
  'EIO',          // I/O error
  'ENETUNREACH',  // Network unreachable
  'EPIPE',        // Broken pipe
  'ENOTCONN',     // Socket not connected (SMB disconnect)
  'EHOSTDOWN',    // Host is down
  'EHOSTUNREACH', // No route to host
  'ENETDOWN',     // Network is down
  'ECONNABORTED', // Connection aborted
  'ESTALE',       // Stale file handle (NFS)
  'ENOENT',       // File not found (often means network unmounted)
];

/**
 * Check if an error message indicates a network failure
 */
function isNetworkError(errorMessage: string | null): boolean {
  if (!errorMessage) return false;
  const upper = errorMessage.toUpperCase();
  return NETWORK_ERROR_CODES.some(code => upper.includes(code));
}

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
   * ADR-050: Added filesCopied parameter for incremental progress tracking
   */
  onProgress?: (percent: number, currentFile: string, bytesCopied: number, totalBytes: number, filesCopied?: number) => void;

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
 * v2.2: Hardware-scaled, SMB-aware, inline hashing for network sources
 */
export class Copier {
  private readonly copyQueue: PQueue;
  private readonly isNetworkDest: boolean;
  private readonly concurrency: number;
  private isNetworkSource: boolean = false;

  constructor(
    private readonly archiveBasePath: string,
    concurrency?: number
  ) {
    // Detect if archive DESTINATION is on network (SMB/NFS)
    // Uses unified storage-detection utility
    this.isNetworkDest = isNetworkPath(archiveBasePath);

    // Get hardware-scaled concurrency
    const hw = getHardwareProfile();
    const defaultConcurrency = this.isNetworkDest
      ? hw.copyWorkersNetwork
      : hw.copyWorkers;

    this.concurrency = concurrency ?? defaultConcurrency;
    this.copyQueue = new PQueue({ concurrency: this.concurrency });

    console.log(`[Copier] Initialized: ${this.concurrency} parallel workers, network dest: ${this.isNetworkDest}`);
  }

  /**
   * Detect if SOURCE files are on network storage
   * Uses unified storage-detection utility
   */
  private detectNetworkSource(files: HashedFile[]): boolean {
    if (files.length === 0) return false;
    return isNetworkPath(files[0].originalPath);
  }

  /**
   * Copy file with inline hash using backbone HashService (wake-n-blake)
   * Uses wake-n-blake copyWithHash for network-aware streaming with inline hashing
   */
  private async copyFileWithBackbone(
    sourcePath: string,
    destPath: string
  ): Promise<{ hash: string; bytesCopied: number }> {
    const result = await HashService.copyWithHash(sourcePath, destPath, {
      verify: false, // We'll verify separately if needed
      algorithm: 'blake3',
    });

    return {
      hash: result.hash,
      bytesCopied: result.size,
    };
  }

  /**
   * Build file path using provided hash (for inline hashing mode)
   * Same logic as buildFilePath but takes hash as parameter
   * ADR-046: New format: [locationPath]/data/org-[type]/[hash].[ext]
   * Sub-location format: [locationPath]/data/sloc-[SUBID]/org-[type]/[hash].[ext]
   */
  private buildFilePathWithHash(hash: string, file: HashedFile, location: LocationInfo): string {
    const locationPath = this.buildLocationPath(location);

    // Determine base path: direct data folder or sub-location folder
    let basePath: string;
    if (location.subid) {
      // Sub-location: [locationPath]/data/sloc-[SUBID]/
      basePath = path.join(locationPath, 'data', `sloc-${location.subid}`);
    } else {
      // Main location: [locationPath]/data/
      basePath = path.join(locationPath, 'data');
    }

    // Determine subfolder based on media type (no loc12 suffix anymore)
    let subfolder: string;
    switch (file.mediaType) {
      case 'image':
        subfolder = 'org-img';
        break;
      case 'video':
        subfolder = 'org-vid';
        break;
      case 'document':
        subfolder = 'org-doc';
        break;
      case 'map':
        subfolder = 'org-map';
        break;
      default:
        subfolder = 'org-misc';
    }

    // Filename is hash + original extension
    const filename = `${hash}${file.extension}`;

    return path.join(basePath, subfolder, filename);
  }

  /**
   * Copy files in PARALLEL - slam the I/O subsystem
   *
   * v2.2: Hardware-scaled, SMB-aware, inline hashing for network sources
   * - PQueue with hardware-scaled concurrency
   * - Pre-create all directories in batch
   * - Parallel copy of all files
   * - Inline hash computation when source is network (single read)
   */
  async copy(
    files: HashedFile[],
    location: LocationInfo,
    options?: CopierOptions
  ): Promise<CopyResult> {
    const startTime = Date.now();

    // Detect if SOURCE is on network - enables inline hashing mode AND throttled concurrency
    this.isNetworkSource = this.detectNetworkSource(files);
    if (this.isNetworkSource) {
      console.log(`[Copier] Network SOURCE detected - using inline hashing (single read per file)`);

      // CRITICAL: Throttle concurrency for network SOURCE
      // 24 parallel reads from SMB will crash the connection!
      // This is the fix for the network import crash - concurrent reads overwhelmed SMB
      const hw = getHardwareProfile();
      const networkConcurrency = hw.copyWorkersNetwork; // Should be 1
      if (this.copyQueue.concurrency > networkConcurrency) {
        console.log(`[Copier] THROTTLING: Reducing concurrency from ${this.copyQueue.concurrency} to ${networkConcurrency} for network source`);
        this.copyQueue.concurrency = networkConcurrency;
      }
    }

    // Filter out duplicates and errored files
    // Allow null hash for network sources (will be computed inline)
    const filesToCopy = files.filter(f => {
      if (f.isDuplicate || f.hashError) return false;
      // For network source mode, allow null hash (computed during copy)
      if (this.isNetworkSource) return true;
      // For local source, require pre-computed hash
      return f.hash !== null;
    });

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

    // Track consecutive network errors for abort threshold
    // After N consecutive network errors, assume network is down and abort
    const NETWORK_ABORT_THRESHOLD = 5;
    let consecutiveNetworkErrors = 0;
    let lastNetworkError = '';

    const results: CopiedFile[] = [];

    // SMB STABILITY: Small delay between files to prevent connection overwhelm
    // macOS Sequoia has known bugs with multiple concurrent SMB operations
    // 50ms is enough breathing room without killing throughput
    const SMB_DELAY_MS = (this.isNetworkDest || this.isNetworkSource) ? 50 : 0;

    const modeLabel = this.concurrency === 1 ? 'SEQUENTIAL' : `${this.concurrency} workers`;
    console.log(`[Copier] Starting copy: ${filesToCopy.length} files, ${(totalBytes / 1024 / 1024).toFixed(1)} MB, ${modeLabel}${SMB_DELAY_MS > 0 ? ` (${SMB_DELAY_MS}ms delay)` : ''}`);

    // Override queue concurrency if specified in options
    if (options?.concurrency) {
      this.copyQueue.concurrency = options.concurrency;
    }

    // Periodic progress updates - prevents "stuck" feeling during long copies
    // Fires every 500ms regardless of file completions
    let progressInterval: ReturnType<typeof setInterval> | null = null;
    if (options?.onProgress) {
      progressInterval = setInterval(() => {
        if (completedCount < filesToCopy.length) {
          const percent = 40 + ((bytesCopied / totalBytes) * 40);
          const pending = this.copyQueue.pending;
          options.onProgress!(percent, `Copying... (${pending} active)`, bytesCopied, totalBytes);
        }
      }, 500);
    }

    // Queue ALL files for copy (sequential for SMB, parallel for local)
    const copyPromises = filesToCopy.map((file, index) =>
      this.copyQueue.add(async () => {
        // Check cancellation
        if (options?.signal?.aborted) {
          throw new Error('Copy cancelled');
        }

        // SMB breathing room: small delay between operations
        if (SMB_DELAY_MS > 0 && index > 0) {
          await new Promise(resolve => setTimeout(resolve, SMB_DELAY_MS));
        }

        // Copy the file
        const result = await this.copyFileFast(file, location);

        // Update counters (atomic operations in JS single-threaded model)
        if (result.copyError) {
          totalErrors++;

          // Track consecutive network errors for abort threshold
          if (isNetworkError(result.copyError)) {
            consecutiveNetworkErrors++;
            lastNetworkError = result.copyError;
            console.log(`[Copier] Network error detected (${consecutiveNetworkErrors}/${NETWORK_ABORT_THRESHOLD}): ${result.copyError}`);

            // Check if we should abort due to sustained network failure
            if (consecutiveNetworkErrors >= NETWORK_ABORT_THRESHOLD) {
              console.log(`[Copier] ABORTING: ${consecutiveNetworkErrors} consecutive network errors - network appears down`);
              throw new NetworkFailureError(
                `Network appears down - ${consecutiveNetworkErrors} consecutive network errors. Last error: ${lastNetworkError}`,
                consecutiveNetworkErrors,
                lastNetworkError
              );
            }
          }
        } else {
          totalCopied++;
          bytesCopied += file.size;
          // Reset consecutive error counter on success
          consecutiveNetworkErrors = 0;
        }

        results.push(result);
        completedCount++;

        // Log progress every 10 files or on errors
        if (completedCount % 10 === 0 || result.copyError) {
          const pct = ((bytesCopied / totalBytes) * 100).toFixed(1);
          const mbDone = (bytesCopied / 1024 / 1024).toFixed(0);
          const mbTotal = (totalBytes / 1024 / 1024).toFixed(0);
          console.log(`[Copier] Progress: ${completedCount}/${filesToCopy.length} files (${pct}%) ${mbDone}/${mbTotal} MB${result.copyError ? ` ERROR: ${result.copyError}` : ''}`);
        }

        // Progress callback (40-80% range) - on file completion
        // ADR-050: Pass completedCount for incremental progress tracking
        if (options?.onProgress) {
          const percent = 40 + ((bytesCopied / totalBytes) * 40);
          options.onProgress(percent, file.filename, bytesCopied, totalBytes, completedCount);
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

    // Clean up progress interval
    if (progressInterval) {
      clearInterval(progressInterval);
    }

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
   * Network paths: sequential to avoid SMB overwhelm
   * Local paths: parallel for speed
   */
  private async ensureDirectoriesBatch(files: HashedFile[], location: LocationInfo): Promise<void> {
    const dirs = new Set<string>();

    for (const file of files) {
      // Use placeholder hash for directory path (hash is only in filename, not directory)
      const hash = file.hash || 'placeholder';
      const destPath = this.buildFilePathWithHash(hash, file, location);
      dirs.add(path.dirname(destPath));
    }

    const dirList = Array.from(dirs);

    if (this.isNetworkDest) {
      // Network: create directories sequentially to avoid SMB connection overwhelm
      // SMB protocol has limited concurrent operation capacity regardless of bandwidth
      console.log(`[Copier] Creating ${dirList.length} directories sequentially (network path)`);
      for (const dir of dirList) {
        await fs.mkdir(dir, { recursive: true }).catch(() => {
          // Ignore errors (directory might already exist or race condition)
        });
      }
    } else {
      // Local: parallel is fine - OS can handle many concurrent mkdir
      const mkdirPromises = dirList.map(dir =>
        fs.mkdir(dir, { recursive: true }).catch(() => {
          // Ignore errors (directory might already exist or race condition)
        })
      );
      await Promise.all(mkdirPromises);
    }
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
   * Copy a single file - supports both pre-hashed and inline hashing modes
   * v2.3: Uses backbone HashService.copyWithHash for network-aware streaming
   *
   * Note: Retry logic is now handled by wake-n-blake internally
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

    // Inline hashing mode: hash is null, compute during copy
    const useInlineHash = file.hash === null;

    try {
      let finalHash: string;
      let bytesCopied: number;

      if (useInlineHash) {
        // INLINE HASH MODE: Use backbone copyWithHash to temp, get hash, then rename
        // We need temp because we don't know the final filename until we have the hash
        const tempDir = this.buildLocationPath(location);
        await fs.mkdir(tempDir, { recursive: true }).catch(() => {});
        const tempPath = path.join(tempDir, `${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);

        try {
          const copyResult = await this.copyFileWithBackbone(file.originalPath, tempPath);
          finalHash = copyResult.hash;
          bytesCopied = copyResult.bytesCopied;

          // Build final path with the computed hash
          const destPath = this.buildFilePathWithHash(finalHash, file, location);

          // Ensure destination directory exists
          await fs.mkdir(path.dirname(destPath), { recursive: true }).catch(() => {});

          // Atomic rename from temp to final
          await fs.rename(tempPath, destPath);

          result.hash = finalHash;
          result.archivePath = destPath;
          result.bytesCopied = bytesCopied;
        } catch (err) {
          // Clean up temp file on error
          await fs.unlink(tempPath).catch(() => {});
          throw err;
        }
      } else {
        // PRE-HASHED MODE: Copy directly to final destination using backbone
        finalHash = file.hash!;
        const destPath = this.buildFilePathWithHash(finalHash, file, location);

        // Ensure destination directory exists
        await fs.mkdir(path.dirname(destPath), { recursive: true }).catch(() => {});

        const copyResult = await this.copyFileWithBackbone(file.originalPath, destPath);
        bytesCopied = copyResult.bytesCopied;

        result.hash = finalHash;
        result.archivePath = destPath;
        result.bytesCopied = bytesCopied;
      }

      return result;

    } catch (error) {
      // Network errors and retries are handled by wake-n-blake
      // If we get here, it's a final failure
      result.copyError = error instanceof Error ? error.message : String(error);
      return result;
    }
  }

  /**
   * Build the location folder path
   * ADR-046: New format: [archive]/locations/[STATE]/[LOCID]/
   */
  private buildLocationPath(location: LocationInfo): string {
    const state = (location.address_state || 'XX').toUpperCase();
    const locid = location.locid;

    return path.join(this.archiveBasePath, 'locations', state, locid);
  }

  /**
   * Build the full file path including media type subfolder
   * ADR-046: New format: [locationPath]/data/org-[type]/[hash].[ext]
   * Sub-location format: [locationPath]/data/sloc-[SUBID]/org-[type]/[hash].[ext]
   *
   * OPT-093: Added sub-location folder support
   */
  private buildFilePath(file: HashedFile, location: LocationInfo): string {
    const locationPath = this.buildLocationPath(location);

    // Determine base path: direct data folder or sub-location folder
    let basePath: string;
    if (location.subid) {
      // Sub-location: [locationPath]/data/sloc-[SUBID]/
      basePath = path.join(locationPath, 'data', `sloc-${location.subid}`);
    } else {
      // Main location: [locationPath]/data/
      basePath = path.join(locationPath, 'data');
    }

    // Determine subfolder based on media type (no loc12 suffix anymore)
    let subfolder: string;
    switch (file.mediaType) {
      case 'image':
        subfolder = 'org-img';
        break;
      case 'video':
        subfolder = 'org-vid';
        break;
      case 'document':
        subfolder = 'org-doc';
        break;
      case 'map':
        subfolder = 'org-map';
        break;
      default:
        subfolder = 'org-misc';
    }

    // Filename is hash + original extension
    const filename = `${file.hash}${file.extension}`;

    return path.join(basePath, subfolder, filename);
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
  getStats(): { pending: number; concurrency: number; isNetworkDest: boolean; isNetworkSource: boolean } {
    return {
      pending: this.copyQueue.pending,
      concurrency: this.concurrency,
      isNetworkDest: this.isNetworkDest,
      isNetworkSource: this.isNetworkSource,
    };
  }
}

/**
 * Create a Copier instance
 */
export function createCopier(archiveBasePath: string, concurrency?: number): Copier {
  return new Copier(archiveBasePath, concurrency);
}
