import { Kysely } from 'kysely';
import type { Database, ImgsTable, VidsTable, DocsTable } from '../main/database.types';

export interface MediaImage {
  imgsha: string;
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
  // Thumbnail/Preview fields (Migration 8 & 9 - Premium Archive)
  thumb_path: string | null;
  thumb_path_sm: string | null;
  thumb_path_lg: string | null;
  preview_path: string | null;
  preview_extracted: number;
  xmp_synced: number;
  xmp_modified_at: string | null;
  // NOTE: darktable columns exist in DB but are deprecated/unused
}

export interface MediaVideo {
  vidsha: string;
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
  // GPS fields (FIX 3.2 - dashcams, phones)
  meta_gps_lat: number | null;
  meta_gps_lng: number | null;
  // Thumbnail/Poster fields (Migration 8 & 9 - Premium Archive)
  thumb_path: string | null;
  thumb_path_sm: string | null;
  thumb_path_lg: string | null;
  preview_path: string | null;
  poster_extracted: number;
  xmp_synced: number;
  xmp_modified_at: string | null;
}

export interface MediaDocument {
  docsha: string;
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
}

/**
 * Repository for media files (images, videos, documents)
 */
export class SQLiteMediaRepository {
  constructor(private readonly db: Kysely<Database>) {}

  // ==================== IMAGES ====================

  async createImage(image: Omit<ImgsTable, 'imgadd'>): Promise<MediaImage> {
    const imgadd = new Date().toISOString();
    await this.db
      .insertInto('imgs')
      .values({ ...image, imgadd })
      .execute();
    return this.findImageByHash(image.imgsha);
  }

  async findImageByHash(imgsha: string): Promise<MediaImage> {
    const row = await this.db
      .selectFrom('imgs')
      .selectAll()
      .where('imgsha', '=', imgsha)
      .executeTakeFirstOrThrow();
    return row;
  }

  async findImagesByLocation(locid: string): Promise<MediaImage[]> {
    const rows = await this.db
      .selectFrom('imgs')
      .selectAll()
      .where('locid', '=', locid)
      .orderBy('imgadd', 'desc')
      .execute();
    return rows;
  }

  async imageExists(imgsha: string): Promise<boolean> {
    const result = await this.db
      .selectFrom('imgs')
      .select('imgsha')
      .where('imgsha', '=', imgsha)
      .executeTakeFirst();
    return !!result;
  }

  // ==================== VIDEOS ====================

  async createVideo(video: Omit<VidsTable, 'vidadd'>): Promise<MediaVideo> {
    const vidadd = new Date().toISOString();
    await this.db
      .insertInto('vids')
      .values({ ...video, vidadd })
      .execute();
    return this.findVideoByHash(video.vidsha);
  }

  async findVideoByHash(vidsha: string): Promise<MediaVideo> {
    const row = await this.db
      .selectFrom('vids')
      .selectAll()
      .where('vidsha', '=', vidsha)
      .executeTakeFirstOrThrow();
    return row;
  }

  async findVideosByLocation(locid: string): Promise<MediaVideo[]> {
    const rows = await this.db
      .selectFrom('vids')
      .selectAll()
      .where('locid', '=', locid)
      .orderBy('vidadd', 'desc')
      .execute();
    return rows;
  }

  async videoExists(vidsha: string): Promise<boolean> {
    const result = await this.db
      .selectFrom('vids')
      .select('vidsha')
      .where('vidsha', '=', vidsha)
      .executeTakeFirst();
    return !!result;
  }

  // ==================== DOCUMENTS ====================

  async createDocument(doc: Omit<DocsTable, 'docadd'>): Promise<MediaDocument> {
    const docadd = new Date().toISOString();
    await this.db
      .insertInto('docs')
      .values({ ...doc, docadd })
      .execute();
    return this.findDocumentByHash(doc.docsha);
  }

  async findDocumentByHash(docsha: string): Promise<MediaDocument> {
    const row = await this.db
      .selectFrom('docs')
      .selectAll()
      .where('docsha', '=', docsha)
      .executeTakeFirstOrThrow();
    return row;
  }

  async findDocumentsByLocation(locid: string): Promise<MediaDocument[]> {
    const rows = await this.db
      .selectFrom('docs')
      .selectAll()
      .where('locid', '=', locid)
      .orderBy('docadd', 'desc')
      .execute();
    return rows;
  }

  async documentExists(docsha: string): Promise<boolean> {
    const result = await this.db
      .selectFrom('docs')
      .select('docsha')
      .where('docsha', '=', docsha)
      .executeTakeFirst();
    return !!result;
  }

  // ==================== GENERAL ====================

  async findAllMediaByLocation(locid: string): Promise<{
    images: MediaImage[];
    videos: MediaVideo[];
    documents: MediaDocument[];
  }> {
    const [images, videos, documents] = await Promise.all([
      this.findImagesByLocation(locid),
      this.findVideosByLocation(locid),
      this.findDocumentsByLocation(locid),
    ]);

    return { images, videos, documents };
  }

  // ==================== THUMBNAIL/PREVIEW OPERATIONS ====================

  /**
   * Get images without multi-tier thumbnails for batch generation
   * Kanye8 FIX: Check thumb_path_sm (400px) not thumb_path (legacy 256px)
   * This catches images imported before multi-tier system
   */
  async getImagesWithoutThumbnails(): Promise<Array<{ imgsha: string; imgloc: string; preview_path: string | null }>> {
    const rows = await this.db
      .selectFrom('imgs')
      .select(['imgsha', 'imgloc', 'preview_path'])
      .where('thumb_path_sm', 'is', null)
      .execute();
    return rows;
  }

  /**
   * Kanye9: Get RAW images that are missing preview extraction
   * These are files that have thumbnails but no preview (browser can't display RAW)
   */
  async getImagesWithoutPreviews(): Promise<Array<{ imgsha: string; imgloc: string }>> {
    // RAW file extensions that need preview extraction
    const rawPattern = '%.nef';  // Start with NEF, most common
    const rows = await this.db
      .selectFrom('imgs')
      .select(['imgsha', 'imgloc'])
      .where('preview_path', 'is', null)
      .where((eb) =>
        eb.or([
          eb('imgloc', 'like', '%.nef'),
          eb('imgloc', 'like', '%.NEF'),
          eb('imgloc', 'like', '%.cr2'),
          eb('imgloc', 'like', '%.CR2'),
          eb('imgloc', 'like', '%.cr3'),
          eb('imgloc', 'like', '%.CR3'),
          eb('imgloc', 'like', '%.arw'),
          eb('imgloc', 'like', '%.ARW'),
          eb('imgloc', 'like', '%.dng'),
          eb('imgloc', 'like', '%.DNG'),
          eb('imgloc', 'like', '%.orf'),
          eb('imgloc', 'like', '%.ORF'),
          eb('imgloc', 'like', '%.raf'),
          eb('imgloc', 'like', '%.RAF'),
          eb('imgloc', 'like', '%.rw2'),
          eb('imgloc', 'like', '%.RW2'),
        ])
      )
      .execute();
    return rows;
  }

  /**
   * Update thumbnail path for an image
   */
  async updateImageThumbnailPath(imgsha: string, thumbPath: string): Promise<void> {
    await this.db
      .updateTable('imgs')
      .set({ thumb_path: thumbPath })
      .where('imgsha', '=', imgsha)
      .execute();
  }

  /**
   * Update preview path for a RAW image
   */
  async updateImagePreviewPath(imgsha: string, previewPath: string): Promise<void> {
    await this.db
      .updateTable('imgs')
      .set({ preview_path: previewPath, preview_extracted: 1 })
      .where('imgsha', '=', imgsha)
      .execute();
  }

  /**
   * Get videos without poster frames
   */
  async getVideosWithoutPosters(): Promise<Array<{ vidsha: string; vidloc: string }>> {
    const rows = await this.db
      .selectFrom('vids')
      .select(['vidsha', 'vidloc'])
      .where('thumb_path', 'is', null)
      .execute();
    return rows;
  }

  /**
   * Update poster frame path for a video
   */
  async updateVideoPosterPath(vidsha: string, posterPath: string): Promise<void> {
    await this.db
      .updateTable('vids')
      .set({ thumb_path: posterPath, poster_extracted: 1 })
      .where('vidsha', '=', vidsha)
      .execute();
  }

  /**
   * Update XMP sync status for an image
   */
  async updateImageXmpStatus(imgsha: string, synced: boolean): Promise<void> {
    await this.db
      .updateTable('imgs')
      .set({
        xmp_synced: synced ? 1 : 0,
        xmp_modified_at: new Date().toISOString()
      })
      .where('imgsha', '=', imgsha)
      .execute();
  }

}
