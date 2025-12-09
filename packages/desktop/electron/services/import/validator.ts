/**
 * Validator - Post-copy integrity verification (Step 4)
 *
 * v2.2 SMB-OPTIMIZED: Network-aware concurrency
 *
 * Per Import Spec v2.0 + ADR-046:
 * - Parallel re-hash using WorkerPool
 * - Hash comparison (BLAKE3)
 * - Rollback on mismatch (auto-delete invalid files)
 * - Continue-on-error (don't abort batch)
 * - Progress reporting (80-95%)
 * - SMB-aware: throttled concurrency for network archives
 *
 * Integrity guarantee per NDSA/Library of Congress standards:
 * - Re-hash destination file after copy
 * - Compare against source hash
 * - Invalid files automatically removed
 *
 * ADR: ADR-046-smb-optimized-import
 *
 * @module services/import/validator
 */

import { promises as fs } from 'fs';
import PQueue from 'p-queue';
import type { CopiedFile } from './copier';
import { getWorkerPool, type WorkerPool } from '../worker-pool';
import { getHardwareProfile } from '../hardware-profile';

/**
 * Validation result for a single file
 */
export interface ValidatedFile extends CopiedFile {
  isValid: boolean;
  validationError: string | null;
}

/**
 * Validation result summary
 */
export interface ValidationResult {
  files: ValidatedFile[];
  totalValidated: number;
  totalValid: number;
  totalInvalid: number;
  totalRolledBack: number;
  validationTimeMs: number;
}

/**
 * Validator options
 */
export interface ValidatorOptions {
  /**
   * Progress callback (80-95% range)
   */
  onProgress?: (percent: number, currentFile: string) => void;

  /**
   * Abort signal for cancellation
   */
  signal?: AbortSignal;

  /**
   * Whether to automatically rollback invalid files
   */
  autoRollback?: boolean;

  /**
   * FIX 6: Streaming callback - called after each file is validated
   * Allows incremental result persistence to avoid memory bloat
   */
  onFileComplete?: (file: ValidatedFile, index: number, total: number) => void | Promise<void>;
}

/**
 * Validator class for integrity verification
 * v2.2: SMB-aware with throttled concurrency for network archives
 */
export class Validator {
  private pool: WorkerPool | null = null;

  /**
   * Initialize the worker pool
   */
  async initialize(): Promise<void> {
    if (!this.pool) {
      this.pool = await getWorkerPool();
    }
  }

  /**
   * Detect if path is on network storage (SMB/NFS/AFP)
   */
  private detectNetworkPath(archivePath: string): boolean {
    if (archivePath.startsWith('/Volumes/')) {
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
   * Validate all copied files by re-hashing and comparing
   * v2.2: Uses PQueue with SMB-aware concurrency
   */
  async validate(files: CopiedFile[], options?: ValidatorOptions): Promise<ValidationResult> {
    await this.initialize();

    const startTime = Date.now();

    // Filter files that were actually copied
    const filesToValidate = files.filter(f => f.archivePath !== null && !f.copyError);

    if (filesToValidate.length === 0) {
      // No files to validate - return early with skipped files
      const results: ValidatedFile[] = files.map(file => ({
        ...file,
        isValid: false,
        validationError: file.copyError || 'Not copied',
      }));

      return {
        files: results,
        totalValidated: 0,
        totalValid: 0,
        totalInvalid: 0,
        totalRolledBack: 0,
        validationTimeMs: 0,
      };
    }

    // Detect if archive is on network - throttle concurrency if so
    const isNetworkArchive = this.detectNetworkPath(filesToValidate[0].archivePath!);
    const hw = getHardwareProfile();

    // SMB-aware concurrency: use network workers for SMB, full hash workers for local
    const concurrency = isNetworkArchive ? hw.copyWorkersNetwork : hw.hashWorkers;
    const queue = new PQueue({ concurrency });

    console.log(`[Validator] Starting validation: ${filesToValidate.length} files, ${concurrency} workers (network: ${isNetworkArchive})`);

    const totalFiles = filesToValidate.length;
    let validatedCount = 0;
    let validCount = 0;
    let invalidCount = 0;
    let rolledBackCount = 0;

    const results: ValidatedFile[] = [];

    // Queue ALL files for parallel validation with controlled concurrency
    const validatePromises = filesToValidate.map((file) =>
      queue.add(async () => {
        // Check cancellation
        if (options?.signal?.aborted) {
          throw new Error('Validation cancelled');
        }

        // Hash the file
        const hashResult = await this.pool!.hash(file.archivePath!);

        const validatedFile: ValidatedFile = {
          ...file,
          isValid: false,
          validationError: null,
        };

        if (hashResult.error) {
          validatedFile.validationError = `Re-hash failed: ${hashResult.error}`;
          invalidCount++;

          // Rollback if requested
          if (options?.autoRollback !== false) {
            await this.rollback(file.archivePath!);
            rolledBackCount++;
          }
        } else if (hashResult.hash !== file.hash) {
          validatedFile.validationError = `Hash mismatch: expected ${file.hash}, got ${hashResult.hash}`;
          invalidCount++;

          // Rollback invalid file
          if (options?.autoRollback !== false) {
            await this.rollback(file.archivePath!);
            rolledBackCount++;
          }
        } else {
          validatedFile.isValid = true;
          validCount++;
        }

        results.push(validatedFile);
        validatedCount++;

        // Log progress every 10 files or on errors (matches Copier pattern)
        if (validatedCount % 10 === 0 || validatedFile.validationError) {
          const pct = ((validatedCount / totalFiles) * 100).toFixed(1);
          console.log(`[Validator] Progress: ${validatedCount}/${totalFiles} files (${pct}%)${validatedFile.validationError ? ` ERROR: ${validatedFile.validationError}` : ''}`);
        }

        // Report progress (80-95% range)
        if (options?.onProgress && totalFiles > 0) {
          const percent = 80 + ((validatedCount / totalFiles) * 15);
          options.onProgress(percent, file.filename);
        }

        // FIX 6: Stream result to caller for incremental persistence
        if (options?.onFileComplete) {
          await options.onFileComplete(validatedFile, validatedCount - 1, totalFiles);
        }

        return validatedFile;
      })
    );

    // Wait for all validations to complete
    await Promise.all(validatePromises);

    // Add files that weren't copied (duplicates, errors) to results
    for (const file of files) {
      if (file.archivePath === null || file.copyError) {
        results.push({
          ...file,
          isValid: false,
          validationError: file.copyError || 'Not copied',
        });
      }
    }

    const validationTimeMs = Date.now() - startTime;

    return {
      files: results,
      totalValidated: validatedCount,
      totalValid: validCount,
      totalInvalid: invalidCount,
      totalRolledBack: rolledBackCount,
      validationTimeMs,
    };
  }

  /**
   * Rollback a single file (delete from archive)
   */
  private async rollback(archivePath: string): Promise<void> {
    try {
      await fs.unlink(archivePath);
      console.log(`[Validator] Rolled back invalid file: ${archivePath}`);
    } catch (error) {
      console.warn(`[Validator] Failed to rollback file: ${archivePath}`, error);
    }
  }
}

/**
 * Create a Validator instance
 */
export function createValidator(): Validator {
  return new Validator();
}
