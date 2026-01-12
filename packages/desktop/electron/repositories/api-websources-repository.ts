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
   */
  async create(input: WebSourceInput): Promise<WebSource> {
    const apiSource = await this.client.createWebSource({
      url: input.url,
      title: input.title ?? undefined,
      locationId: input.locid ?? undefined,
      sublocationId: input.subid ?? undefined,
      sourceType: input.source_type,
      notes: input.notes ?? undefined,
    });
    return this.mapApiToLocal(apiSource);
  }

  /**
   * Find a web source by ID
   */
  async findById(source_id: string): Promise<WebSource> {
    const apiSource = await this.client.getWebSource(source_id);
    return this.mapApiToLocal(apiSource);
  }

  /**
   * Find a web source by URL
   */
  async findByUrl(url: string): Promise<WebSource | null> {
    const apiSource = await this.client.getWebSourceByUrl(url);
    return apiSource ? this.mapApiToLocal(apiSource) : null;
  }

  /**
   * Find all web sources for a specific location
   */
  async findByLocation(locid: string): Promise<WebSource[]> {
    const result = await this.client.getWebSourcesByLocation(locid);
    return result.sources.map(s => this.mapApiToLocal(s));
  }

  /**
   * Find all web sources for a specific sub-location
   */
  async findBySubLocation(subid: string): Promise<WebSource[]> {
    // Dispatch hub doesn't have sublocation filter, fetch by location and filter client-side
    const result = await this.client.getWebSources({ limit: 1000 });
    return result.sources.filter(s => s.sublocationId === subid).map(s => this.mapApiToLocal(s));
  }

  /**
   * Find web sources by status
   */
  async findByStatus(status: WebSourceStatus): Promise<WebSource[]> {
    const result = await this.client.getWebSources({ status, limit: 1000 });
    return result.sources.map(s => this.mapApiToLocal(s));
  }

  /**
   * Find pending sources ready for archiving
   */
  async findPendingForArchive(limit: number = 10): Promise<WebSource[]> {
    const result = await this.client.getWebSources({ status: 'pending', limit });
    return result.sources.map(s => this.mapApiToLocal(s));
  }

  /**
   * Find recently added sources
   */
  async findRecent(limit: number = 10): Promise<WebSource[]> {
    const result = await this.client.getWebSources({ limit });
    return result.sources.map(s => this.mapApiToLocal(s));
  }

  /**
   * Find all web sources
   */
  async findAll(): Promise<WebSource[]> {
    const result = await this.client.getWebSources({ limit: 1000 });
    return result.sources.map(s => this.mapApiToLocal(s));
  }

  /**
   * Update a web source
   */
  async update(source_id: string, updates: WebSourceUpdate): Promise<WebSource> {
    const apiSource = await this.client.updateWebSource(source_id, {
      title: updates.title ?? undefined,
      locationId: updates.locid ?? undefined,
      sublocationId: updates.subid ?? undefined,
      sourceType: updates.source_type,
      notes: updates.notes ?? undefined,
      status: updates.status,
      extractedTitle: updates.extracted_title ?? undefined,
      extractedAuthor: updates.extracted_author ?? undefined,
      extractedDate: updates.extracted_date ?? undefined,
      extractedPublisher: updates.extracted_publisher ?? undefined,
      extractedText: updates.extracted_text ?? undefined,
      wordCount: updates.word_count,
      imageCount: updates.image_count,
      videoCount: updates.video_count,
      archivePath: updates.archive_path ?? undefined,
      screenshotPath: updates.screenshot_path ?? undefined,
      pdfPath: updates.pdf_path ?? undefined,
      htmlPath: updates.html_path ?? undefined,
      warcPath: updates.warc_path ?? undefined,
      archiveError: updates.archive_error ?? undefined,
      domain: updates.domain ?? undefined,
      canonicalUrl: updates.canonical_url ?? undefined,
      language: updates.language ?? undefined,
    });
    return this.mapApiToLocal(apiSource);
  }

  /**
   * Delete a web source
   */
  async delete(source_id: string): Promise<void> {
    await this.client.deleteWebSource(source_id);
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
    const apiVersion = await this.client.createWebSourceVersion(source_id, {
      archivePath: options.archive_path,
      screenshotPath: options.screenshot_path ?? undefined,
      pdfPath: options.pdf_path ?? undefined,
      htmlPath: options.html_path ?? undefined,
      contentHash: options.content_hash ?? undefined,
      wordCount: options.word_count,
    });
    return this.mapApiVersionToLocal(apiVersion);
  }

  /**
   * Find all versions for a web source
   */
  async findVersions(source_id: string): Promise<WebSourceVersion[]> {
    const result = await this.client.getWebSourceVersions(source_id);
    return result.versions.map((v) => this.mapApiVersionToLocal(v));
  }

  /**
   * Find a specific version by number
   */
  async findVersionByNumber(source_id: string, version_number: number): Promise<WebSourceVersion | null> {
    const apiVersion = await this.client.getWebSourceVersion(source_id, version_number);
    return apiVersion ? this.mapApiVersionToLocal(apiVersion) : null;
  }

  /**
   * Get latest version for a web source
   */
  async findLatestVersion(source_id: string): Promise<WebSourceVersion | null> {
    const result = await this.client.getWebSourceVersions(source_id);
    if (result.versions.length === 0) return null;
    // Versions are sorted by version number descending
    return this.mapApiVersionToLocal(result.versions[0]);
  }

  /**
   * Get version count for a web source
   */
  async countVersions(source_id: string): Promise<number> {
    const result = await this.client.getWebSourceVersions(source_id);
    return result.versions.length;
  }

  // ===========================================================================
  // Full-Text Search
  // ===========================================================================

  /**
   * Search web sources using full-text search
   */
  async search(query: string, options?: { locid?: string; limit?: number }): Promise<WebSourceSearchResult[]> {
    const result = await this.client.searchWebSources(query, {
      locationId: options?.locid,
      limit: options?.limit,
    });
    return result.results.map((r) => ({
      source_id: r.id,
      url: r.url,
      title: r.title,
      locid: r.locationId,
      snippet: r.snippet,
      rank: 1, // API doesn't return rank
    }));
  }

  /**
   * Map API version to local format
   */
  private mapApiVersionToLocal(apiVersion: {
    id: string;
    sourceId: string;
    versionNumber: number;
    archivedAt: string;
    archivePath?: string;
    screenshotPath?: string;
    pdfPath?: string;
    htmlPath?: string;
    warcPath?: string;
    wordCount?: number;
    imageCount?: number;
    videoCount?: number;
    contentHash?: string;
    contentChanged?: boolean;
    diffSummary?: string;
  }): WebSourceVersion {
    return {
      version_id: apiVersion.id,
      source_id: apiVersion.sourceId,
      version_number: apiVersion.versionNumber,
      archived_at: apiVersion.archivedAt,
      archive_path: apiVersion.archivePath || null,
      screenshot_path: apiVersion.screenshotPath || null,
      pdf_path: apiVersion.pdfPath || null,
      html_path: apiVersion.htmlPath || null,
      warc_path: apiVersion.warcPath || null,
      word_count: apiVersion.wordCount ?? null,
      image_count: apiVersion.imageCount ?? null,
      video_count: apiVersion.videoCount ?? null,
      content_hash: apiVersion.contentHash || null,
      content_changed: apiVersion.contentChanged ?? false,
      diff_summary: apiVersion.diffSummary || null,
    };
  }

  // ===========================================================================
  // Statistics
  // ===========================================================================

  /**
   * Get overall statistics for web sources
   */
  async getStats(): Promise<WebSourceStats> {
    const stats = await this.client.getWebSourceStats();
    return {
      total: stats.total,
      pending: stats.pending,
      archiving: 0, // Not tracked by dispatch
      complete: stats.complete,
      partial: 0, // Not tracked by dispatch
      failed: stats.failed,
      total_images: stats.totalImages,
      total_videos: 0, // Not tracked by dispatch
      total_words: stats.totalWords,
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

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Map API web source to local format
   */
  private mapApiToLocal(apiSource: {
    id: string;
    url: string;
    title?: string;
    locationId?: string;
    sublocationId?: string;
    sourceType: string;
    notes?: string;
    status: string;
    extractedTitle?: string;
    extractedAuthor?: string;
    extractedDate?: string;
    extractedPublisher?: string;
    extractedText?: string;
    wordCount?: number;
    imageCount?: number;
    videoCount?: number;
    archivePath?: string;
    screenshotPath?: string;
    pdfPath?: string;
    htmlPath?: string;
    warcPath?: string;
    screenshotHash?: string;
    pdfHash?: string;
    htmlHash?: string;
    warcHash?: string;
    contentHash?: string;
    archiveError?: string;
    retryCount?: number;
    createdAt: string;
    archivedAt?: string;
    domain?: string;
    canonicalUrl?: string;
    language?: string;
  }): WebSource {
    return {
      source_id: apiSource.id,
      url: apiSource.url,
      title: apiSource.title || null,
      locid: apiSource.locationId || null,
      subid: apiSource.sublocationId || null,
      source_type: (apiSource.sourceType as WebSourceType) || 'article',
      notes: apiSource.notes || null,
      status: (apiSource.status as WebSourceStatus) || 'pending',
      component_status: null,
      extracted_title: apiSource.extractedTitle || null,
      extracted_author: apiSource.extractedAuthor || null,
      extracted_date: apiSource.extractedDate || null,
      extracted_publisher: apiSource.extractedPublisher || null,
      extracted_text: apiSource.extractedText || null,
      word_count: apiSource.wordCount || 0,
      image_count: apiSource.imageCount || 0,
      video_count: apiSource.videoCount || 0,
      archive_path: apiSource.archivePath || null,
      screenshot_path: apiSource.screenshotPath || null,
      pdf_path: apiSource.pdfPath || null,
      html_path: apiSource.htmlPath || null,
      warc_path: apiSource.warcPath || null,
      screenshot_hash: apiSource.screenshotHash || null,
      pdf_hash: apiSource.pdfHash || null,
      html_hash: apiSource.htmlHash || null,
      warc_hash: apiSource.warcHash || null,
      content_hash: apiSource.contentHash || null,
      provenance_hash: null,
      archive_error: apiSource.archiveError || null,
      retry_count: apiSource.retryCount || 0,
      created_at: apiSource.createdAt,
      archived_at: apiSource.archivedAt || null,
      auth_imp: null,
      domain: apiSource.domain || null,
      canonical_url: apiSource.canonicalUrl || null,
      language: apiSource.language || null,
    };
  }
}
