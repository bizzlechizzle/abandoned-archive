/**
 * API-based Import Repository
 *
 * Tracks import sessions through dispatch hub job system.
 * Import records help track when media was added and from what source.
 */

import type { DispatchClient } from '@aa/services';

export interface ImportRecord {
  import_id: string;
  locid: string | null;
  import_date: string;
  auth_imp: string | null;
  img_count: number;
  vid_count: number;
  doc_count: number;
  map_count: number;
  notes: string | null;
  status: string;
  progress: number;
  stage?: string;
  completedAt?: string;
  locnam?: string;
  address_state?: string;
  heroThumbPath?: string;
}

export interface ImportInput {
  locid: string | null;
  auth_imp?: string | null;
  source_path?: string;
  import_type?: string;
  img_count?: number;
  vid_count?: number;
  doc_count?: number;
  map_count?: number;
  notes?: string | null;
}

export interface ImportStats {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  totalMediaImported: number;
}

/**
 * API-based import repository
 *
 * In dispatch architecture, imports are tracked as jobs.
 * This repository provides a compatibility layer.
 */
export class ApiImportRepository {
  constructor(private readonly client: DispatchClient) {}

  /**
   * Create a new import record
   * Maps to submitting an import job to dispatch
   */
  async create(input: ImportInput): Promise<ImportRecord> {
    // In dispatch, imports are tracked via job system
    // Submit job and use job ID as import ID
    const jobId = await this.client.submitJob({
      type: 'import',
      plugin: 'wake-n-blake',
      priority: 'NORMAL',
      data: {
        source: input.source_path || '',
        options: {
          locationId: input.locid,
          author: input.auth_imp,
          counts: {
            images: input.img_count || 0,
            videos: input.vid_count || 0,
            documents: input.doc_count || 0,
            maps: input.map_count || 0,
          },
          notes: input.notes,
        },
      },
    });

    return {
      import_id: jobId,
      locid: input.locid,
      import_date: new Date().toISOString(),
      auth_imp: input.auth_imp || null,
      img_count: input.img_count || 0,
      vid_count: input.vid_count || 0,
      doc_count: input.doc_count || 0,
      map_count: input.map_count || 0,
      notes: input.notes || null,
      status: 'pending',
      progress: 0,
    };
  }

  /**
   * Find import by ID
   */
  async findById(import_id: string): Promise<ImportRecord | null> {
    try {
      const result = await this.client.getImport(import_id);
      const imp = result.import;

      // Extract location ID from job data if available
      const data = imp.data || {};
      const options = (data.options as Record<string, unknown>) || {};
      const counts = (options.counts as Record<string, number>) || {};

      return {
        import_id: imp.id,
        locid: (options.locationId as string) || null,
        import_date: imp.createdAt,
        auth_imp: (options.author as string) || null,
        img_count: counts.images || imp.mediaCount || 0,
        vid_count: counts.videos || 0,
        doc_count: counts.documents || 0,
        map_count: counts.maps || 0,
        notes: (options.notes as string) || null,
        status: imp.status,
        progress: imp.progress,
        stage: imp.stage,
        completedAt: imp.completedAt,
      };
    } catch (error) {
      console.error('ApiImportRepository.findById error:', error);
      return null;
    }
  }

  /**
   * Find recent imports
   */
  async findRecent(limit: number = 20): Promise<ImportRecord[]> {
    try {
      const result = await this.client.getImports({ limit });
      return result.imports.map(imp => this.mapImportJobToRecord(imp));
    } catch (error) {
      console.error('ApiImportRepository.findRecent error:', error);
      return [];
    }
  }

  /**
   * Find imports by location
   */
  async findByLocation(locid: string): Promise<ImportRecord[]> {
    try {
      const result = await this.client.getImportsByLocation(locid);
      return result.imports.map(imp => ({
        import_id: imp.id,
        locid,
        import_date: imp.createdAt,
        auth_imp: null,
        img_count: 0,
        vid_count: 0,
        doc_count: 0,
        map_count: 0,
        notes: null,
        status: imp.status,
        progress: imp.progress,
        stage: imp.stage,
        completedAt: imp.completedAt,
      }));
    } catch (error) {
      console.error('ApiImportRepository.findByLocation error:', error);
      return [];
    }
  }

  /**
   * Find all imports
   */
  async findAll(options?: { limit?: number; offset?: number }): Promise<ImportRecord[]> {
    try {
      const result = await this.client.getImports({
        limit: options?.limit || 100,
        offset: options?.offset || 0,
      });
      return result.imports.map(imp => this.mapImportJobToRecord(imp));
    } catch (error) {
      console.error('ApiImportRepository.findAll error:', error);
      return [];
    }
  }

  /**
   * Find imports by status
   */
  async findByStatus(status: string, limit: number = 50): Promise<ImportRecord[]> {
    try {
      const result = await this.client.getImports({ status, limit });
      return result.imports.map(imp => this.mapImportJobToRecord(imp));
    } catch (error) {
      console.error('ApiImportRepository.findByStatus error:', error);
      return [];
    }
  }

  /**
   * Get import statistics
   */
  async getStats(): Promise<ImportStats> {
    try {
      return await this.client.getImportStats();
    } catch (error) {
      console.error('ApiImportRepository.getStats error:', error);
      return {
        total: 0,
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        totalMediaImported: 0,
      };
    }
  }

  /**
   * Get total media count across all imports
   */
  async getTotalMediaCount(): Promise<{ images: number; videos: number; documents: number; maps: number }> {
    try {
      const stats = await this.client.getImportStats();
      // We only get total media count from stats - need media API for breakdown
      return {
        images: stats.totalMediaImported,
        videos: 0,
        documents: 0,
        maps: 0,
      };
    } catch (error) {
      console.error('ApiImportRepository.getTotalMediaCount error:', error);
      return { images: 0, videos: 0, documents: 0, maps: 0 };
    }
  }

  /**
   * Map import job to import record
   */
  private mapImportJobToRecord(imp: {
    id: string;
    status: string;
    progress: number;
    stage?: string;
    plugin: string;
    type: string;
    data?: Record<string, unknown>;
    result?: Record<string, unknown>;
    error?: string;
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
  }): ImportRecord {
    const data = imp.data || {};
    const options = (data.options as Record<string, unknown>) || {};
    const counts = (options.counts as Record<string, number>) || {};

    return {
      import_id: imp.id,
      locid: (options.locationId as string) || (data.locationId as string) || null,
      import_date: imp.createdAt,
      auth_imp: (options.author as string) || null,
      img_count: counts.images || 0,
      vid_count: counts.videos || 0,
      doc_count: counts.documents || 0,
      map_count: counts.maps || 0,
      notes: (options.notes as string) || null,
      status: imp.status,
      progress: imp.progress,
      stage: imp.stage,
      completedAt: imp.completedAt,
    };
  }
}
