/**
 * API-based Location Repository
 *
 * Implements LocationRepository interface using dispatch hub API
 * instead of local SQLite database. All data flows through the
 * central hub to PostgreSQL.
 */

import type { DispatchClient } from '@aa/services';
import type {
  ApiLocation,
  ApiCreateLocationInput,
  ApiLocationFilters,
} from '@aa/services';
import type { LocationRepository, LocationFilters } from '@aa/core';
import type { Location, LocationInput, GPSCoordinates, Address } from '@aa/core';

export class ApiLocationRepository implements LocationRepository {
  constructor(private readonly client: DispatchClient) {}

  async create(input: LocationInput): Promise<Location> {
    const apiInput = this.mapInputToApi(input);
    const result = await this.client.createLocation(apiInput);
    return this.mapApiToLocal(result);
  }

  async findById(id: string): Promise<Location | null> {
    try {
      const result = await this.client.getLocation(id);
      return this.mapApiToLocal(result);
    } catch {
      return null;
    }
  }

  async findAll(filters?: LocationFilters): Promise<Location[]> {
    const apiFilters = this.mapFiltersToApi(filters);
    const result = await this.client.getLocations(apiFilters);
    return result.data.map((loc) => this.mapApiToLocal(loc));
  }

  async update(id: string, input: Partial<LocationInput>): Promise<Location> {
    const apiInput = this.mapInputToApi(input as LocationInput);
    const result = await this.client.updateLocation(id, apiInput);
    return this.mapApiToLocal(result);
  }

  async delete(id: string): Promise<void> {
    await this.client.deleteLocation(id);
  }

  async count(filters?: LocationFilters): Promise<number> {
    const apiFilters = this.mapFiltersToApi(filters);
    const result = await this.client.getLocations({ ...apiFilters, limit: 1 });
    return result.pagination.total;
  }

  // Extended methods not in base interface but used by the app

  async findNearby(
    lat: number,
    lon: number,
    radiusKm: number = 50,
    limit: number = 20
  ): Promise<Array<Location & { distance: number }>> {
    const results = await this.client.getNearbyLocations(lat, lon, radiusKm, limit);
    return results.map((loc) => ({
      ...this.mapApiToLocal(loc),
      distance: loc.distance,
    }));
  }

  async getBounds(filters?: LocationFilters): Promise<{
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
    count: number;
  }> {
    return this.client.getLocationBounds(this.mapFiltersToApi(filters));
  }

  async getFilterOptions(): Promise<{
    states: string[];
    cities: string[];
    categories: string[];
    classes: string[];
  }> {
    return this.client.getLocationFilterOptions();
  }

  async recordView(id: string): Promise<void> {
    await this.client.recordLocationView(id);
  }

  // Sublocation methods

  async getSublocations(locationId: string): Promise<Array<{ id: string; name: string; shortName?: string }>> {
    const subs = await this.client.getSublocations(locationId);
    return subs.map((s) => ({
      id: s.id,
      name: s.name,
      shortName: s.shortName,
    }));
  }

  async createSublocation(
    locationId: string,
    data: { name: string; shortName?: string }
  ): Promise<{ id: string; name: string; shortName?: string }> {
    const result = await this.client.createSublocation(locationId, data);
    return {
      id: result.id,
      name: result.name,
      shortName: result.shortName,
    };
  }

  async deleteSublocation(locationId: string, sublocationId: string): Promise<void> {
    await this.client.deleteSublocation(locationId, sublocationId);
  }

  // Note methods

  async getNotes(locationId: string): Promise<Array<{ id: string; noteText: string; noteType: string; createdAt: string }>> {
    const notes = await this.client.getLocationNotes(locationId);
    return notes.map((n) => ({
      id: n.id,
      noteText: n.noteText,
      noteType: n.noteType,
      createdAt: n.createdAt,
    }));
  }

  async createNote(
    locationId: string,
    data: { noteText: string; noteType?: string }
  ): Promise<{ id: string; noteText: string; noteType: string; createdAt: string }> {
    const result = await this.client.createLocationNote(locationId, data);
    return {
      id: result.id,
      noteText: result.noteText,
      noteType: result.noteType,
      createdAt: result.createdAt,
    };
  }

  async deleteNote(locationId: string, noteId: string): Promise<void> {
    await this.client.deleteLocationNote(locationId, noteId);
  }

  // Private mapping methods

  private mapFiltersToApi(filters?: LocationFilters): ApiLocationFilters | undefined {
    if (!filters) return undefined;

    return {
      search: filters.search,
      status: filters.access as 'active' | 'demolished' | 'restricted' | 'unknown' | undefined,
      state: filters.state,
      city: undefined,
      category: filters.category,
      favorite: filters.favorite,
      project: filters.project,
      historic: filters.historic,
      limit: filters.limit,
      offset: undefined,
    };
  }

  private mapInputToApi(input: LocationInput): ApiCreateLocationInput {
    return {
      name: input.locnam,
      shortName: input.slocnam,
      akaName: input.akanam,
      category: input.category,
      class: input.class,
      gps: input.gps
        ? {
            lat: input.gps.lat,
            lng: input.gps.lng,
            accuracy: input.gps.accuracy,
            source: input.gps.source,
            verifiedOnMap: input.gps.verifiedOnMap,
          }
        : undefined,
      address: input.address
        ? {
            street: input.address.street,
            city: input.address.city,
            county: input.address.county,
            state: input.address.state,
            zipcode: input.address.zipcode,
          }
        : undefined,
      status: input.access as 'active' | 'demolished' | 'restricted' | 'unknown' | undefined,
      access: input.access,
      documentation: input.documentation,
      historic: input.historic,
      favorite: input.favorite,
      project: input.project,
      builtYear: input.builtYear ? parseInt(input.builtYear, 10) : undefined,
      builtType: input.builtType,
      abandonedYear: input.abandonedYear ? parseInt(input.abandonedYear, 10) : undefined,
      abandonedType: input.abandonedType,
    };
  }

  private mapApiToLocal(api: ApiLocation): Location {
    const gps: GPSCoordinates | undefined =
      api.gpsLat !== undefined && api.gpsLon !== undefined
        ? {
            lat: api.gpsLat!,
            lng: api.gpsLon!,
            accuracy: api.gpsAccuracy,
            source: (api.gpsSource as GPSCoordinates['source']) || 'manual',
            verifiedOnMap: api.gpsVerifiedOnMap || false,
          }
        : undefined;

    const address: Address | undefined =
      api.addressStreet || api.addressCity || api.addressState
        ? {
            verified: false,
            street: api.addressStreet,
            city: api.addressCity,
            state: api.addressState,
            zipcode: api.addressZipcode,
          }
        : undefined;

    return {
      locid: api.id,
      locnam: api.name,
      slocnam: api.shortName,
      akanam: api.akaName,
      category: api.category,
      class: api.class,
      gps,
      address,
      access: api.access,
      documentation: api.documentation,
      historic: api.historic || false,
      favorite: api.favorite || false,
      project: api.project || false,
      builtYear: api.builtYear?.toString(),
      builtType: api.builtType as 'year' | 'range' | 'date' | undefined,
      abandonedYear: api.abandonedYear?.toString(),
      abandonedType: api.abandonedType as 'year' | 'range' | 'date' | undefined,
      locadd: api.createdAt,
      locup: api.updatedAt,
      sublocs: [],
      regions: [],
      state: api.addressState,
      viewCount: api.viewCount || 0,
      lastViewedAt: api.lastViewedAt,
      docInterior: false,
      docExterior: false,
      docDrone: false,
      docWebHistory: false,
      docMapFind: false,
      locationVerified: false,
      locnamVerified: false,
      akanamVerified: false,
      countryCulturalRegionVerified: false,
      localCulturalRegionVerified: false,
      isHostOnly: false,
      country: 'United States',
      continent: 'North America',
    };
  }
}
