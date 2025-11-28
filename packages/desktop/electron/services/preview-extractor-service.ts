import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { MediaPathService } from './media-path-service';
import { ExifToolService } from './exiftool-service';

const execFileAsync = promisify(execFile);

/**
 * PreviewExtractorService - Extract embedded JPEG previews from RAW files
 *
 * Core Rules (DO NOT BREAK):
 * 1. Extract previews, don't convert - ExifTool extraction is <1s vs 2-5s for full conversion
 * 2. Fallback chain: PreviewImage -> JpgFromRaw -> ThumbnailImage
 * 3. Never throw, return null - Import must not fail because preview failed
 * 4. Hash bucketing - Store as .previews/a3/a3d5e8f9...jpg
 * 5. ExifTool only - Do not add LibRaw, dcraw, or WASM decoders
 */
export class PreviewExtractorService {
  // Formats that contain embedded JPEG previews (RAW + HEIC)
  // Sharp cannot decode HEIC directly (missing libheif plugin), so we extract embedded JPEG
  private readonly PREVIEW_FORMATS = new Set([
    // RAW camera formats
    '.nef', '.nrw',                    // Nikon
    '.cr2', '.cr3', '.crw',            // Canon
    '.arw', '.srf', '.sr2',            // Sony
    '.orf',                            // Olympus
    '.pef', '.dng',                    // Pentax, Adobe
    '.rw2',                            // Panasonic
    '.raf',                            // Fujifilm
    '.raw', '.rwl', '.dng',            // Leica
    '.3fr', '.fff',                    // Hasselblad
    '.iiq',                            // Phase One
    '.mrw',                            // Minolta
    '.x3f',                            // Sigma
    '.erf',                            // Epson
    '.mef',                            // Mamiya
    '.mos',                            // Leaf
    '.kdc', '.dcr',                    // Kodak
    // HEIC/HEIF (iPhone, modern cameras) - Sharp can't decode without libheif
    '.heic', '.heif',                  // Apple HEIC
  ]);

  // Tags to try for preview extraction, in order of preference
  private readonly PREVIEW_TAGS = [
    'PreviewImage',    // Most common, full-size preview
    'JpgFromRaw',      // Canon CR2
    'ThumbnailImage',  // Fallback, usually smaller
  ];

  constructor(
    private readonly mediaPathService: MediaPathService,
    private readonly exifToolService: ExifToolService
  ) {}

  /**
   * Convert EXIF orientation string to rotation degrees
   * EXIF orientation values: https://exiftool.org/TagNames/EXIF.html
   * 1 = Horizontal (normal) = 0°
   * 3 = Rotate 180 = 180°
   * 6 = Rotate 90 CW = 90°
   * 8 = Rotate 270 CW = 270° (or -90°)
   */
  private orientationToDegrees(orientation: string | null): number {
    if (!orientation) return 0;

    // Handle string descriptions from exiftool-vendored
    const lower = orientation.toLowerCase();
    if (lower.includes('rotate 90 cw') || lower.includes('90')) return 90;
    if (lower.includes('rotate 180') || lower.includes('180')) return 180;
    if (lower.includes('rotate 270 cw') || lower.includes('270') || lower.includes('rotate 90 ccw')) return 270;

    // Handle numeric values (1-8)
    const num = parseInt(orientation, 10);
    if (num === 3) return 180;
    if (num === 6) return 90;
    if (num === 8) return 270;

    return 0; // Normal orientation or unrecognized
  }

  /**
   * Check if a file format requires preview extraction (RAW or HEIC)
   * These formats either can't be decoded by sharp or benefit from embedded JPEG extraction
   */
  needsPreviewExtraction(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.PREVIEW_FORMATS.has(ext);
  }

  /**
   * Check if file is HEIC/HEIF (requires sips conversion, not ExifTool extraction)
   */
  isHeicFormat(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ext === '.heic' || ext === '.heif';
  }

  /**
   * @deprecated Use needsPreviewExtraction instead
   */
  isRawFormat(filePath: string): boolean {
    return this.needsPreviewExtraction(filePath);
  }

  /**
   * Convert HEIC to JPEG using macOS sips (built-in tool)
   * sips preserves EXIF metadata including orientation
   */
  private async convertHeicWithSips(sourcePath: string, outputPath: string): Promise<boolean> {
    try {
      await execFileAsync('sips', [
        '-s', 'format', 'jpeg',
        sourcePath,
        '--out', outputPath
      ]);
      return true;
    } catch (error) {
      console.error(`[PreviewExtractor] sips conversion failed:`, error);
      return false;
    }
  }

  /**
   * Extract embedded JPEG preview from a RAW or HEIC file
   *
   * @param sourcePath - Absolute path to RAW/HEIC file
   * @param hash - SHA256 hash of the file (for naming)
   * @param force - If true, re-extract even if preview exists (for upgrading to higher-res)
   * @returns Absolute path to extracted preview, or null on failure
   */
  async extractPreview(sourcePath: string, hash: string, force: boolean = false): Promise<string | null> {
    try {
      // Skip files that don't need preview extraction
      if (!this.needsPreviewExtraction(sourcePath)) {
        return null;
      }

      const previewPath = this.mediaPathService.getPreviewPath(hash);

      // Check if preview already exists (skip if force=true)
      if (!force) {
        try {
          await fs.access(previewPath);
          return previewPath; // Already exists
        } catch {
          // Doesn't exist, continue to extract
        }
      }

      // Ensure bucket directory exists
      await this.mediaPathService.ensureBucketDir(
        this.mediaPathService.getPreviewDir(),
        hash
      );

      // HEIC files: Use sips (macOS) to convert to JPEG
      // Sharp can't decode HEIC without libheif plugin
      if (this.isHeicFormat(sourcePath)) {
        console.log(`[PreviewExtractor] Converting HEIC via sips: ${sourcePath}`);

        // Convert to temp file first, then apply rotation with sharp
        const tempPath = previewPath + '.tmp.jpg';
        const success = await this.convertHeicWithSips(sourcePath, tempPath);

        if (success) {
          // Apply EXIF rotation (sips preserves EXIF, but doesn't apply it visually)
          const rotatedBuffer = await sharp(tempPath).rotate().toBuffer();
          await fs.writeFile(previewPath, rotatedBuffer);
          await fs.unlink(tempPath).catch(() => {}); // Clean up temp file
          console.log(`[PreviewExtractor] HEIC converted and rotated: ${previewPath}`);
          return previewPath;
        }

        console.log(`[PreviewExtractor] HEIC conversion failed for ${sourcePath}`);
        return null;
      }

      // RAW files: Extract embedded JPEG preview via ExifTool
      // Try ALL preview tags and pick the LARGEST one (highest resolution)
      // Different RAW formats store the best preview under different tags:
      // - Nikon NEF: JpgFromRaw is full-res, PreviewImage is smaller
      // - Canon CR2: JpgFromRaw is full-res
      // - Others: PreviewImage is usually best
      let bestBuffer: Buffer | null = null;
      let bestTag: string | null = null;

      for (const tag of this.PREVIEW_TAGS) {
        const buffer = await this.exifToolService.extractBinaryTag(sourcePath, tag);

        if (buffer && buffer.length > 0) {
          console.log(`[PreviewExtractor] Found ${tag}: ${buffer.length} bytes`);
          if (!bestBuffer || buffer.length > bestBuffer.length) {
            bestBuffer = buffer;
            bestTag = tag;
          }
        }
      }

      if (bestBuffer && bestTag) {
        // The embedded JPEG preview often lacks orientation EXIF - read from parent RAW file
        // and apply rotation manually. sharp.rotate() without args only works if JPEG has EXIF.
        const rawOrientation = await this.exifToolService.getOrientation(sourcePath);
        const rotationDegrees = this.orientationToDegrees(rawOrientation);

        let finalBuffer: Buffer;
        if (rotationDegrees !== 0) {
          finalBuffer = await sharp(bestBuffer).rotate(rotationDegrees).toBuffer();
          console.log(`[PreviewExtractor] Applied ${rotationDegrees}° rotation from RAW EXIF`);
        } else {
          // No rotation needed, but still process through sharp to strip any embedded rotation
          finalBuffer = await sharp(bestBuffer).rotate().toBuffer();
        }

        await fs.writeFile(previewPath, finalBuffer);
        console.log(`[PreviewExtractor] Extracted ${bestTag} (${bestBuffer.length} bytes) from ${sourcePath}`);
        return previewPath;
      }

      // No preview found
      console.log(`[PreviewExtractor] No embedded preview found in ${sourcePath}`);
      return null;
    } catch (error) {
      // Log but don't throw - import should not fail due to preview failure
      console.error(`[PreviewExtractor] Failed to extract preview from ${sourcePath}:`, error);
      return null;
    }
  }

  /**
   * Extract previews for multiple RAW files
   * Non-blocking - failures don't stop other extractions
   */
  async extractBatch(
    items: Array<{ sourcePath: string; hash: string }>
  ): Promise<Map<string, string | null>> {
    const results = new Map<string, string | null>();

    for (const item of items) {
      const result = await this.extractPreview(item.sourcePath, item.hash);
      results.set(item.hash, result);
    }

    return results;
  }
}
