import { Kysely } from 'kysely';
import { randomUUID } from 'crypto';
import type { Database, ImportsTable } from '../main/database.types';

export interface ImportRecord {
  import_id: string;
  locid: string | null;
  import_date: string;
  auth_imp: string | null;
  img_count: number;
  vid_count: number;
  doc_count: number;
  map_count: number;
  notes: string | null;
  // Joined location data
  locnam?: string;
  address_state?: string;
}

export interface ImportInput {
  locid: string | null;
  auth_imp: string | null;
  img_count?: number;
  vid_count?: number;
  doc_count?: number;
  map_count?: number;
  notes?: string | null;
}

export class SQLiteImportRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async create(input: ImportInput): Promise<ImportRecord> {
    const import_id = randomUUID();
    const import_date = new Date().toISOString();

    const record: ImportsTable = {
      import_id,
      locid: input.locid,
      import_date,
      auth_imp: input.auth_imp,
      img_count: input.img_count || 0,
      vid_count: input.vid_count || 0,
      doc_count: input.doc_count || 0,
      map_count: input.map_count || 0,
      notes: input.notes || null,
    };

    await this.db.insertInto('imports').values(record).execute();

    return this.findById(import_id);
  }

  async findById(import_id: string): Promise<ImportRecord> {
    const row = await this.db
      .selectFrom('imports')
      .leftJoin('locs', 'imports.locid', 'locs.locid')
      .selectAll('imports')
      .select(['locs.locnam', 'locs.address_state'])
      .where('imports.import_id', '=', import_id)
      .executeTakeFirstOrThrow();

    return row;
  }

  async findRecent(limit: number = 5): Promise<ImportRecord[]> {
    const rows = await this.db
      .selectFrom('imports')
      .leftJoin('locs', 'imports.locid', 'locs.locid')
      .selectAll('imports')
      .select(['locs.locnam', 'locs.address_state'])
      .orderBy('imports.import_date', 'desc')
      .limit(limit)
      .execute();

    return rows;
  }

  async findByLocation(locid: string): Promise<ImportRecord[]> {
    const rows = await this.db
      .selectFrom('imports')
      .leftJoin('locs', 'imports.locid', 'locs.locid')
      .selectAll('imports')
      .select(['locs.locnam', 'locs.address_state'])
      .where('imports.locid', '=', locid)
      .orderBy('imports.import_date', 'desc')
      .execute();

    return rows;
  }

  async findAll(): Promise<ImportRecord[]> {
    const rows = await this.db
      .selectFrom('imports')
      .leftJoin('locs', 'imports.locid', 'locs.locid')
      .selectAll('imports')
      .select(['locs.locnam', 'locs.address_state'])
      .orderBy('imports.import_date', 'desc')
      .execute();

    return rows;
  }

  async getTotalMediaCount(): Promise<{ images: number; videos: number; documents: number; maps: number }> {
    const result = await this.db
      .selectFrom('imports')
      .select((eb) => [
        eb.fn.sum<number>('img_count').as('total_images'),
        eb.fn.sum<number>('vid_count').as('total_videos'),
        eb.fn.sum<number>('doc_count').as('total_documents'),
        eb.fn.sum<number>('map_count').as('total_maps'),
      ])
      .executeTakeFirst();

    return {
      images: Number(result?.total_images || 0),
      videos: Number(result?.total_videos || 0),
      documents: Number(result?.total_documents || 0),
      maps: Number(result?.total_maps || 0),
    };
  }
}
