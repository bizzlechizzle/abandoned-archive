/**
 * Scanner - File discovery and initial analysis (Step 1)
 *
 * v2.5 BACKBONE: Uses wake-n-blake ScanService for file discovery
 *
 * Per Import Spec v2.0:
 * - Recursive directory walk via backbone ScanService (wake-n-blake)
 * - Exclusion patterns (.DS_Store, Thumbs.db, etc.)
 * - Sidecar detection (.XMP, .SRT, .THM, .LRF)
 * - RAW+JPEG pair detection
 * - Live Photo candidate detection
 * - File size collection for progress estimation
 * - Progress reporting (0-5%)
 *
 * Security features (kept locally):
 * - Path traversal prevention
 * - External symlink blocking
 *
 * @module services/import/scanner
 */

import { promises as fs } from 'fs';
import path from 'path';
import { generateId } from '../../main/ipc-validation';
import { realpath, lstat } from 'fs/promises';
import { getMediaCategory, type MediaCategory } from 'wake-n-blake';
import { ScanService } from '../backbone/scan-service.js';

/**
 * Sidecar file extensions that accompany main media files
 */
export const SIDECAR_EXTENSIONS = new Set([
  '.xmp',    // Adobe XMP sidecar
  '.srt',    // Subtitle/DJI telemetry
  '.thm',    // Thumbnail
  '.lrf',    // DJI low-res reference
  '.xml',    // Metadata sidecar
  '.json',   // Metadata sidecar
]);

/**
 * Files to always skip (never import)
 */
export const SKIP_PATTERNS = new Set([
  '.ds_store',
  'thumbs.db',
  '.spotlight-v100',
  '.trashes',
  '.fseventsd',
  'desktop.ini',
  '.gitignore',
  '.git',
  '.svn',
  '__macosx',
  '.thumbnails',
  '.previews',
  '.posters',
  '.cache',
  '_database',
]);

/**
 * Extensions to always skip (not configurable)
 */
export const SKIP_EXTENSIONS_ALWAYS = new Set([
  '.aae',    // Apple adjustments (useless without original)
  '.psb',    // Photoshop large document
  '.psd',    // Photoshop document (can be huge, rarely needed)
]);

/**
 * Extensions that can be configured to skip (user preference)
 */
export const SKIP_EXTENSIONS_CONFIGURABLE = {
  acr: '.acr',  // Adobe Camera Raw settings
} as const;

/**
 * Get the full set of extensions to skip based on options
 */
export function getSkipExtensions(options?: { skipAcrFiles?: boolean }): Set<string> {
  const extensions = new Set(SKIP_EXTENSIONS_ALWAYS);
  // Default: skip ACR files unless explicitly disabled
  if (options?.skipAcrFiles !== false) {
    extensions.add(SKIP_EXTENSIONS_CONFIGURABLE.acr);
  }
  return extensions;
}

/**
 * Legacy export for backwards compatibility
 * @deprecated Use getSkipExtensions() instead
 */
export const SKIP_EXTENSIONS = new Set([
  '.aae',    // Apple adjustments (useless without original)
  '.psb',    // Photoshop large document
  '.psd',    // Photoshop document (can be huge, rarely needed)
  '.acr',    // Adobe Camera Raw settings (configurable via settings)
]);

/**
 * Extensions to import but hide (metadata/support files)
 */
export const HIDDEN_EXTENSIONS = new Set([
  '.srt',    // DJI telemetry
  '.lrf',    // DJI low-res reference
  '.thm',    // Thumbnails
]);

/**
 * Scanned file information
 */
export interface ScannedFile {
  id: string;
  originalPath: string;
  filename: string;
  extension: string;
  size: number;
  mediaType: 'image' | 'video' | 'document' | 'map' | 'sidecar' | 'unknown';
  isSidecar: boolean;
  isRaw: boolean;
  shouldHide: boolean;
  shouldSkip: boolean;
  /** Potential paired file (RAW+JPEG, Live Photo MOV) */
  pairedWith?: string;
  /** Base name for matching (without extension) */
  baseName: string;
}

/**
 * Scan result summary
 */
export interface ScanResult {
  sessionId: string;
  files: ScannedFile[];
  totalBytes: number;
  totalFiles: number;
  byType: {
    image: number;
    video: number;
    document: number;
    map: number;
    sidecar: number;
    skipped: number;
  };
  rawJpegPairs: Array<{ raw: string; jpeg: string }>;
  livePhotoCandidates: Array<{ image: string; video: string }>;
  sameDevice: boolean;
  estimatedDurationMs: number;
}

/**
 * Scanner options
 */
export interface ScannerOptions {
  /**
   * Progress callback (0-5% range)
   */
  onProgress?: (percent: number, currentPath: string) => void;

  /**
   * Abort signal for cancellation
   */
  signal?: AbortSignal;

  /**
   * Archive base path (for same-device detection)
   */
  archivePath?: string;

  /**
   * Skip .acr files during import (default: true)
   * Set to false to import Adobe Camera Raw settings files
   */
  skipAcrFiles?: boolean;
}

/**
 * RAW file extensions for pairing detection
 */
const RAW_EXTENSIONS = new Set([
  '.raw', '.cr2', '.cr3', '.nef', '.arw', '.orf', '.rw2', '.pef', '.dng', '.srw', '.raf',
  '.3fr', '.dcr', '.kdc', '.mrw', '.nrw', '.rwl', '.sr2', '.srf', '.x3f', '.erf', '.mef', '.mos',
]);

/**
 * JPEG extensions for pairing detection
 */
const JPEG_EXTENSIONS = new Set(['.jpg', '.jpeg']);

/**
 * Video extensions that could be Live Photo videos
 */
const LIVE_PHOTO_VIDEO_EXTENSIONS = new Set(['.mov', '.mp4']);

/**
 * Image extensions that could have Live Photo videos
 */
const LIVE_PHOTO_IMAGE_EXTENSIONS = new Set(['.heic', '.heif', '.jpg', '.jpeg']);

/**
 * Check if two paths are on the same device
 */
async function isSameDevice(path1: string, path2: string): Promise<boolean> {
  try {
    const [stat1, stat2] = await Promise.all([
      fs.stat(path1),
      fs.stat(path2),
    ]);
    return stat1.dev === stat2.dev;
  } catch {
    return false;
  }
}

/**
 * Get media type from extension using wake-n-blake's categorization
 *
 * Wake-n-blake is the source of truth for file type detection.
 * Local SIDECAR_EXTENSIONS check is kept for special sidecar handling.
 */
function getMediaType(ext: string): ScannedFile['mediaType'] {
  const lowerExt = ext.toLowerCase();

  // Check sidecars first (special handling for import flow)
  if (SIDECAR_EXTENSIONS.has(lowerExt)) return 'sidecar';

  // Use wake-n-blake for all other categorization
  const category = getMediaCategory(lowerExt);
  return mapCategoryToMediaType(category);
}

/**
 * Map wake-n-blake MediaCategory to scanner's media type
 */
function mapCategoryToMediaType(category: MediaCategory): ScannedFile['mediaType'] {
  switch (category) {
    case 'image':
    case 'raw':
      return 'image';
    case 'video':
      return 'video';
    case 'geospatial':
      return 'map';
    case 'sidecar':
    case 'subtitle':
      return 'sidecar';
    // All other categories go to documents
    case 'document':
    case 'archive':
    case 'audio':
    case 'ebook':
    case 'email':
    case 'font':
    case 'model3d':
    case 'calendar':
    case 'contact':
    case 'executable':
    case 'data':
    case 'game':
    case 'other':
      return 'document';
    default:
      return 'unknown';
  }
}

/**
 * Scanner class for file discovery
 */
export class Scanner {
  /** Counters for path security logging */
  private pathTraversalBlocked = 0;
  private symlinkBlocked = 0;
  /** Current scan options (set during scan()) */
  private currentScanOptions?: ScannerOptions;

  /**
   * Validate that a path doesn't escape the allowed root directory
   * Prevents path traversal attacks via symlinks or ../ sequences
   * @param filePath - Path to validate
   * @param allowedRoot - Root directory that all paths must stay within
   * @returns true if path is safe, false if it escapes the root
   */
  private async validatePathWithinRoot(filePath: string, allowedRoot: string): Promise<boolean> {
    try {
      // Resolve both paths to eliminate ../ and symlinks
      const realFilePath = await realpath(filePath);
      const realAllowedRoot = await realpath(allowedRoot);

      // Path must start with the root (or be exactly the root)
      const isWithin = realFilePath === realAllowedRoot ||
        realFilePath.startsWith(realAllowedRoot + path.sep);

      if (!isWithin) {
        console.warn(`[Scanner] Path traversal blocked: ${filePath} resolves outside allowed root`);
        this.pathTraversalBlocked++;
        return false;
      }

      return true;
    } catch (error) {
      // If realpath fails (broken symlink, permission denied, etc.), reject the path
      console.warn(`[Scanner] Path validation failed for ${filePath}:`, error);
      return false;
    }
  }

  /**
   * Check if a path is a symlink pointing outside the allowed root
   * @param filePath - Path to check
   * @param allowedRoot - Root directory that symlink targets must stay within
   * @returns true if symlink points outside root (should be blocked), false if safe
   */
  private async isSymlinkOutsideRoot(filePath: string, allowedRoot: string): Promise<boolean> {
    try {
      const stats = await lstat(filePath);

      if (!stats.isSymbolicLink()) {
        return false; // Not a symlink, no concern
      }

      // It's a symlink - check where it points
      const target = await realpath(filePath);
      const realRoot = await realpath(allowedRoot);

      const isOutside = target !== realRoot && !target.startsWith(realRoot + path.sep);

      if (isOutside) {
        console.warn(`[Scanner] External symlink blocked: ${filePath} -> ${target}`);
        this.symlinkBlocked++;
        return true;
      }

      return false;
    } catch (error) {
      // Broken symlink or permission denied - treat as unsafe
      console.warn(`[Scanner] Symlink check failed for ${filePath}:`, error);
      return true; // Err on the side of caution
    }
  }

  /**
   * Scan directories and files for import
   */
  async scan(paths: string[], options?: ScannerOptions): Promise<ScanResult> {
    // Reset security counters for this scan
    this.pathTraversalBlocked = 0;
    this.symlinkBlocked = 0;
    // Store options for use in scanFile
    this.currentScanOptions = options;

    const sessionId = generateId();
    const files: ScannedFile[] = [];
    let totalBytes = 0;
    let processedPaths = 0;

    // Get total path count for progress
    const allPaths = await this.expandPaths(paths, options?.signal);
    const totalPaths = allPaths.length;

    // Process each file
    for (const filePath of allPaths) {
      if (options?.signal?.aborted) {
        throw new Error('Scan cancelled');
      }

      const scanned = await this.scanFile(filePath);

      if (!scanned.shouldSkip) {
        files.push(scanned);
        totalBytes += scanned.size;
      }

      processedPaths++;

      // Report progress (0-5% range)
      if (options?.onProgress && totalPaths > 0) {
        const percent = (processedPaths / totalPaths) * 5;
        options.onProgress(percent, filePath);
      }
    }

    // Detect RAW+JPEG pairs
    const rawJpegPairs = this.detectRawJpegPairs(files);

    // Detect Live Photo candidates
    const livePhotoCandidates = this.detectLivePhotoCandidates(files);

    // Check if source and archive are on same device
    let sameDevice = false;
    if (options?.archivePath && paths.length > 0) {
      sameDevice = await isSameDevice(paths[0], options.archivePath);
    }

    // Estimate duration based on file count and total size
    const estimatedDurationMs = this.estimateDuration(files.length, totalBytes, sameDevice);

    // Count by type
    const byType = {
      image: 0,
      video: 0,
      document: 0,
      map: 0,
      sidecar: 0,
      skipped: 0,
    };

    for (const file of files) {
      if (file.mediaType === 'unknown') {
        byType.skipped++;
      } else {
        byType[file.mediaType]++;
      }
    }

    return {
      sessionId,
      files,
      totalBytes,
      totalFiles: files.length,
      byType,
      rawJpegPairs,
      livePhotoCandidates,
      sameDevice,
      estimatedDurationMs,
    };
  }

  /**
   * Expand directory paths to individual file paths
   * Validates all paths stay within their input directories (security)
   */
  private async expandPaths(paths: string[], signal?: AbortSignal): Promise<string[]> {
    const result: string[] = [];

    for (const inputPath of paths) {
      if (signal?.aborted) {
        throw new Error('Scan cancelled');
      }

      // Resolve input path to get the canonical root
      const resolvedInput = path.resolve(inputPath);

      // Check for symlinks pointing outside at the root level
      if (await this.isSymlinkOutsideRoot(resolvedInput, resolvedInput)) {
        console.warn(`[Scanner] Skipping external symlink at root: ${inputPath}`);
        continue;
      }

      const stat = await fs.stat(resolvedInput);

      if (stat.isFile()) {
        result.push(resolvedInput);
      } else if (stat.isDirectory()) {
        const expanded = await this.walkDirectory(resolvedInput, resolvedInput, signal);
        result.push(...expanded);
      }
    }

    // Log security summary if any paths were blocked
    if (this.pathTraversalBlocked > 0 || this.symlinkBlocked > 0) {
      console.log(`[Scanner] Security: blocked ${this.pathTraversalBlocked} path traversal attempts, ${this.symlinkBlocked} external symlinks`);
    }

    return result;
  }

  /**
   * Recursively walk directory and collect file paths
   * Validates all paths stay within the allowed root (security)
   * @param dirPath - Current directory to walk
   * @param allowedRoot - Root directory that all paths must stay within
   * @param signal - Abort signal for cancellation
   */
  private async walkDirectory(dirPath: string, allowedRoot: string, signal?: AbortSignal): Promise<string[]> {
    const result: string[] = [];

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (signal?.aborted) {
          throw new Error('Scan cancelled');
        }

        const fullPath = path.join(dirPath, entry.name);
        const lowerName = entry.name.toLowerCase();

        // Skip excluded patterns
        if (SKIP_PATTERNS.has(lowerName)) {
          continue;
        }

        // Skip hidden files (starting with .)
        if (entry.name.startsWith('.')) {
          continue;
        }

        // Security: Check for symlinks pointing outside the allowed root
        if (await this.isSymlinkOutsideRoot(fullPath, allowedRoot)) {
          continue; // Skip external symlinks
        }

        // Security: Validate path doesn't escape via ../ or resolved symlink
        if (!await this.validatePathWithinRoot(fullPath, allowedRoot)) {
          continue; // Skip paths that escape the root
        }

        if (entry.isFile()) {
          result.push(fullPath);
        } else if (entry.isDirectory()) {
          const nested = await this.walkDirectory(fullPath, allowedRoot, signal);
          result.push(...nested);
        }
      }
    } catch (error) {
      console.warn(`[Scanner] Failed to read directory: ${dirPath}`, error);
    }

    return result;
  }

  /**
   * Scan a single file and extract metadata
   * Uses backbone ScanService for sidecar/skip detection
   */
  private async scanFile(filePath: string): Promise<ScannedFile> {
    const filename = path.basename(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const baseName = path.basename(filePath, extension).toLowerCase();

    let size = 0;
    try {
      const stat = await fs.stat(filePath);
      size = stat.size;
    } catch {
      // File may have been deleted
    }

    const mediaType = getMediaType(extension);
    // Use backbone ScanService with local fallback
    const isSidecar = ScanService.isSidecar(filePath) || SIDECAR_EXTENSIONS.has(extension);
    const isRaw = RAW_EXTENSIONS.has(extension);
    const shouldHide = HIDDEN_EXTENSIONS.has(extension);
    // Get skip extensions based on current scan options (respects user preferences)
    const skipExtensions = getSkipExtensions({ skipAcrFiles: this.currentScanOptions?.skipAcrFiles });
    // Use backbone for skip detection with local fallback
    const shouldSkip = ScanService.isSkipped(filePath) || skipExtensions.has(extension) || mediaType === 'unknown';

    return {
      id: generateId(),
      originalPath: filePath,
      filename,
      extension,
      size,
      mediaType,
      isSidecar,
      isRaw,
      shouldHide,
      shouldSkip,
      baseName,
    };
  }

  /**
   * Detect RAW+JPEG pairs based on matching base names
   */
  private detectRawJpegPairs(files: ScannedFile[]): Array<{ raw: string; jpeg: string }> {
    const pairs: Array<{ raw: string; jpeg: string }> = [];
    const byBaseName = new Map<string, ScannedFile[]>();

    // Group files by base name
    for (const file of files) {
      const existing = byBaseName.get(file.baseName) || [];
      existing.push(file);
      byBaseName.set(file.baseName, existing);
    }

    // Find pairs
    for (const [, group] of byBaseName) {
      const raw = group.find(f => RAW_EXTENSIONS.has(f.extension));
      const jpeg = group.find(f => JPEG_EXTENSIONS.has(f.extension));

      if (raw && jpeg) {
        pairs.push({ raw: raw.id, jpeg: jpeg.id });
        raw.pairedWith = jpeg.id;
        jpeg.pairedWith = raw.id;
      }
    }

    return pairs;
  }

  /**
   * Detect Live Photo candidates based on matching base names
   */
  private detectLivePhotoCandidates(files: ScannedFile[]): Array<{ image: string; video: string }> {
    const candidates: Array<{ image: string; video: string }> = [];
    const byBaseName = new Map<string, ScannedFile[]>();

    // Group files by base name
    for (const file of files) {
      const existing = byBaseName.get(file.baseName) || [];
      existing.push(file);
      byBaseName.set(file.baseName, existing);
    }

    // Find potential Live Photo pairs
    for (const [, group] of byBaseName) {
      const image = group.find(f => LIVE_PHOTO_IMAGE_EXTENSIONS.has(f.extension));
      const video = group.find(f => LIVE_PHOTO_VIDEO_EXTENSIONS.has(f.extension));

      if (image && video) {
        candidates.push({ image: image.id, video: video.id });
      }
    }

    return candidates;
  }

  /**
   * Estimate import duration based on file count, size, and copy strategy
   * OPT-078: Simplified - always estimate as copy speed (no hardlinks)
   */
  private estimateDuration(fileCount: number, totalBytes: number, _sameDevice: boolean): number {
    // Base time per file (metadata, DB operations): ~50ms
    const baseTimePerFile = 50;

    // Copy speed estimate: ~200 MB/s (SSD to SSD)
    const copySpeedBps = 200_000_000;
    const copyTimeMs = (totalBytes / copySpeedBps) * 1000;

    // Total estimate
    const totalMs = (fileCount * baseTimePerFile) + copyTimeMs;

    return Math.ceil(totalMs);
  }
}

// Singleton instance
let scannerInstance: Scanner | null = null;

/**
 * Get the singleton Scanner instance
 */
export function getScanner(): Scanner {
  if (!scannerInstance) {
    scannerInstance = new Scanner();
  }
  return scannerInstance;
}
