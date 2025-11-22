/**
 * Metadata Adapter Interface
 *
 * Abstracts EXIF/video metadata extraction for portability.
 * Implementations: ExifToolAdapter (local), LambdaMetadataAdapter (cloud)
 *
 * @module adapters/metadata
 */

import type { MediaType } from '../domain/media.js';

/** GPS coordinates extracted from media */
export interface GPSCoordinates {
  lat: number;
  lng: number;
  altitude?: number;
  accuracy?: number;
}

/** Common metadata fields across all media types */
export interface BaseMetadata {
  /** Image/video width in pixels */
  width?: number;
  /** Image/video height in pixels */
  height?: number;
  /** Original capture date (ISO8601) */
  dateTaken?: string;
  /** GPS coordinates if present */
  gps?: GPSCoordinates;
}

/** Image-specific metadata */
export interface ImageMetadata extends BaseMetadata {
  cameraMake?: string;
  cameraModel?: string;
  cameraSerial?: string;
  lens?: string;
  focalLength?: number;
  aperture?: number;
  iso?: number;
  exposureTime?: string;
  flash?: boolean;
  orientation?: number;
  /** Raw EXIF data for archival */
  rawExif?: Record<string, unknown>;
}

/** Video-specific metadata */
export interface VideoMetadata extends BaseMetadata {
  /** Duration in seconds */
  duration?: number;
  /** Video codec (e.g., 'h264', 'hevc') */
  codec?: string;
  /** Frames per second */
  fps?: number;
  /** Audio codec if present */
  audioCodec?: string;
  /** Bitrate in bits per second */
  bitrate?: number;
  /** Raw FFprobe data for archival */
  rawFfmpeg?: Record<string, unknown>;
  /** Raw EXIF data (some videos have EXIF) */
  rawExif?: Record<string, unknown>;
}

/** Document-specific metadata */
export interface DocumentMetadata extends BaseMetadata {
  /** Number of pages */
  pageCount?: number;
  /** Document author */
  author?: string;
  /** Document title */
  title?: string;
  /** Document subject */
  subject?: string;
  /** Creation software */
  creator?: string;
  /** Raw metadata for archival */
  rawExif?: Record<string, unknown>;
}

/** Map-specific metadata */
export interface MapMetadata extends BaseMetadata {
  /** Map bounds */
  bounds?: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  /** Center point */
  center?: GPSCoordinates;
  /** Number of waypoints (GPX) */
  waypointCount?: number;
  /** Number of tracks (GPX) */
  trackCount?: number;
  /** Map type (gpx, kml, geojson, etc.) */
  mapType?: string;
  /** Raw metadata for archival */
  rawExif?: Record<string, unknown>;
  /** Parsed map data */
  rawMapData?: Record<string, unknown>;
}

/** Union type of all metadata types */
export type MediaMetadata =
  | ImageMetadata
  | VideoMetadata
  | DocumentMetadata
  | MapMetadata;

/** Result of metadata extraction */
export interface MetadataResult {
  success: boolean;
  metadata?: MediaMetadata;
  error?: string;
}

/** Batch extraction input */
export interface BatchMetadataInput {
  path: string;
  type: MediaType;
}

/**
 * Metadata adapter interface - abstracts metadata extraction.
 *
 * This allows the import pipeline to use ExifTool locally
 * or Lambda functions in the cloud without code changes.
 */
export interface MetadataAdapter {
  /**
   * Extract metadata from a single file.
   *
   * @param filePath - Absolute path to file
   * @param type - Media type (determines extraction strategy)
   * @returns Metadata result with success flag
   */
  extract(filePath: string, type: MediaType): Promise<MetadataResult>;

  /**
   * Extract metadata from multiple files (batch optimization).
   * Implementations should optimize for batch processing.
   *
   * @param files - Array of file paths and types
   * @returns Map of file path to metadata result
   */
  extractBatch(files: BatchMetadataInput[]): Promise<Map<string, MetadataResult>>;

  /**
   * Extract GPS coordinates from metadata.
   * Utility method for GPS validation.
   *
   * @param metadata - Previously extracted metadata
   * @returns GPS coordinates or null if not present
   */
  extractGPS(metadata: MediaMetadata): GPSCoordinates | null;

  /**
   * Check if adapter is ready (e.g., ExifTool process started).
   */
  isReady(): boolean;

  /**
   * Initialize adapter (start processes, warm up, etc.)
   */
  initialize(): Promise<void>;

  /**
   * Shutdown adapter (stop processes, cleanup)
   */
  shutdown(): Promise<void>;
}
