/**
 * API-based Web Sources Repository
 *
 * Manages web sources (bookmarks, archived pages) through dispatch hub.
 * Web sources include screenshots, PDFs, HTML, WARC archives, and extracted metadata.
 *
 * NOTE: Dispatch hub needs comprehensive websource endpoints:
 * - POST /api/websources
 * - GET /api/websources/:id
 * - GET /api/websources/by-url/:url
 * - GET /api/websources/by-location/:locid
 * - PUT /api/websources/:id
 * - DELETE /api/websources/:id
 * - GET /api/websources/search?q=...
 * - GET /api/websources/stats
 */

import type { DispatchClient } from '@aa/services';

// =============================================================================
// Types and Interfaces (matching SQLite repository)
// =============================================================================

export type WebSourceStatus = 'pending' | 'archiving' | 'complete' | 'partial' | 'failed';
export type WebSourceType = 'article' | 'gallery' | 'video' | 'social' | 'map' | 'document' | 'archive' | 'other';

export interface ComponentStatus {
  screenshot?: 'pending' | 'done' | 'failed' | 'skipped';
  pdf?: 'pending' | 'done' | 'failed' | 'skipped';
  html?: 'pending' | 'done' | 'failed' | 'skipped';
  warc?: 'pending' | 'done' | 'failed' | 'skipped';
  images?: 'pending' | 'done' | 'failed' | 'skipped';
  videos?: 'pending' | 'done' | 'failed' | 'skipped';
  text?: 'pending' | 'done' | 'failed' | 'skipped';
}

export interface WebSourceInput {
  url: string;
  title?: string | null;
  locid?: string | null;
  subid?: string | null;
  source_type?: WebSourceType;
  notes?: string | null;
  auth_imp?: string | null;
}

export interface WebSourceUpdate {
  title?: string | null;
  locid?: string | null;
  subid?: string | null;
  source_type?: WebSourceType;
  notes?: string | null;
  status?: WebSourceStatus;
  component_status?: ComponentStatus;
  extracted_title?: string | null;
  extracted_author?: string | null;
  extracted_date?: string | null;
  extracted_publisher?: string | null;
  extracted_text?: string | null;
  word_count?: number;
  image_count?: number;
  video_count?: number;
  archive_path?: string | null;
  screenshot_path?: string | null;
  pdf_path?: string | null;
  html_path?: string | null;
  warc_path?: string | null;
  screenshot_hash?: string | null;
  pdf_hash?: string | null;
  html_hash?: string | null;
  warc_hash?: string | null;
  content_hash?: string | null;
  provenance_hash?: string | null;
  archive_error?: string | null;
  retry_count?: number;
  archived_at?: string | null;
  domain?: string | null;
  canonical_url?: string | null;
  language?: string | null;
}

export interface WebSource {
  source_id: string;
  url: string;
  title: string | null;
  locid: string | null;
  subid: string | null;
  source_type: WebSourceType;
  notes: string | null;
  status: WebSourceStatus;
  component_status: ComponentStatus | null;
  extracted_title: string | null;
  extracted_author: string | null;
  extracted_date: string | null;
  extracted_publisher: string | null;
  extracted_text: string | null;
  word_count: number;
  image_count: number;
  video_count: number;
  archive_path: string | null;
  screenshot_path: string | null;
  pdf_path: string | null;
  html_path: string | null;
  warc_path: string | null;
  screenshot_hash: string | null;
  pdf_hash: string | null;
  html_hash: string | null;
  warc_hash: string | null;
  content_hash: string | null;
  provenance_hash: string | null;
  archive_error: string | null;
  retry_count: number;
  created_at: string;
  archived_at: string | null;
  auth_imp: string | null;
  domain: string | null;
  canonical_url: string | null;
  language: string | null;
  locnam?: string;
  subnam?: string;
}

export interface WebSourceVersion {
  version_id: string;
  source_id: string;
  version_number: number;
  archived_at: string;
  archive_path: string | null;
  screenshot_path: string | null;
  pdf_path: string | null;
  html_path: string | null;
  warc_path: string | null;
  word_count: number | null;
  image_count: number | null;
  video_count: number | null;
  content_hash: string | null;
  content_changed: boolean;
  diff_summary: string | null;
}

export interface WebSourceSearchResult {
  source_id: string;
  url: string;
  title: string | null;
  locid: string | null;
  snippet: string;
  rank: number;
}

export interface WebSourceStats {
  total: number;
  pending: number;
  archiving: number;
  complete: number;
  partial: number;
  failed: number;
  total_images: number;
  total_videos: number;
  total_words: number;
}

export interface WebSourceImage {
  source_id: string;
  image_index: number;
  url: string;
  local_path: string | null;
  hash: string | null;
  width: number | null;
  height: number | null;
  size: number | null;
  alt: string | null;
  caption: string | null;
}

export interface WebSourceVideo {
  source_id: string;
  video_index: number;
  url: string;
  local_path: string | null;
  hash: string | null;
  title: string | null;
  duration: number | null;
  platform: string | null;
}

// =============================================================================
// Repository Implementation
// =============================================================================

/**
 * API-based web sources repository
 *
 * NOTE: Dispatch hub does not yet have comprehensive websource endpoints.
 * Many methods will throw or return empty results until dispatch is extended.
 *
 * Web source archiving (screenshot, PDF, WARC generation) should happen
 * on dispatch workers, not in the desktop client.
 */
export class ApiWebSourcesRepository {
  constructor(private readonly client: DispatchClient) {}

  // ===========================================================================
  // Core CRUD Operations
  // ===========================================================================

  /**
   * Create a new web source
   * TODO: Dispatch hub needs POST /api/websources
   */
  async create(input: WebSourceInput): Promise<WebSource> {
    console.warn('ApiWebSourcesRepository.create: Submitting as dispatch job');

    // Submit as a job to dispatch for processing
    try {
      const jobId = await this.client.submitJob({
        type: 'capture',
        plugin: 'puppeteer',
        priority: 'NORMAL',
        data: {
          source: input.url,
          options: {
            title: input.title,
            locationId: input.locid,
            sublocationId: input.subid,
            sourceType: input.source_type,
            notes: input.notes,
          },
        },
      });

      // Return a pending web source object
      return {
        source_id: jobId,
        url: input.url,
        title: input.title || null,
        locid: input.locid || null,
        subid: input.subid || null,
        source_type: input.source_type || 'article',
        notes: input.notes || null,
        status: 'pending',
        component_status: null,
        extracted_title: null,
        extracted_author: null,
        extracted_date: null,
        extracted_publisher: null,
        extracted_text: null,
        word_count: 0,
        image_count: 0,
        video_count: 0,
        archive_path: null,
        screenshot_path: null,
        pdf_path: null,
        html_path: null,
        warc_path: null,
        screenshot_hash: null,
        pdf_hash: null,
        html_hash: null,
        warc_hash: null,
        content_hash: null,
        provenance_hash: null,
        archive_error: null,
        retry_count: 0,
        created_at: new Date().toISOString(),
        archived_at: null,
        auth_imp: input.auth_imp || null,
        domain: null,
        canonical_url: null,
        language: null,
      };
    } catch (error) {
      console.error('ApiWebSourcesRepository.create: Failed to submit job', error);
      throw new Error('Failed to create web source: dispatch hub connection failed');
    }
  }

  /**
   * Find a web source by ID
   * TODO: Dispatch hub needs GET /api/websources/:id
   */
  async findById(source_id: string): Promise<WebSource> {
    console.warn('ApiWebSourcesRepository.findById: Not yet implemented in dispatch hub');
    throw new Error(`Web source not found: ${source_id} (dispatch endpoint not implemented)`);
  }

  /**
   * Find a web source by URL
   */
  async findByUrl(url: string): Promise<WebSource | null> {
    console.warn('ApiWebSourcesRepository.findByUrl: Not yet implemented in dispatch hub');
    return null;
  }

  /**
   * Find all web sources for a specific location
   * TODO: Dispatch hub needs GET /api/websources/by-location/:locid
   */
  async findByLocation(locid: string): Promise<WebSource[]> {
    console.warn('ApiWebSourcesRepository.findByLocation: Not yet implemented in dispatch hub');
    return [];
  }

  /**
   * Find all web sources for a specific sub-location
   */
  async findBySubLocation(subid: string): Promise<WebSource[]> {
    console.warn('ApiWebSourcesRepository.findBySubLocation: Not yet implemented in dispatch hub');
    return [];
  }

  /**
   * Find web sources by status
   */
  async findByStatus(status: WebSourceStatus): Promise<WebSource[]> {
    console.warn('ApiWebSourcesRepository.findByStatus: Not yet implemented in dispatch hub');
    return [];
  }

  /**
   * Find pending sources ready for archiving
   */
  async findPendingForArchive(limit: number = 10): Promise<WebSource[]> {
    console.warn('ApiWebSourcesRepository.findPendingForArchive: Not yet implemented');
    return [];
  }

  /**
   * Find recently added sources
   */
  async findRecent(limit: number = 10): Promise<WebSource[]> {
    console.warn('ApiWebSourcesRepository.findRecent: Not yet implemented in dispatch hub');
    return [];
  }

  /**
   * Find all web sources
   */
  async findAll(): Promise<WebSource[]> {
    console.warn('ApiWebSourcesRepository.findAll: Not yet implemented in dispatch hub');
    return [];
  }

  /**
   * Update a web source
   * TODO: Dispatch hub needs PUT /api/websources/:id
   */
  async update(source_id: string, updates: WebSourceUpdate): Promise<WebSource> {
    console.warn('ApiWebSourcesRepository.update: Not yet implemented in dispatch hub');
    throw new Error(`Cannot update web source: ${source_id} (dispatch endpoint not implemented)`);
  }

  /**
   * Delete a web source
   * TODO: Dispatch hub needs DELETE /api/websources/:id
   */
  async delete(source_id: string): Promise<void> {
    console.warn('ApiWebSourcesRepository.delete: Not yet implemented in dispatch hub');
    throw new Error(`Cannot delete web source: ${source_id} (dispatch endpoint not implemented)`);
  }

  // ===========================================================================
  // Archive Status Management
  // ===========================================================================

  /**
   * Mark a source as archiving in progress
   */
  async markArchiving(source_id: string): Promise<void> {
    await this.update(source_id, { status: 'archiving' });
  }

  /**
   * Mark a source as archive complete
   */
  async markComplete(
    source_id: string,
    options: {
      archive_path: string;
      screenshot_path?: string | null;
      pdf_path?: string | null;
      html_path?: string | null;
      warc_path?: string | null;
      content_hash?: string | null;
      extracted_title?: string | null;
      extracted_text?: string | null;
      word_count?: number;
      image_count?: number;
      video_count?: number;
    }
  ): Promise<WebSource> {
    return this.update(source_id, {
      status: 'complete',
      archived_at: new Date().toISOString(),
      archive_error: null,
      ...options,
    });
  }

  /**
   * Mark a source as partially archived
   */
  async markPartial(
    source_id: string,
    component_status: ComponentStatus,
    options: {
      archive_path: string;
      screenshot_path?: string | null;
      pdf_path?: string | null;
    }
  ): Promise<WebSource> {
    return this.update(source_id, {
      status: 'partial',
      archived_at: new Date().toISOString(),
      component_status,
      ...options,
    });
  }

  /**
   * Mark a source as failed
   */
  async markFailed(source_id: string, error: string): Promise<WebSource> {
    return this.update(source_id, {
      status: 'failed',
      archive_error: error,
    });
  }

  /**
   * Reset a failed source to pending for retry
   */
  async resetToPending(source_id: string): Promise<WebSource> {
    return this.update(source_id, {
      status: 'pending',
      archive_error: null,
    });
  }

  /**
   * Update component status during archiving
   */
  async updateComponentStatus(source_id: string, component_status: ComponentStatus): Promise<void> {
    await this.update(source_id, { component_status });
  }

  // ===========================================================================
  // Version Management
  // ===========================================================================

  /**
   * Create a new version snapshot
   * TODO: Dispatch hub needs POST /api/websources/:id/versions
   */
  async createVersion(
    source_id: string,
    options: {
      archive_path: string;
      screenshot_path?: string | null;
      pdf_path?: string | null;
      html_path?: string | null;
      content_hash?: string | null;
      word_count?: number;
    }
  ): Promise<WebSourceVersion> {
    console.warn('ApiWebSourcesRepository.createVersion: Not yet implemented');
    throw new Error('Version creation not yet supported via dispatch');
  }

  /**
   * Find all versions for a web source
   */
  async findVersions(source_id: string): Promise<WebSourceVersion[]> {
    console.warn('ApiWebSourcesRepository.findVersions: Not yet implemented');
    return [];
  }

  /**
   * Find a specific version by number
   */
  async findVersionByNumber(source_id: string, version_number: number): Promise<WebSourceVersion | null> {
    console.warn('ApiWebSourcesRepository.findVersionByNumber: Not yet implemented');
    return null;
  }

  /**
   * Get latest version for a web source
   */
  async findLatestVersion(source_id: string): Promise<WebSourceVersion | null> {
    console.warn('ApiWebSourcesRepository.findLatestVersion: Not yet implemented');
    return null;
  }

  /**
   * Get version count for a web source
   */
  async countVersions(source_id: string): Promise<number> {
    return 0;
  }

  // ===========================================================================
  // Full-Text Search
  // ===========================================================================

  /**
   * Search web sources using full-text search
   * TODO: Dispatch hub needs GET /api/websources/search?q=...
   */
  async search(query: string, options?: { locid?: string; limit?: number }): Promise<WebSourceSearchResult[]> {
    console.warn('ApiWebSourcesRepository.search: Not yet implemented in dispatch hub');
    return [];
  }

  // ===========================================================================
  // Statistics
  // ===========================================================================

  /**
   * Get overall statistics for web sources
   * TODO: Dispatch hub needs GET /api/websources/stats
   */
  async getStats(): Promise<WebSourceStats> {
    console.warn('ApiWebSourcesRepository.getStats: Not yet implemented in dispatch hub');
    return {
      total: 0,
      pending: 0,
      archiving: 0,
      complete: 0,
      partial: 0,
      failed: 0,
      total_images: 0,
      total_videos: 0,
      total_words: 0,
    };
  }

  /**
   * Get statistics for a specific location
   */
  async getStatsByLocation(locid: string): Promise<WebSourceStats> {
    console.warn('ApiWebSourcesRepository.getStatsByLocation: Not yet implemented');
    return this.getStats();
  }

  /**
   * Get total count
   */
  async count(): Promise<number> {
    return 0;
  }

  /**
   * Get count by location
   */
  async countByLocation(locid: string): Promise<number> {
    return 0;
  }

  /**
   * Get count by sub-location
   */
  async countBySubLocation(subid: string): Promise<number> {
    return 0;
  }

  // ===========================================================================
  // Image and Video Management
  // ===========================================================================

  /**
   * Get all images for a web source
   */
  async findImages(sourceId: string): Promise<WebSourceImage[]> {
    console.warn('ApiWebSourcesRepository.findImages: Not yet implemented');
    return [];
  }

  /**
   * Get all videos for a web source
   */
  async findVideos(sourceId: string): Promise<WebSourceVideo[]> {
    console.warn('ApiWebSourcesRepository.findVideos: Not yet implemented');
    return [];
  }

  /**
   * Insert image metadata for a web source
   */
  async insertImage(
    sourceId: string,
    imageIndex: number,
    data: {
      url: string;
      localPath?: string;
      hash?: string;
      width?: number;
      height?: number;
      alt?: string;
    }
  ): Promise<void> {
    console.warn('ApiWebSourcesRepository.insertImage: Not yet implemented');
  }

  /**
   * Insert video metadata for a web source
   */
  async insertVideo(
    sourceId: string,
    videoIndex: number,
    data: {
      url: string;
      localPath?: string;
      hash?: string;
      title?: string;
      duration?: number;
    }
  ): Promise<void> {
    console.warn('ApiWebSourcesRepository.insertVideo: Not yet implemented');
  }

  /**
   * Batch insert images with full metadata
   */
  async insertSourceImages(
    sourceId: string,
    images: Array<{
      url: string;
      localPath?: string;
      hash?: string;
      width?: number;
      height?: number;
      alt?: string;
    }>
  ): Promise<void> {
    console.warn('ApiWebSourcesRepository.insertSourceImages: Not yet implemented');
  }

  /**
   * Batch insert videos with full metadata
   */
  async insertSourceVideos(
    sourceId: string,
    videos: Array<{
      url: string;
      localPath?: string;
      hash?: string;
      title?: string;
      duration?: number;
    }>
  ): Promise<void> {
    console.warn('ApiWebSourcesRepository.insertSourceVideos: Not yet implemented');
  }

  /**
   * Delete all images for a source
   */
  async deleteImages(sourceId: string): Promise<void> {
    console.warn('ApiWebSourcesRepository.deleteImages: Not yet implemented');
  }

  /**
   * Delete all videos for a source
   */
  async deleteVideos(sourceId: string): Promise<void> {
    console.warn('ApiWebSourcesRepository.deleteVideos: Not yet implemented');
  }

  /**
   * Clear all media for a source
   */
  async clearSourceMedia(sourceId: string): Promise<void> {
    console.warn('ApiWebSourcesRepository.clearSourceMedia: Not yet implemented');
  }

  /**
   * Update page-level metadata fields
   */
  async updatePageMetadata(
    sourceId: string,
    data: {
      domain?: string;
      canonicalUrl?: string;
      language?: string;
    }
  ): Promise<void> {
    console.warn('ApiWebSourcesRepository.updatePageMetadata: Not yet implemented');
  }

  // ===========================================================================
  // Migration Helpers (Deprecated)
  // ===========================================================================

  /**
   * Migrate existing bookmarks to web sources
   * @deprecated Not needed for API version
   */
  async migrateFromBookmarks(): Promise<{ migrated: number; failed: number }> {
    console.log('ApiWebSourcesRepository.migrateFromBookmarks: No migration needed for API');
    return { migrated: 0, failed: 0 };
  }
}
