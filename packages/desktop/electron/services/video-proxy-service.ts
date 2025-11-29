/**
 * VideoProxyService - Generate optimized H.264 proxy videos
 *
 * Per video-proxy-system-plan.md:
 * - 1080p for landscape (don't upscale)
 * - 720p width for portrait (don't upscale)
 * - FFmpeg autorotate bakes rotation into pixels
 * - -movflags +faststart enables instant scrubbing
 */
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { Kysely } from 'kysely';
import type { Database } from '../main/database.types';

export interface ProxyResult {
  success: boolean;
  proxyPath?: string;
  error?: string;
  proxyWidth?: number;
  proxyHeight?: number;
}

interface VideoMetadata {
  width: number;
  height: number;
}

/**
 * Calculate proxy dimensions.
 * - Landscape: max 1080p height (don't upscale)
 * - Portrait: max 720p width (don't upscale)
 */
function calculateProxySize(width: number, height: number): { width: number; height: number } {
  const isPortrait = height > width;

  if (isPortrait) {
    // Portrait: max 720 width
    if (width <= 720) {
      return { width, height }; // Don't upscale
    }
    const scale = 720 / width;
    return {
      width: 720,
      height: Math.round(height * scale / 2) * 2 // Even number for H.264
    };
  } else {
    // Landscape: max 1080 height
    if (height <= 1080) {
      return { width, height }; // Don't upscale
    }
    const scale = 1080 / height;
    return {
      width: Math.round(width * scale / 2) * 2, // Even number for H.264
      height: 1080
    };
  }
}

/**
 * Get the proxy cache directory path.
 */
export async function getProxyCacheDir(archivePath: string): Promise<string> {
  const cacheDir = path.join(archivePath, '.cache', 'video-proxies');
  await fs.mkdir(cacheDir, { recursive: true });
  return cacheDir;
}

/**
 * Generate a proxy video for the given video file.
 */
export async function generateProxy(
  db: Kysely<Database>,
  archivePath: string,
  vidsha: string,
  sourcePath: string,
  metadata: VideoMetadata
): Promise<ProxyResult> {
  const cacheDir = await getProxyCacheDir(archivePath);
  const proxyPath = path.join(cacheDir, `${vidsha}_proxy.mp4`);

  // Check if proxy already exists
  try {
    await fs.access(proxyPath);
    // Proxy exists, update last_accessed and return
    const now = new Date().toISOString();
    await db
      .updateTable('video_proxies')
      .set({ last_accessed: now })
      .where('vidsha', '=', vidsha)
      .execute();
    return { success: true, proxyPath };
  } catch {
    // Proxy doesn't exist, generate it
  }

  const { width: targetWidth, height: targetHeight } = calculateProxySize(
    metadata.width,
    metadata.height
  );

  // Build FFmpeg scale filter
  const isPortrait = metadata.height > metadata.width;
  const scaleFilter = isPortrait
    ? `scale=${targetWidth}:-2`  // Portrait: set width, auto height
    : `scale=-2:${targetHeight}`; // Landscape: auto width, set height

  console.log(`[VideoProxy] Generating proxy for ${vidsha.slice(0, 12)}...`);
  console.log(`[VideoProxy]   Input: ${sourcePath}`);
  console.log(`[VideoProxy]   Size: ${metadata.width}x${metadata.height} -> ${targetWidth}x${targetHeight}`);

  return new Promise((resolve) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', sourcePath,
      '-vf', scaleFilter,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      '-y', // Overwrite if exists
      proxyPath
    ]);

    let stderr = '';
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', async (code) => {
      if (code === 0) {
        // Get file size and save to database
        try {
          const stats = await fs.stat(proxyPath);
          const now = new Date().toISOString();

          await db
            .insertInto('video_proxies')
            .values({
              vidsha,
              proxy_path: proxyPath,
              generated_at: now,
              last_accessed: now,
              file_size_bytes: stats.size,
              original_width: metadata.width,
              original_height: metadata.height,
              proxy_width: targetWidth,
              proxy_height: targetHeight
            })
            .onConflict((oc) => oc
              .column('vidsha')
              .doUpdateSet({
                proxy_path: proxyPath,
                generated_at: now,
                last_accessed: now,
                file_size_bytes: stats.size,
                proxy_width: targetWidth,
                proxy_height: targetHeight
              })
            )
            .execute();

          console.log(`[VideoProxy] Generated proxy: ${proxyPath} (${(stats.size / 1024 / 1024).toFixed(1)}MB)`);
          resolve({ success: true, proxyPath, proxyWidth: targetWidth, proxyHeight: targetHeight });
        } catch (err) {
          console.error(`[VideoProxy] Database error:`, err);
          resolve({ success: false, error: `Database error: ${err}` });
        }
      } else {
        console.error(`[VideoProxy] ❌ FFmpeg FAILED for ${vidsha.slice(0, 12)}`);
        console.error(`[VideoProxy]   Input: ${sourcePath}`);
        console.error(`[VideoProxy]   Exit code: ${code}`);
        console.error(`[VideoProxy]   Error output:\n${stderr.slice(-1000)}`);
        resolve({ success: false, error: `FFmpeg failed (code ${code}): ${stderr.slice(-300)}` });
      }
    });

    ffmpeg.on('error', (err) => {
      console.error(`[VideoProxy] ❌ FFmpeg spawn error for ${vidsha.slice(0, 12)}:`, err.message);
      console.error(`[VideoProxy]   Input: ${sourcePath}`);
      resolve({ success: false, error: `FFmpeg spawn error: ${err.message}` });
    });
  });
}

/**
 * Get proxy path for a video if it exists.
 * Updates last_accessed if found, cleans up record if file missing.
 */
export async function getProxyPath(
  db: Kysely<Database>,
  vidsha: string
): Promise<string | null> {
  const proxy = await db
    .selectFrom('video_proxies')
    .select(['proxy_path', 'vidsha'])
    .where('vidsha', '=', vidsha)
    .executeTakeFirst();

  if (!proxy) return null;

  // Verify file exists
  try {
    await fs.access(proxy.proxy_path);

    // Update last_accessed
    await db
      .updateTable('video_proxies')
      .set({ last_accessed: new Date().toISOString() })
      .where('vidsha', '=', vidsha)
      .execute();

    return proxy.proxy_path;
  } catch {
    // File doesn't exist, clean up record
    console.warn(`[VideoProxy] Proxy file missing, cleaning up record for ${vidsha}`);
    await db
      .deleteFrom('video_proxies')
      .where('vidsha', '=', vidsha)
      .execute();
    return null;
  }
}

/**
 * Check if a proxy exists for a video (without updating last_accessed).
 */
export async function hasProxy(
  db: Kysely<Database>,
  vidsha: string
): Promise<boolean> {
  const proxy = await db
    .selectFrom('video_proxies')
    .select('vidsha')
    .where('vidsha', '=', vidsha)
    .executeTakeFirst();

  if (!proxy) return false;

  // Also verify the file actually exists
  const fullProxy = await db
    .selectFrom('video_proxies')
    .select('proxy_path')
    .where('vidsha', '=', vidsha)
    .executeTakeFirst();

  if (!fullProxy) return false;

  try {
    await fs.access(fullProxy.proxy_path);
    return true;
  } catch {
    return false;
  }
}
