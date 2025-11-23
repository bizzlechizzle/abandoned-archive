/**
 * DarktableService - Professional RAW processing via darktable-cli
 * Per LILBITS: ~150 lines, single responsibility
 *
 * Provides high-quality RAW to JPEG conversion using Darktable's
 * professional-grade processing engine.
 *
 * Integration Point: Called AFTER ExifTool preview extraction,
 * processes in background queue without blocking import.
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { MediaPathService } from './media-path-service';

export interface DarktableConfig {
  enabled: boolean;
  binaryPath: string | null;  // null = use bundled or auto-detect
  quality: number;            // JPEG quality (default 92)
}

export interface ProcessResult {
  success: boolean;
  outputPath: string | null;
  error?: string;
  processingTime?: number;
}

// Default locations to search for darktable-cli
const DARKTABLE_SEARCH_PATHS = {
  darwin: [
    '/Applications/darktable.app/Contents/MacOS/darktable-cli',
    '/opt/homebrew/bin/darktable-cli',
    '/usr/local/bin/darktable-cli',
  ],
  linux: [
    '/usr/bin/darktable-cli',
    '/usr/local/bin/darktable-cli',
    '/snap/bin/darktable-cli',
  ],
  win32: [
    'C:\\Program Files\\darktable\\bin\\darktable-cli.exe',
    'C:\\Program Files (x86)\\darktable\\bin\\darktable-cli.exe',
  ],
};

// RAW file extensions supported
const RAW_EXTENSIONS = new Set([
  'nef', 'cr2', 'cr3', 'arw', 'srf', 'sr2', 'orf', 'pef', 'dng',
  'rw2', 'raf', 'raw', 'rwl', '3fr', 'fff', 'iiq', 'mrw', 'x3f',
  'erf', 'mef', 'mos', 'kdc', 'dcr',
]);

export class DarktableService {
  private binaryPath: string | null = null;
  private readonly defaultQuality = 92;

  constructor(private readonly mediaPathService: MediaPathService) {}

  /**
   * Check if darktable-cli is available on the system
   */
  async isAvailable(): Promise<boolean> {
    const binary = await this.findBinary();
    return binary !== null;
  }

  /**
   * Find darktable-cli binary - bundled or system-installed
   */
  async findBinary(): Promise<string | null> {
    if (this.binaryPath) return this.binaryPath;

    const platform = process.platform as keyof typeof DARKTABLE_SEARCH_PATHS;
    const searchPaths = DARKTABLE_SEARCH_PATHS[platform] || [];

    // Check bundled binary first
    const bundledPath = path.join(
      process.resourcesPath || '',
      'bin',
      platform,
      platform === 'win32' ? 'darktable-cli.exe' : 'darktable-cli'
    );
    searchPaths.unshift(bundledPath);

    for (const searchPath of searchPaths) {
      try {
        await fs.access(searchPath, fs.constants.X_OK);
        this.binaryPath = searchPath;
        console.log(`[Darktable] Found binary at: ${searchPath}`);
        return searchPath;
      } catch {
        // Continue searching
      }
    }

    console.warn('[Darktable] No darktable-cli binary found');
    return null;
  }

  /**
   * Check if a file is a supported RAW format
   */
  isRawFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase().slice(1);
    return RAW_EXTENSIONS.has(ext);
  }

  /**
   * Process a RAW file through darktable-cli
   *
   * @param sourcePath - Path to the RAW file
   * @param hash - SHA256 hash (for output naming)
   * @param quality - JPEG quality (default 92)
   * @returns ProcessResult with output path or error
   */
  async processRawFile(
    sourcePath: string,
    hash: string,
    quality: number = this.defaultQuality
  ): Promise<ProcessResult> {
    const startTime = Date.now();

    const binary = await this.findBinary();
    if (!binary) {
      return { success: false, outputPath: null, error: 'Darktable not found' };
    }

    try {
      // Create output directory
      const outputDir = this.mediaPathService.getDarktablePath(hash);
      await this.mediaPathService.ensureBucketDir(
        path.dirname(outputDir),
        hash
      );

      const outputPath = `${outputDir}.jpg`;

      // Check if already processed
      try {
        await fs.access(outputPath);
        console.log(`[Darktable] Already processed: ${hash}`);
        return {
          success: true,
          outputPath,
          processingTime: 0
        };
      } catch {
        // Not yet processed, continue
      }

      // Run darktable-cli
      await this.runDarktableCli(binary, sourcePath, outputPath, quality);

      // Verify output exists
      await fs.access(outputPath);

      const processingTime = Date.now() - startTime;
      console.log(`[Darktable] Processed ${hash} in ${processingTime}ms`);

      return {
        success: true,
        outputPath,
        processingTime,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Darktable] Failed to process ${hash}:`, errorMsg);
      return {
        success: false,
        outputPath: null,
        error: errorMsg,
        processingTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute darktable-cli subprocess
   */
  private runDarktableCli(
    binary: string,
    input: string,
    output: string,
    quality: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // darktable-cli <input> <output> [options]
      // --core --conf plugins/imageio/format/jpeg/quality=92
      const args = [
        input,
        output,
        '--core',
        '--conf', `plugins/imageio/format/jpeg/quality=${quality}`,
      ];

      console.log(`[Darktable] Running: ${binary} ${args.join(' ')}`);

      const proc = spawn(binary, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 120000, // 2 minute timeout per file
      });

      let stderr = '';

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`darktable-cli exited with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Get the output path for a processed file
   */
  getOutputPath(hash: string): string {
    return `${this.mediaPathService.getDarktablePath(hash)}.jpg`;
  }
}
