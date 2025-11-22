/**
 * Media Domain Model
 *
 * Represents media files (images, videos, documents, maps) in the archive.
 *
 * @module domain/media
 */

import { z } from 'zod';

/** Supported media types */
export const MediaTypeSchema = z.enum(['image', 'video', 'document', 'map']);
export type MediaType = z.infer<typeof MediaTypeSchema>;

/** File extensions by media type */
export const FILE_EXTENSIONS: Record<MediaType, string[]> = {
  image: [
    // Standard formats
    '.jpg', '.jpeg', '.jpe', '.jfif', '.png', '.gif', '.bmp', '.tiff', '.tif', '.webp',
    '.jp2', '.jpx', '.j2k', '.j2c', '.jxl', '.heic', '.heif', '.hif', '.avif',
    '.psd', '.psb', '.ai', '.eps', '.epsf', '.svg', '.svgz', '.ico', '.cur',
    // RAW formats
    '.nef', '.nrw', '.cr2', '.cr3', '.crw', '.arw', '.arq', '.srf', '.sr2',
    '.dng', '.orf', '.ori', '.raf', '.rw2', '.raw', '.rwl', '.pef', '.ptx', '.srw',
    '.x3f', '.3fr', '.fff', '.dcr', '.k25', '.kdc', '.mef', '.mos', '.mrw', '.erf',
    '.iiq', '.rwz', '.gpr',
  ],
  video: [
    '.mp4', '.m4v', '.m4p', '.mov', '.qt', '.avi', '.divx', '.mkv', '.mka', '.mks',
    '.mk3d', '.webm', '.wmv', '.wma', '.asf', '.flv', '.f4v', '.f4p', '.f4a', '.f4b',
    '.mpg', '.mpeg', '.mpe', '.mpv', '.m2v', '.ts', '.mts', '.m2ts', '.vob',
    '.3gp', '.3g2', '.ogv', '.ogg', '.ogm',
  ],
  document: [
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.odt', '.ods', '.odp', '.txt', '.rtf', '.md', '.csv',
  ],
  map: [
    '.gpx', '.kml', '.kmz', '.geojson', '.topojson',
    '.shp', '.shx', '.dbf', '.prj',
    '.osm', '.mbtiles', '.geotiff', '.gtiff',
  ],
};

/**
 * Determine media type from file extension.
 *
 * @param ext - File extension (with or without dot)
 * @returns Media type or 'document' as default
 */
export function getMediaType(ext: string): MediaType {
  const normalizedExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;

  for (const [type, extensions] of Object.entries(FILE_EXTENSIONS)) {
    if (extensions.includes(normalizedExt)) {
      return type as MediaType;
    }
  }

  return 'document'; // Default fallback
}

/** Base media record (shared fields) */
export const BaseMediaRecordSchema = z.object({
  sha: z.string().length(64), // SHA256 hash
  type: MediaTypeSchema,
  locid: z.string().uuid(),
  subid: z.string().uuid().nullable().optional(),

  // File names
  originalName: z.string(), // Original filename
  archiveName: z.string(), // SHA256.ext

  // File paths
  originalPath: z.string(), // Where file came from
  archivePath: z.string(), // Where file is stored

  // Metadata
  authImp: z.string().nullable(),
  addedAt: z.string(), // ISO8601

  // Dimensions (if applicable)
  width: z.number().nullable().optional(),
  height: z.number().nullable().optional(),

  // Date taken
  dateTaken: z.string().nullable().optional(),

  // GPS
  gpsLat: z.number().nullable().optional(),
  gpsLng: z.number().nullable().optional(),

  // Raw metadata (JSON)
  rawExif: z.record(z.unknown()).nullable().optional(),
  rawFfmpeg: z.record(z.unknown()).nullable().optional(),
});

/** Image-specific fields */
export const ImageRecordSchema = BaseMediaRecordSchema.extend({
  type: z.literal('image'),
  cameraMake: z.string().nullable().optional(),
  cameraModel: z.string().nullable().optional(),
});

/** Video-specific fields */
export const VideoRecordSchema = BaseMediaRecordSchema.extend({
  type: z.literal('video'),
  duration: z.number().nullable().optional(),
  codec: z.string().nullable().optional(),
  fps: z.number().nullable().optional(),
});

/** Document-specific fields */
export const DocumentRecordSchema = BaseMediaRecordSchema.extend({
  type: z.literal('document'),
  pageCount: z.number().nullable().optional(),
  author: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
});

/** Map-specific fields */
export const MapRecordSchema = BaseMediaRecordSchema.extend({
  type: z.literal('map'),
  mapType: z.string().nullable().optional(),
  waypointCount: z.number().nullable().optional(),
  reference: z.string().nullable().optional(),
  mapStates: z.string().nullable().optional(),
});

/** Union of all media record types */
export const MediaRecordSchema = z.discriminatedUnion('type', [
  ImageRecordSchema,
  VideoRecordSchema,
  DocumentRecordSchema,
  MapRecordSchema,
]);

export type MediaRecord = z.infer<typeof MediaRecordSchema>;
export type ImageRecord = z.infer<typeof ImageRecordSchema>;
export type VideoRecord = z.infer<typeof VideoRecordSchema>;
export type DocumentRecord = z.infer<typeof DocumentRecordSchema>;
export type MapRecord = z.infer<typeof MapRecordSchema>;
