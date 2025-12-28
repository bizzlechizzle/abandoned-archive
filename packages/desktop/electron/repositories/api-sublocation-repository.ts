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
   * Note: API currently only supports create/delete, not update
   * This is a gap that needs to be addressed in dispatch hub
   */
  async update(subid: string, input: UpdateSubLocationInput): Promise<SubLocation | null> {
    // TODO: Dispatch hub needs PUT /api/locations/:id/sublocations/:subid endpoint
    console.warn('ApiSublocationRepository.update: Not yet implemented in dispatch hub');
    throw new Error('Sublocation update not yet supported via API');
  }

  /**
   * Delete a sub-location
   */
  async delete(locid: string, subid: string): Promise<void> {
    await this.client.deleteSublocation(locid, subid);
  }

  /**
   * Update GPS coordinates for a sub-location
   * Note: API needs to be extended for this
   */
  async updateGps(subid: string, gps: SubLocationGpsInput): Promise<SubLocation | null> {
    // TODO: Dispatch hub needs GPS update endpoint for sublocations
    console.warn('ApiSublocationRepository.updateGps: Not yet implemented in dispatch hub');
    throw new Error('Sublocation GPS update not yet supported via API');
  }

  /**
   * Set a sub-location as primary for its parent location
   */
  async setPrimary(locid: string, subid: string): Promise<void> {
    // TODO: Dispatch hub needs set-primary endpoint
    console.warn('ApiSublocationRepository.setPrimary: Not yet implemented in dispatch hub');
    throw new Error('Set primary sublocation not yet supported via API');
  }

  /**
   * Count sub-locations for a location
   */
  async countByLocationId(locid: string): Promise<number> {
    const subs = await this.findByLocationId(locid);
    return subs.length;
  }

  /**
   * Get sub-location with media counts
   * Note: Stats would need to come from dispatch hub
   */
  async getWithMediaCounts(subid: string): Promise<SubLocation | null> {
    // TODO: Dispatch hub needs stats endpoint for sublocations
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
      category: null, // Not in API yet
      class: null, // Not in API yet
      status: null, // Not in API yet
      hero_imghash: null, // Not in API yet
      hero_focal_x: 0.5,
      hero_focal_y: 0.5,
      is_primary: false, // Not in API yet
      created_date: api.createdAt ?? new Date().toISOString(),
      created_by: null,
      modified_date: api.createdAt ?? null, // Use createdAt - updatedAt not in API
      modified_by: null,
      gps_lat: null, // Not in API yet
      gps_lng: null,
      gps_accuracy: null,
      gps_source: null,
      gps_verified_on_map: false,
      gps_captured_at: null,
      akanam: null, // Not in API yet
    };
  }
}
