/**
 * Phase 2: SERIALIZE IT
 *
 * Extracts all metadata before touching any files.
 * Batch operations for performance.
 *
 * @module pipeline/phase-serialize
 */

import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import type { StorageAdapter } from '../adapters/storage.js';
import type { DatabaseAdapter } from '../adapters/database.js';
import type { MetadataAdapter } from '../adapters/metadata.js';
import type { Manifest, ImportProgress } from '../domain/manifest.js';
import { getMediaType } from '../domain/media.js';

export interface PhaseSerializeDependencies {
  storage: StorageAdapter;
  database: DatabaseAdapter;
  metadata: MetadataAdapter;
}

/**
 * Phase 2: SERIALIZE IT
 *
 * Responsibilities:
 * 1. Classify file types by extension
 * 2. Calculate SHA256 hashes (parallel)
 * 3. Check for duplicates
 * 4. Extract metadata (batch)
 * 5. Update manifest
 */
export class PhaseSerialize {
  constructor(private readonly deps: PhaseSerializeDependencies) {}

  async execute(
    manifest: Manifest,
    onProgress?: (progress: ImportProgress) => void
  ): Promise<Manifest> {
    manifest.phase = 'phase_2_serialize';
    manifest.updatedAt = new Date().toISOString();

    const totalFiles = manifest.files.length;

    // Step 1: Classify file types
    for (const file of manifest.files) {
      const ext = this.deps.storage.extname(file.originalName);
      file.type = getMediaType(ext);
    }

    onProgress?.({
      phase: 'phase_2_serialize',
      percent: 10,
      filesProcessed: 0,
      totalFiles,
    });

    // Step 2: Calculate SHA256 hashes (parallel)
    const hashPromises = manifest.files.map(async (file, index) => {
      file.status = 'hashing';
      const hash = await this.calculateSHA256(file.originalPath);
      file.sha256 = hash;
      file.status = 'hashed';
      return { index, hash };
    });

    await Promise.all(hashPromises);

    onProgress?.({
      phase: 'phase_2_serialize',
      percent: 40,
      filesProcessed: totalFiles,
      totalFiles,
    });

    // Step 3: Check for duplicates
    for (const file of manifest.files) {
      if (file.sha256 && file.type) {
        const exists = await this.deps.database.mediaExists(file.sha256, file.type);
        if (exists) {
          file.isDuplicate = true;
          file.status = 'duplicate';
        }
      }
    }

    onProgress?.({
      phase: 'phase_2_serialize',
      percent: 50,
      filesProcessed: totalFiles,
      totalFiles,
    });

    // Step 4: Extract metadata (batch for non-duplicates)
    const nonDuplicates = manifest.files.filter(f => !f.isDuplicate && f.type);

    if (nonDuplicates.length > 0) {
      const batchInput = nonDuplicates.map(f => ({
        path: f.originalPath,
        type: f.type!,
      }));

      const metadataResults = await this.deps.metadata.extractBatch(batchInput);

      for (const file of nonDuplicates) {
        const result = metadataResults.get(file.originalPath);
        if (result?.success && result.metadata) {
          file.metadata = result.metadata as Record<string, unknown>;
          file.status = 'serialized';
        } else {
          file.status = 'serialized'; // Continue even if metadata extraction fails
        }
      }
    }

    onProgress?.({
      phase: 'phase_2_serialize',
      percent: 100,
      filesProcessed: totalFiles,
      totalFiles,
    });

    return manifest;
  }

  /**
   * Calculate SHA256 hash of a file using streaming.
   */
  private calculateSHA256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(filePath);

      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }
}
