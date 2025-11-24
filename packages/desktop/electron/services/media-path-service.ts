import path from 'path';
import fs from 'fs/promises';

/**
 * MediaPathService - Centralized path utilities for media files
 *
 * Provides consistent paths for thumbnails, previews, posters, and XMP sidecars.
 * Uses hash bucketing to avoid filesystem limits (10k+ files in one directory).
 *
 * Path pattern: [baseDir]/[first2chars]/[sha256].[ext]
 * Example: .thumbnails/a3/a3d5e8f9...jpg
 */
export class MediaPathService {
  constructor(private readonly archivePath: string) {}

  // === Directory Getters ===

  getThumbnailDir(): string {
    return path.join(this.archivePath, '.thumbnails');
  }

  getPreviewDir(): string {
    return path.join(this.archivePath, '.previews');
  }

  getPosterDir(): string {
    return path.join(this.archivePath, '.posters');
  }

  // === Path Generators ===

  /**
   * Get thumbnail path for a given file hash and size
   * Uses first 2 characters of hash as subdirectory for bucketing
   *
   * Sizes:
   * - 400: Small thumbnail for grid view (1x displays)
   * - 800: Large thumbnail for grid view (2x HiDPI displays)
   * - 1920: Preview for lightbox/detail view
   * - undefined: Legacy 256px path (backwards compatibility)
   */
  getThumbnailPath(hash: string, size?: 400 | 800 | 1920): string {
    const bucket = hash.substring(0, 2);
    const filename = size ? `${hash}_${size}.jpg` : `${hash}.jpg`;
    return path.join(this.getThumbnailDir(), bucket, filename);
  }

  /**
   * Get preview path for a given file hash (for RAW files)
   */
  getPreviewPath(hash: string): string {
    const bucket = hash.substring(0, 2);
    return path.join(this.getPreviewDir(), bucket, `${hash}.jpg`);
  }

  /**
   * Get poster frame path for a given video hash
   */
  getPosterPath(hash: string): string {
    const bucket = hash.substring(0, 2);
    return path.join(this.getPosterDir(), bucket, `${hash}.jpg`);
  }

  /**
   * Get XMP sidecar path for a media file
   * XMP sidecars are stored alongside the original file
   */
  getXmpPath(mediaPath: string): string {
    const parsed = path.parse(mediaPath);
    return path.join(parsed.dir, `${parsed.name}.xmp`);
  }

  // === Directory Initialization ===

  /**
   * Ensure all media directories exist
   */
  async ensureDirectories(): Promise<void> {
    const dirs = [
      this.getThumbnailDir(),
      this.getPreviewDir(),
      this.getPosterDir(),
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Ensure bucket directory exists for a given hash
   */
  async ensureBucketDir(baseDir: string, hash: string): Promise<void> {
    const bucket = hash.substring(0, 2);
    const bucketDir = path.join(baseDir, bucket);
    await fs.mkdir(bucketDir, { recursive: true });
  }
}
