/**
 * Scan Service - Backbone Wrapper for wake-n-blake
 *
 * Provides directory scanning, file discovery, and related file detection.
 */

import {
  scanDirectory,
  findRelatedFiles,
  isSidecarFile,
  isSkippedFile,
  detectFileType,
  getMediaCategory,
  isMediaExtension,
  type FileCategory,
  type MediaCategory,
} from 'wake-n-blake';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

export interface ScanOptions {
  /** Recursive scan (default: true) */
  recursive?: boolean;
  /** Include hidden files/folders (default: false) */
  includeHidden?: boolean;
  /** Glob patterns to exclude */
  excludePatterns?: string[];
  /** Whether to detect related files (RAW+JPG, Live Photo, etc.) */
  detectRelated?: boolean;
}

export interface ScanResult {
  /** All discovered file paths */
  files: string[];
  /** File count */
  totalFiles: number;
  /** Total size in bytes */
  totalBytes: number;
  /** Files grouped by category */
  byCategory: Record<string, string[]>;
  /** Errors encountered during scan */
  errors: ScanError[];
}

export interface ScanError {
  path: string;
  error: string;
}

export class ScanService {
  /**
   * Scan a directory for files
   */
  static async scan(
    dirPath: string,
    options: ScanOptions = {}
  ): Promise<ScanResult> {
    const errors: ScanError[] = [];
    const byCategory: Record<string, string[]> = {};
    let totalBytes = 0;

    // Use wake-n-blake's scanner
    const scanResult = await scanDirectory(dirPath, {
      recursive: options.recursive ?? true,
      includeHidden: options.includeHidden ?? false,
      excludePatterns: options.excludePatterns,
    });

    // Copy scanner errors
    errors.push(...scanResult.errors);

    // Categorize files and calculate sizes
    for (const filePath of scanResult.files) {
      try {
        const stats = await fs.stat(filePath);
        totalBytes += stats.size;

        const fileType = await detectFileType(filePath);
        const category = fileType.category;

        if (!byCategory[category]) {
          byCategory[category] = [];
        }
        byCategory[category].push(filePath);
      } catch (err) {
        errors.push({
          path: filePath,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      files: scanResult.files,
      totalFiles: scanResult.files.length,
      totalBytes,
      byCategory,
      errors,
    };
  }

  /**
   * Find related files for a set of files (RAW+JPG pairs, Live Photos, etc.)
   */
  static async findRelated(filePaths: string[]): Promise<Map<string, string[]>> {
    const groups = await findRelatedFiles(filePaths);
    const result = new Map<string, string[]>();

    for (const group of groups) {
      for (const file of group.allFiles) {
        const related = group.allFiles.filter(f => f !== file);
        if (related.length > 0) {
          result.set(file, related);
        }
      }
    }

    return result;
  }

  /**
   * Check if a file is a sidecar (XMP, THM, etc.)
   */
  static isSidecar(filePath: string): boolean {
    return isSidecarFile(filePath);
  }

  /**
   * Check if a file should be skipped (system files, etc.)
   */
  static isSkipped(filePath: string): boolean {
    return isSkippedFile(filePath);
  }

  /**
   * Get the media category for a file extension
   */
  static getCategory(extension: string): MediaCategory | undefined {
    if (isMediaExtension(extension)) {
      return getMediaCategory(extension);
    }
    return undefined;
  }

  /**
   * Detect file type using magic bytes
   */
  static async detectType(filePath: string) {
    return detectFileType(filePath);
  }
}

export { FileCategory, MediaCategory };
