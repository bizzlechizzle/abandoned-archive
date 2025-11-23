/**
 * Shared types for location detail components
 * Per LILBITS: Keep types in separate file to reduce component size
 */

export interface MediaImage {
  imgsha: string;
  imgnam: string;
  imgloc: string;
  meta_width: number | null;
  meta_height: number | null;
  meta_date_taken: string | null;
  meta_camera_make: string | null;
  meta_camera_model: string | null;
  meta_gps_lat: number | null;
  meta_gps_lng: number | null;
  thumb_path: string | null;
  thumb_path_sm: string | null;
  thumb_path_lg: string | null;
  preview_path: string | null;
}

export interface MediaVideo {
  vidsha: string;
  vidnam: string;
  vidloc: string;
  meta_duration: number | null;
  meta_width: number | null;
  meta_height: number | null;
  meta_codec: string | null;
  meta_gps_lat: number | null;
  meta_gps_lng: number | null;
  thumb_path: string | null;
  thumb_path_sm: string | null;
  thumb_path_lg: string | null;
  preview_path: string | null;
}

export interface MediaDocument {
  docsha: string;
  docnam: string;
  docloc: string;
}

export interface Bookmark {
  urlid: string;
  url: string;
  url_title: string | null;
  url_description: string | null;
  url_type: string | null;
  urladd: string | null;
}

export interface GpsWarning {
  filename: string;
  message: string;
  distance: number;
  severity: 'minor' | 'major';
  mediaGPS: { lat: number; lng: number };
}

export interface FailedFile {
  filePath: string;
  originalName: string;
  error: string;
}

// Utility functions
export function formatDuration(seconds: number | null): string {
  if (!seconds) return 'Unknown';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatResolution(width: number | null, height: number | null): string {
  if (!width || !height) return 'Unknown';
  return `${width}x${height}`;
}
