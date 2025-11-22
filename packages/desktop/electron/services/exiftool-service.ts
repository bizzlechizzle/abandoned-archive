import { exiftool } from 'exiftool-vendored';

export interface ImageMetadata {
  width: number | null;
  height: number | null;
  dateTaken: string | null;
  cameraMake: string | null;
  cameraModel: string | null;
  gps: {
    lat: number;
    lng: number;
    altitude?: number;
  } | null;
  rawExif: string;
}

// Default timeout for ExifTool operations (30 seconds)
const EXIFTOOL_TIMEOUT_MS = 30000;

/**
 * Service for extracting EXIF metadata from images using ExifTool
 */
export class ExifToolService {
  /**
   * Extract metadata from an image file with timeout protection
   * @param filePath - Absolute path to the image file
   * @param timeoutMs - Timeout in milliseconds (default: 30 seconds)
   * @returns Promise resolving to extracted metadata
   */
  async extractMetadata(filePath: string, timeoutMs: number = EXIFTOOL_TIMEOUT_MS): Promise<ImageMetadata> {
    console.log('[ExifTool] Starting metadata extraction for:', filePath);
    const startTime = Date.now();

    try {
      console.log('[ExifTool] Calling exiftool.read() with', timeoutMs, 'ms timeout...');

      // Wrap ExifTool call with timeout to prevent hangs
      const tags = await this.withTimeout(
        exiftool.read(filePath),
        timeoutMs,
        `ExifTool timed out after ${timeoutMs}ms for: ${filePath}`
      );

      console.log('[ExifTool] Extraction completed in', Date.now() - startTime, 'ms');

      return {
        width: tags.ImageWidth || tags.ExifImageWidth || null,
        height: tags.ImageHeight || tags.ExifImageHeight || null,
        dateTaken: tags.DateTimeOriginal?.toISOString() || tags.CreateDate?.toISOString() || null,
        cameraMake: tags.Make || null,
        cameraModel: tags.Model || null,
        gps:
          tags.GPSLatitude && tags.GPSLongitude
            ? {
                lat: tags.GPSLatitude,
                lng: tags.GPSLongitude,
                altitude: tags.GPSAltitude,
              }
            : null,
        rawExif: JSON.stringify(tags, null, 2),
      };
    } catch (error) {
      console.error('[ExifTool] Error extracting metadata:', error);
      throw error;
    }
  }

  /**
   * Wrap a promise with a timeout
   * @param promise - The promise to wrap
   * @param timeoutMs - Timeout in milliseconds
   * @param errorMessage - Error message if timeout occurs
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(errorMessage));
      }, timeoutMs);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Close the ExifTool process
   * Should be called when the application is shutting down
   */
  async close(): Promise<void> {
    await exiftool.end();
  }
}
