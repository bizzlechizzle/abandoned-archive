/**
 * API-based Location Views Repository
 *
 * Tracks view history for locations to show recently viewed
 * and most popular locations.
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
   */
  async getRecentlyViewed(limit: number = 10): Promise<LocationView[]> {
    try {
      const locations = await this.client.getRecentlyViewedLocations(limit);
      return locations.map((loc) => ({
        locid: loc.id,
        view_date: loc.lastViewedAt ?? new Date().toISOString(),
        locnam: loc.name,
        address_state: loc.addressState ?? undefined,
      }));
    } catch (error) {
      console.error('getRecentlyViewed failed:', error);
      return [];
    }
  }

  /**
   * Get most viewed locations
   */
  async getMostViewed(limit: number = 10): Promise<ViewStats[]> {
    try {
      const locations = await this.client.getMostViewedLocations(limit);
      return locations.map((loc) => ({
        locid: loc.id,
        view_count: loc.viewCount,
        last_viewed: loc.lastViewedAt ?? new Date().toISOString(),
        locnam: loc.name,
      }));
    } catch (error) {
      console.error('getMostViewed failed:', error);
      return [];
    }
  }

  /**
   * Get view history for a specific location
   * Note: Full history tracking would require additional hub endpoints
   */
  async getViewHistory(locid: string): Promise<LocationView[]> {
    try {
      const location = await this.client.getLocation(locid);
      if (location.lastViewedAt) {
        return [{
          locid: location.id,
          view_date: location.lastViewedAt,
          locnam: location.name,
          address_state: location.addressState ?? undefined,
        }];
      }
      return [];
    } catch {
      return [];
    }
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
   * Note: Would require additional hub endpoint to clear history
   */
  async clearHistory(): Promise<void> {
    console.warn('ApiLocationViewsRepository.clearHistory: Not implemented - would require hub endpoint');
  }
}
