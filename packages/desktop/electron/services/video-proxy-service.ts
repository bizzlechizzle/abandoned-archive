/**
 * VideoProxyService - Generate optimized H.264 proxy videos
 *
 * OPT-053 Immich Model:
 * - 720p max for ALL orientations (don't upscale)
 * - FFmpeg autorotate bakes rotation into pixels
 * - -movflags +faststart enables instant scrubbing
 * - -hwaccel auto for GPU acceleration when available
 * - Proxies stored alongside originals as hidden files (.{hash}.proxy.mp4)
 * - Proxies are permanent (no purge, no last_accessed tracking)
 */
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { Kysely } from 'kysely';
import type { Database } from '../main/database.types';

// Current proxy encoding version - increment when changing encoding settings
export const PROXY_VERSION = 1;

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
 * OPT-053: 720p max for ALL orientations (landscape AND portrait)
 * Never upscale - if source is smaller than 720p, keep original size.
 */
function calculateProxySize(width: number, height: number): { width: number; height: number } {
  const maxDimension = 720;

  // Find the larger dimension
  const isPortrait = height > width;
  const largerDim = isPortrait ? height : width;

  // If already small enough, don't upscale
  if (largerDim <= maxDimension) {
    // Ensure even dimensions for H.264
    return {
      width: Math.round(width / 2) * 2,
      height: Math.round(height / 2) * 2
    };
  }

  // Scale down to fit within 720p
  const scale = maxDimension / largerDim;
  return {
    width: Math.round((width * scale) / 2) * 2,  // Even number for H.264
    height: Math.round((height * scale) / 2) * 2  // Even number for H.264
  };
}

/**
 * Get the proxy file path for a video.
 * OPT-053: Hidden file alongside original: .{hash}.proxy.mp4
 *
 * @param videoDir - Directory containing the original video
 * @param vidsha - SHA256 hash of the video
 * @returns Full path to proxy file
 */
export function getProxyPathForVideo(videoDir: string, vidsha: string): string {
  return path.join(videoDir, `.${vidsha}.proxy.mp4`);
}

/**
 * DEPRECATED: Get the proxy cache directory path.
 * OPT-053: No longer used for new proxies. Retained only for legacy cleanup.
 */
export async function getProxyCacheDir(archivePath: string): Promise<string> {
  const cacheDir = path.join(archivePath, '.cache', 'video-proxies');
  await fs.mkdir(cacheDir, { recursive: true });
  return cacheDir;
}

/**
 * Generate a proxy video for the given video file.
 * OPT-053: Proxies stored alongside originals, permanent (no purge).
 */
export async function generateProxy(
  db: Kysely<Database>,
  archivePath: string,
  vidsha: string,
  sourcePath: string,
  metadata: VideoMetadata
): Promise<ProxyResult> {
  // OPT-053: Proxy stored alongside original video
  const videoDir = path.dirname(sourcePath);
  const proxyPath = getProxyPathForVideo(videoDir, vidsha);

  // Check if proxy already exists
  try {
    await fs.access(proxyPath);
    // Proxy exists - return immediately (no last_accessed update needed, proxies are permanent)
    console.log(`[VideoProxy] Proxy already exists: ${proxyPath}`);
    return { success: true, proxyPath };
  } catch {
    // Proxy doesn't exist, generate it
  }

  // Ensure video directory exists
  try {
    await fs.mkdir(videoDir, { recursive: true });
  } catch {
    // Directory likely exists
  }

  const { width: targetWidth, height: targetHeight } = calculateProxySize(
    metadata.width,
    metadata.height
  );

  // Build FFmpeg scale filter - always scale to calculated dimensions
  const scaleFilter = `scale=${targetWidth}:${targetHeight}`;

  console.log(`[VideoProxy] Generating 720p proxy for ${vidsha.slice(0, 12)}...`);
  console.log(`[VideoProxy]   Input: ${sourcePath}`);
  console.log(`[VideoProxy]   Size: ${metadata.width}x${metadata.height} -> ${targetWidth}x${targetHeight}`);
  console.log(`[VideoProxy]   Output: ${proxyPath}`);

  return new Promise((resolve) => {
    // OPT-053: Added -hwaccel auto for GPU acceleration
    const ffmpeg = spawn('ffmpeg', [
      '-hwaccel', 'auto',           // GPU acceleration when available
      '-i', sourcePath,
      '-vf', scaleFilter,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-movflags', '+faststart',    // Enable instant playback/scrubbing
      '-y',                         // Overwrite if exists
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

          // OPT-053: No last_accessed tracking - proxies are permanent
          await db
            .insertInto('video_proxies')
            .values({
              vidsha,
              proxy_path: proxyPath,
              generated_at: now,
              last_accessed: now, // Still set for backwards compat, but not used
              file_size_bytes: stats.size,
              original_width: metadata.width,
              original_height: metadata.height,
              proxy_width: targetWidth,
              proxy_height: targetHeight,
              proxy_version: PROXY_VERSION
            })
            .onConflict((oc) => oc
              .column('vidsha')
              .doUpdateSet({
                proxy_path: proxyPath,
                generated_at: now,
                last_accessed: now,
                file_size_bytes: stats.size,
                proxy_width: targetWidth,
                proxy_height: targetHeight,
                proxy_version: PROXY_VERSION
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
        console.error(`[VideoProxy] FFmpeg FAILED for ${vidsha.slice(0, 12)}`);
        console.error(`[VideoProxy]   Input: ${sourcePath}`);
        console.error(`[VideoProxy]   Exit code: ${code}`);
        console.error(`[VideoProxy]   Error output:\n${stderr.slice(-1000)}`);
        resolve({ success: false, error: `FFmpeg failed (code ${code}): ${stderr.slice(-300)}` });
      }
    });

    ffmpeg.on('error', (err) => {
      console.error(`[VideoProxy] FFmpeg spawn error for ${vidsha.slice(0, 12)}:`, err.message);
      console.error(`[VideoProxy]   Input: ${sourcePath}`);
      resolve({ success: false, error: `FFmpeg spawn error: ${err.message}` });
    });
  });
}

/**
 * Get proxy path for a video if it exists.
 * OPT-053: Simplified - no last_accessed update (proxies are permanent).
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
    // OPT-053: No last_accessed update - proxies are permanent
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
 * Check if a proxy exists for a video by checking the filesystem directly.
 * OPT-053: Compute expected path from video location, no DB lookup needed.
 *
 * @param videoPath - Full path to the original video
 * @param vidsha - SHA256 hash of the video
 * @returns true if proxy file exists
 */
export async function proxyExistsForVideo(videoPath: string, vidsha: string): Promise<boolean> {
  const videoDir = path.dirname(videoPath);
  const proxyPath = getProxyPathForVideo(videoDir, vidsha);

  try {
    await fs.access(proxyPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a proxy exists for a video (via database lookup).
 * OPT-053: Simplified - no last_accessed update.
 */
export async function hasProxy(
  db: Kysely<Database>,
  vidsha: string
): Promise<boolean> {
  const proxy = await db
    .selectFrom('video_proxies')
    .select('proxy_path')
    .where('vidsha', '=', vidsha)
    .executeTakeFirst();

  if (!proxy) return false;

  // Verify the file actually exists
  try {
    await fs.access(proxy.proxy_path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a proxy file and its database record.
 * Used when deleting videos or regenerating proxies.
 */
export async function deleteProxy(
  db: Kysely<Database>,
  vidsha: string
): Promise<void> {
  const proxy = await db
    .selectFrom('video_proxies')
    .select('proxy_path')
    .where('vidsha', '=', vidsha)
    .executeTakeFirst();

  if (proxy) {
    // Delete file
    try {
      await fs.unlink(proxy.proxy_path);
      console.log(`[VideoProxy] Deleted proxy file: ${proxy.proxy_path}`);
    } catch {
      // File may not exist
    }

    // Delete record
    await db
      .deleteFrom('video_proxies')
      .where('vidsha', '=', vidsha)
      .execute();
  }
}
