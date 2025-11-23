import { Kysely } from 'kysely';
import { randomUUID } from 'crypto';
import type { Database, LocsTable } from '../main/database.types';
import {
  LocationRepository,
  LocationFilters,
  Location,
  LocationInput,
  LocationEntity
} from '@au-archive/core';
import { AddressNormalizer } from '../services/address-normalizer';
// FIX 6.7: Import GPS validator for proximity search
import { GPSValidator } from '../services/gps-validator';

export class SQLiteLocationRepository implements LocationRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async create(input: LocationInput): Promise<Location> {
    const locid = randomUUID();
    const loc12 = LocationEntity.generateLoc12(locid);
    const slocnam = input.slocnam || LocationEntity.generateShortName(input.locnam);
    const locadd = new Date().toISOString();

    // Normalize address fields before storage
    // This ensures consistent formatting: 2-letter state codes, proper zipcode format, etc.
    const normalizedStreet = AddressNormalizer.normalizeStreet(input.address?.street);
    const normalizedCity = AddressNormalizer.normalizeCity(input.address?.city);
    const normalizedCounty = AddressNormalizer.normalizeCounty(input.address?.county);
    const normalizedState = AddressNormalizer.normalizeStateCode(input.address?.state);
    const normalizedZipcode = AddressNormalizer.normalizeZipcode(input.address?.zipcode);

    await this.db
      .insertInto('locs')
      .values({
        locid,
        loc12,
        locnam: input.locnam,
        slocnam,
        akanam: input.akanam || null,
        type: input.type || null,
        stype: input.stype || null,
        gps_lat: input.gps?.lat || null,
        gps_lng: input.gps?.lng || null,
        gps_accuracy: input.gps?.accuracy || null,
        gps_source: input.gps?.source || null,
        gps_verified_on_map: input.gps?.verifiedOnMap ? 1 : 0,
        gps_captured_at: input.gps?.capturedAt || null,
        gps_leaflet_data: input.gps?.leafletData ? JSON.stringify(input.gps.leafletData) : null,
        address_street: normalizedStreet,
        address_city: normalizedCity,
        address_county: normalizedCounty,
        address_state: normalizedState,
        address_zipcode: normalizedZipcode,
        address_confidence: input.address?.confidence || null,
        address_geocoded_at: input.address?.geocodedAt || null,
        condition: input.condition || null,
        status: input.status || null,
        documentation: input.documentation || null,
        access: input.access || null,
        historic: input.historic ? 1 : 0,
        favorite: input.favorite ? 1 : 0,
        sublocs: null,
        sub12: null,
        locadd,
        locup: null,
        auth_imp: input.auth_imp || null,
        regions: null,
        state: null
      })
      .execute();

    const location = await this.findById(locid);
    if (!location) {
      throw new Error('Failed to create location');
    }
    return location;
  }

  async findById(id: string): Promise<Location | null> {
    const row = await this.db
      .selectFrom('locs')
      .selectAll()
      .where('locid', '=', id)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRowToLocation(row);
  }

  async findAll(filters?: LocationFilters): Promise<Location[]> {
    let query = this.db.selectFrom('locs').selectAll();

    if (filters?.state) {
      query = query.where('address_state', '=', filters.state);
    }

    if (filters?.type) {
      query = query.where('type', '=', filters.type);
    }

    if (filters?.hasGPS) {
      query = query.where('gps_lat', 'is not', null).where('gps_lng', 'is not', null);
    }

    if (filters?.search) {
      query = query.where((eb) =>
        eb.or([
          eb('locnam', 'like', `%${filters.search}%`),
          eb('akanam', 'like', `%${filters.search}%`)
        ])
      );
    }

    if (filters?.documented === false) {
      query = query.where('documentation', '=', 'No Visit / Keyboard Scout');
    }

    if (filters?.historic === true) {
      query = query.where('historic', '=', 1);
    }

    if (filters?.favorite === true) {
      query = query.where('favorite', '=', 1);
    }

    query = query.orderBy('locadd', 'desc');

    const rows = await query.execute();
    return rows.map((row) => this.mapRowToLocation(row));
  }

  async update(id: string, input: Partial<LocationInput>): Promise<Location> {
    const locup = new Date().toISOString();

    const updates: Record<string, unknown> = {
      locup
    };

    if (input.locnam !== undefined) updates.locnam = input.locnam;
    if (input.slocnam !== undefined) updates.slocnam = input.slocnam;
    if (input.akanam !== undefined) updates.akanam = input.akanam;
    if (input.type !== undefined) updates.type = input.type;
    if (input.stype !== undefined) updates.stype = input.stype;

    if (input.gps !== undefined) {
      updates.gps_lat = input.gps.lat;
      updates.gps_lng = input.gps.lng;
      updates.gps_accuracy = input.gps.accuracy || null;
      updates.gps_source = input.gps.source;
      updates.gps_verified_on_map = input.gps.verifiedOnMap ? 1 : 0;
      updates.gps_captured_at = input.gps.capturedAt || null;
      updates.gps_leaflet_data = input.gps.leafletData ? JSON.stringify(input.gps.leafletData) : null;
    }

    if (input.address !== undefined) {
      // Normalize address fields before storage
      updates.address_street = AddressNormalizer.normalizeStreet(input.address.street);
      updates.address_city = AddressNormalizer.normalizeCity(input.address.city);
      updates.address_county = AddressNormalizer.normalizeCounty(input.address.county);
      updates.address_state = AddressNormalizer.normalizeStateCode(input.address.state);
      updates.address_zipcode = AddressNormalizer.normalizeZipcode(input.address.zipcode);
      updates.address_confidence = input.address.confidence || null;
      updates.address_geocoded_at = input.address.geocodedAt || null;
    }

    if (input.condition !== undefined) updates.condition = input.condition;
    if (input.status !== undefined) updates.status = input.status;
    if (input.documentation !== undefined) updates.documentation = input.documentation;
    if (input.access !== undefined) updates.access = input.access;
    if (input.historic !== undefined) updates.historic = input.historic ? 1 : 0;
    if (input.favorite !== undefined) updates.favorite = input.favorite ? 1 : 0;
    if (input.hero_imgsha !== undefined) updates.hero_imgsha = input.hero_imgsha;
    if (input.auth_imp !== undefined) updates.auth_imp = input.auth_imp;

    await this.db
      .updateTable('locs')
      .set(updates)
      .where('locid', '=', id)
      .execute();

    const location = await this.findById(id);
    if (!location) {
      throw new Error('Failed to update location');
    }
    return location;
  }

  async delete(id: string): Promise<void> {
    await this.db
      .deleteFrom('locs')
      .where('locid', '=', id)
      .execute();
  }

  async count(filters?: LocationFilters): Promise<number> {
    let query = this.db.selectFrom('locs').select((eb) => eb.fn.countAll().as('count'));

    if (filters?.state) {
      query = query.where('address_state', '=', filters.state);
    }

    if (filters?.type) {
      query = query.where('type', '=', filters.type);
    }

    if (filters?.hasGPS) {
      query = query.where('gps_lat', 'is not', null).where('gps_lng', 'is not', null);
    }

    if (filters?.search) {
      query = query.where((eb) =>
        eb.or([
          eb('locnam', 'like', `%${filters.search}%`),
          eb('akanam', 'like', `%${filters.search}%`)
        ])
      );
    }

    // CONSISTENCY: Match findAll filters
    if (filters?.historic === true) {
      query = query.where('historic', '=', 1);
    }

    if (filters?.favorite === true) {
      query = query.where('favorite', '=', 1);
    }

    const result = await query.executeTakeFirst();
    return Number(result?.count || 0);
  }

  private mapRowToLocation(row: LocsTable): Location {
    return {
      locid: row.locid,
      loc12: row.loc12,
      locnam: row.locnam,
      slocnam: row.slocnam,
      akanam: row.akanam,
      type: row.type,
      stype: row.stype,
      gps:
        row.gps_lat && row.gps_lng
          ? {
              lat: row.gps_lat,
              lng: row.gps_lng,
              accuracy: row.gps_accuracy,
              source: row.gps_source,
              verifiedOnMap: row.gps_verified_on_map === 1,
              capturedAt: row.gps_captured_at,
              leafletData: row.gps_leaflet_data ? JSON.parse(row.gps_leaflet_data) : undefined
            }
          : undefined,
      address: {
        street: row.address_street,
        city: row.address_city,
        county: row.address_county,
        state: row.address_state,
        zipcode: row.address_zipcode,
        confidence: row.address_confidence,
        geocodedAt: row.address_geocoded_at
      },
      condition: row.condition,
      status: row.status,
      documentation: row.documentation,
      access: row.access,
      historic: row.historic === 1,
      favorite: row.favorite === 1,
      hero_imgsha: row.hero_imgsha,
      sublocs: row.sublocs ? JSON.parse(row.sublocs) : [],
      sub12: row.sub12,
      locadd: row.locadd,
      locup: row.locup,
      auth_imp: row.auth_imp,
      regions: row.regions ? JSON.parse(row.regions) : [],
      state: row.state
    };
  }

  /**
   * FIX 6.7: Find locations within a radius of given coordinates
   * Uses Haversine formula for great-circle distance calculation
   * @param lat Center latitude
   * @param lng Center longitude
   * @param radiusKm Radius in kilometers
   * @returns Locations sorted by distance from center
   */
  async findNearby(lat: number, lng: number, radiusKm: number): Promise<Array<Location & { distance: number }>> {
    // Get all locations with GPS coordinates
    const rows = await this.db
      .selectFrom('locs')
      .selectAll()
      .where('gps_lat', 'is not', null)
      .where('gps_lng', 'is not', null)
      .execute();

    // Calculate distance for each and filter by radius
    const radiusMeters = radiusKm * 1000;
    const locationsWithDistance: Array<Location & { distance: number }> = [];

    for (const row of rows) {
      const distance = GPSValidator.haversineDistance(lat, lng, row.gps_lat!, row.gps_lng!);
      if (distance <= radiusMeters) {
        const location = this.mapRowToLocation(row);
        locationsWithDistance.push({
          ...location,
          distance: Math.round(distance), // Distance in meters
        });
      }
    }

    // Sort by distance (closest first)
    locationsWithDistance.sort((a, b) => a.distance - b.distance);

    return locationsWithDistance;
  }
}
