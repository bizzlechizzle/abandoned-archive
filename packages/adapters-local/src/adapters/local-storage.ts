/**
 * Local Storage Adapter
 *
 * Implements StorageAdapter using Node.js fs module.
 * Supports rsync for optimized large file transfers.
 *
 * @module adapters/local-storage
 */

import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import type {
  StorageAdapter,
  CopyOptions,
  CopyResult,
  FileStat,
  FileInfo,
} from '@au-archive/import-core';

/**
 * Local filesystem storage adapter.
 * Uses Node.js fs module for all operations.
 */
export class LocalStorageAdapter implements StorageAdapter {
  private rsyncAvailable: boolean | null = null;

  async read(filePath: string): Promise<Buffer> {
    return fsp.readFile(filePath);
  }

  async write(filePath: string, data: Buffer): Promise<void> {
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, data);
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fsp.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async delete(filePath: string): Promise<void> {
    await fsp.unlink(filePath);
  }

  async copy(
    source: string,
    dest: string,
    options?: CopyOptions
  ): Promise<CopyResult> {
    const startSize = (await this.stat(source)).size;

    // Ensure destination directory exists
    await fsp.mkdir(path.dirname(dest), { recursive: true });

    // Try hardlink first if requested
    if (options?.hardlink) {
      try {
        await fsp.link(source, dest);
        return {
          success: true,
          bytesTransferred: startSize,
          usedRsync: false,
          verified: true,
        };
      } catch {
        // Hardlink failed (different filesystem), fall through to copy
      }
    }

    // Try rsync if requested and available
    if (options?.useRsync && (await this.checkRsyncAvailable())) {
      const result = await this.copyWithRsync(source, dest, options);
      if (result.success) {
        return result;
      }
      // Fall through to regular copy if rsync fails
    }

    // Regular copy
    await fsp.copyFile(source, dest);

    // Verify checksum if requested
    let verified = false;
    if (options?.checksum) {
      const sourceHash = await this.calculateHash(source);
      const destHash = await this.calculateHash(dest);
      verified = sourceHash === destHash;
      if (!verified) {
        await fsp.unlink(dest);
        return {
          success: false,
          bytesTransferred: 0,
          usedRsync: false,
          verified: false,
          error: 'Checksum verification failed',
        };
      }
    }

    return {
      success: true,
      bytesTransferred: startSize,
      usedRsync: false,
      verified: options?.checksum ? verified : false,
    };
  }

  createReadStream(filePath: string): Readable {
    return fs.createReadStream(filePath);
  }

  createWriteStream(filePath: string): Writable {
    return fs.createWriteStream(filePath);
  }

  async mkdir(dirPath: string, recursive = true): Promise<void> {
    await fsp.mkdir(dirPath, { recursive });
  }

  async list(directory: string): Promise<FileInfo[]> {
    const entries = await fsp.readdir(directory, { withFileTypes: true });
    const results: FileInfo[] = [];

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      const stat = await this.stat(fullPath);
      results.push({
        name: entry.name,
        path: fullPath,
        stat,
      });
    }

    return results;
  }

  async stat(filePath: string): Promise<FileStat> {
    const stats = await fsp.stat(filePath);
    return {
      size: stats.size,
      mtime: stats.mtime,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
    };
  }

  join(...paths: string[]): string {
    return path.join(...paths);
  }

  dirname(filePath: string): string {
    return path.dirname(filePath);
  }

  basename(filePath: string): string {
    return path.basename(filePath);
  }

  extname(filePath: string): string {
    return path.extname(filePath).toLowerCase();
  }

  // ─────────────────────────────────────────────────────────────
  // Private Helper Methods
  // ─────────────────────────────────────────────────────────────

  private async checkRsyncAvailable(): Promise<boolean> {
    if (this.rsyncAvailable !== null) {
      return this.rsyncAvailable;
    }

    return new Promise((resolve) => {
      const proc = spawn('rsync', ['--version']);
      proc.on('error', () => {
        this.rsyncAvailable = false;
        resolve(false);
      });
      proc.on('close', (code) => {
        this.rsyncAvailable = code === 0;
        resolve(this.rsyncAvailable);
      });
    });
  }

  private async copyWithRsync(
    source: string,
    dest: string,
    options?: CopyOptions
  ): Promise<CopyResult> {
    const args = ['-a']; // Archive mode
    if (options?.partial) {
      args.push('--partial');
    }
    if (options?.checksum) {
      args.push('--checksum');
    }
    args.push(source, dest);

    return new Promise((resolve) => {
      const proc = spawn('rsync', args);
      let stderr = '';

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('error', () => {
        resolve({
          success: false,
          bytesTransferred: 0,
          usedRsync: true,
          verified: false,
          error: 'rsync process error',
        });
      });

      proc.on('close', async (code) => {
        if (code === 0) {
          const stat = await this.stat(dest);
          resolve({
            success: true,
            bytesTransferred: stat.size,
            usedRsync: true,
            verified: options?.checksum ?? false,
          });
        } else {
          resolve({
            success: false,
            bytesTransferred: 0,
            usedRsync: true,
            verified: false,
            error: stderr || `rsync exited with code ${code}`,
          });
        }
      });
    });
  }

  private async calculateHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }
}
