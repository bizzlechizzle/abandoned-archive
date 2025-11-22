/**
 * Import Pipeline Orchestrator
 *
 * Coordinates the 4-phase import pipeline:
 * LOG IT -> SERIALIZE IT -> COPY & NAME IT -> DUMP
 *
 * @module pipeline/orchestrator
 */

import type { StorageAdapter } from '../adapters/storage.js';
import type { DatabaseAdapter } from '../adapters/database.js';
import type { MetadataAdapter } from '../adapters/metadata.js';
import type {
  Manifest,
  ImportInput,
  ImportProgress,
  ImportResult,
} from '../domain/manifest.js';
import { PhaseLog } from './phase-log.js';
import { PhaseSerialize } from './phase-serialize.js';
import { PhaseCopy } from './phase-copy.js';
import { PhaseDump } from './phase-dump.js';

export interface OrchestratorConfig {
  /** Path to archive root */
  archivePath: string;
  /** Path to store manifest files */
  manifestPath: string;
}

export interface OrchestratorDependencies {
  storage: StorageAdapter;
  database: DatabaseAdapter;
  metadata: MetadataAdapter;
}

/**
 * Import Pipeline Orchestrator
 *
 * Usage:
 * ```typescript
 * const orchestrator = new ImportOrchestrator(config, deps);
 * const result = await orchestrator.import(input, onProgress);
 * ```
 */
export class ImportOrchestrator {
  private readonly phaseLog: PhaseLog;
  private readonly phaseSerialize: PhaseSerialize;
  private readonly phaseCopy: PhaseCopy;
  private readonly phaseDump: PhaseDump;

  constructor(
    private readonly config: OrchestratorConfig,
    private readonly deps: OrchestratorDependencies
  ) {
    this.phaseLog = new PhaseLog({
      storage: deps.storage,
      database: deps.database,
    });

    this.phaseSerialize = new PhaseSerialize({
      storage: deps.storage,
      database: deps.database,
      metadata: deps.metadata,
    });

    this.phaseCopy = new PhaseCopy({
      storage: deps.storage,
      archivePath: config.archivePath,
    });

    this.phaseDump = new PhaseDump({
      storage: deps.storage,
      database: deps.database,
    });
  }

  /**
   * Execute full import pipeline.
   *
   * @param input - Import input (files, location, options)
   * @param onProgress - Progress callback
   * @returns Import result with summary
   */
  async import(
    input: ImportInput,
    onProgress?: (progress: ImportProgress) => void
  ): Promise<ImportResult> {
    let manifest: Manifest;

    try {
      // Phase 1: LOG IT
      manifest = await this.phaseLog.execute(input, onProgress);

      // Save manifest after Phase 1
      await this.saveManifest(manifest);

      // Phase 2: SERIALIZE IT
      manifest = await this.phaseSerialize.execute(manifest, onProgress);

      // Save manifest after Phase 2
      await this.saveManifest(manifest);

      // Phase 3: COPY & NAME IT
      manifest = await this.phaseCopy.execute(manifest, onProgress);

      // Save manifest after Phase 3
      await this.saveManifest(manifest);

      // Phase 4: DUMP
      const result = await this.phaseDump.execute(manifest, onProgress);

      // Save final manifest
      await this.saveManifest(manifest);

      // Set manifest path in result
      result.manifestPath = this.getManifestPath(manifest.importId);

      // Signal completion
      onProgress?.({
        phase: 'complete',
        percent: 100,
        filesProcessed: manifest.files.length,
        totalFiles: manifest.files.length,
      });

      return result;

    } catch (error) {
      // Save failed manifest for debugging
      if (manifest!) {
        manifest.phase = 'failed';
        manifest.updatedAt = new Date().toISOString();
        await this.saveManifest(manifest);
      }

      throw error;
    }
  }

  /**
   * Resume an interrupted import from manifest.
   *
   * @param manifestPath - Path to manifest file
   * @param onProgress - Progress callback
   * @returns Import result
   */
  async resume(
    manifestPath: string,
    onProgress?: (progress: ImportProgress) => void
  ): Promise<ImportResult> {
    // Load manifest
    const manifestData = await this.deps.storage.read(manifestPath);
    const manifest: Manifest = JSON.parse(manifestData.toString());

    // Resume from appropriate phase
    switch (manifest.phase) {
      case 'phase_1_log':
        // Restart from serialize
        return this.resumeFromSerialize(manifest, onProgress);

      case 'phase_2_serialize':
        // Restart from copy
        return this.resumeFromCopy(manifest, onProgress);

      case 'phase_3_copy':
        // Restart from dump
        return this.resumeFromDump(manifest, onProgress);

      case 'complete':
        // Already done
        return {
          success: true,
          importId: manifest.importId,
          manifestPath,
          summary: manifest.summary!,
          errors: [],
        };

      default:
        throw new Error(`Cannot resume from phase: ${manifest.phase}`);
    }
  }

  private async resumeFromSerialize(
    manifest: Manifest,
    onProgress?: (progress: ImportProgress) => void
  ): Promise<ImportResult> {
    manifest = await this.phaseSerialize.execute(manifest, onProgress);
    await this.saveManifest(manifest);

    manifest = await this.phaseCopy.execute(manifest, onProgress);
    await this.saveManifest(manifest);

    const result = await this.phaseDump.execute(manifest, onProgress);
    await this.saveManifest(manifest);

    result.manifestPath = this.getManifestPath(manifest.importId);
    return result;
  }

  private async resumeFromCopy(
    manifest: Manifest,
    onProgress?: (progress: ImportProgress) => void
  ): Promise<ImportResult> {
    manifest = await this.phaseCopy.execute(manifest, onProgress);
    await this.saveManifest(manifest);

    const result = await this.phaseDump.execute(manifest, onProgress);
    await this.saveManifest(manifest);

    result.manifestPath = this.getManifestPath(manifest.importId);
    return result;
  }

  private async resumeFromDump(
    manifest: Manifest,
    onProgress?: (progress: ImportProgress) => void
  ): Promise<ImportResult> {
    const result = await this.phaseDump.execute(manifest, onProgress);
    await this.saveManifest(manifest);

    result.manifestPath = this.getManifestPath(manifest.importId);
    return result;
  }

  /**
   * Save manifest to disk.
   */
  private async saveManifest(manifest: Manifest): Promise<void> {
    const manifestPath = this.getManifestPath(manifest.importId);
    await this.deps.storage.mkdir(this.config.manifestPath, true);
    await this.deps.storage.write(
      manifestPath,
      Buffer.from(JSON.stringify(manifest, null, 2))
    );
  }

  /**
   * Get manifest file path.
   */
  private getManifestPath(importId: string): string {
    return this.deps.storage.join(this.config.manifestPath, `${importId}.json`);
  }
}
