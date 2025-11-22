/**
 * Phase 1: LOG IT
 *
 * Validates inputs and creates the import manifest.
 * This is the entry point for all imports.
 *
 * @module pipeline/phase-log
 */

import type { StorageAdapter } from '../adapters/storage.js';
import type { DatabaseAdapter } from '../adapters/database.js';
import type { Manifest, ImportInput, ImportProgress } from '../domain/manifest.js';
import { createManifest } from '../domain/manifest.js';

export interface PhaseLogDependencies {
  storage: StorageAdapter;
  database: DatabaseAdapter;
}

/**
 * Phase 1: LOG IT
 *
 * Responsibilities:
 * 1. Validate location exists
 * 2. Validate all input files exist
 * 3. Create manifest with file entries
 * 4. Save manifest to disk
 */
export class PhaseLog {
  constructor(private readonly deps: PhaseLogDependencies) {}

  async execute(
    input: ImportInput,
    onProgress?: (progress: ImportProgress) => void
  ): Promise<Manifest> {
    onProgress?.({
      phase: 'phase_1_log',
      percent: 0,
      filesProcessed: 0,
      totalFiles: input.files.length,
    });

    // Step 1: Validate location exists
    const location = await this.deps.database.findLocation(input.locationId);
    if (!location) {
      throw new Error(`Location not found: ${input.locationId}`);
    }

    onProgress?.({
      phase: 'phase_1_log',
      percent: 20,
      filesProcessed: 0,
      totalFiles: input.files.length,
    });

    // Step 2: Validate all files exist and get sizes
    const validatedFiles: Array<{ path: string; name: string; size: number }> = [];

    for (let i = 0; i < input.files.length; i++) {
      const file = input.files[i];

      if (!await this.deps.storage.exists(file.path)) {
        throw new Error(`File not found: ${file.path}`);
      }

      const stat = await this.deps.storage.stat(file.path);
      if (!stat.isFile) {
        throw new Error(`Not a file: ${file.path}`);
      }

      validatedFiles.push({
        path: file.path,
        name: file.name,
        size: stat.size,
      });

      onProgress?.({
        phase: 'phase_1_log',
        percent: 20 + Math.floor((i / input.files.length) * 60),
        currentFile: file.name,
        filesProcessed: i + 1,
        totalFiles: input.files.length,
      });
    }

    // Step 3: Create manifest
    const manifest = createManifest({
      ...input,
      files: validatedFiles,
      location: {
        locid: location.locid,
        locnam: location.locnam,
        slocnam: location.slocnam ?? null,
        loc12: location.loc12,
        address_state: location.address_state ?? null,
        type: location.type ?? null,
        gps_lat: location.gps_lat ?? null,
        gps_lng: location.gps_lng ?? null,
      },
    });

    onProgress?.({
      phase: 'phase_1_log',
      percent: 100,
      filesProcessed: input.files.length,
      totalFiles: input.files.length,
    });

    return manifest;
  }
}
