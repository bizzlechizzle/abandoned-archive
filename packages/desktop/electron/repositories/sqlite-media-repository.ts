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
}
