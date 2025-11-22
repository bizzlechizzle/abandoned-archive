/**
 * Storage Adapter Interface
 *
 * Abstracts file system operations for portability.
 * Implementations: LocalStorageAdapter (fs), S3StorageAdapter (cloud)
 *
 * @module adapters/storage
 */

import type { Readable, Writable } from 'node:stream';

/** Options for copy operations */
export interface CopyOptions {
  /** Use rsync if available (faster for large files) */
  useRsync?: boolean;
  /** Create hardlink instead of copy (same filesystem only) */
  hardlink?: boolean;
  /** Verify checksum after copy */
  checksum?: boolean;
  /** Support resume for interrupted transfers */
  partial?: boolean;
}

/** Result of a copy operation */
export interface CopyResult {
  success: boolean;
  bytesTransferred: number;
  usedRsync: boolean;
  verified: boolean;
  error?: string;
}

/** File statistics */
export interface FileStat {
  size: number;
  mtime: Date;
  isFile: boolean;
  isDirectory: boolean;
}

/** File info returned from directory listing */
export interface FileInfo {
  name: string;
  path: string;
  stat: FileStat;
}

/**
 * Storage adapter interface - abstracts all file system operations.
 *
 * This allows the import pipeline to work with local filesystem,
 * S3, or any other storage backend without code changes.
 */
export interface StorageAdapter {
  /**
   * Read entire file into buffer.
   * Use createReadStream for large files.
   */
  read(path: string): Promise<Buffer>;

  /**
   * Write buffer to file.
   * Creates parent directories if needed.
   */
  write(path: string, data: Buffer): Promise<void>;

  /** Check if file or directory exists */
  exists(path: string): Promise<boolean>;

  /** Delete file */
  delete(path: string): Promise<void>;

  /**
   * Copy file from source to destination.
   * Supports rsync optimization for large files.
   */
  copy(source: string, dest: string, options?: CopyOptions): Promise<CopyResult>;

  /** Create readable stream for large file processing */
  createReadStream(path: string): Readable;

  /** Create writable stream for large file output */
  createWriteStream(path: string): Writable;

  /** Create directory (recursive by default) */
  mkdir(path: string, recursive?: boolean): Promise<void>;

  /** List files in directory */
  list(directory: string): Promise<FileInfo[]>;

  /** Get file statistics */
  stat(path: string): Promise<FileStat>;

  /** Join path segments (platform-aware) */
  join(...paths: string[]): string;

  /** Get directory name from path */
  dirname(path: string): string;

  /** Get base name from path */
  basename(path: string): string;

  /** Get file extension (lowercase, with dot) */
  extname(path: string): string;
}
