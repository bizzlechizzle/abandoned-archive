/**
 * API-based Timeline Repository
 *
 * Timeline provides chronological view of media across all locations.
 * Requires dispatch hub to support timeline/aggregation queries.
 *
 * TODO: Dispatch hub needs timeline endpoints:
 * - GET /api/timeline?year=2024&month=6
 * - GET /api/timeline/years
 * - GET /api/timeline/stats
 */

import type { DispatchClient } from '@aa/services';

export interface TimelineEntry {
  date: string;
  locationId: string;
  locationName: string;
  sublocationId?: string;
  sublocationName?: string;
  mediaType: 'image' | 'video' | 'document' | 'map';
  mediaId: string;
  thumbPath?: string;
}

export interface TimelineMonth {
  year: number;
  month: number;
  count: number;
}

export interface TimelineFilters {
  locationId?: string;
  sublocationId?: string;
  mediaType?: 'image' | 'video' | 'document' | 'map';
  startDate?: string;
  endDate?: string;
}

/**
 * API-based timeline repository
 *
 * NOTE: Dispatch hub does not yet have timeline endpoints.
 * Timeline queries require aggregation across media table.
 */
export class ApiTimelineRepository {
  constructor(private readonly client: DispatchClient) {}

  /**
   * Get timeline entries for a date range
   */
  async getEntries(filters?: TimelineFilters): Promise<TimelineEntry[]> {
    // TODO: Dispatch hub needs GET /api/timeline
    console.warn('ApiTimelineRepository.getEntries: Not yet implemented in dispatch hub');
    return [];
  }

  /**
   * Get entries for a specific year/month
   */
  async getEntriesForMonth(year: number, month: number, filters?: TimelineFilters): Promise<TimelineEntry[]> {
    // TODO: Dispatch hub needs GET /api/timeline?year=X&month=Y
    console.warn('ApiTimelineRepository.getEntriesForMonth: Not yet implemented');
    return [];
  }

  /**
   * Get list of years that have media
   */
  async getYearsWithMedia(): Promise<number[]> {
    // TODO: Dispatch hub needs GET /api/timeline/years
    console.warn('ApiTimelineRepository.getYearsWithMedia: Not yet implemented');
    return [];
  }

  /**
   * Get months with media for a specific year
   */
  async getMonthsWithMedia(year: number): Promise<TimelineMonth[]> {
    // TODO: Dispatch hub needs timeline stats endpoint
    console.warn('ApiTimelineRepository.getMonthsWithMedia: Not yet implemented');
    return [];
  }

  /**
   * Get count of media by date
   */
  async getMediaCountByDate(startDate: string, endDate: string): Promise<Map<string, number>> {
    // TODO: Dispatch hub needs timeline aggregation
    console.warn('ApiTimelineRepository.getMediaCountByDate: Not yet implemented');
    return new Map();
  }

  /**
   * Get earliest and latest media dates
   */
  async getDateRange(): Promise<{ earliest: string | null; latest: string | null }> {
    // TODO: Dispatch hub needs GET /api/media/date-range
    console.warn('ApiTimelineRepository.getDateRange: Not yet implemented');
    return { earliest: null, latest: null };
  }

  /**
   * Get media for a specific date
   */
  async getMediaForDate(date: string): Promise<TimelineEntry[]> {
    // TODO: Dispatch hub needs date-specific media query
    console.warn('ApiTimelineRepository.getMediaForDate: Not yet implemented');
    return [];
  }
}
