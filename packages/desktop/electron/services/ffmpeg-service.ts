import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs/promises';
import { execSync } from 'child_process';
import path from 'path';

// Common FFmpeg installation paths on macOS
const FFMPEG_PATHS = [
  '/opt/homebrew/bin/ffmpeg',      // Homebrew on Apple Silicon
  '/usr/local/bin/ffmpeg',          // Homebrew on Intel Mac / manual install
  '/usr/bin/ffmpeg',                // System install
];

/**
 * Find FFmpeg binary path
 * Checks PATH first, then common installation directories
 */
function findFfmpegPath(): string | null {
  // Try 'which ffmpeg' first (works if in PATH)
  try {
    const result = execSync('which ffmpeg', { encoding: 'utf-8' }).trim();
    if (result) return result;
  } catch {
    // Not in PATH, continue to check common paths
  }

  // Check common installation paths
  for (const ffmpegPath of FFMPEG_PATHS) {
    try {
      require('fs').accessSync(ffmpegPath);
      return ffmpegPath;
    } catch {
      // Not at this path, continue
    }
  }

  return null;
}

// Initialize FFmpeg path on module load
const ffmpegPath = findFfmpegPath();
if (ffmpegPath) {
  console.log(`[FFmpegService] Using FFmpeg at: ${ffmpegPath}`);
  ffmpeg.setFfmpegPath(ffmpegPath);
  // Also set ffprobe path (typically in same directory)
  const ffprobePath = path.join(path.dirname(ffmpegPath), 'ffprobe');
  try {
    require('fs').accessSync(ffprobePath);
    ffmpeg.setFfprobePath(ffprobePath);
  } catch {
    // ffprobe not at expected location, let fluent-ffmpeg find it
  }
} else {
  console.error('[FFmpegService] WARNING: FFmpeg not found! Video processing will fail.');
}

export interface VideoMetadata {
  duration: number | null;
  width: number | null;
  height: number | null;
  codec: string | null;
  fps: number | null;
  dateTaken: string | null;
  rawMetadata: string;
}

/**
 * Service for extracting metadata from videos using FFmpeg
 */
export class FFmpegService {
  /**
   * Extract metadata from a video file
   * @param filePath - Absolute path to the video file
   * @returns Promise resolving to extracted metadata
   */
  async extractMetadata(filePath: string): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          console.error('Error extracting video metadata:', err);
          reject(err);
          return;
        }

        const videoStream = metadata.streams.find((s) => s.codec_type === 'video');

        // Extract creation time from format tags or stream tags
        const creationTime =
          metadata.format.tags?.creation_time ||
          videoStream?.tags?.creation_time ||
          null;

        resolve({
          duration: metadata.format.duration || null,
          width: videoStream?.width || null,
          height: videoStream?.height || null,
          codec: videoStream?.codec_name || null,
          fps: videoStream?.r_frame_rate
            ? this.parseFrameRate(videoStream.r_frame_rate)
            : null,
          dateTaken: creationTime ? new Date(creationTime).toISOString() : null,
          rawMetadata: JSON.stringify(metadata, null, 2),
        });
      });
    });
  }

  /**
   * Parse frame rate string (e.g., "30000/1001") to number
   */
  private parseFrameRate(frameRate: string): number | null {
    try {
      const parts = frameRate.split('/');
      if (parts.length === 2) {
        const numerator = parseInt(parts[0], 10);
        const denominator = parseInt(parts[1], 10);
        return numerator / denominator;
      }
      return parseFloat(frameRate);
    } catch {
      return null;
    }
  }

  /**
   * Extract a single frame from a video at a specific timestamp
   *
   * @param sourcePath - Absolute path to video file
   * @param outputPath - Absolute path for output JPEG
   * @param timestampSeconds - Time offset in seconds (default: 1)
   * @param size - Output size in pixels (square crop, default: 256)
   * @returns Promise that resolves when frame is extracted
   */
  async extractFrame(
    sourcePath: string,
    outputPath: string,
    timestampSeconds: number = 1,
    size: number = 256
  ): Promise<void> {
    // Check if source file exists BEFORE calling FFmpeg
    try {
      await fs.access(sourcePath);
    } catch {
      throw new Error(`Source file not found: ${sourcePath}`);
    }

    return new Promise((resolve, reject) => {
      ffmpeg(sourcePath)
        .seekInput(timestampSeconds)
        .frames(1)
        .size(`${size}x${size}`)
        .outputOptions(['-q:v', '2', '-update', '1']) // JPEG quality + single image mode (FFmpeg 7.x)
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => {
          console.error('[FFmpegService] extractFrame failed:', err.message);
          console.error('[FFmpegService] Source:', sourcePath);
          console.error('[FFmpegService] Output:', outputPath);
          reject(err);
        })
        .run();
    });
  }
}
