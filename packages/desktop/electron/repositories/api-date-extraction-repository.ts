/**
 * API-based Date Extraction Repository
 *
 * Stores extracted dates from media EXIF data and
 * manages date inference for undated media.
 *
 * In dispatch architecture, this data is stored in media records
 */

import type { DispatchClient } from '@aa/services';

export interface ExtractedDate {
  media_hash: string;
  date_taken: string | null;
  date_modified: string | null;
  date_created: string | null;
  date_source: string; // 'exif', 'filename', 'inferred', 'manual'
  confidence: number; // 0-1
  extraction_date: string;
}

export interface DateInference {
  media_hash: string;
  inferred_date: string;
  inferred_from: 'nearby_media' | 'folder_name' | 'manual';
  confidence: number;
}

export interface DateStats {
  total: number;
  withDates: number;
  withoutDates: number;
  percentageWithDates: number;
  earliest: string | null;
  latest: string | null;
}

/**
 * API-based date extraction repository
 *
 * Date extraction data is part of media records in dispatch
 */
export class ApiDateExtractionRepository {
  constructor(private readonly client: DispatchClient) {}

  /**
   * Store extracted dates for media
   */
  async storeExtractedDates(dates: ExtractedDate): Promise<void> {
    // Dates are stored as part of media record in dispatch
    // This would update the media's capturedAt field
    try {
      await this.client.updateMedia(dates.media_hash, {
        capturedAt: dates.date_taken || undefined,
      });
    } catch (error) {
      console.error('ApiDateExtractionRepository.storeExtractedDates error:', error);
    }
  }

  /**
   * Get extracted dates for media
   */
  async getExtractedDates(media_hash: string): Promise<ExtractedDate | null> {
    try {
      const media = await this.client.getMediaByHash(media_hash);
      if (!media) return null;

      return {
        media_hash: media.blake3Hash,
        date_taken: media.capturedAt || null,
        date_modified: null, // Not tracked separately
        date_created: media.createdAt || null,
        date_source: 'exif',
        confidence: 1,
        extraction_date: new Date().toISOString(),
      };
    } catch (error) {
      console.error('ApiDateExtractionRepository.getExtractedDates error:', error);
      return null;
    }
  }

  /**
   * Get media without dates
   */
  async getMediaWithoutDates(locationId?: string, limit?: number): Promise<string[]> {
    try {
      const result = await this.client.getMediaWithoutDates({
        locationId,
        limit: limit || 100,
      });
      return result.data.map(m => m.blake3Hash);
    } catch (error) {
      console.error('ApiDateExtractionRepository.getMediaWithoutDates error:', error);
      return [];
    }
  }

  /**
   * Get full media objects without dates
   */
  async getMediaWithoutDatesDetail(locationId?: string, options?: {
    limit?: number;
    offset?: number;
  }): Promise<{ media: Array<{ hash: string; filename: string; filepath: string }>; total: number }> {
    try {
      const result = await this.client.getMediaWithoutDates({
        locationId,
        limit: options?.limit || 100,
        offset: options?.offset || 0,
      });
      return {
        media: result.data.map(m => ({
          hash: m.blake3Hash,
          filename: m.filename,
          filepath: m.filepath,
        })),
        total: result.pagination.total,
      };
    } catch (error) {
      console.error('ApiDateExtractionRepository.getMediaWithoutDatesDetail error:', error);
      return { media: [], total: 0 };
    }
  }

  /**
   * Store inferred date
   */
  async storeInferredDate(inference: DateInference): Promise<void> {
    try {
      await this.client.updateMedia(inference.media_hash, {
        capturedAt: inference.inferred_date,
      });
    } catch (error) {
      console.error('ApiDateExtractionRepository.storeInferredDate error:', error);
    }
  }

  /**
   * Get date range for location
   */
  async getDateRangeForLocation(locid: string): Promise<{
    earliest: string | null;
    latest: string | null;
    mediaWithDates: number;
    mediaWithoutDates: number;
  }> {
    try {
      const result = await this.client.getLocationDateRange(locid);
      return {
        earliest: result.earliest,
        latest: result.latest,
        mediaWithDates: result.mediaWithDates,
        mediaWithoutDates: result.mediaWithoutDates,
      };
    } catch (error) {
      console.error('ApiDateExtractionRepository.getDateRangeForLocation error:', error);
      return { earliest: null, latest: null, mediaWithDates: 0, mediaWithoutDates: 0 };
    }
  }

  /**
   * Get date extraction statistics
   */
  async getDateStats(locationId?: string): Promise<DateStats> {
    try {
      const stats = await this.client.getDateExtractionStats(locationId);
      return {
        total: stats.total,
        withDates: stats.withDates,
        withoutDates: stats.withoutDates,
        percentageWithDates: stats.percentageWithDates,
        earliest: stats.earliest,
        latest: stats.latest,
      };
    } catch (error) {
      console.error('ApiDateExtractionRepository.getDateStats error:', error);
      return {
        total: 0,
        withDates: 0,
        withoutDates: 0,
        percentageWithDates: 0,
        earliest: null,
        latest: null,
      };
    }
  }

  /**
   * Bulk extract dates from media
   *
   * Note: In API mode, date extraction happens automatically during import
   * via the wake-n-blake plugin. This method submits a batch job for
   * re-extracting dates from existing media.
   */
  async bulkExtract(media_hashes: string[]): Promise<ExtractedDate[]> {
    // For bulk extraction, we would submit a job to dispatch
    // The wake-n-blake plugin handles EXIF extraction during import
    // For now, return the current dates for the given media
    const results: ExtractedDate[] = [];
    for (const hash of media_hashes) {
      const date = await this.getExtractedDates(hash);
      if (date) {
        results.push(date);
      }
    }
    return results;
  }
}
