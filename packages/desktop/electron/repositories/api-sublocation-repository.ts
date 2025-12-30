/**
 * API-based Sublocation Repository
 *
 * Implements sublocation operations using dispatch hub API
 * instead of local SQLite database. All data flows through the
 * central hub to PostgreSQL.
 */

import type { DispatchClient } from '@aa/services';
import type { Sublocation } from '@aa/services';

/**
 * SubLocation entity for application use
 * Maps from API Sublocation to local format
 */
export interface SubLocation {
  subid: string;
  locid: string;
  subnam: string;
  ssubname: string | null;
  category: string | null;
  class: string | null;
  status: string | null;
  hero_imghash: string | null;
  hero_focal_x: number;
  hero_focal_y: number;
  is_primary: boolean;
  created_date: string;
  created_by: string | null;
  modified_date: string | null;
  modified_by: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  gps_accuracy: number | null;
  gps_source: string | null;
  gps_verified_on_map: boolean;
  gps_captured_at: string | null;
  akanam: string | null;
}

/**
 * GPS data for updating sub-location coordinates
 */
export interface SubLocationGpsInput {
  lat: number;
  lng: number;
  accuracy?: number | null;
  source: string;
}

/**
 * Input for creating a new sub-location
 */
export interface CreateSubLocationInput {
  locid: string;
  subnam: string;
  ssubname?: string | null;
  category?: string | null;
  class?: string | null;
  status?: string | null;
  is_primary?: boolean;
  created_by?: string | null;
}

/**
 * Input for updating a sub-location
 */
export interface UpdateSubLocationInput {
  subnam?: string;
  ssubname?: string | null;
  category?: string | null;
  class?: string | null;
  status?: string | null;
  hero_imghash?: string | null;
  hero_focal_x?: number;
  hero_focal_y?: number;
  is_primary?: boolean;
  modified_by?: string | null;
  akanam?: string | null;
}

/**
 * API-based sublocation repository
 */
export class ApiSublocationRepository {
  constructor(private readonly client: DispatchClient) {}

  /**
   * Create a new sub-location
   */
  async create(input: CreateSubLocationInput): Promise<SubLocation> {
    const result = await this.client.createSublocation(input.locid, {
      name: input.subnam,
      shortName: input.ssubname ?? undefined,
    });
    return this.mapApiToLocal(result, input.locid);
  }

  /**
   * Find sub-location by ID
   */
  async findById(subid: string): Promise<SubLocation | null> {
    // API doesn't have direct sublocation lookup, need to search
    // This is a limitation - we'd need to know the location ID
    // For now, return null - the IPC handler should use findByLocationId
    console.warn('ApiSublocationRepository.findById: Direct lookup not supported, use findByLocationId');
    return null;
  }

  /**
   * Find all sub-locations for a parent location
   */
  async findByLocationId(locid: string): Promise<SubLocation[]> {
    const results = await this.client.getSublocations(locid);
    return results.map((s) => this.mapApiToLocal(s, locid));
  }

  /**
   * Update a sub-location
   */
  async update(locid: string, subid: string, input: UpdateSubLocationInput): Promise<SubLocation | null> {
    try {
      const result = await this.client.updateSublocation(locid, subid, {
        name: input.subnam,
        shortName: input.ssubname ?? undefined,
      });
      return this.mapApiToLocal(result, locid);
    } catch (error) {
      console.error('ApiSublocationRepository.update failed:', error);
      return null;
    }
  }

  /**
   * Delete a sub-location
   */
  async delete(locid: string, subid: string): Promise<void> {
    await this.client.deleteSublocation(locid, subid);
  }

  /**
   * Update GPS coordinates for a sub-location
   */
  async updateGps(locid: string, subid: string, gps: SubLocationGpsInput): Promise<SubLocation | null> {
    try {
      const result = await this.client.updateSublocationGps(locid, subid, {
        lat: gps.lat,
        lng: gps.lng,
        accuracy: gps.accuracy ?? undefined,
        source: gps.source,
      });
      return this.mapApiToLocal(result, locid);
    } catch (error) {
      console.error('ApiSublocationRepository.updateGps failed:', error);
      return null;
    }
  }

  /**
   * Set a sub-location as primary for its parent location
   */
  async setPrimary(locid: string, subid: string): Promise<void> {
    await this.client.setSublocationPrimary(locid, subid);
  }

  /**
   * Count sub-locations for a location
   */
  async countByLocationId(locid: string): Promise<number> {
    const subs = await this.findByLocationId(locid);
    return subs.length;
  }

  /**
   * Get sublocation stats for a location
   */
  async getStats(locid: string): Promise<{ count: number; withGps: number; withMedia: number }> {
    return this.client.getSublocationStats(locid);
  }

  /**
   * Get sub-location with media counts
   */
  async getWithMediaCounts(subid: string): Promise<SubLocation | null> {
    return this.findById(subid);
  }

  /**
   * Map API Sublocation to local SubLocation format
   */
  private mapApiToLocal(api: Sublocation, locid: string): SubLocation {
    return {
      subid: api.id,
      locid: locid,
      subnam: api.name,
      ssubname: api.shortName ?? null,
      category: null,
      class: null,
      status: null,
      hero_imghash: null,
      hero_focal_x: 0.5,
      hero_focal_y: 0.5,
      is_primary: api.isPrimary ?? false,
      created_date: api.createdAt ?? new Date().toISOString(),
      created_by: null,
      modified_date: api.updatedAt ?? null,
      modified_by: null,
      gps_lat: api.gpsLat ?? null,
      gps_lng: api.gpsLon ?? null,
      gps_accuracy: api.gpsAccuracy ?? null,
      gps_source: api.gpsSource ?? null,
      gps_verified_on_map: false,
      gps_captured_at: null,
      akanam: null,
    };
  }
}
