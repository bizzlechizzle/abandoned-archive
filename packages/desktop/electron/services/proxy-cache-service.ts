/**
 * ProxyCacheService - Manage video proxy cache lifecycle
 *
 * Per video-proxy-system-plan.md:
 * - 30-day auto-purge for locations not viewed
 * - Manual clear option in Settings
 * - Cache stats for transparency
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Kysely } from 'kysely';
import type { Database } from '../main/database.types';
import { getProxyCacheDir } from './video-proxy-service';

export interface CacheStats {
  totalCount: number;
  totalSizeBytes: number;
  totalSizeMB: number;
  oldestAccess: string | null;
  newestAccess: string | null;
}

export interface PurgeResult {
  deleted: number;
  freedBytes: number;
  freedMB: number;
}

/**
 * Get cache statistics.
 */
export async function getCacheStats(db: Kysely<Database>): Promise<CacheStats> {
  const result = await db
    .selectFrom('video_proxies')
    .select(({ fn }) => [
      fn.count<number>('vidsha').as('count'),
      fn.sum<number>('file_size_bytes').as('size'),
      fn.min<string>('last_accessed').as('oldest'),
      fn.max<string>('last_accessed').as('newest')
    ])
    .executeTakeFirst();

  const totalCount = Number(result?.count || 0);
  const totalSizeBytes = Number(result?.size || 0);

  return {
    totalCount,
    totalSizeBytes,
    totalSizeMB: Math.round(totalSizeBytes / 1024 / 1024 * 10) / 10,
    oldestAccess: result?.oldest || null,
    newestAccess: result?.newest || null
  };
}

/**
 * Purge proxies not accessed in the last N days.
 */
export async function purgeOldProxies(
  db: Kysely<Database>,
  daysOld: number = 30
): Promise<PurgeResult> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysOld);
  const cutoffISO = cutoff.toISOString();

  console.log(`[ProxyCache] Purging proxies not accessed since ${cutoffISO}...`);

  // Find stale proxies
  const stale = await db
    .selectFrom('video_proxies')
    .select(['vidsha', 'proxy_path', 'file_size_bytes'])
    .where('last_accessed', '<', cutoffISO)
    .execute();

  let deleted = 0;
  let freedBytes = 0;

  for (const proxy of stale) {
    // Delete file
    try {
      await fs.unlink(proxy.proxy_path);
      freedBytes += proxy.file_size_bytes || 0;
      console.log(`[ProxyCache] Deleted proxy file: ${proxy.proxy_path}`);
    } catch {
      // File may already be gone
    }

    // Delete record
    await db
      .deleteFrom('video_proxies')
      .where('vidsha', '=', proxy.vidsha)
      .execute();

    deleted++;
  }

  console.log(`[ProxyCache] Purged ${deleted} proxies, freed ${(freedBytes / 1024 / 1024).toFixed(1)}MB`);

  return {
    deleted,
    freedBytes,
    freedMB: Math.round(freedBytes / 1024 / 1024 * 10) / 10
  };
}

/**
 * Clear all proxies (manual purge from Settings).
 */
export async function clearAllProxies(
  db: Kysely<Database>,
  archivePath: string
): Promise<PurgeResult> {
  console.log(`[ProxyCache] Clearing all proxies...`);

  const all = await db
    .selectFrom('video_proxies')
    .select(['vidsha', 'proxy_path', 'file_size_bytes'])
    .execute();

  let freedBytes = 0;

  // Delete all proxy files
  for (const proxy of all) {
    try {
      await fs.unlink(proxy.proxy_path);
      freedBytes += proxy.file_size_bytes || 0;
    } catch {
      // Ignore errors for missing files
    }
  }

  // Delete all records
  await db.deleteFrom('video_proxies').execute();

  // Also clean up any orphaned files in the cache directory
  try {
    const cacheDir = await getProxyCacheDir(archivePath);
    const files = await fs.readdir(cacheDir);
    for (const file of files) {
      if (file.endsWith('_proxy.mp4')) {
        try {
          const filePath = path.join(cacheDir, file);
          const stats = await fs.stat(filePath);
          await fs.unlink(filePath);
          freedBytes += stats.size;
        } catch {
          // Ignore
        }
      }
    }
  } catch {
    // Cache directory may not exist
  }

  console.log(`[ProxyCache] Cleared ${all.length} proxies, freed ${(freedBytes / 1024 / 1024).toFixed(1)}MB`);

  return {
    deleted: all.length,
    freedBytes,
    freedMB: Math.round(freedBytes / 1024 / 1024 * 10) / 10
  };
}

/**
 * Update last_accessed for all videos in a location.
 * Called when user views a location to prevent proxies from being purged.
 */
export async function touchLocationProxies(
  db: Kysely<Database>,
  locid: string
): Promise<number> {
  const now = new Date().toISOString();

  // Get all video SHAs for this location
  const videos = await db
    .selectFrom('vids')
    .select('vidsha')
    .where('locid', '=', locid)
    .execute();

  if (videos.length === 0) return 0;

  const shas = videos.map(v => v.vidsha);

  const result = await db
    .updateTable('video_proxies')
    .set({ last_accessed: now })
    .where('vidsha', 'in', shas)
    .execute();

  return Number(result[0]?.numUpdatedRows || 0);
}

/**
 * Get videos in a location that don't have proxies yet.
 */
export async function getVideosNeedingProxies(
  db: Kysely<Database>,
  locid: string
): Promise<Array<{
  vidsha: string;
  vidloc: string;
  meta_width: number | null;
  meta_height: number | null;
}>> {
  // Use subquery to find videos without proxy records
  const videos = await db
    .selectFrom('vids')
    .leftJoin('video_proxies', 'vids.vidsha', 'video_proxies.vidsha')
    .select(['vids.vidsha', 'vids.vidloc', 'vids.meta_width', 'vids.meta_height'])
    .where('vids.locid', '=', locid)
    .where('video_proxies.vidsha', 'is', null)
    .execute();

  return videos;
}
