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
 * NOTE: Location exclusions could be a boolean flag on the location
 * in dispatch's PostgreSQL schema
 */
export class ApiLocationExclusionsRepository {
  constructor(private readonly client: DispatchClient) {}

  /**
   * Exclude a location
   */
  async exclude(locid: string, reason?: string): Promise<void> {
    // TODO: Update location with hidden=true via dispatch
    console.warn('ApiLocationExclusionsRepository.exclude: Not yet implemented');
    throw new Error('Location exclusion not yet implemented');
  }

  /**
   * Include a previously excluded location
   */
  async include(locid: string): Promise<void> {
    // TODO: Update location with hidden=false via dispatch
    console.warn('ApiLocationExclusionsRepository.include: Not yet implemented');
    throw new Error('Location inclusion not yet implemented');
  }

  /**
   * Check if a location is excluded
   */
  async isExcluded(locid: string): Promise<boolean> {
    try {
      const location = await this.client.getLocation(locid);
      return (location as any).hidden || false;
    } catch {
      return false;
    }
  }

  /**
   * Get all excluded locations
   */
  async getExcluded(): Promise<LocationExclusion[]> {
    // TODO: Query locations where hidden=true
    console.warn('ApiLocationExclusionsRepository.getExcluded: Not yet implemented');
    return [];
  }

  /**
   * Get exclusion info for a location
   */
  async getExclusionInfo(locid: string): Promise<LocationExclusion | null> {
    console.warn('ApiLocationExclusionsRepository.getExclusionInfo: Not yet implemented');
    return null;
  }
}
