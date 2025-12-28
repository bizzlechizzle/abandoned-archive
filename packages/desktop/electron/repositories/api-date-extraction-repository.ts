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

/**
 * API-based date extraction repository
 *
 * NOTE: Date extraction data should be part of media records in dispatch
 */
export class ApiDateExtractionRepository {
  constructor(private readonly client: DispatchClient) {}

  /**
   * Store extracted dates for media
   */
  async storeExtractedDates(dates: ExtractedDate): Promise<void> {
    // Dates are stored as part of media record in dispatch
    // This would update the media's dateTaken, etc. fields
    try {
      await this.client.updateMedia(dates.media_hash, {
        dateTaken: dates.date_taken || undefined,
      } as any);
    } catch {
      console.warn('ApiDateExtractionRepository.storeExtractedDates: Failed to update');
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
    } catch {
      return null;
    }
  }

  /**
   * Get media without dates
   */
  async getMediaWithoutDates(locationId?: string): Promise<string[]> {
    // TODO: Dispatch hub needs query for media without dates
    console.warn('ApiDateExtractionRepository.getMediaWithoutDates: Not yet implemented');
    return [];
  }

  /**
   * Store inferred date
   */
  async storeInferredDate(inference: DateInference): Promise<void> {
    try {
      await this.client.updateMedia(inference.media_hash, {
        dateTaken: inference.inferred_date,
      } as any);
    } catch {
      console.warn('ApiDateExtractionRepository.storeInferredDate: Failed to update');
    }
  }

  /**
   * Get date range for location
   */
  async getDateRangeForLocation(locid: string): Promise<{ earliest: string | null; latest: string | null }> {
    // TODO: Dispatch hub needs date range aggregation
    console.warn('ApiDateExtractionRepository.getDateRangeForLocation: Not yet implemented');
    return { earliest: null, latest: null };
  }

  /**
   * Bulk extract dates from media
   */
  async bulkExtract(media_hashes: string[]): Promise<ExtractedDate[]> {
    // This would be a background job in dispatch
    console.warn('ApiDateExtractionRepository.bulkExtract: Use dispatch job system');
    return [];
  }
}
