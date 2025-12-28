/**
 * API-based Location Views Repository
 *
 * Tracks view history for locations to show recently viewed
 * and most popular locations.
 *
 * In dispatch, view tracking uses recordLocationView()
 */

import type { DispatchClient } from '@aa/services';

export interface LocationView {
  locid: string;
  view_date: string;
  locnam?: string;
  address_state?: string;
}

export interface ViewStats {
  locid: string;
  view_count: number;
  last_viewed: string;
  locnam?: string;
}

/**
 * API-based location views repository
 */
export class ApiLocationViewsRepository {
  constructor(private readonly client: DispatchClient) {}

  /**
   * Record a view for a location
   */
  async recordView(locid: string): Promise<void> {
    await this.client.recordLocationView(locid);
  }

  /**
   * Get recently viewed locations
   * TODO: Dispatch hub needs GET /api/locations/recent-views
   */
  async getRecentlyViewed(limit: number = 10): Promise<LocationView[]> {
    console.warn('ApiLocationViewsRepository.getRecentlyViewed: Not yet implemented');
    return [];
  }

  /**
   * Get most viewed locations
   * TODO: Dispatch hub needs GET /api/locations/most-viewed
   */
  async getMostViewed(limit: number = 10): Promise<ViewStats[]> {
    console.warn('ApiLocationViewsRepository.getMostViewed: Not yet implemented');
    return [];
  }

  /**
   * Get view history for a specific location
   */
  async getViewHistory(locid: string): Promise<LocationView[]> {
    console.warn('ApiLocationViewsRepository.getViewHistory: Not yet implemented');
    return [];
  }

  /**
   * Get view count for a location
   */
  async getViewCount(locid: string): Promise<number> {
    try {
      const location = await this.client.getLocation(locid);
      return location.viewCount || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Clear view history
   */
  async clearHistory(): Promise<void> {
    console.warn('ApiLocationViewsRepository.clearHistory: Not yet implemented');
  }
}
