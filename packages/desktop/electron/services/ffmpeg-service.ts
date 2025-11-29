import ffmpeg from 'fluent-ffmpeg';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface VideoMetadata {
  duration: number | null;
  width: number | null;
  height: number | null;
  codec: string | null;
  fps: number | null;
  dateTaken: string | null;
  rotation: number | null;  // Degrees: 0, 90, 180, 270, -90, etc.
  rawMetadata: string;
}

/**
 * Service for extracting metadata from videos using FFmpeg
 */
export class FFmpegService {
  /**
   * Extract rotation from video using direct ffprobe call
   * fluent-ffmpeg doesn't expose side_data_list which contains displaymatrix rotation
   */
  private async extractRotation(filePath: string): Promise<number | null> {
    try {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_streams',
        filePath
      ]);

      const data = JSON.parse(stdout);
      const videoStream = data.streams?.find((s: { codec_type: string }) => s.codec_type === 'video');

      if (!videoStream) return null;

      // Check side_data_list for displaymatrix rotation (iPhone/modern videos)
      if (videoStream.side_data_list) {
        for (const sideData of videoStream.side_data_list) {
          if (sideData.side_data_type === 'Display Matrix' && typeof sideData.rotation === 'number') {
            return sideData.rotation;
          }
        }
      }

      // Fallback: check stream tags for rotate (older format)
      if (videoStream.tags?.rotate) {
        return parseInt(videoStream.tags.rotate, 10) || null;
      }

      return null;
    } catch (err) {
      console.error('Error extracting rotation via ffprobe:', err);
      return null;
    }
  }

  /**
   * Extract metadata from a video file
   * @param filePath - Absolute path to the video file
   * @returns Promise resolving to extracted metadata
   */
  async extractMetadata(filePath: string): Promise<VideoMetadata> {
    // Extract rotation separately since fluent-ffmpeg doesn't expose side_data_list
    const rotation = await this.extractRotation(filePath);

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
          rotation,
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
   * Uses -vf scale filter instead of -s flag to ensure FFmpeg's autorotate
   * filter (enabled by default) applies BEFORE scaling. This fixes phone
   * videos with rotation metadata (90°/180°/270°).
   *
   * @param sourcePath - Absolute path to video file
   * @param outputPath - Absolute path for output JPEG
   * @param timestampSeconds - Time offset in seconds (default: 1)
   * @param maxHeight - Maximum height in pixels (preserves aspect ratio, default: 1920 for preview tier)
   * @returns Promise that resolves when frame is extracted
   */
  async extractFrame(
    sourcePath: string,
    outputPath: string,
    timestampSeconds: number = 1,
    maxHeight: number = 1920
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(sourcePath)
        .seekInput(timestampSeconds)
        .frames(1)
        // Use -vf scale instead of -s to ensure autorotate applies first
        // -1:maxHeight = auto-calculate width, constrain height
        .outputOptions([
          '-vf', `scale=-1:${maxHeight}`,
          '-q:v', '2',
          '-update', '1'  // Single image mode (FFmpeg 7.x)
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }
}
