/**
 * Copier - Atomic file copy with hardlink/symlink/reflink support (Step 3)
 *
 * Per Import Spec v2.0:
 * - Strategy detection (same device check)
 * - Hardlink operation (fs.link) - preferred for local filesystems
 * - Symlink operation (fs.symlink) - fallback for SMB/network shares
 * - Reflink operation (APFS copy-on-write)
 * - Copy fallback (fs.copyFile)
 * - Atomic temp-file-then-rename
 * - Archive path builder
 * - Progress reporting (40-80%)
 *
 * Strategy priority: hardlink > symlink > copy
 * - Hardlink: Same inode, no extra space, works on local filesystems
 * - Symlink: Points to original, no extra space, works on SMB/network
 * - Copy: Full duplicate, uses 2x space, universal fallback
 *
 * @module services/import/copier
 */

import { promises as fs, constants } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { HashedFile } from './hasher';

/**
 * Copy strategy types
 * - hardlink: Same inode reference (local filesystems only)
 * - symlink: Symbolic link to original (works on SMB/network)
 * - reflink: Copy-on-write clone (APFS/Btrfs)
 * - copy: Full file copy (universal fallback)
 */
export type CopyStrategy = 'hardlink' | 'symlink' | 'reflink' | 'copy';

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
   *
   * Returns 'hardlink' for same-device scenarios (will fallback to symlink→copy if needed)
   * Returns 'copy' for different-device scenarios
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
        // Same device - try hardlink first (will cascade to symlink→copy if needed)
        console.log(`[Copier] Strategy: hardlink (same device: ${sourceStat.dev})`);
        console.log(`[Copier]   Source: ${sourcePath}`);
        console.log(`[Copier]   Dest:   ${destPath}`);
        return 'hardlink';
      } else {
        console.log(`[Copier] Strategy: copy (different devices: source=${sourceStat.dev}, dest=${destStat.dev})`);
        return 'copy';
      }
    } catch (error) {
      // If stat fails, fall back to copy
      console.warn(`[Copier] Strategy detection failed, using copy:`, error);
      return 'copy';
    }
  }

  /**
   * Copy a single file using the specified strategy with fallback chain
   *
   * Fallback order: hardlink → symlink → copy
   * - hardlink: Fastest, no space used, but fails on network shares
   * - symlink: No space used, works on SMB/network, but breaks if original moves
   * - copy: Always works, but uses 2x disk space
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

      // Use temp file for atomic operation (except for symlinks which don't need atomicity)
      const tempPath = `${destPath}.${randomUUID().slice(0, 8)}.tmp`;

      try {
        // Try the selected strategy
        if (strategy === 'hardlink') {
          await this.tryHardlink(file.originalPath, tempPath);
          console.log(`[Copier] ✓ Hardlink created: ${file.filename}`);
        } else if (strategy === 'symlink') {
          // Symlinks go directly to final path (no temp-rename needed)
          await this.trySymlink(file.originalPath, destPath);
          result.archivePath = destPath;
          result.copyStrategy = 'symlink';
          result.bytesCopied = 0; // Symlinks use no space
          console.log(`[Copier] ✓ Symlink created: ${file.filename} → ${file.originalPath}`);
          return result;
        } else if (strategy === 'reflink') {
          await this.tryReflink(file.originalPath, tempPath);
          console.log(`[Copier] ✓ Reflink created: ${file.filename}`);
        } else {
          await this.tryCopy(file.originalPath, tempPath);
          console.log(`[Copier] ✓ File copied: ${file.filename} (${this.formatBytes(file.size)})`);
        }

        // Atomic rename from temp to final
        await fs.rename(tempPath, destPath);

        result.archivePath = destPath;
        result.bytesCopied = strategy === 'hardlink' ? 0 : file.size;

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
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.copyError = errorMsg;

      // Fallback chain: hardlink → symlink → copy
      if (strategy === 'hardlink') {
        console.warn(`[Copier] Hardlink failed for ${file.filename}: ${errorMsg}`);
        console.log(`[Copier] Trying symlink fallback...`);
        const retryResult = await this.copyFile(file, location, 'symlink');
        return retryResult;
      } else if (strategy === 'symlink') {
        console.warn(`[Copier] Symlink failed for ${file.filename}: ${errorMsg}`);
        console.log(`[Copier] Falling back to full copy...`);
        const retryResult = await this.copyFile(file, location, 'copy');
        return retryResult;
      }
      // If copy fails, no more fallbacks - error will be returned
    }

    return result;
  }

  /**
   * Format bytes as human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  /**
   * Try to create a hardlink
   * Works on local filesystems (HFS+, APFS, ext4, NTFS)
   * Fails on network shares (SMB, NFS, AFP)
   */
  private async tryHardlink(source: string, dest: string): Promise<void> {
    await fs.link(source, dest);
  }

  /**
   * Try to create a symbolic link
   * Works on most filesystems including SMB/network shares
   * Points to the original file - if original moves, link breaks
   */
  private async trySymlink(source: string, dest: string): Promise<void> {
    // Use absolute path for symlink target to ensure it works from any location
    const absoluteSource = path.isAbsolute(source) ? source : path.resolve(source);
    await fs.symlink(absoluteSource, dest);
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
