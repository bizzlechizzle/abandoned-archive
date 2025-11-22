/**
 * ExifTool Metadata Adapter
 *
 * Implements MetadataAdapter using exiftool-vendored.
 * Provides reliable EXIF extraction for all media types.
 *
 * @module adapters/exiftool-adapter
 */

import { ExifTool } from 'exiftool-vendored';
import type {
  MetadataAdapter,
  MetadataResult,
  BatchMetadataInput,
  GPSCoordinates,
  MediaMetadata,
  ImageMetadata,
  VideoMetadata,
  DocumentMetadata,
  MapMetadata,
} from '@au-archive/import-core';
import type { MediaType } from '@au-archive/import-core';

/** Base metadata with GPS as optional undefined (not null) */
interface BaseMetadataInput {
  width?: number;
  height?: number;
  dateTaken?: string;
  gps?: GPSCoordinates;
}

/**
 * ExifTool-based metadata adapter for local extraction.
 * Uses exiftool-vendored for reliable cross-platform support.
 */
export class ExifToolAdapter implements MetadataAdapter {
  private exiftool: ExifTool | null = null;
  private ready = false;

  isReady(): boolean {
    return this.ready && this.exiftool !== null;
  }

  async initialize(): Promise<void> {
    if (this.exiftool) {
      return;
    }
    this.exiftool = new ExifTool({ maxProcs: 4 });
    this.ready = true;
  }

  async shutdown(): Promise<void> {
    if (this.exiftool) {
      await this.exiftool.end();
      this.exiftool = null;
      this.ready = false;
    }
  }

  async extract(filePath: string, type: MediaType): Promise<MetadataResult> {
    if (!this.exiftool) {
      return { success: false, error: 'ExifTool not initialized' };
    }

    try {
      const tags = await this.exiftool.read(filePath);
      // Convert Tags to Record<string, unknown> for processing
      const tagsRecord = tags as unknown as Record<string, unknown>;
      const metadata = this.tagsToMetadata(tagsRecord, type);
      return { success: true, metadata };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  async extractBatch(files: BatchMetadataInput[]): Promise<Map<string, MetadataResult>> {
    const results = new Map<string, MetadataResult>();

    if (!this.exiftool) {
      for (const file of files) {
        results.set(file.path, { success: false, error: 'ExifTool not initialized' });
      }
      return results;
    }

    // Process in parallel with limited concurrency
    const promises = files.map(async (file) => {
      const result = await this.extract(file.path, file.type);
      return { path: file.path, result };
    });

    const outcomes = await Promise.all(promises);
    for (const { path, result } of outcomes) {
      results.set(path, result);
    }

    return results;
  }

  extractGPS(metadata: MediaMetadata): GPSCoordinates | null {
    if ('gps' in metadata && metadata.gps) {
      return metadata.gps;
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────────
  // Private Helper Methods
  // ─────────────────────────────────────────────────────────────

  private tagsToMetadata(tags: Record<string, unknown>, type: MediaType): MediaMetadata {
    const gps = this.extractGPSFromTags(tags);
    const base: BaseMetadataInput = {
      width: this.getNumber(tags, 'ImageWidth', 'ExifImageWidth'),
      height: this.getNumber(tags, 'ImageHeight', 'ExifImageHeight'),
      dateTaken: this.getDateString(tags),
      gps: gps ?? undefined,
    };

    switch (type) {
      case 'image':
        return this.extractImageMetadata(tags, base);
      case 'video':
        return this.extractVideoMetadata(tags, base);
      case 'document':
        return this.extractDocumentMetadata(tags, base);
      case 'map':
        return this.extractMapMetadata(tags, base);
    }
  }

  private extractImageMetadata(
    tags: Record<string, unknown>,
    base: BaseMetadataInput
  ): ImageMetadata {
    return {
      ...base,
      cameraMake: this.getString(tags, 'Make'),
      cameraModel: this.getString(tags, 'Model'),
      cameraSerial: this.getString(tags, 'SerialNumber', 'InternalSerialNumber'),
      lens: this.getString(tags, 'LensModel', 'Lens', 'LensType'),
      focalLength: this.extractFocalLength(tags),
      aperture: this.getNumber(tags, 'FNumber', 'Aperture', 'ApertureValue'),
      iso: this.getNumber(tags, 'ISO', 'ISOSpeedRatings'),
      exposureTime: this.getString(tags, 'ExposureTime', 'ShutterSpeed'),
      flash: this.extractFlash(tags),
      orientation: this.getNumber(tags, 'Orientation'),
      rawExif: this.sanitizeForStorage(tags),
    };
  }

  private extractVideoMetadata(
    tags: Record<string, unknown>,
    base: BaseMetadataInput
  ): VideoMetadata {
    return {
      ...base,
      duration: this.extractDuration(tags),
      codec: this.getString(tags, 'VideoCodec', 'CompressorID', 'CompressorName'),
      fps: this.getNumber(tags, 'VideoFrameRate', 'FrameRate'),
      audioCodec: this.getString(tags, 'AudioCodec', 'AudioFormat'),
      bitrate: this.getNumber(tags, 'AvgBitrate', 'VideoBitrate'),
      rawExif: this.sanitizeForStorage(tags),
    };
  }

  private extractDocumentMetadata(
    tags: Record<string, unknown>,
    base: BaseMetadataInput
  ): DocumentMetadata {
    return {
      ...base,
      pageCount: this.getNumber(tags, 'PageCount', 'Pages'),
      author: this.getString(tags, 'Author', 'Creator'),
      title: this.getString(tags, 'Title'),
      subject: this.getString(tags, 'Subject'),
      creator: this.getString(tags, 'Producer', 'CreatorTool'),
      rawExif: this.sanitizeForStorage(tags),
    };
  }

  private extractMapMetadata(
    tags: Record<string, unknown>,
    base: BaseMetadataInput
  ): MapMetadata {
    const gps = this.extractGPSFromTags(tags);
    return {
      ...base,
      center: gps ?? undefined,
      mapType: this.inferMapType(tags),
      rawExif: this.sanitizeForStorage(tags),
    };
  }

  private extractGPSFromTags(tags: Record<string, unknown>): GPSCoordinates | null {
    const lat = this.getNumber(tags, 'GPSLatitude');
    const lng = this.getNumber(tags, 'GPSLongitude');

    if (lat === undefined || lng === undefined) {
      return null;
    }

    return {
      lat,
      lng,
      altitude: this.getNumber(tags, 'GPSAltitude'),
      accuracy: this.getNumber(tags, 'GPSHPositioningError'),
    };
  }

  private extractFocalLength(tags: Record<string, unknown>): number | undefined {
    const fl = tags['FocalLength'];
    if (typeof fl === 'number') return fl;
    if (typeof fl === 'string') {
      const match = fl.match(/^(\d+(?:\.\d+)?)/);
      return match ? parseFloat(match[1]) : undefined;
    }
    return undefined;
  }

  private extractFlash(tags: Record<string, unknown>): boolean | undefined {
    const flash = tags['Flash'];
    if (typeof flash === 'boolean') return flash;
    if (typeof flash === 'string') {
      return flash.toLowerCase().includes('fired');
    }
    if (typeof flash === 'number') {
      return (flash & 1) === 1; // Bit 0 indicates flash fired
    }
    return undefined;
  }

  private extractDuration(tags: Record<string, unknown>): number | undefined {
    const duration = tags['Duration'];
    if (typeof duration === 'number') return duration;
    if (typeof duration === 'string') {
      // Parse "HH:MM:SS" or "MM:SS" format
      const parts = duration.split(':').map(Number);
      if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
      } else if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
      }
      // Try parsing as seconds
      const seconds = parseFloat(duration);
      return isNaN(seconds) ? undefined : seconds;
    }
    return undefined;
  }

  private getDateString(tags: Record<string, unknown>): string | undefined {
    const dateFields = [
      'DateTimeOriginal',
      'CreateDate',
      'MediaCreateDate',
      'TrackCreateDate',
      'ModifyDate',
    ];

    for (const field of dateFields) {
      const value = tags[field];
      if (value) {
        // ExifTool returns ExifDateTime objects, convert to ISO string
        if (typeof value === 'object' && value !== null && 'toISOString' in value) {
          return (value as { toISOString: () => string }).toISOString();
        }
        if (typeof value === 'string') {
          // Try to parse common EXIF date format "YYYY:MM:DD HH:MM:SS"
          const parsed = value.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
          const date = new Date(parsed);
          if (!isNaN(date.getTime())) {
            return date.toISOString();
          }
        }
      }
    }
    return undefined;
  }

  private getString(tags: Record<string, unknown>, ...fields: string[]): string | undefined {
    for (const field of fields) {
      const value = tags[field];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  }

  private getNumber(tags: Record<string, unknown>, ...fields: string[]): number | undefined {
    for (const field of fields) {
      const value = tags[field];
      if (typeof value === 'number' && !isNaN(value)) {
        return value;
      }
      if (typeof value === 'string') {
        const num = parseFloat(value);
        if (!isNaN(num)) return num;
      }
    }
    return undefined;
  }

  private inferMapType(tags: Record<string, unknown>): string | undefined {
    const mimeType = this.getString(tags, 'MIMEType');
    if (mimeType) {
      if (mimeType.includes('gpx')) return 'gpx';
      if (mimeType.includes('kml')) return 'kml';
      if (mimeType.includes('geojson')) return 'geojson';
    }
    return undefined;
  }

  private sanitizeForStorage(tags: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(tags)) {
      // Skip binary data and internal fields
      if (key.startsWith('_') || key === 'SourceFile') continue;
      if (value instanceof Buffer) continue;
      if (typeof value === 'object' && value !== null) {
        // Convert ExifDateTime and similar objects to strings
        if ('toISOString' in value) {
          sanitized[key] = (value as { toISOString: () => string }).toISOString();
        } else if ('toString' in value) {
          sanitized[key] = String(value);
        }
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }
}
