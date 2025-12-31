/**
 * API-based Location Exclusions Repository
 *
 * Manages excluded/hidden locations that shouldn't appear
 * in normal search results.
 *
 * In dispatch, this could be a hidden flag on locations
 */

import type { DispatchClient } from '@aa/services';

export interface LocationExclusion {
  locid: string;
  excluded_date: string;
  reason?: string;
  excluded_by?: string;
}

/**
 * API-based location exclusions repository
 *
 * Uses the hidden flag on locations in dispatch's PostgreSQL schema
 */
export class ApiLocationExclusionsRepository {
  constructor(private readonly client: DispatchClient) {}

  /**
   * Exclude a location
   */
  async exclude(locid: string, reason?: string): Promise<void> {
    await this.client.setLocationHidden(locid, true, reason);
  }

  /**
   * Include a previously excluded location
   */
  async include(locid: string): Promise<void> {
    await this.client.setLocationHidden(locid, false);
  }

  /**
   * Check if a location is excluded
   */
  async isExcluded(locid: string): Promise<boolean> {
    try {
      const location = await this.client.getLocation(locid);
      return (location as any).isHidden || false;
    } catch {
      return false;
    }
  }

  /**
   * Get all excluded locations
   */
  async getExcluded(): Promise<LocationExclusion[]> {
    const hidden = await this.client.getHiddenLocations({ limit: 1000 });
    return hidden.map((loc) => ({
      locid: loc.id,
      excluded_date: new Date().toISOString(), // Not tracked by API
      reason: loc.hiddenReason ?? undefined,
      excluded_by: undefined,
    }));
  }

  /**
   * Get exclusion info for a location
   */
  async getExclusionInfo(locid: string): Promise<LocationExclusion | null> {
    try {
      const location = await this.client.getLocation(locid);
      if ((location as any).isHidden) {
        return {
          locid: location.id,
          excluded_date: new Date().toISOString(),
          reason: (location as any).hiddenReason ?? undefined,
          excluded_by: undefined,
        };
      }
      return null;
    } catch {
      return null;
    }
  }
}
