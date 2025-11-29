import { Kysely } from 'kysely';
import { randomUUID } from 'crypto';
import type { Database, BookmarksTable } from '../main/database.types';

export interface BookmarkInput {
  url: string;
  title?: string | null;
  locid?: string | null;
  subid?: string | null;
  auth_imp?: string | null;
  thumbnail_path?: string | null;
}

export interface BookmarkUpdate {
  url?: string;
  title?: string | null;
  locid?: string | null;
  subid?: string | null;
  thumbnail_path?: string | null;
}

export interface Bookmark {
  bookmark_id: string;
  url: string;
  title: string | null;
  locid: string | null;
  subid: string | null;
  bookmark_date: string;
  auth_imp: string | null;
  thumbnail_path: string | null;
  // Joined fields from locs/slocs tables
  locnam?: string;
  subnam?: string;
}

/**
 * Repository for managing web bookmarks
 */
export class SQLiteBookmarksRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Create a new bookmark
   */
  async create(input: BookmarkInput): Promise<Bookmark> {
    const bookmark_id = randomUUID();
    const bookmark_date = new Date().toISOString();

    const bookmark: BookmarksTable = {
      bookmark_id,
      url: input.url,
      title: input.title || null,
      locid: input.locid || null,
      subid: input.subid || null,
      bookmark_date,
      auth_imp: input.auth_imp || null,
      thumbnail_path: input.thumbnail_path || null,
    };

    await this.db.insertInto('bookmarks').values(bookmark).execute();

    return this.findById(bookmark_id);
  }

  /**
   * Find a bookmark by ID
   */
  async findById(bookmark_id: string): Promise<Bookmark> {
    const result = await this.db
      .selectFrom('bookmarks')
      .leftJoin('locs', 'bookmarks.locid', 'locs.locid')
      .leftJoin('slocs', 'bookmarks.subid', 'slocs.subid')
      .selectAll('bookmarks')
      .select(['locs.locnam', 'slocs.subnam'])
      .where('bookmarks.bookmark_id', '=', bookmark_id)
      .executeTakeFirstOrThrow();

    return result as Bookmark;
  }

  /**
   * Find all bookmarks for a specific location
   */
  async findByLocation(locid: string): Promise<Bookmark[]> {
    const results = await this.db
      .selectFrom('bookmarks')
      .leftJoin('locs', 'bookmarks.locid', 'locs.locid')
      .leftJoin('slocs', 'bookmarks.subid', 'slocs.subid')
      .selectAll('bookmarks')
      .select(['locs.locnam', 'slocs.subnam'])
      .where('bookmarks.locid', '=', locid)
      .orderBy('bookmarks.bookmark_date', 'desc')
      .execute();

    return results as Bookmark[];
  }

  /**
   * Find all bookmarks for a specific sub-location
   */
  async findBySubLocation(subid: string): Promise<Bookmark[]> {
    const results = await this.db
      .selectFrom('bookmarks')
      .leftJoin('locs', 'bookmarks.locid', 'locs.locid')
      .leftJoin('slocs', 'bookmarks.subid', 'slocs.subid')
      .selectAll('bookmarks')
      .select(['locs.locnam', 'slocs.subnam'])
      .where('bookmarks.subid', '=', subid)
      .orderBy('bookmarks.bookmark_date', 'desc')
      .execute();

    return results as Bookmark[];
  }

  /**
   * Find recent bookmarks across all locations
   */
  async findRecent(limit: number = 10): Promise<Bookmark[]> {
    const results = await this.db
      .selectFrom('bookmarks')
      .leftJoin('locs', 'bookmarks.locid', 'locs.locid')
      .leftJoin('slocs', 'bookmarks.subid', 'slocs.subid')
      .selectAll('bookmarks')
      .select(['locs.locnam', 'slocs.subnam'])
      .orderBy('bookmarks.bookmark_date', 'desc')
      .limit(limit)
      .execute();

    return results as Bookmark[];
  }

  /**
   * Find all bookmarks
   */
  async findAll(): Promise<Bookmark[]> {
    const results = await this.db
      .selectFrom('bookmarks')
      .leftJoin('locs', 'bookmarks.locid', 'locs.locid')
      .leftJoin('slocs', 'bookmarks.subid', 'slocs.subid')
      .selectAll('bookmarks')
      .select(['locs.locnam', 'slocs.subnam'])
      .orderBy('bookmarks.bookmark_date', 'desc')
      .execute();

    return results as Bookmark[];
  }

  /**
   * Update a bookmark
   */
  async update(bookmark_id: string, updates: BookmarkUpdate): Promise<Bookmark> {
    await this.db
      .updateTable('bookmarks')
      .set(updates)
      .where('bookmark_id', '=', bookmark_id)
      .execute();

    return this.findById(bookmark_id);
  }

  /**
   * Delete a bookmark
   */
  async delete(bookmark_id: string): Promise<void> {
    await this.db.deleteFrom('bookmarks').where('bookmark_id', '=', bookmark_id).execute();
  }

  /**
   * Get total bookmark count
   */
  async count(): Promise<number> {
    const result = await this.db
      .selectFrom('bookmarks')
      .select((eb) => eb.fn.count<number>('bookmark_id').as('count'))
      .executeTakeFirstOrThrow();

    return result.count;
  }

  /**
   * Get bookmark count for a specific location
   */
  async countByLocation(locid: string): Promise<number> {
    const result = await this.db
      .selectFrom('bookmarks')
      .select((eb) => eb.fn.count<number>('bookmark_id').as('count'))
      .where('locid', '=', locid)
      .executeTakeFirstOrThrow();

    return result.count;
  }

  /**
   * Get bookmark count for a specific sub-location
   */
  async countBySubLocation(subid: string): Promise<number> {
    const result = await this.db
      .selectFrom('bookmarks')
      .select((eb) => eb.fn.count<number>('bookmark_id').as('count'))
      .where('subid', '=', subid)
      .executeTakeFirstOrThrow();

    return result.count;
  }
}
