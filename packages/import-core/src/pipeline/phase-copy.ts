/**
 * Phase 3: COPY & NAME IT
 *
 * Creates folder structure and copies files to archive.
 * Supports rsync for performance and integrity.
 *
 * @module pipeline/phase-copy
 */

import type { StorageAdapter } from '../adapters/storage.js';
import type { Manifest, ImportProgress } from '../domain/manifest.js';

export interface PhaseCopyDependencies {
  storage: StorageAdapter;
  archivePath: string;
}

/**
 * Phase 3: COPY & NAME IT
 *
 * Responsibilities:
 * 1. Create folder structure
 * 2. Copy files with integrity verification
 * 3. Rename to SHA256.ext format
 * 4. Update manifest with archive paths
 */
export class PhaseCopy {
  constructor(private readonly deps: PhaseCopyDependencies) {}

  async execute(
    manifest: Manifest,
    onProgress?: (progress: ImportProgress) => void
  ): Promise<Manifest> {
    manifest.phase = 'phase_3_copy';
    manifest.updatedAt = new Date().toISOString();

    // Filter files to copy (non-duplicates, non-errors)
    const filesToCopy = manifest.files.filter(
      f => !f.isDuplicate && f.status !== 'error' && f.sha256
    );

    const totalFiles = filesToCopy.length;
    let processedFiles = 0;

    // Step 1: Create folder structure
    const folderPath = this.buildFolderPath(manifest);
    await this.createFolderStructure(folderPath);

    onProgress?.({
      phase: 'phase_3_copy',
      percent: 5,
      filesProcessed: 0,
      totalFiles,
    });

    // Step 2: Copy each file
    for (const file of filesToCopy) {
      try {
        file.status = 'copying';

        // Build archive path
        const ext = this.deps.storage.extname(file.originalName).toLowerCase();
        const archiveName = `${file.sha256}${ext}`;
        const typeFolderName = this.getTypeFolderName(file.type!, manifest.location.loc12);
        const archivePath = this.deps.storage.join(
          folderPath,
          typeFolderName,
          archiveName
        );

        // Ensure type folder exists
        await this.deps.storage.mkdir(this.deps.storage.dirname(archivePath), true);

        // Copy file
        const copyResult = await this.deps.storage.copy(
          file.originalPath,
          archivePath,
          {
            useRsync: manifest.options.useRsync,
            hardlink: manifest.options.useHardlinks,
            checksum: manifest.options.verifyChecksums,
          }
        );

        if (!copyResult.success) {
          file.status = 'error';
          file.error = copyResult.error || 'Copy failed';
          continue;
        }

        file.archivePath = archivePath;
        file.archiveName = archiveName;
        file.status = 'copied';

        // Step 3: Verify integrity if requested
        if (manifest.options.verifyChecksums && !copyResult.verified) {
          // Adapter didn't verify, do it ourselves
          const verified = await this.verifyFile(archivePath, file.sha256!);
          if (!verified) {
            file.status = 'error';
            file.error = 'Integrity verification failed';
            continue;
          }
        }

        file.verified = true;
        file.status = 'verified';

        processedFiles++;
        onProgress?.({
          phase: 'phase_3_copy',
          percent: 5 + Math.floor((processedFiles / totalFiles) * 95),
          currentFile: file.originalName,
          filesProcessed: processedFiles,
          totalFiles,
        });
      } catch (error) {
        file.status = 'error';
        file.error = error instanceof Error ? error.message : 'Unknown error';
      }
    }

    onProgress?.({
      phase: 'phase_3_copy',
      percent: 100,
      filesProcessed: processedFiles,
      totalFiles,
    });

    return manifest;
  }

  /**
   * Build the location folder path.
   * Format: [archive]/locations/[STATE]-[TYPE]/[SLOCNAM]-[LOC12]
   */
  private buildFolderPath(manifest: Manifest): string {
    const state = manifest.location.state || 'XX';
    const type = manifest.location.type || 'Unknown';
    const slocnam = manifest.location.slocnam || manifest.location.locnam.toLowerCase().replace(/\s+/g, '-').slice(0, 20);
    const loc12 = manifest.location.loc12;

    return this.deps.storage.join(
      this.deps.archivePath,
      'locations',
      `${state}-${type}`,
      `${slocnam}-${loc12}`
    );
  }

  /**
   * Get type-specific folder name.
   * Format: org-[type]-[LOC12]
   */
  private getTypeFolderName(type: string, loc12: string): string {
    const typeMap: Record<string, string> = {
      image: 'img',
      video: 'vid',
      document: 'doc',
      map: 'map',
    };
    return `org-${typeMap[type] || type}-${loc12}`;
  }

  /**
   * Create folder structure recursively.
   */
  private async createFolderStructure(basePath: string): Promise<void> {
    // Create base location folder
    await this.deps.storage.mkdir(basePath, true);

    // Create type folders
    const loc12 = this.deps.storage.basename(basePath).split('-').pop() || '';
    for (const type of ['img', 'vid', 'doc', 'map']) {
      const typePath = this.deps.storage.join(basePath, `org-${type}-${loc12}`);
      await this.deps.storage.mkdir(typePath, true);
    }
  }

  /**
   * Verify file integrity by comparing hash.
   */
  private async verifyFile(archivePath: string, expectedHash: string): Promise<boolean> {
    // Re-read file and calculate hash
    const { createHash } = await import('crypto');
    const { createReadStream } = await import('fs');

    return new Promise((resolve) => {
      const hash = createHash('sha256');
      const stream = createReadStream(archivePath);

      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex') === expectedHash));
      stream.on('error', () => resolve(false));
    });
  }
}
