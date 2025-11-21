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

/**
 * Service for extracting EXIF metadata from images using ExifTool
 */
export class ExifToolService {
  /**
   * Extract metadata from an image file
   * @param filePath - Absolute path to the image file
   * @returns Promise resolving to extracted metadata
   */
  async extractMetadata(filePath: string): Promise<ImageMetadata> {
    try {
      const tags = await exiftool.read(filePath);

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
      console.error('Error extracting EXIF metadata:', error);
      throw error;
    }
  }

  /**
   * Close the ExifTool process
   * Should be called when the application is shutting down
   */
  async close(): Promise<void> {
    await exiftool.end();
  }
}
