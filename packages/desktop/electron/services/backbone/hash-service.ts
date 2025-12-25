/**
 * Hash Service - Backbone Wrapper for wake-n-blake
 *
 * Provides BLAKE3 hashing, verification, and copy-with-hash operations.
 * All hashing in the application should go through this service.
 */

import {
  hashFile,
  hashBlake3,
  hashBuffer,
  verifyFile,
  copyWithHash,
  fastHash,
  fastHashBatch,
  hashBatch as wnbHashBatch,
  type HashResult,
  type CopyOptions,
  type CopyResult,
  type FastHashOptions,
  type FastHashResult,
  type Algorithm,
  type HashBatchOptions,
  type HashBatchResult,
} from 'wake-n-blake';

export interface BatchHashResult {
  path: string;
  hash: string | null;
  error: string | null;
}

export interface HashServiceOptions {
  algorithm?: Algorithm;
  full?: boolean;  // Return full 64-char hash instead of 16-char
}

export class HashService {
  /**
   * Hash a single file using BLAKE3
   * Returns 16-char short hash by default (for filenames/IDs)
   */
  static async hashFile(
    filePath: string,
    options: HashServiceOptions = {}
  ): Promise<string> {
    const algorithm = options.algorithm ?? 'blake3';

    if (algorithm === 'blake3') {
      // Use direct BLAKE3 function for short/full control
      return hashBlake3(filePath, { full: options.full ?? false });
    }

    // For other algorithms, use hashFile which returns full hash
    const result = await hashFile(filePath, algorithm);
    return result.hash;
  }

  /**
   * Hash a buffer using BLAKE3
   */
  static async hashBuffer(
    buffer: Buffer,
    options: HashServiceOptions = {}
  ): Promise<string> {
    const result = await hashBuffer(buffer, options.full ?? false);
    return result;
  }

  /**
   * Get full hash result with metadata
   */
  static async hashFileWithMeta(
    filePath: string,
    algorithm: Algorithm = 'blake3'
  ): Promise<HashResult> {
    return hashFile(filePath, algorithm);
  }

  /**
   * Verify a file against an expected hash
   */
  static async verifyFile(
    filePath: string,
    expectedHash: string,
    algorithm: Algorithm = 'blake3'
  ): Promise<boolean> {
    const result = await verifyFile(filePath, expectedHash, algorithm);
    return result.match;
  }

  /**
   * Copy a file while computing its hash (for verified imports)
   * Returns both the destination path and the computed hash
   */
  static async copyWithHash(
    sourcePath: string,
    destPath: string,
    options: Partial<CopyOptions> = {}
  ): Promise<CopyResult> {
    return copyWithHash(sourcePath, destPath, {
      verify: true,
      algorithm: 'blake3',
      ...options,
    });
  }

  /**
   * Fast hash for quick duplicate detection (sampling-based)
   */
  static async fastHash(
    filePath: string,
    options: Partial<FastHashOptions> = {}
  ): Promise<FastHashResult> {
    return fastHash(filePath, options);
  }

  /**
   * Batch fast hash for efficient processing of multiple files
   */
  static async fastHashBatch(
    filePaths: string[],
    options: Partial<FastHashOptions> = {}
  ): Promise<FastHashResult[]> {
    return fastHashBatch(filePaths, options);
  }

  /**
   * Generate a 16-char BLAKE3 ID for a new entity
   * Uses random bytes, not file content
   */
  static async generateId(): Promise<string> {
    const { generateBlake3Id } = await import('wake-n-blake');
    return generateBlake3Id();
  }

  /**
   * Batch hash multiple files with byte-level progress
   * Uses wake-n-blake's hashBatch which provides smooth per-chunk progress
   */
  static async hashBatch(
    filePaths: string[],
    options: {
      concurrency?: number;
      onProgress?: (completed: number, total: number, file: string) => void;
      /** Byte-level progress for smooth UI updates (no dead spots) */
      onByteProgress?: (bytesProcessed: number, bytesTotal: number, currentFile: string) => void;
      signal?: AbortSignal;
    } = {}
  ): Promise<BatchHashResult[]> {
    // Use wake-n-blake's hashBatch with byte-level progress
    const results = await wnbHashBatch(filePaths, {
      signal: options.signal,
      onProgress: (bytesProcessed, bytesTotal, filesCompleted, totalFiles, currentFile) => {
        // Fire byte-level progress for smooth UI updates
        if (options.onByteProgress) {
          options.onByteProgress(bytesProcessed, bytesTotal, currentFile);
        }
        // Also fire file-level progress for backwards compatibility
        if (options.onProgress) {
          options.onProgress(filesCompleted, totalFiles, currentFile);
        }
      },
    });

    // Map to BatchHashResult format
    return results.map((r: HashBatchResult) => ({
      path: r.path,
      hash: r.hash,
      error: r.error,
    }));
  }
}

export { HashResult, CopyResult, FastHashResult, Algorithm };
