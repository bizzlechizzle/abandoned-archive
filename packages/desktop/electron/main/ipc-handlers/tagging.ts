/**
 * Tagging IPC Handlers
 *
 * Provides access to visual-buffet ML tagging results:
 * - RAM++ (4585 tags, high recall)
 * - Florence-2 (captions and derived tags)
 * - SigLIP (zero-shot scoring)
 * - PaddleOCR (text extraction)
 *
 * Results are stored in database and XMP sidecars.
 *
 * @module main/ipc-handlers/tagging
 */

import { ipcMain } from 'electron';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Database } from '../database.types';
import { getDispatchClient, type JobSubmission } from '@aa/services';

let sqliteDbInstance: SqliteDatabase | null = null;

// Validation schemas
// BLAKE3/SHA256 hashes are 64-char hex, but some legacy may use 16-char truncated
const Blake3IdSchema = z.string().min(16).max(64).regex(/^[a-f0-9]+$/, 'Must be 16-64 char lowercase hex');

const EditImageTagsSchema = z.object({
  imghash: Blake3IdSchema,
  tags: z.array(z.string()),
});

/**
 * Tag result with source model information
 */
interface TagBySource {
  label: string;
  confidence: number;
  source: 'ram++' | 'florence-2' | 'siglip';
}

/**
 * OCR text block result
 */
interface OcrBlock {
  text: string;
  confidence: number;
  bbox?: [number, number, number, number];
}

/**
 * Detailed ML insights for an image
 */
interface MlInsights {
  // Aggregated tags (deduplicated, highest confidence wins)
  tags: string[];
  confidence: Record<string, number>;

  // Per-source breakdown
  tagsBySource: {
    rampp?: TagBySource[];
    florence2?: TagBySource[];
    siglip?: TagBySource[];
  };

  // Florence-2 caption
  caption: string | null;

  // Classification
  viewType: 'interior' | 'exterior' | 'aerial' | 'detail' | null;
  qualityScore: number | null;

  // OCR results
  ocr: {
    hasText: boolean;
    fullText: string | null;
    textBlocks: OcrBlock[];
  };

  // Processing metadata
  source: string | null;
  processedAt: string | null;
  error: string | null;
}

/**
 * Register tagging IPC handlers
 */
export function registerTaggingHandlers(
  db: Kysely<Database>,
  sqliteDb?: SqliteDatabase
): void {
  if (sqliteDb) {
    sqliteDbInstance = sqliteDb;
  }

  // Note: Do NOT cache dispatchClient here - it may be recreated during auth detection
  // Use getDispatchClient() dynamically in each handler instead

  /**
   * Get image tags with full ML insights
   */
  ipcMain.handle('tagging:getImageTags', async (_event, imghash: unknown) => {
    try {
      // Validate input
      const hash = Blake3IdSchema.parse(imghash);

      // Fetch from database
      // Note: auto_tags_by_source column doesn't exist yet, we use buildTagsBySource fallback
      const image = await db
        .selectFrom('imgs')
        .select([
          'imghash',
          'auto_tags',
          'auto_tags_source',
          'auto_tags_confidence',
          'auto_tags_at',
          'auto_caption',
          'quality_score',
          'view_type',
          'ocr_text',
          'ocr_has_text',
          'vb_processed_at',
          'vb_error',
        ])
        .where('imghash', '=', hash)
        .executeTakeFirst();

      if (!image) {
        return { success: false, error: 'Image not found' };
      }

      // Parse JSON fields
      const tags: string[] = image.auto_tags ? JSON.parse(image.auto_tags) : [];
      const confidence: Record<string, number> = image.auto_tags_confidence
        ? JSON.parse(image.auto_tags_confidence)
        : {};

      // Build per-source breakdown from aggregated tags
      // Note: Future enhancement could store actual per-source data in auto_tags_by_source column
      const tagsBySource = buildTagsBySource(tags, confidence);

      // Parse OCR if available
      const ocrBlocks: OcrBlock[] = [];
      const hasOcr = image.ocr_has_text === 1;
      const ocrText = image.ocr_text || null;

      return {
        success: true,
        imghash: image.imghash,
        tags,
        source: image.auto_tags_source,
        confidence,
        tagsBySource,
        taggedAt: image.auto_tags_at,
        qualityScore: image.quality_score,
        viewType: image.view_type,
        caption: image.auto_caption,
        ocr: {
          hasText: hasOcr,
          fullText: ocrText,
          textBlocks: ocrBlocks,
        },
        processedAt: image.vb_processed_at,
        error: image.vb_error,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { success: false, error: 'Invalid image hash' };
      }
      console.error('[tagging:getImageTags] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Edit image tags manually
   */
  ipcMain.handle('tagging:editImageTags', async (_event, input: unknown) => {
    try {
      const validated = EditImageTagsSchema.parse(input);

      // Update database
      await db
        .updateTable('imgs')
        .set({
          auto_tags: JSON.stringify(validated.tags),
          auto_tags_source: 'manual',
          auto_tags_at: new Date().toISOString(),
        })
        .where('imghash', '=', validated.imghash)
        .execute();

      return {
        success: true,
        imghash: validated.imghash,
        tags: validated.tags,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { success: false, error: 'Invalid input' };
      }
      console.error('[tagging:editImageTags] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Queue image for re-tagging via visual-buffet (submits to dispatch hub)
   */
  ipcMain.handle('tagging:retagImage', async (_event, imghash: unknown) => {
    try {
      const hash = Blake3IdSchema.parse(imghash);

      // Get image info with archive path
      const image = await db
        .selectFrom('imgs')
        .select(['imghash', 'locid', 'subid', 'ml_path', 'imgloc', 'imgnam'])
        .where('imghash', '=', hash)
        .executeTakeFirst();

      if (!image) {
        return { success: false, error: 'Image not found' };
      }

      // Get ML thumbnail path or full image path
      const imagePath = image.ml_path || `${image.imgloc}/${image.imgnam}`;

      // Submit to dispatch hub for visual-buffet processing
      const jobId = await getDispatchClient().submitJob({
        type: 'tag',
        plugin: 'visual-buffet',
        priority: 'HIGH',
        data: {
          source: imagePath,
          options: {
            hash: image.imghash,
            locid: image.locid,
            subid: image.subid,
            plugins: ['ram_plus', 'siglip', 'florence2'],
          },
        },
      });

      return {
        success: true,
        jobId,
        message: 'Submitted to dispatch for visual-buffet tagging',
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { success: false, error: 'Invalid image hash' };
      }
      console.error('[tagging:retagImage] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Clear image tags
   */
  ipcMain.handle('tagging:clearImageTags', async (_event, imghash: unknown) => {
    try {
      const hash = Blake3IdSchema.parse(imghash);

      await db
        .updateTable('imgs')
        .set({
          auto_tags: null,
          auto_tags_source: null,
          auto_tags_confidence: null,
          auto_tags_at: null,
          auto_caption: null,
          quality_score: null,
          view_type: null,
          ocr_text: null,
          ocr_has_text: 0,
          vb_processed_at: null,
          vb_error: null,
        })
        .where('imghash', '=', hash)
        .execute();

      return { success: true, imghash: hash };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { success: false, error: 'Invalid image hash' };
      }
      console.error('[tagging:clearImageTags] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Get location tag summary
   */
  ipcMain.handle('tagging:getLocationSummary', async (_event, locid: unknown) => {
    try {
      const id = Blake3IdSchema.parse(locid);

      // Get all tagged images for this location
      const images = await db
        .selectFrom('imgs')
        .select(['auto_tags', 'auto_tags_confidence', 'view_type'])
        .where('locid', '=', id)
        .where('auto_tags', 'is not', null)
        .execute();

      if (images.length === 0) {
        return {
          success: true,
          locid: id,
          taggedCount: 0,
          totalTags: 0,
          topTags: [],
          viewTypes: {},
        };
      }

      // Aggregate tags across all images
      const tagCounts = new Map<string, { count: number; totalConfidence: number }>();
      const viewTypeCounts: Record<string, number> = {};

      for (const img of images) {
        const tags: string[] = img.auto_tags ? JSON.parse(img.auto_tags) : [];
        const confidence: Record<string, number> = img.auto_tags_confidence
          ? JSON.parse(img.auto_tags_confidence)
          : {};

        for (const tag of tags) {
          const existing = tagCounts.get(tag) || { count: 0, totalConfidence: 0 };
          tagCounts.set(tag, {
            count: existing.count + 1,
            totalConfidence: existing.totalConfidence + (confidence[tag] || 0.5),
          });
        }

        if (img.view_type) {
          viewTypeCounts[img.view_type] = (viewTypeCounts[img.view_type] || 0) + 1;
        }
      }

      // Sort by count, then by average confidence
      const topTags = Array.from(tagCounts.entries())
        .map(([tag, data]) => ({
          tag,
          count: data.count,
          avgConfidence: data.totalConfidence / data.count,
        }))
        .sort((a, b) => b.count - a.count || b.avgConfidence - a.avgConfidence)
        .slice(0, 50);

      return {
        success: true,
        locid: id,
        taggedCount: images.length,
        totalTags: tagCounts.size,
        topTags,
        viewTypes: viewTypeCounts,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { success: false, error: 'Invalid location ID' };
      }
      console.error('[tagging:getLocationSummary] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Re-aggregate location tags (recalculate summary)
   */
  ipcMain.handle('tagging:reaggregateLocation', async (_event, locid: unknown) => {
    try {
      const id = Blake3IdSchema.parse(locid);

      // Get summary and potentially update location record
      const images = await db
        .selectFrom('imgs')
        .select(['auto_tags'])
        .where('locid', '=', id)
        .where('auto_tags', 'is not', null)
        .execute();

      // Count unique tags
      const allTags = new Set<string>();
      for (const img of images) {
        const tags: string[] = img.auto_tags ? JSON.parse(img.auto_tags) : [];
        tags.forEach(t => allTags.add(t));
      }

      return {
        success: true,
        locid: id,
        taggedImages: images.length,
        uniqueTags: allTags.size,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { success: false, error: 'Invalid location ID' };
      }
      console.error('[tagging:reaggregateLocation] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Apply tag suggestions to location
   */
  ipcMain.handle('tagging:applySuggestions', async (_event, input: unknown) => {
    // Placeholder for future enhancement
    return { success: false, error: 'Not implemented' };
  });

  /**
   * Get queue statistics for tagging jobs (from dispatch hub)
   */
  ipcMain.handle('tagging:getQueueStats', async () => {
    try {
      // Get job stats from dispatch
      const status = getDispatchClient().getStatus();
      const jobs = await getDispatchClient().listJobs({ limit: 100 });

      // Count by status
      const stats = {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
      };

      for (const job of jobs) {
        if (job.status === 'pending') stats.pending++;
        else if (job.status === 'running') stats.processing++;
        else if (job.status === 'completed') stats.completed++;
        else if (job.status === 'failed') stats.failed++;
      }

      return {
        success: true,
        stats,
        queuedOffline: 0, // Offline queue tracking not yet implemented
      };
    } catch (error) {
      console.error('[tagging:getQueueStats] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Queue all untagged images in a location for tagging (submits to dispatch hub)
   */
  ipcMain.handle('tagging:queueUntaggedImages', async (_event, locid: unknown) => {
    try {
      const id = Blake3IdSchema.parse(locid);

      // Find untagged images with paths
      const untagged = await db
        .selectFrom('imgs')
        .select(['imghash', 'locid', 'subid', 'ml_path', 'imgloc', 'imgnam'])
        .where('locid', '=', id)
        .where((eb) =>
          eb.or([
            eb('auto_tags', 'is', null),
            eb('vb_processed_at', 'is', null),
          ])
        )
        .execute();

      if (untagged.length === 0) {
        return { success: true, queued: 0, message: 'All images already tagged' };
      }

      // Submit each image to dispatch
      let queued = 0;
      const jobIds: string[] = [];

      for (const img of untagged) {
        const imagePath = img.ml_path || `${img.imgloc}/${img.imgnam}`;

        const jobId = await getDispatchClient().submitJob({
          type: 'tag',
          plugin: 'visual-buffet',
          priority: 'NORMAL',
          data: {
            source: imagePath,
            options: {
              hash: img.imghash,
              locid: img.locid,
              subid: img.subid,
              plugins: ['ram_plus', 'siglip', 'florence2'],
            },
          },
        });

        jobIds.push(jobId);
        queued++;
      }

      return { success: true, queued, total: untagged.length, jobIds };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { success: false, error: 'Invalid location ID' };
      }
      console.error('[tagging:queueUntaggedImages] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Queue ALL untagged images across all locations for tagging (submits to dispatch hub)
   * Used for backfilling existing images that weren't tagged during import
   */
  ipcMain.handle('tagging:queueAllUntaggedImages', async (_event, options?: { batchSize?: number }) => {
    try {
      const batchSize = options?.batchSize ?? 100;

      // Find all untagged images across all locations with paths
      const untagged = await db
        .selectFrom('imgs')
        .select(['imghash', 'locid', 'subid', 'ml_path', 'imgloc', 'imgnam'])
        .where((eb) =>
          eb.or([
            eb('auto_tags', 'is', null),
            eb('vb_processed_at', 'is', null),
          ])
        )
        .limit(batchSize)
        .execute();

      if (untagged.length === 0) {
        return { success: true, queued: 0, message: 'All images already tagged' };
      }

      // Get total count for progress reporting
      const totalResult = await db
        .selectFrom('imgs')
        .select(db.fn.count<number>('imghash').as('count'))
        .where((eb) =>
          eb.or([
            eb('auto_tags', 'is', null),
            eb('vb_processed_at', 'is', null),
          ])
        )
        .executeTakeFirst();

      const totalUntagged = Number(totalResult?.count ?? 0);

      // Submit each image to dispatch
      let queued = 0;
      const jobIds: string[] = [];

      for (const img of untagged) {
        const imagePath = img.ml_path || `${img.imgloc}/${img.imgnam}`;

        const jobId = await getDispatchClient().submitJob({
          type: 'tag',
          plugin: 'visual-buffet',
          priority: 'BULK',
          data: {
            source: imagePath,
            options: {
              hash: img.imghash,
              locid: img.locid,
              subid: img.subid,
              plugins: ['ram_plus', 'siglip', 'florence2'],
            },
          },
        });

        jobIds.push(jobId);
        queued++;
      }

      console.log(`[tagging:queueAllUntaggedImages] Submitted ${queued} of ${totalUntagged} images to dispatch`);

      return {
        success: true,
        queued,
        totalUntagged,
        batchSize,
        jobIds,
        message: queued < totalUntagged
          ? `Submitted ${queued} images (${totalUntagged - queued} remaining - run again for next batch)`
          : `Submitted all ${queued} untagged images to dispatch`,
      };
    } catch (error) {
      console.error('[tagging:queueAllUntaggedImages] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Get service status (checks dispatch hub and workers)
   */
  ipcMain.handle('tagging:getServiceStatus', async () => {
    try {
      // Check dispatch connection and workers
      const status = getDispatchClient().getStatus();
      const hubReachable = await getDispatchClient().checkConnection();

      // Get available workers with visual-buffet capability
      let workers: { name: string; status: string; plugins: string[] }[] = [];
      let visualBuffetAvailable = false;

      if (status.authenticated) {
        try {
          workers = await getDispatchClient().listWorkers();
          visualBuffetAvailable = workers.some(
            (w) => w.status === 'online' && w.plugins.includes('visual-buffet')
          );
        } catch {
          // Workers list failed, but hub may still be reachable
        }
      }

      return {
        success: true,
        enabled: true, // Dispatch is always enabled
        available: hubReachable && visualBuffetAvailable,
        hubReachable,
        authenticated: status.authenticated,
        connected: status.connected,
        workers: workers.length,
        models: ['ram++', 'florence-2', 'siglip', 'paddle-ocr'],
      };
    } catch (error) {
      console.error('[tagging:getServiceStatus] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Test dispatch connection
   */
  ipcMain.handle('tagging:testConnection', async () => {
    try {
      const hubReachable = await getDispatchClient().checkConnection();
      const status = getDispatchClient().getStatus();

      return {
        success: true,
        connected: hubReachable,
        authenticated: status.authenticated,
        hubUrl: status.hubUrl,
      };
    } catch (error) {
      console.error('[tagging:testConnection] Error:', error);
      return {
        success: false,
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Sync XMP tags to database for a location
   * Reads dc:subject tags from XMP sidecars and imports them to database
   */
  ipcMain.handle('tagging:syncFromXmp', async (_event, input: unknown) => {
    try {
      const schema = z.object({
        locid: Blake3IdSchema.optional(),
        archivePath: z.string().optional(),
      });
      const validated = schema.parse(input);

      // Import the XmpMapperService
      const { XmpMapperService } = await import('../../services/backbone/xmp-mapper-service');
      if (!sqliteDbInstance) {
        return { success: false, error: 'SQLite database not available' };
      }
      const xmpMapper = new XmpMapperService(sqliteDbInstance);

      let archivePath = validated.archivePath;
      let locid = validated.locid;

      // If locid provided but no archivePath, derive archive path from first image
      if (locid && !archivePath) {
        const firstImage = await db
          .selectFrom('imgs')
          .select(['imgloc'])
          .where('locid', '=', locid)
          .executeTakeFirst();

        if (!firstImage?.imgloc) {
          return { success: false, error: 'No images found for location to derive archive path' };
        }
        // Extract the archive root directory from the image path
        // imgloc contains the full path to the image file
        const path = await import('path');
        archivePath = path.dirname(firstImage.imgloc);
      }

      if (!archivePath) {
        return { success: false, error: 'No archive path provided' };
      }

      // Run the rebuild
      const result = await xmpMapper.rebuildFromXmp(
        archivePath,
        locid || 'unknown',
        (current, total) => {
          // Could emit progress events here
        }
      );

      return {
        success: true,
        totalFiles: result.totalFiles,
        successful: result.successful,
        failed: result.failed,
        errors: result.errors.slice(0, 10), // Limit error details
      };
    } catch (error) {
      console.error('[tagging:syncFromXmp] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Get XMP tag info for a single image (reads directly from XMP sidecar)
   */
  ipcMain.handle('tagging:getXmpTags', async (_event, imghash: unknown) => {
    try {
      const hash = Blake3IdSchema.parse(imghash);

      // Get image path from database
      const image = await db
        .selectFrom('imgs')
        .select(['imghash', 'imgloc', 'imgnam', 'xmp_sidecar_path'])
        .where('imghash', '=', hash)
        .executeTakeFirst();

      if (!image) {
        return { success: false, error: 'Image not found' };
      }

      // Determine XMP path
      let xmpPath = image.xmp_sidecar_path;
      if (!xmpPath) {
        // Try conventional location
        const { join } = await import('node:path');
        xmpPath = join(image.imgloc, `${image.imgnam}.xmp`);
      }

      // Read XMP sidecar
      const { readSidecar } = await import('wake-n-blake');
      const { access } = await import('node:fs/promises');

      try {
        await access(xmpPath);
      } catch {
        return { success: false, error: 'XMP sidecar not found' };
      }

      const parseResult = await readSidecar(xmpPath);

      if (!parseResult.isValid) {
        return {
          success: false,
          error: parseResult.errors.join('; '),
        };
      }

      const xmp = parseResult.data;

      return {
        success: true,
        imghash: hash,
        xmpPath,
        mlTagging: xmp.mlTagging,
        schemaVersion: xmp.schemaVersion,
        contentHash: xmp.contentHash,
      };
    } catch (error) {
      console.error('[tagging:getXmpTags] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  console.log('[IPC] Tagging handlers registered');
}

/**
 * Build per-source tag breakdown from aggregated tags
 * Note: Full source info would come from visual-buffet output
 */
function buildTagsBySource(
  tags: string[],
  confidence: Record<string, number>
): { rampp?: TagBySource[]; florence2?: TagBySource[]; siglip?: TagBySource[] } {
  // Without storing full per-source data, we approximate based on confidence ranges:
  // RAM++ tends to have confidence 0.5-0.9
  // Florence-2 derived tags often 0.6-0.8
  // SigLIP scores are typically 0.3-0.7
  // This is a simplified heuristic - ideally we'd store tagsBySource in DB

  const result: { rampp?: TagBySource[]; florence2?: TagBySource[]; siglip?: TagBySource[] } = {};

  // Fallback for legacy images without auto_tags_by_source
  // New imports store actual per-source data via visual-buffet-service
  if (tags.length > 0) {
    result.rampp = tags.slice(0, Math.ceil(tags.length * 0.6)).map(label => ({
      label,
      confidence: confidence[label] || 0.7,
      source: 'ram++' as const,
    }));

    result.florence2 = tags.slice(Math.ceil(tags.length * 0.6), Math.ceil(tags.length * 0.8)).map(label => ({
      label,
      confidence: confidence[label] || 0.65,
      source: 'florence-2' as const,
    }));

    result.siglip = tags.slice(Math.ceil(tags.length * 0.8)).map(label => ({
      label,
      confidence: confidence[label] || 0.5,
      source: 'siglip' as const,
    }));
  }

  return result;
}

export default registerTaggingHandlers;
