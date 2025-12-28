/**
 * API-based Import Repository
 *
 * Tracks import sessions through dispatch hub instead of local SQLite.
 * Import records help track when media was added and from what source.
 *
 * NOTE: Full import tracking via dispatch job system is not yet implemented.
 * This is a stub implementation that submits jobs but cannot fully track them.
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
      plugin: 'archive-import',
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
    };
  }

  /**
   * Find import by ID (job lookup)
   * NOTE: JobUpdate type doesn't expose full job data, returns partial record
   */
  async findById(import_id: string): Promise<ImportRecord | null> {
    try {
      const job = await this.client.getJob(import_id);
      if (!job) return null;

      // JobUpdate only has: jobId, status, result, error, workerId, retryCount
      // Return minimal record with available data
      return {
        import_id: job.jobId,
        locid: null, // Not available from JobUpdate
        import_date: new Date().toISOString(),
        auth_imp: null,
        img_count: 0,
        vid_count: 0,
        doc_count: 0,
        map_count: 0,
        notes: null,
      };
    } catch {
      return null;
    }
  }

  /**
   * Find recent imports
   * NOTE: Dispatch job list doesn't provide full import details
   */
  async findRecent(limit: number = 5): Promise<ImportRecord[]> {
    console.warn('ApiImportRepository.findRecent: Full import history not yet available via dispatch');
    return [];
  }

  /**
   * Find imports by location
   * TODO: Dispatch hub needs import-by-location endpoint
   */
  async findByLocation(locid: string): Promise<ImportRecord[]> {
    console.warn('ApiImportRepository.findByLocation: Not yet implemented in dispatch hub');
    return [];
  }

  /**
   * Find all imports
   */
  async findAll(): Promise<ImportRecord[]> {
    return this.findRecent(100);
  }

  /**
   * Get total media count across all imports
   * Should query media table in dispatch instead
   */
  async getTotalMediaCount(): Promise<{ images: number; videos: number; documents: number; maps: number }> {
    // TODO: Get counts from dispatch media API
    console.warn('ApiImportRepository.getTotalMediaCount: Should use media API stats endpoint');
    return { images: 0, videos: 0, documents: 0, maps: 0 };
  }
}
