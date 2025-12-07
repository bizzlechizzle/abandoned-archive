import { Kysely } from 'kysely';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Database, SlocsTable } from '../main/database.types';
import { MediaPathService } from '../services/media-path-service';
import { getLogger } from '../services/logger-service';

/**
 * SubLocation entity for application use
 */
export interface SubLocation {
  subid: string;
  sub12: string;
  locid: string;
  subnam: string;
  ssubname: string | null;
  type: string | null;
  status: string | null;
  hero_imghash: string | null;
  hero_focal_x: number;
  hero_focal_y: number;
  is_primary: boolean;
  created_date: string;
  created_by: string | null;
  modified_date: string | null;
  modified_by: string | null;
  // Migration 31: Sub-location GPS (separate from host location)
  gps_lat: number | null;
  gps_lng: number | null;
  gps_accuracy: number | null;
  gps_source: string | null;
  gps_verified_on_map: boolean;
  gps_captured_at: string | null;
  // Migration 32: AKA and historical name
  akanam: string | null;
  historicalName: string | null;
}

/**
 * GPS data for updating sub-location coordinates
 */
export interface SubLocationGpsInput {
  lat: number;
  lng: number;
  accuracy?: number | null;
  source: string;  // 'user_map_click', 'photo_exif', 'manual_entry'
}

/**
 * Input for creating a new sub-location
 */
export interface CreateSubLocationInput {
  locid: string;
  subnam: string;
  ssubname?: string | null;
  type?: string | null;
  status?: string | null;
  is_primary?: boolean;
  created_by?: string | null;
}

/**
 * Input for updating a sub-location
 */
export interface UpdateSubLocationInput {
  subnam?: string;
  ssubname?: string | null;
  type?: string | null;
  status?: string | null;
  hero_imghash?: string | null;
  hero_focal_x?: number;
  hero_focal_y?: number;
  is_primary?: boolean;
  modified_by?: string | null;
  // Migration 32: AKA and historical name
  akanam?: string | null;
  historicalName?: string | null;
}

/**
 * Generate short sub-location name (12 chars max)
 */
function generateShortName(name: string): string {
  // Remove common prefixes/suffixes and truncate
  const shortened = name
    .replace(/^(The|A|An)\s+/i, '')
    .replace(/\s+(Building|House|Hall|Center|Centre)$/i, '')
    .substring(0, 12)
    .trim();
  return shortened || name.substring(0, 12);
}

/**
 * SQLite repository for sub-locations
 */
export class SQLiteSubLocationRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Create a new sub-location
   * OPT-001: Wrapped in transaction to ensure atomicity
   */
  async create(input: CreateSubLocationInput): Promise<SubLocation> {
    const subid = randomUUID();
    const sub12 = subid.substring(0, 12).replace(/-/g, '');
    const ssubname = input.ssubname || generateShortName(input.subnam);
    const created_date = new Date().toISOString();

    // Use transaction to ensure all operations succeed or all fail
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('slocs')
        .values({
          subid,
          sub12,
          locid: input.locid,
          subnam: input.subnam,
          ssubname,
          type: input.type || null,
          status: input.status || null,
          hero_imghash: null,
          is_primary: input.is_primary ? 1 : 0,
          created_date,
          created_by: input.created_by || null,
          modified_date: null,
          modified_by: null,
          // Migration 31: GPS fields (all null on creation)
          gps_lat: null,
          gps_lng: null,
          gps_accuracy: null,
          gps_source: null,
          gps_verified_on_map: 0,
          gps_captured_at: null,
          // Migration 32: AKA and historical name (null on creation)
          akanam: null,
          historicalName: null,
        })
        .execute();

      // If marked as primary, update parent location's sub12 field
      if (input.is_primary) {
        await trx
          .updateTable('locs')
          .set({ sub12 })
          .where('locid', '=', input.locid)
          .execute();
      }

      // Update parent location's sublocs JSON array
      const parent = await trx
        .selectFrom('locs')
        .select('sublocs')
        .where('locid', '=', input.locid)
        .executeTakeFirst();

      const currentSublocs: string[] = parent?.sublocs ? JSON.parse(parent.sublocs) : [];
      if (!currentSublocs.includes(subid)) {
        currentSublocs.push(subid);
        await trx
          .updateTable('locs')
          .set({ sublocs: JSON.stringify(currentSublocs) })
          .where('locid', '=', input.locid)
          .execute();
      }
    });

    return {
      subid,
      sub12,
      locid: input.locid,
      subnam: input.subnam,
      ssubname,
      type: input.type || null,
      status: input.status || null,
      hero_imghash: null,
      is_primary: input.is_primary || false,
      created_date,
      created_by: input.created_by || null,
      modified_date: null,
      modified_by: null,
      // Migration 31: GPS fields (all null on creation)
      gps_lat: null,
      gps_lng: null,
      gps_accuracy: null,
      gps_source: null,
      gps_verified_on_map: false,
      gps_captured_at: null,
      // Migration 32: AKA and historical name
      akanam: null,
      historicalName: null,
    };
  }

  /**
   * Find sub-location by ID
   */
  async findById(subid: string): Promise<SubLocation | null> {
    const row = await this.db
      .selectFrom('slocs')
      .selectAll()
      .where('subid', '=', subid)
      .executeTakeFirst();

    return row ? this.mapRowToSubLocation(row) : null;
  }

  /**
   * Find all sub-locations for a parent location
   */
  async findByLocationId(locid: string): Promise<SubLocation[]> {
    const rows = await this.db
      .selectFrom('slocs')
      .selectAll()
      .where('locid', '=', locid)
      .orderBy('is_primary', 'desc')
      .orderBy('subnam', 'asc')
      .execute();

    return rows.map(row => this.mapRowToSubLocation(row));
  }

  /**
   * Update a sub-location
   */
  async update(subid: string, input: UpdateSubLocationInput): Promise<SubLocation | null> {
    const existing = await this.findById(subid);
    if (!existing) return null;

    const modified_date = new Date().toISOString();

    const updateValues: Record<string, unknown> = {
      modified_date,
      modified_by: input.modified_by || null,
    };

    if (input.subnam !== undefined) updateValues.subnam = input.subnam;
    if (input.ssubname !== undefined) updateValues.ssubname = input.ssubname;
    if (input.type !== undefined) updateValues.type = input.type;
    if (input.status !== undefined) updateValues.status = input.status;
    if (input.hero_imghash !== undefined) updateValues.hero_imghash = input.hero_imghash;
    if (input.hero_focal_x !== undefined) updateValues.hero_focal_x = input.hero_focal_x;
    if (input.hero_focal_y !== undefined) updateValues.hero_focal_y = input.hero_focal_y;
    if (input.is_primary !== undefined) updateValues.is_primary = input.is_primary ? 1 : 0;
    if (input.akanam !== undefined) updateValues.akanam = input.akanam;
    if (input.historicalName !== undefined) updateValues.historicalName = input.historicalName;

    await this.db
      .updateTable('slocs')
      .set(updateValues)
      .where('subid', '=', subid)
      .execute();

    // If setting as primary, update parent and clear other primaries
    if (input.is_primary) {
      await this.setPrimary(existing.locid, subid);
    }

    return this.findById(subid);
  }

  /**
   * Delete a sub-location with cascade delete of all associated media
   * OPT-093: Full cascade delete mirroring location delete behavior
   *
   * Cascade deletes:
   * - All images with this subid
   * - All videos with this subid
   * - All documents with this subid
   * - All maps with this subid
   * - Physical media files from disk
   * - Thumbnails, previews, posters, video proxies
   * - BagIt _archive folder for this sub-location
   */
  async delete(subid: string): Promise<void> {
    const logger = getLogger();
    const existing = await this.findById(subid);
    if (!existing) return;

    // 1. Get parent location for folder path construction
    const parentLocation = await this.db
      .selectFrom('locs')
      .select(['locid', 'loc12', 'locnam', 'slocnam', 'address_state', 'type'])
      .where('locid', '=', existing.locid)
      .executeTakeFirst();

    // 2. Collect all media hashes for this sub-location
    const imgHashes = await this.db
      .selectFrom('imgs')
      .select(['imghash as hash', 'organized_path'])
      .where('subid', '=', subid)
      .execute();

    const vidHashes = await this.db
      .selectFrom('vids')
      .select(['vidhash as hash', 'organized_path'])
      .where('subid', '=', subid)
      .execute();

    const docHashes = await this.db
      .selectFrom('docs')
      .select(['dochash as hash', 'organized_path'])
      .where('subid', '=', subid)
      .execute();

    const mapHashes = await this.db
      .selectFrom('maps')
      .select(['maphash as hash', 'organized_path'])
      .where('subid', '=', subid)
      .execute();

    // Combine with type annotations
    const mediaHashes: Array<{ hash: string; type: 'img' | 'vid' | 'doc' | 'map'; path?: string }> = [
      ...imgHashes.map(r => ({ hash: r.hash, type: 'img' as const, path: r.organized_path ?? undefined })),
      ...vidHashes.map(r => ({ hash: r.hash, type: 'vid' as const, path: r.organized_path ?? undefined })),
      ...docHashes.map(r => ({ hash: r.hash, type: 'doc' as const, path: r.organized_path ?? undefined })),
      ...mapHashes.map(r => ({ hash: r.hash, type: 'map' as const, path: r.organized_path ?? undefined })),
    ];

    // 3. Get video proxy paths
    const videoHashes = mediaHashes.filter(m => m.type === 'vid').map(m => m.hash);
    const proxyPaths: string[] = [];
    if (videoHashes.length > 0) {
      const proxies = await this.db
        .selectFrom('video_proxies')
        .select('proxy_path')
        .where('vidhash', 'in', videoHashes)
        .execute();
      proxyPaths.push(...proxies.map(p => p.proxy_path).filter((p): p is string => !!p));
    }

    // 4. Audit log BEFORE deletion
    logger.info('SubLocationRepository', 'DELETION AUDIT: Deleting sub-location with files', {
      subid,
      locid: existing.locid,
      subnam: existing.subnam,
      sub12: existing.sub12,
      is_primary: existing.is_primary,
      media_count: mediaHashes.length,
      video_proxies: proxyPaths.length,
      deleted_at: new Date().toISOString(),
    });

    // 5. Delete DB records (cascade will handle video_proxies via trigger)
    // Delete media records first (they reference slocs)
    await this.db.deleteFrom('imgs').where('subid', '=', subid).execute();
    await this.db.deleteFrom('vids').where('subid', '=', subid).execute();
    await this.db.deleteFrom('docs').where('subid', '=', subid).execute();
    await this.db.deleteFrom('maps').where('subid', '=', subid).execute();

    // Delete the sub-location record
    await this.db.deleteFrom('slocs').where('subid', '=', subid).execute();

    // Remove from parent location's sublocs array
    await this.removeFromParentSublocs(existing.locid, subid);

    // If this was the primary, clear parent's sub12
    if (existing.is_primary) {
      await this.clearPrimaryOnParent(existing.locid);
    }

    // 6. Background file cleanup (non-blocking for instant UI response)
    const archivePath = await this.getArchivePath();

    setImmediate(async () => {
      try {
        // 6a. Delete sub-location folder if it exists
        // Folder structure: [archive]/locations/[STATE]-[TYPE]/[SLOCNAM]-[LOC12]/org-{type}-[LOC12]-[SUB12]/
        if (archivePath && parentLocation) {
          const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 50);
          const state = parentLocation.address_state?.toUpperCase() || 'XX';
          const locType = parentLocation.type || 'Unknown';
          const slocnam = parentLocation.slocnam || parentLocation.locnam.substring(0, 12);

          // Sub-location specific folders
          const locationFolder = path.join(
            archivePath,
            'locations',
            `${state}-${sanitize(locType)}`,
            `${sanitize(slocnam)}-${parentLocation.loc12}`
          );

          // Delete sub-location media folders (org-img-LOC12-SUB12, etc.)
          for (const mediaType of ['img', 'vid', 'doc']) {
            const subFolder = path.join(
              locationFolder,
              `org-${mediaType}-${parentLocation.loc12}-${existing.sub12}`
            );
            try {
              await fs.rm(subFolder, { recursive: true, force: true });
              logger.info('SubLocationRepository', `Deleted sub-location folder: ${subFolder}`);
            } catch {
              // Folder might not exist
            }
          }

          // Delete sub-location _archive (BagIt) folder
          const bagitFolder = path.join(locationFolder, `_archive-${existing.sub12}`);
          try {
            await fs.rm(bagitFolder, { recursive: true, force: true });
            logger.info('SubLocationRepository', `Deleted sub-location BagIt folder: ${bagitFolder}`);
          } catch {
            // Folder might not exist
          }
        }

        // 6b. Delete thumbnails/previews/posters by hash
        if (archivePath && mediaHashes.length > 0) {
          const mediaPathService = new MediaPathService(archivePath);

          for (const { hash, type } of mediaHashes) {
            // Thumbnails (all sizes including legacy)
            for (const size of [400, 800, 1920, undefined] as const) {
              const thumbPath = mediaPathService.getThumbnailPath(hash, size as 400 | 800 | 1920 | undefined);
              await fs.unlink(thumbPath).catch(() => {});
            }

            // Previews (images/RAW only)
            if (type === 'img') {
              const previewPath = mediaPathService.getPreviewPath(hash);
              await fs.unlink(previewPath).catch(() => {});
            }

            // Posters (videos only)
            if (type === 'vid') {
              const posterPath = mediaPathService.getPosterPath(hash);
              await fs.unlink(posterPath).catch(() => {});
            }
          }
        }

        // 6c. Delete video proxies
        for (const proxyPath of proxyPaths) {
          await fs.unlink(proxyPath).catch(() => {});
        }

        logger.info('SubLocationRepository', `File cleanup complete for sub-location ${subid}`);
      } catch (err) {
        logger.warn('SubLocationRepository', `Background file cleanup error for ${subid}`, {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    });
  }

  /**
   * Get archive path from settings
   */
  private async getArchivePath(): Promise<string | null> {
    const result = await this.db
      .selectFrom('settings')
      .select('value')
      .where('key', '=', 'archive_path')
      .executeTakeFirst();

    // Try both keys (archive_path and archive_folder)
    if (result?.value) return result.value;

    const altResult = await this.db
      .selectFrom('settings')
      .select('value')
      .where('key', '=', 'archive_folder')
      .executeTakeFirst();

    return altResult?.value || null;
  }

  /**
   * Set a sub-location as primary for its parent
   */
  async setPrimary(locid: string, subid: string): Promise<void> {
    // Clear existing primary
    await this.db
      .updateTable('slocs')
      .set({ is_primary: 0 })
      .where('locid', '=', locid)
      .execute();

    // Set new primary
    const subloc = await this.findById(subid);
    if (subloc) {
      await this.db
        .updateTable('slocs')
        .set({ is_primary: 1 })
        .where('subid', '=', subid)
        .execute();

      await this.setPrimaryOnParent(locid, subloc.sub12);
    }
  }

  /**
   * Check if a sub-location name already exists for a location
   */
  async checkNameExists(locid: string, subnam: string, excludeSubid?: string): Promise<boolean> {
    let query = this.db
      .selectFrom('slocs')
      .select('subid')
      .where('locid', '=', locid)
      .where('subnam', '=', subnam);

    if (excludeSubid) {
      query = query.where('subid', '!=', excludeSubid);
    }

    const row = await query.executeTakeFirst();
    return !!row;
  }

  /**
   * Count sub-locations for a parent location
   */
  async countByLocationId(locid: string): Promise<number> {
    const result = await this.db
      .selectFrom('slocs')
      .select(eb => eb.fn.countAll<number>().as('count'))
      .where('locid', '=', locid)
      .executeTakeFirst();

    return result?.count || 0;
  }

  /**
   * Get sub-locations with their hero images for display
   * Checks all thumbnail columns: preview_path > thumb_path_lg > thumb_path_sm > thumb_path
   * Sorts by: is_primary DESC, then by asset count (imgs + vids + docs) DESC
   */
  async findWithHeroImages(locid: string): Promise<Array<SubLocation & { hero_thumb_path?: string; asset_count?: number }>> {
    // Query sublocations with asset counts using subqueries
    const rows = await this.db
      .selectFrom('slocs')
      .selectAll('slocs')
      .select(eb => [
        eb.selectFrom('imgs')
          .select(eb.fn.countAll<number>().as('cnt'))
          .whereRef('imgs.subid', '=', 'slocs.subid')
          .as('img_count'),
        eb.selectFrom('vids')
          .select(eb.fn.countAll<number>().as('cnt'))
          .whereRef('vids.subid', '=', 'slocs.subid')
          .as('vid_count'),
        eb.selectFrom('docs')
          .select(eb.fn.countAll<number>().as('cnt'))
          .whereRef('docs.subid', '=', 'slocs.subid')
          .as('doc_count'),
      ])
      .where('locid', '=', locid)
      .execute();

    // Map to SubLocation with hero paths and calculate total asset count
    const sublocsWithAssets = await Promise.all(
      rows.map(async (row) => {
        const subloc = this.mapRowToSubLocation(row);
        const assetCount = (row.img_count || 0) + (row.vid_count || 0) + (row.doc_count || 0);

        let heroPath: string | undefined;
        if (subloc.hero_imghash) {
          const img = await this.db
            .selectFrom('imgs')
            .select(['preview_path', 'thumb_path_lg', 'thumb_path_sm', 'thumb_path'])
            .where('imghash', '=', subloc.hero_imghash)
            .executeTakeFirst();
          heroPath = img?.preview_path || img?.thumb_path_lg || img?.thumb_path_sm || img?.thumb_path || undefined;
        }

        return {
          ...subloc,
          hero_thumb_path: heroPath,
          asset_count: assetCount,
        };
      })
    );

    // Sort: primary first, then by asset count descending
    return sublocsWithAssets.sort((a, b) => {
      // Primary always first
      if (a.is_primary && !b.is_primary) return -1;
      if (!a.is_primary && b.is_primary) return 1;
      // Then by asset count descending
      return (b.asset_count || 0) - (a.asset_count || 0);
    });
  }

  /**
   * Update GPS coordinates for a sub-location
   * This is SEPARATE from the host location's GPS
   */
  async updateGps(subid: string, gps: SubLocationGpsInput): Promise<SubLocation | null> {
    const existing = await this.findById(subid);
    if (!existing) return null;

    const gps_captured_at = new Date().toISOString();
    const gps_verified = gps.source === 'user_map_click' ? 1 : 0;

    await this.db
      .updateTable('slocs')
      .set({
        gps_lat: gps.lat,
        gps_lng: gps.lng,
        gps_accuracy: gps.accuracy || null,
        gps_source: gps.source,
        gps_verified_on_map: gps_verified,
        gps_captured_at,
        modified_date: gps_captured_at,
      })
      .where('subid', '=', subid)
      .execute();

    console.log(`[SubLocationRepo] Updated GPS for ${subid}: ${gps.lat}, ${gps.lng} (source: ${gps.source})`);

    return this.findById(subid);
  }

  /**
   * Clear GPS coordinates for a sub-location
   */
  async clearGps(subid: string): Promise<SubLocation | null> {
    const existing = await this.findById(subid);
    if (!existing) return null;

    await this.db
      .updateTable('slocs')
      .set({
        gps_lat: null,
        gps_lng: null,
        gps_accuracy: null,
        gps_source: null,
        gps_verified_on_map: 0,
        gps_captured_at: null,
        modified_date: new Date().toISOString(),
      })
      .where('subid', '=', subid)
      .execute();

    console.log(`[SubLocationRepo] Cleared GPS for ${subid}`);

    return this.findById(subid);
  }

  /**
   * Verify GPS on map for a sub-location
   */
  async verifyGpsOnMap(subid: string): Promise<SubLocation | null> {
    const existing = await this.findById(subid);
    if (!existing) return null;

    await this.db
      .updateTable('slocs')
      .set({
        gps_verified_on_map: 1,
        gps_source: 'user_map_click',
        modified_date: new Date().toISOString(),
      })
      .where('subid', '=', subid)
      .execute();

    console.log(`[SubLocationRepo] Verified GPS on map for ${subid}`);

    return this.findById(subid);
  }

  /**
   * Get all sub-locations with GPS for a location (for map display)
   */
  async findWithGpsByLocationId(locid: string): Promise<SubLocation[]> {
    const rows = await this.db
      .selectFrom('slocs')
      .selectAll()
      .where('locid', '=', locid)
      .where('gps_lat', 'is not', null)
      .where('gps_lng', 'is not', null)
      .execute();

    return rows.map(row => this.mapRowToSubLocation(row));
  }

  // Private helper methods

  private mapRowToSubLocation(row: SlocsTable): SubLocation {
    return {
      subid: row.subid,
      sub12: row.sub12,
      locid: row.locid,
      subnam: row.subnam,
      ssubname: row.ssubname,
      type: row.type || null,
      status: row.status || null,
      hero_imghash: row.hero_imghash || null,
      hero_focal_x: row.hero_focal_x ?? 0.5,
      hero_focal_y: row.hero_focal_y ?? 0.5,
      is_primary: row.is_primary === 1,
      created_date: row.created_date || new Date().toISOString(),
      created_by: row.created_by || null,
      modified_date: row.modified_date || null,
      modified_by: row.modified_by || null,
      // Migration 31: GPS fields
      gps_lat: row.gps_lat || null,
      gps_lng: row.gps_lng || null,
      gps_accuracy: row.gps_accuracy || null,
      gps_source: row.gps_source || null,
      gps_verified_on_map: row.gps_verified_on_map === 1,
      gps_captured_at: row.gps_captured_at || null,
      // Migration 32: AKA and historical name
      akanam: row.akanam || null,
      historicalName: row.historicalName || null,
    };
  }

  private async setPrimaryOnParent(locid: string, sub12: string): Promise<void> {
    await this.db
      .updateTable('locs')
      .set({ sub12 })
      .where('locid', '=', locid)
      .execute();
  }

  private async clearPrimaryOnParent(locid: string): Promise<void> {
    await this.db
      .updateTable('locs')
      .set({ sub12: null })
      .where('locid', '=', locid)
      .execute();
  }

  private async addToParentSublocs(locid: string, subid: string): Promise<void> {
    const parent = await this.db
      .selectFrom('locs')
      .select('sublocs')
      .where('locid', '=', locid)
      .executeTakeFirst();

    const currentSublocs: string[] = parent?.sublocs ? JSON.parse(parent.sublocs) : [];
    if (!currentSublocs.includes(subid)) {
      currentSublocs.push(subid);
      await this.db
        .updateTable('locs')
        .set({ sublocs: JSON.stringify(currentSublocs) })
        .where('locid', '=', locid)
        .execute();
    }
  }

  private async removeFromParentSublocs(locid: string, subid: string): Promise<void> {
    const parent = await this.db
      .selectFrom('locs')
      .select('sublocs')
      .where('locid', '=', locid)
      .executeTakeFirst();

    const currentSublocs: string[] = parent?.sublocs ? JSON.parse(parent.sublocs) : [];
    const filteredSublocs = currentSublocs.filter(id => id !== subid);

    await this.db
      .updateTable('locs')
      .set({ sublocs: JSON.stringify(filteredSublocs) })
      .where('locid', '=', locid)
      .execute();
  }
}
