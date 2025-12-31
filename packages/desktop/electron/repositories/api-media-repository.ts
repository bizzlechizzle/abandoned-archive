/**
 * API-based Media Repository
 *
 * Implements media operations using dispatch hub API
 * instead of local SQLite database.
 */

import type { DispatchClient } from '@aa/services';
import type {
  ApiMedia,
  ApiCreateMediaInput,
  ApiMediaFilters,
  MediaTag,
  AddTagInput,
} from '@aa/services';

export interface MediaImage {
  imghash: string;
  imgnam: string;
  imgnamo: string;
  imgloc: string;
  imgloco: string;
  locid: string | null;
  subid: string | null;
  auth_imp: string | null;
  imgadd: string | null;
  meta_exiftool: string | null;
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
  preview_extracted: number;
  xmp_synced: number;
  xmp_modified_at: string | null;
  hidden: number;
  hidden_reason: string | null;
  is_live_photo: number;
  imported_by_id: string | null;
  imported_by: string | null;
  media_source: string | null;
  file_size_bytes: number | null;
}

export interface MediaVideo {
  vidhash: string;
  vidnam: string;
  vidnamo: string;
  vidloc: string;
  vidloco: string;
  locid: string | null;
  subid: string | null;
  auth_imp: string | null;
  vidadd: string | null;
  meta_ffmpeg: string | null;
  meta_exiftool: string | null;
  meta_duration: number | null;
  meta_width: number | null;
  meta_height: number | null;
  meta_codec: string | null;
  meta_fps: number | null;
  meta_date_taken: string | null;
  meta_gps_lat: number | null;
  meta_gps_lng: number | null;
  thumb_path: string | null;
  thumb_path_sm: string | null;
  thumb_path_lg: string | null;
  preview_path: string | null;
  poster_extracted: number;
  xmp_synced: number;
  xmp_modified_at: string | null;
  hidden: number;
  hidden_reason: string | null;
  is_live_photo: number;
  imported_by_id: string | null;
  imported_by: string | null;
  media_source: string | null;
  file_size_bytes: number | null;
}

export interface MediaDocument {
  dochash: string;
  docnam: string;
  docnamo: string;
  docloc: string;
  docloco: string;
  locid: string | null;
  subid: string | null;
  auth_imp: string | null;
  docadd: string | null;
  meta_exiftool: string | null;
  meta_page_count: number | null;
  meta_author: string | null;
  meta_title: string | null;
  hidden: number;
  hidden_reason: string | null;
  imported_by_id: string | null;
  imported_by: string | null;
  media_source: string | null;
  file_size_bytes: number | null;
}

export interface MediaMap {
  maphash: string;
  mapnam: string;
  mapnamo: string;
  maploc: string;
  maploco: string;
  locid: string | null;
  subid: string | null;
  auth_imp: string | null;
  mapadd: string | null;
  meta_exiftool: string | null;
  meta_map: string | null;
  meta_gps_lat: number | null;
  meta_gps_lng: number | null;
  reference: string | null;
  map_states: string | null;
  map_verified: number;
  thumb_path_sm: string | null;
  thumb_path_lg: string | null;
  preview_path: string | null;
  imported_by_id: string | null;
  imported_by: string | null;
  media_source: string | null;
  file_size_bytes: number | null;
}

export interface MediaQueryOptions {
  subid?: string | null;
}

type MediaType = 'image' | 'video' | 'document' | 'map';

export class ApiMediaRepository {
  constructor(private readonly client: DispatchClient) {}

  // Image operations

  async getImagesByLocation(locid: string, options?: MediaQueryOptions): Promise<MediaImage[]> {
    const filters: ApiMediaFilters = {
      locationId: locid,
      sublocationId: options?.subid ?? undefined,
      mimeType: 'image/%',
    };
    const result = await this.client.getMedia(filters);
    return result.data
      .filter((m) => m.mimeType.startsWith('image/'))
      .map((m) => this.mapApiToImage(m));
  }

  async getImageByHash(hash: string): Promise<MediaImage | null> {
    const media = await this.client.getMediaByHash(hash);
    if (!media || !media.mimeType.startsWith('image/')) return null;
    return this.mapApiToImage(media);
  }

  async createImage(data: Partial<MediaImage>): Promise<MediaImage> {
    const input = this.mapImageToApi(data);
    const result = await this.client.createMedia(input);
    return this.mapApiToImage(result);
  }

  async updateImage(hash: string, data: Partial<MediaImage>): Promise<MediaImage> {
    const media = await this.client.getMediaByHash(hash);
    if (!media) throw new Error(`Image not found: ${hash}`);
    const input = this.mapImageToApi(data);
    const result = await this.client.updateMedia(media.id, input);
    return this.mapApiToImage(result);
  }

  async deleteImage(hash: string): Promise<void> {
    const media = await this.client.getMediaByHash(hash);
    if (media) {
      await this.client.deleteMedia(media.id);
    }
  }

  // Video operations

  async getVideosByLocation(locid: string, options?: MediaQueryOptions): Promise<MediaVideo[]> {
    const filters: ApiMediaFilters = {
      locationId: locid,
      sublocationId: options?.subid ?? undefined,
      mimeType: 'video/%',
    };
    const result = await this.client.getMedia(filters);
    return result.data
      .filter((m) => m.mimeType.startsWith('video/'))
      .map((m) => this.mapApiToVideo(m));
  }

  async getVideoByHash(hash: string): Promise<MediaVideo | null> {
    const media = await this.client.getMediaByHash(hash);
    if (!media || !media.mimeType.startsWith('video/')) return null;
    return this.mapApiToVideo(media);
  }

  async createVideo(data: Partial<MediaVideo>): Promise<MediaVideo> {
    const input = this.mapVideoToApi(data);
    const result = await this.client.createMedia(input);
    return this.mapApiToVideo(result);
  }

  async updateVideo(hash: string, data: Partial<MediaVideo>): Promise<MediaVideo> {
    const media = await this.client.getMediaByHash(hash);
    if (!media) throw new Error(`Video not found: ${hash}`);
    const input = this.mapVideoToApi(data);
    const result = await this.client.updateMedia(media.id, input);
    return this.mapApiToVideo(result);
  }

  async deleteVideo(hash: string): Promise<void> {
    const media = await this.client.getMediaByHash(hash);
    if (media) {
      await this.client.deleteMedia(media.id);
    }
  }

  // Document operations

  async getDocumentsByLocation(locid: string, options?: MediaQueryOptions): Promise<MediaDocument[]> {
    const filters: ApiMediaFilters = {
      locationId: locid,
      sublocationId: options?.subid ?? undefined,
      mimeType: 'application/%',
    };
    const result = await this.client.getMedia(filters);
    return result.data
      .filter((m) => m.mimeType.startsWith('application/'))
      .map((m) => this.mapApiToDocument(m));
  }

  async getDocumentByHash(hash: string): Promise<MediaDocument | null> {
    const media = await this.client.getMediaByHash(hash);
    if (!media || !media.mimeType.startsWith('application/')) return null;
    return this.mapApiToDocument(media);
  }

  async createDocument(data: Partial<MediaDocument>): Promise<MediaDocument> {
    const input = this.mapDocumentToApi(data);
    const result = await this.client.createMedia(input);
    return this.mapApiToDocument(result);
  }

  async deleteDocument(hash: string): Promise<void> {
    const media = await this.client.getMediaByHash(hash);
    if (media) {
      await this.client.deleteMedia(media.id);
    }
  }

  // Map operations

  async getMapsByLocation(locid: string, options?: MediaQueryOptions): Promise<MediaMap[]> {
    const filters: ApiMediaFilters = {
      locationId: locid,
      sublocationId: options?.subid ?? undefined,
    };
    const result = await this.client.getMedia(filters);
    // Maps have specific MIME types
    const mapMimes = ['application/gpx+xml', 'application/vnd.google-earth.kml+xml', 'application/geo+json', 'image/tiff'];
    return result.data
      .filter((m) => mapMimes.some((mime) => m.mimeType.includes(mime.split('/')[1])))
      .map((m) => this.mapApiToMap(m));
  }

  async getMapByHash(hash: string): Promise<MediaMap | null> {
    const media = await this.client.getMediaByHash(hash);
    if (!media) return null;
    return this.mapApiToMap(media);
  }

  // Tag operations

  async getTags(hash: string): Promise<MediaTag[]> {
    const media = await this.client.getMediaByHash(hash);
    if (!media) return [];
    return this.client.getMediaTags(media.id);
  }

  async addTag(hash: string, tag: AddTagInput): Promise<MediaTag> {
    const media = await this.client.getMediaByHash(hash);
    if (!media) throw new Error(`Media not found: ${hash}`);
    return this.client.addMediaTag(media.id, tag);
  }

  async removeTag(hash: string, tagId: string): Promise<void> {
    const media = await this.client.getMediaByHash(hash);
    if (media) {
      await this.client.removeMediaTag(media.id, tagId);
    }
  }

  // Hide/unhide operations

  async hideMedia(hash: string, reason?: string): Promise<void> {
    const media = await this.client.getMediaByHash(hash);
    if (media) {
      await this.client.hideMedia(media.id, reason);
    }
  }

  async unhideMedia(hash: string): Promise<void> {
    const media = await this.client.getMediaByHash(hash);
    if (media) {
      await this.client.unhideMedia(media.id);
    }
  }

  // Thumbnail operations

  async setThumbnails(
    hash: string,
    thumbnails: {
      thumbPath?: string;
      thumbPathSm?: string;
      thumbPathLg?: string;
      previewPath?: string;
      posterPath?: string;
    }
  ): Promise<void> {
    const media = await this.client.getMediaByHash(hash);
    if (media) {
      await this.client.setMediaThumbnails(media.id, thumbnails);
    }
  }

  // Counts

  async countImagesByLocation(locid: string): Promise<number> {
    const filters: ApiMediaFilters = { locationId: locid, mimeType: 'image/%', limit: 1 };
    const result = await this.client.getMedia(filters);
    return result.pagination.total;
  }

  async countVideosByLocation(locid: string): Promise<number> {
    const filters: ApiMediaFilters = { locationId: locid, mimeType: 'video/%', limit: 1 };
    const result = await this.client.getMedia(filters);
    return result.pagination.total;
  }

  async countDocumentsByLocation(locid: string): Promise<number> {
    const filters: ApiMediaFilters = { locationId: locid, mimeType: 'application/%', limit: 1 };
    const result = await this.client.getMedia(filters);
    return result.pagination.total;
  }

  // Private mapping methods

  private mapApiToImage(api: ApiMedia): MediaImage {
    return {
      imghash: api.blake3Hash,
      imgnam: api.filename,
      imgnamo: api.filename,
      imgloc: api.filepath,
      imgloco: api.filepath,
      locid: api.locationId || null,
      subid: api.sublocationId || null,
      auth_imp: null,
      imgadd: api.createdAt,
      meta_exiftool: api.exifData ? JSON.stringify(api.exifData) : null,
      meta_width: api.width || null,
      meta_height: api.height || null,
      meta_date_taken: api.capturedAt || null,
      meta_camera_make: null,
      meta_camera_model: null,
      meta_gps_lat: api.gpsLat || null,
      meta_gps_lng: api.gpsLon || null,
      thumb_path: api.thumbPath || null,
      thumb_path_sm: api.thumbPathSm || null,
      thumb_path_lg: api.thumbPathLg || null,
      preview_path: api.previewPath || null,
      preview_extracted: api.previewPath ? 1 : 0,
      xmp_synced: 0,
      xmp_modified_at: null,
      hidden: api.hidden ? 1 : 0,
      hidden_reason: api.hiddenReason || null,
      is_live_photo: api.isLivePhoto ? 1 : 0,
      imported_by_id: null,
      imported_by: null,
      media_source: null,
      file_size_bytes: api.sizeBytes,
    };
  }

  private mapImageToApi(data: Partial<MediaImage>): ApiCreateMediaInput {
    return {
      blake3Hash: data.imghash || '',
      filename: data.imgnam || '',
      filepath: data.imgloc || '',
      mimeType: 'image/jpeg',
      sizeBytes: data.file_size_bytes || 0,
      width: data.meta_width || undefined,
      height: data.meta_height || undefined,
      gpsLat: data.meta_gps_lat || undefined,
      gpsLon: data.meta_gps_lng || undefined,
      capturedAt: data.meta_date_taken || undefined,
      locationId: data.locid || undefined,
      sublocationId: data.subid || undefined,
      exifData: data.meta_exiftool ? JSON.parse(data.meta_exiftool) : undefined,
    };
  }

  private mapApiToVideo(api: ApiMedia): MediaVideo {
    return {
      vidhash: api.blake3Hash,
      vidnam: api.filename,
      vidnamo: api.filename,
      vidloc: api.filepath,
      vidloco: api.filepath,
      locid: api.locationId || null,
      subid: api.sublocationId || null,
      auth_imp: null,
      vidadd: api.createdAt,
      meta_ffmpeg: null,
      meta_exiftool: api.exifData ? JSON.stringify(api.exifData) : null,
      meta_duration: api.duration || null,
      meta_width: api.width || null,
      meta_height: api.height || null,
      meta_codec: null,
      meta_fps: null,
      meta_date_taken: api.capturedAt || null,
      meta_gps_lat: api.gpsLat || null,
      meta_gps_lng: api.gpsLon || null,
      thumb_path: api.thumbPath || null,
      thumb_path_sm: api.thumbPathSm || null,
      thumb_path_lg: api.thumbPathLg || null,
      preview_path: api.previewPath || null,
      poster_extracted: api.posterPath ? 1 : 0,
      xmp_synced: 0,
      xmp_modified_at: null,
      hidden: api.hidden ? 1 : 0,
      hidden_reason: api.hiddenReason || null,
      is_live_photo: api.isLivePhoto ? 1 : 0,
      imported_by_id: null,
      imported_by: null,
      media_source: null,
      file_size_bytes: api.sizeBytes,
    };
  }

  private mapVideoToApi(data: Partial<MediaVideo>): ApiCreateMediaInput {
    return {
      blake3Hash: data.vidhash || '',
      filename: data.vidnam || '',
      filepath: data.vidloc || '',
      mimeType: 'video/mp4',
      sizeBytes: data.file_size_bytes || 0,
      width: data.meta_width || undefined,
      height: data.meta_height || undefined,
      duration: data.meta_duration || undefined,
      gpsLat: data.meta_gps_lat || undefined,
      gpsLon: data.meta_gps_lng || undefined,
      capturedAt: data.meta_date_taken || undefined,
      locationId: data.locid || undefined,
      sublocationId: data.subid || undefined,
      exifData: data.meta_exiftool ? JSON.parse(data.meta_exiftool) : undefined,
    };
  }

  private mapApiToDocument(api: ApiMedia): MediaDocument {
    return {
      dochash: api.blake3Hash,
      docnam: api.filename,
      docnamo: api.filename,
      docloc: api.filepath,
      docloco: api.filepath,
      locid: api.locationId || null,
      subid: api.sublocationId || null,
      auth_imp: null,
      docadd: api.createdAt,
      meta_exiftool: api.exifData ? JSON.stringify(api.exifData) : null,
      meta_page_count: null,
      meta_author: null,
      meta_title: null,
      hidden: api.hidden ? 1 : 0,
      hidden_reason: api.hiddenReason || null,
      imported_by_id: null,
      imported_by: null,
      media_source: null,
      file_size_bytes: api.sizeBytes,
    };
  }

  private mapDocumentToApi(data: Partial<MediaDocument>): ApiCreateMediaInput {
    return {
      blake3Hash: data.dochash || '',
      filename: data.docnam || '',
      filepath: data.docloc || '',
      mimeType: 'application/pdf',
      sizeBytes: data.file_size_bytes || 0,
      locationId: data.locid || undefined,
      sublocationId: data.subid || undefined,
      exifData: data.meta_exiftool ? JSON.parse(data.meta_exiftool) : undefined,
    };
  }

  private mapApiToMap(api: ApiMedia): MediaMap {
    return {
      maphash: api.blake3Hash,
      mapnam: api.filename,
      mapnamo: api.filename,
      maploc: api.filepath,
      maploco: api.filepath,
      locid: api.locationId || null,
      subid: api.sublocationId || null,
      auth_imp: null,
      mapadd: api.createdAt,
      meta_exiftool: api.exifData ? JSON.stringify(api.exifData) : null,
      meta_map: api.metadata ? JSON.stringify(api.metadata) : null,
      meta_gps_lat: api.gpsLat || null,
      meta_gps_lng: api.gpsLon || null,
      reference: null,
      map_states: null,
      map_verified: 0,
      thumb_path_sm: api.thumbPathSm || null,
      thumb_path_lg: api.thumbPathLg || null,
      preview_path: api.previewPath || null,
      imported_by_id: null,
      imported_by: null,
      media_source: null,
      file_size_bytes: api.sizeBytes,
    };
  }
}
