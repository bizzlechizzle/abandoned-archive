import fs from 'fs/promises';
import path from 'path';
import { MediaPathService } from './media-path-service';
import { ExifToolService } from './exiftool-service';

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
  // RAW formats that contain embedded JPEG previews
  private readonly RAW_EXTENSIONS = new Set([
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
   * Check if a file is a RAW format that likely contains an embedded preview
   */
  isRawFormat(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.RAW_EXTENSIONS.has(ext);
  }

  /**
   * Extract embedded JPEG preview from a RAW file
   *
   * @param sourcePath - Absolute path to RAW file
   * @param hash - SHA256 hash of the file (for naming)
   * @param force - If true, re-extract even if preview exists (for upgrading to higher-res)
   * @returns Absolute path to extracted preview, or null on failure
   */
  async extractPreview(sourcePath: string, hash: string, force: boolean = false): Promise<string | null> {
    try {
      // Skip non-RAW files
      if (!this.isRawFormat(sourcePath)) {
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
        await fs.writeFile(previewPath, bestBuffer);
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
