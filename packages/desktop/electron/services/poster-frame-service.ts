import fs from 'fs/promises';
import { MediaPathService } from './media-path-service';
import { FFmpegService } from './ffmpeg-service';

/**
 * PosterFrameService - Generate poster frames (thumbnails) for videos using FFmpeg
 *
 * Core Rules (DO NOT BREAK):
 * 1. Extract at random timestamp (20-50% of duration) for representative frames
 * 2. Fallback to 1 second for short/unknown duration videos
 * 3. Output is ALWAYS JPEG - Browser compatibility
 * 4. Never throw, return null - Import must not fail because poster failed
 * 5. Hash bucketing - Store as .posters/a3/a3d5e8f9...jpg
 * 6. FFmpeg only - Already installed, no additional dependencies
 */
export class PosterFrameService {
  private readonly FALLBACK_TIMESTAMP = 1; // seconds, for short/unknown duration
  private readonly OUTPUT_HEIGHT = 1920; // Match preview tier for full thumbnail support
  private readonly MIN_PERCENT = 0.2; // 20% into video
  private readonly MAX_PERCENT = 0.5; // 50% into video
  private readonly MIN_DURATION_FOR_RANDOM = 3; // seconds

  constructor(
    private readonly mediaPathService: MediaPathService,
    private readonly ffmpegService: FFmpegService
  ) {}

  /**
   * Calculate timestamp for poster extraction based on video duration.
   * Uses random point between 20-50% for longer videos to avoid
   * black frames, title cards, and credits.
   *
   * @param duration - Video duration in seconds (null if unknown)
   * @returns Timestamp in seconds to extract frame from
   */
  private calculateTimestamp(duration: number | null): number {
    if (!duration || duration <= this.MIN_DURATION_FOR_RANDOM) {
      return this.FALLBACK_TIMESTAMP;
    }
    const percent =
      Math.random() * (this.MAX_PERCENT - this.MIN_PERCENT) + this.MIN_PERCENT;
    return Math.floor(duration * percent);
  }

  /**
   * Generate a poster frame for a video file
   *
   * @param sourcePath - Absolute path to video file
   * @param hash - SHA256 hash of the file (for naming)
   * @returns Absolute path to generated poster, or null on failure
   */
  async generatePoster(sourcePath: string, hash: string): Promise<string | null> {
    try {
      const posterPath = this.mediaPathService.getPosterPath(hash);

      // Check if poster already exists
      try {
        await fs.access(posterPath);
        return posterPath; // Already exists
      } catch {
        // Doesn't exist, continue to generate
      }

      // Ensure bucket directory exists
      await this.mediaPathService.ensureBucketDir(
        this.mediaPathService.getPosterDir(),
        hash
      );

      // Get video duration to calculate optimal timestamp
      let timestamp = this.FALLBACK_TIMESTAMP;
      try {
        const metadata = await this.ffmpegService.extractMetadata(sourcePath);
        timestamp = this.calculateTimestamp(metadata.duration);
      } catch {
        // If metadata extraction fails, use fallback timestamp
      }

      // Extract frame using FFmpeg at calculated timestamp
      await this.ffmpegService.extractFrame(
        sourcePath,
        posterPath,
        timestamp,
        this.OUTPUT_HEIGHT
      );

      // Verify the poster was created
      await fs.access(posterPath);
      return posterPath;
    } catch (error) {
      // Log but don't throw - import should not fail due to poster failure
      console.error(`[PosterFrameService] Failed to generate poster for ${sourcePath}:`, error);
      return null;
    }
  }

  /**
   * Generate posters for multiple videos
   * Non-blocking - failures don't stop other posters
   */
  async generateBatch(
    items: Array<{ sourcePath: string; hash: string }>
  ): Promise<Map<string, string | null>> {
    const results = new Map<string, string | null>();

    for (const item of items) {
      const result = await this.generatePoster(item.sourcePath, item.hash);
      results.set(item.hash, result);
    }

    return results;
  }
}
