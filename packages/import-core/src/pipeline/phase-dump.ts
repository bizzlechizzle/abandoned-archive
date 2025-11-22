/**
 * Phase 4: DUMP
 *
 * Single transaction to insert all records into database.
 * Also handles audit logging and optional cleanup.
 *
 * @module pipeline/phase-dump
 */

import { randomUUID } from 'crypto';
import type { StorageAdapter } from '../adapters/storage.js';
import type { DatabaseAdapter } from '../adapters/database.js';
import type { Manifest, ImportProgress, ImportResult } from '../domain/manifest.js';
import type { MediaRecord } from '../domain/media.js';
import { calculateSummary } from '../domain/manifest.js';
import { createProvenanceRecord } from '../domain/provenance.js';

export interface PhaseDumpDependencies {
  storage: StorageAdapter;
  database: DatabaseAdapter;
}

/**
 * Phase 4: DUMP
 *
 * Responsibilities:
 * 1. Single transaction for all DB operations
 * 2. Insert media records
 * 3. Insert provenance records
 * 4. Create import record
 * 5. Append to audit log
 * 6. Delete originals if requested
 */
export class PhaseDump {
  constructor(private readonly deps: PhaseDumpDependencies) {}

  async execute(
    manifest: Manifest,
    onProgress?: (progress: ImportProgress) => void
  ): Promise<ImportResult> {
    manifest.phase = 'phase_4_dump';
    manifest.updatedAt = new Date().toISOString();

    // Filter verified files for DB insertion
    const verifiedFiles = manifest.files.filter(
      f => f.status === 'verified' && f.sha256 && f.archivePath
    );

    const totalFiles = verifiedFiles.length;
    const errors: string[] = [];

    onProgress?.({
      phase: 'phase_4_dump',
      percent: 0,
      filesProcessed: 0,
      totalFiles,
    });

    try {
      // Single transaction for all DB operations
      await this.deps.database.transaction(async (trx) => {
        // Insert media records
        for (let i = 0; i < verifiedFiles.length; i++) {
          const file = verifiedFiles[i];

          try {
            // Build media record
            const mediaRecord = this.buildMediaRecord(file, manifest);

            // Insert media
            await this.deps.database.insertMedia(trx, mediaRecord);

            // Insert provenance
            const provenance = {
              provenanceId: randomUUID(),
              ...createProvenanceRecord(
                file.sha256!,
                file.type!,
                manifest.authImp || 'system',
                file.originalName,
                file.originalPath
              ),
            };
            await this.deps.database.insertProvenance(trx, provenance);

            file.status = 'complete';

            onProgress?.({
              phase: 'phase_4_dump',
              percent: Math.floor((i / totalFiles) * 80),
              currentFile: file.originalName,
              filesProcessed: i + 1,
              totalFiles,
            });
          } catch (error) {
            file.status = 'error';
            file.error = error instanceof Error ? error.message : 'DB insert failed';
            errors.push(`${file.originalName}: ${file.error}`);
          }
        }

        // Create import record
        const summary = calculateSummary(manifest.files);
        await this.deps.database.createImportRecord(trx, {
          importId: manifest.importId,
          locid: manifest.location.locid,
          importDate: manifest.createdAt,
          authImp: manifest.authImp,
          imgCount: summary.images,
          vidCount: summary.videos,
          docCount: summary.documents,
          mapCount: summary.maps,
        });
      });

      onProgress?.({
        phase: 'phase_4_dump',
        percent: 85,
        filesProcessed: totalFiles,
        totalFiles,
      });

      // Append to audit log (outside transaction for reliability)
      await this.deps.database.appendAuditLog({
        action: 'import',
        entityType: 'import',
        entityId: manifest.importId,
        actor: manifest.authImp || 'system',
        details: {
          locationId: manifest.location.locid,
          filesImported: verifiedFiles.length,
          summary: calculateSummary(manifest.files),
        },
      });

      // Delete originals if requested
      if (manifest.options.deleteOriginals) {
        for (const file of verifiedFiles) {
          if (file.status === 'complete') {
            try {
              await this.deps.storage.delete(file.originalPath);
            } catch {
              // Log but don't fail - file is already imported
              errors.push(`Failed to delete original: ${file.originalName}`);
            }
          }
        }
      }

      onProgress?.({
        phase: 'phase_4_dump',
        percent: 100,
        filesProcessed: totalFiles,
        totalFiles,
      });

      // Update manifest
      manifest.phase = 'complete';
      manifest.summary = calculateSummary(manifest.files);
      manifest.updatedAt = new Date().toISOString();

      return {
        success: errors.length === 0,
        importId: manifest.importId,
        manifestPath: '', // Set by orchestrator
        summary: manifest.summary,
        errors,
      };

    } catch (error) {
      manifest.phase = 'failed';
      manifest.updatedAt = new Date().toISOString();

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Transaction failed: ${errorMessage}`);

      return {
        success: false,
        importId: manifest.importId,
        manifestPath: '',
        summary: calculateSummary(manifest.files),
        errors,
      };
    }
  }

  /**
   * Build media record from manifest file.
   */
  private buildMediaRecord(file: Manifest['files'][0], manifest: Manifest): MediaRecord {
    const metadata = (file.metadata || {}) as Record<string, unknown>;
    const now = new Date().toISOString();

    const base = {
      sha: file.sha256!,
      locid: manifest.location.locid,
      subid: manifest.subid,
      originalName: file.originalName,
      archiveName: file.archiveName!,
      originalPath: file.originalPath,
      archivePath: file.archivePath!,
      authImp: manifest.authImp,
      addedAt: now,
      width: metadata.width as number | undefined,
      height: metadata.height as number | undefined,
      dateTaken: metadata.dateTaken as string | undefined,
      gpsLat: (metadata.gps as { lat?: number })?.lat,
      gpsLng: (metadata.gps as { lng?: number })?.lng,
      rawExif: metadata.rawExif as Record<string, unknown> | undefined,
    };

    switch (file.type) {
      case 'image':
        return {
          ...base,
          type: 'image',
          cameraMake: metadata.cameraMake as string | undefined,
          cameraModel: metadata.cameraModel as string | undefined,
        };
      case 'video':
        return {
          ...base,
          type: 'video',
          duration: metadata.duration as number | undefined,
          codec: metadata.codec as string | undefined,
          fps: metadata.fps as number | undefined,
          rawFfmpeg: metadata.rawFfmpeg as Record<string, unknown> | undefined,
        };
      case 'document':
        return {
          ...base,
          type: 'document',
          pageCount: metadata.pageCount as number | undefined,
          author: metadata.author as string | undefined,
          title: metadata.title as string | undefined,
        };
      case 'map':
        return {
          ...base,
          type: 'map',
          mapType: metadata.mapType as string | undefined,
          waypointCount: metadata.waypointCount as number | undefined,
        };
      default:
        return { ...base, type: 'document' };
    }
  }
}
