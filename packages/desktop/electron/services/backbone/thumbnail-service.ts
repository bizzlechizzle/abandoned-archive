/**
 * Thumbnail Service - Backbone Wrapper for shoemaker
 *
 * Provides thumbnail generation, preview extraction, and video frame extraction.
 * Never throws - returns null on failure for graceful degradation.
 */

import {
  generateForFile,
  extractBestPreview,
  analyzeEmbeddedPreviews,
  loadConfig,
  loadPreset,
  applyPreset,
  isRawFormat,
  isVideoFormat,
  isDecodedFormat,
  type Config,
  type Preset,
  type GenerationResult,
  type PreviewAnalysis,
  type ProgressInfo,
} from 'shoemaker';
import * as path from 'node:path';
import * as fs from 'node:fs';

export interface ThumbnailSizes {
  /** Small thumbnail (400px) for grid view */
  sm?: string;
  /** Large thumbnail (800px) for HiDPI grid */
  lg?: string;
  /** Preview (1920px) for lightbox */
  preview?: string;
}

export interface ThumbnailOptions {
  /** Force regeneration even if thumbnails exist */
  force?: boolean;
  /** Output directory (default: alongside source) */
  outputDir?: string;
  /** Preset name (default: 'fast') */
  preset?: string;
  /** Progress callback */
  onProgress?: (info: ProgressInfo) => void;
}

export interface ThumbnailResult {
  /** Whether generation succeeded */
  success: boolean;
  /** Generated thumbnail paths by size */
  paths: ThumbnailSizes;
  /** Extraction method used */
  method: 'extracted' | 'decoded' | 'direct' | 'video' | null;
  /** Error message if failed */
  error?: string;
  /** Processing time in ms */
  durationMs: number;
}

let configInstance: Config | null = null;
let presetCache: Map<string, Preset> = new Map();

export class ThumbnailService {
  /**
   * Initialize the thumbnail service (call once at startup)
   */
  static async initialize(): Promise<void> {
    configInstance = await loadConfig();
    // Pre-load common presets
    try {
      const fast = await loadPreset('fast', configInstance);
      const quality = await loadPreset('quality', configInstance);
      presetCache.set('fast', fast);
      presetCache.set('quality', quality);
    } catch {
      // Presets may not exist, use defaults
    }
  }

  /**
   * Generate thumbnails for an image or video
   * Never throws - returns success: false on failure
   */
  static async generate(
    filePath: string,
    options: ThumbnailOptions = {}
  ): Promise<ThumbnailResult> {
    const startTime = Date.now();

    try {
      // Ensure initialized
      if (!configInstance) {
        await this.initialize();
      }

      // Get or load preset
      const presetName = options.preset ?? 'fast';
      let preset = presetCache.get(presetName);
      if (!preset) {
        try {
          preset = await loadPreset(presetName, configInstance!);
          presetCache.set(presetName, preset);
        } catch {
          // Use fast as fallback
          preset = presetCache.get('fast');
        }
      }

      const config = preset ? applyPreset(configInstance!, preset) : configInstance!;

      // Generate thumbnails using shoemaker
      const result = await generateForFile(filePath, {
        config,
        preset: preset!,
        force: options.force,
        onProgress: options.onProgress,
      });

      // Map result to our interface
      const paths: ThumbnailSizes = {};
      for (const thumb of result.thumbnails) {
        if (thumb.width <= 400) paths.sm = thumb.path;
        else if (thumb.width <= 800) paths.lg = thumb.path;
        else paths.preview = thumb.path;
      }

      return {
        success: result.thumbnails.length > 0,
        paths,
        method: result.method,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      // Never throw - return failure result
      return {
        success: false,
        paths: {},
        method: null,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Extract best available preview from a RAW file
   * Returns null on failure (graceful degradation)
   */
  static async extractPreview(filePath: string): Promise<Buffer | null> {
    try {
      const ext = path.extname(filePath).toLowerCase();
      if (!isRawFormat(ext)) {
        return null;
      }

      const result = await extractBestPreview(filePath);
      return result?.buffer ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Analyze embedded previews in a RAW file
   */
  static async analyzePreview(filePath: string): Promise<PreviewAnalysis | null> {
    try {
      return await analyzeEmbeddedPreviews(filePath);
    } catch {
      return null;
    }
  }

  /**
   * Check if a file is a RAW format
   */
  static isRaw(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return isRawFormat(ext);
  }

  /**
   * Check if a file is a video format
   */
  static isVideo(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return isVideoFormat(ext);
  }

  /**
   * Check if a file needs decoding (not just resize)
   */
  static needsDecoding(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return !isDecodedFormat(ext);
  }

  /**
   * Get thumbnail paths for a file (without generating)
   */
  static getThumbnailPaths(
    filePath: string,
    outputDir?: string
  ): ThumbnailSizes {
    const dir = outputDir ?? path.dirname(filePath);
    const stem = path.basename(filePath, path.extname(filePath));

    return {
      sm: path.join(dir, `${stem}.thumb.sm.jpg`),
      lg: path.join(dir, `${stem}.thumb.lg.jpg`),
      preview: path.join(dir, `${stem}.preview.jpg`),
    };
  }

  /**
   * Check if thumbnails already exist for a file
   */
  static thumbnailsExist(filePath: string, outputDir?: string): ThumbnailSizes {
    const paths = this.getThumbnailPaths(filePath, outputDir);
    const existing: ThumbnailSizes = {};

    if (paths.sm && fs.existsSync(paths.sm)) existing.sm = paths.sm;
    if (paths.lg && fs.existsSync(paths.lg)) existing.lg = paths.lg;
    if (paths.preview && fs.existsSync(paths.preview)) existing.preview = paths.preview;

    return existing;
  }
}

export { Config, Preset, GenerationResult, PreviewAnalysis, ProgressInfo };
