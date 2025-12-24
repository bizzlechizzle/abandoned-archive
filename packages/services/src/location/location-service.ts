/**
 * Location service - core location operations
 */

import { createHash, randomBytes } from 'crypto';
import type { Database } from 'better-sqlite3';
import {
  type Location,
  type LocationInput,
  type LocationUpdate,
  type LocationFilters,
  type LocationStats,
  type LocationDuplicate,
  LocationInputSchema,
  LocationUpdateSchema,
  LocationFiltersSchema,
} from './types';
import { LocationNotFoundError } from '../shared/errors';
import { createLogger } from '../shared/logger';

const logger = createLogger('location-service');

/**
 * Generate a BLAKE3-style ID (16 hex chars from random bytes)
 * Uses SHA-256 for simplicity (BLAKE3 would be imported from wake-n-blake in production)
 */
function generateLocationId(): string {
  const hash = createHash('sha256').update(randomBytes(32)).digest('hex');
  return hash.slice(0, 16);
}

/**
 * Location service for managing abandoned locations
 */
export class LocationService {
  constructor(private db: Database) {}

  /**
   * Find all locations with optional filters
   */
  async findAll(rawFilters?: Partial<LocationFilters>): Promise<Location[]> {
    const filters = rawFilters ? LocationFiltersSchema.parse(rawFilters) : {};

    let query = 'SELECT * FROM locs WHERE 1=1';
    const params: unknown[] = [];

    // Text search
    if (filters.search) {
      query += ' AND (locnam LIKE ? OR description LIKE ? OR address_street LIKE ?)';
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    // Classification filters
    if (filters.type) {
      query += ' AND type = ?';
      params.push(filters.type);
    }
    if (filters.types?.length) {
      query += ` AND type IN (${filters.types.map(() => '?').join(',')})`;
      params.push(...filters.types);
    }
    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters.statuses?.length) {
      query += ` AND status IN (${filters.statuses.map(() => '?').join(',')})`;
      params.push(...filters.statuses);
    }

    // Geographic filters (using address_ prefix to match desktop schema)
    if (filters.state) {
      query += ' AND address_state = ?';
      params.push(filters.state);
    }
    if (filters.county) {
      query += ' AND address_county = ?';
      params.push(filters.county);
    }
    if (filters.city) {
      query += ' AND address_city = ?';
      params.push(filters.city);
    }

    // Bounding box (using gps_ prefix to match desktop schema)
    if (filters.north && filters.south && filters.east && filters.west) {
      query += ' AND gps_lat BETWEEN ? AND ? AND gps_lng BETWEEN ? AND ?';
      params.push(filters.south, filters.north, filters.west, filters.east);
    }

    // Media filters
    if (filters.hasImages !== undefined) {
      query += filters.hasImages ? ' AND imgct > 0' : ' AND (imgct = 0 OR imgct IS NULL)';
    }
    if (filters.hasHeroImage !== undefined) {
      query += filters.hasHeroImage ? ' AND heroimg IS NOT NULL' : ' AND heroimg IS NULL';
    }

    // Sorting
    const sortField = filters.sortBy === 'name' ? 'locnam'
      : filters.sortBy === 'createdAt' ? 'created_at'
      : filters.sortBy === 'updatedAt' ? 'updated_at'
      : filters.sortBy === 'imageCount' ? 'imgct'
      : 'locnam';
    const sortOrder = filters.sortOrder || 'asc';
    query += ` ORDER BY ${sortField} ${sortOrder.toUpperCase()}`;

    // Pagination
    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }
    if (filters.offset) {
      query += ' OFFSET ?';
      params.push(filters.offset);
    }

    logger.debug('Finding locations', { query, paramCount: params.length });

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as Record<string, unknown>[];

    return rows.map(this.mapRowToLocation);
  }

  /**
   * Find a single location by ID
   */
  async findById(id: string): Promise<Location | null> {
    const stmt = this.db.prepare('SELECT * FROM locs WHERE locid = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;

    if (!row) {
      return null;
    }

    return this.mapRowToLocation(row);
  }

  /**
   * Find a location by ID, throwing if not found
   */
  async findByIdOrThrow(id: string): Promise<Location> {
    const location = await this.findById(id);
    if (!location) {
      throw new LocationNotFoundError(id);
    }
    return location;
  }

  /**
   * Create a new location
   */
  async create(rawInput: LocationInput): Promise<Location> {
    const input = LocationInputSchema.parse(rawInput);
    const id = generateLocationId();
    const now = new Date();

    logger.info('Creating location', { id, name: input.name });

    // Generate loc12 (short 12-char ID for display)
    const loc12 = id.slice(0, 12);

    const stmt = this.db.prepare(`
      INSERT INTO locs (
        locid, loc12, locnam, type, status, category, tags,
        gps_lat, gps_lng, gps_source,
        address_street, address_city, address_county, address_state, address_zipcode,
        description, notes,
        condition, access, favorite, historic,
        discovered_at, built_year, abandoned_year,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?
      )
    `);

    stmt.run(
      id,
      loc12,
      input.name,
      input.type || null,
      input.status || 'unknown',
      input.category || null,
      input.tags ? JSON.stringify(input.tags) : '[]',
      input.latitude || null,
      input.longitude || null,
      input.gpsSource || null,
      input.address || null,
      input.city || null,
      input.county || null,
      input.state || null,
      input.postalCode || null,
      input.description || null,
      input.notes || null,
      input.condition || null,
      input.access || null,
      input.favorite ? 1 : 0,
      input.historic ? 1 : 0,
      input.discoveredAt?.toISOString() || null,
      input.builtYear || null,
      input.abandonedYear || null,
      now.toISOString(),
      now.toISOString(),
    );

    const location = await this.findByIdOrThrow(id);
    logger.info('Location created', { id, name: location.name });

    return location;
  }

  /**
   * Update a location
   */
  async update(id: string, rawInput: LocationUpdate): Promise<Location> {
    const input = LocationUpdateSchema.parse(rawInput);
    const existing = await this.findByIdOrThrow(id);

    logger.info('Updating location', { id, fields: Object.keys(input) });

    const updates: string[] = [];
    const params: unknown[] = [];

    if (input.name !== undefined) {
      updates.push('locnam = ?');
      params.push(input.name);
    }
    if (input.type !== undefined) {
      updates.push('type = ?');
      params.push(input.type);
    }
    if (input.status !== undefined) {
      updates.push('status = ?');
      params.push(input.status);
    }
    if (input.tags !== undefined) {
      updates.push('tags = ?');
      params.push(JSON.stringify(input.tags));
    }
    if (input.latitude !== undefined) {
      updates.push('gps_lat = ?');
      params.push(input.latitude);
    }
    if (input.longitude !== undefined) {
      updates.push('gps_lng = ?');
      params.push(input.longitude);
    }
    if (input.gpsSource !== undefined) {
      updates.push('gps_source = ?');
      params.push(input.gpsSource);
    }
    if (input.address !== undefined) {
      updates.push('address_street = ?');
      params.push(input.address);
    }
    if (input.city !== undefined) {
      updates.push('address_city = ?');
      params.push(input.city);
    }
    if (input.county !== undefined) {
      updates.push('address_county = ?');
      params.push(input.county);
    }
    if (input.state !== undefined) {
      updates.push('address_state = ?');
      params.push(input.state);
    }
    if (input.postalCode !== undefined) {
      updates.push('address_zipcode = ?');
      params.push(input.postalCode);
    }
    if (input.description !== undefined) {
      updates.push('description = ?');
      params.push(input.description);
    }
    if (input.notes !== undefined) {
      updates.push('notes = ?');
      params.push(input.notes);
    }
    if (input.category !== undefined) {
      updates.push('category = ?');
      params.push(input.category);
    }
    if (input.condition !== undefined) {
      updates.push('condition = ?');
      params.push(input.condition);
    }
    if (input.access !== undefined) {
      updates.push('access = ?');
      params.push(input.access);
    }
    if (input.favorite !== undefined) {
      updates.push('favorite = ?');
      params.push(input.favorite ? 1 : 0);
    }
    if (input.historic !== undefined) {
      updates.push('historic = ?');
      params.push(input.historic ? 1 : 0);
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    const query = `UPDATE locs SET ${updates.join(', ')} WHERE locid = ?`;
    const stmt = this.db.prepare(query);
    stmt.run(...params);

    const updated = await this.findByIdOrThrow(id);
    logger.info('Location updated', { id });

    return updated;
  }

  /**
   * Delete a location
   */
  async delete(id: string): Promise<void> {
    await this.findByIdOrThrow(id);

    logger.info('Deleting location', { id });

    const stmt = this.db.prepare('DELETE FROM locs WHERE locid = ?');
    stmt.run(id);

    logger.info('Location deleted', { id });
  }

  /**
   * Get location statistics
   */
  async getStats(): Promise<LocationStats> {
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM locs');
    const total = (totalStmt.get() as { count: number }).count;

    const byStatusStmt = this.db.prepare(
      'SELECT status, COUNT(*) as count FROM locs GROUP BY status',
    );
    const statusRows = byStatusStmt.all() as Array<{ status: string; count: number }>;
    const byStatus = Object.fromEntries(
      statusRows.map((r) => [r.status || 'unknown', r.count]),
    ) as Record<string, number>;

    const byTypeStmt = this.db.prepare(
      'SELECT type, COUNT(*) as count FROM locs WHERE type IS NOT NULL GROUP BY type',
    );
    const typeRows = byTypeStmt.all() as Array<{ type: string; count: number }>;
    const byType = Object.fromEntries(
      typeRows.map((r) => [r.type, r.count]),
    ) as Record<string, number>;

    const byStateStmt = this.db.prepare(
      'SELECT address_state, COUNT(*) as count FROM locs WHERE address_state IS NOT NULL GROUP BY address_state ORDER BY count DESC',
    );
    const stateRows = byStateStmt.all() as Array<{ address_state: string; count: number }>;
    const byState = Object.fromEntries(
      stateRows.map((r) => [r.address_state, r.count]),
    ) as Record<string, number>;

    const withGpsStmt = this.db.prepare(
      'SELECT COUNT(*) as count FROM locs WHERE gps_lat IS NOT NULL AND gps_lng IS NOT NULL',
    );
    const withGps = (withGpsStmt.get() as { count: number }).count;

    const withHeroStmt = this.db.prepare(
      'SELECT COUNT(*) as count FROM locs WHERE heroimg IS NOT NULL',
    );
    const withHeroImage = (withHeroStmt.get() as { count: number }).count;

    const mediaTotalsStmt = this.db.prepare(
      'SELECT SUM(imgct) as images, SUM(vidct) as videos, SUM(docct) as docs FROM locs',
    );
    const mediaTotals = mediaTotalsStmt.get() as {
      images: number | null;
      videos: number | null;
      docs: number | null;
    };

    return {
      totalLocations: total,
      byStatus: byStatus as Record<string, number>,
      byType: byType as Record<string, number>,
      byState,
      withGps,
      withHeroImage,
      totalImages: mediaTotals.images || 0,
      totalVideos: mediaTotals.videos || 0,
      totalDocuments: mediaTotals.docs || 0,
    };
  }

  /**
   * Find potential duplicate locations
   */
  async findDuplicates(threshold = 0.8): Promise<LocationDuplicate[]> {
    // Simple implementation - can be enhanced with Jaro-Winkler from mapcombine
    const locations = await this.findAll();
    const duplicates: LocationDuplicate[] = [];

    for (let i = 0; i < locations.length; i++) {
      for (let j = i + 1; j < locations.length; j++) {
        const loc1 = locations[i];
        const loc2 = locations[j];
        const reasons: string[] = [];
        let score = 0;

        // Name similarity (simple)
        if (loc1.name.toLowerCase() === loc2.name.toLowerCase()) {
          score += 0.5;
          reasons.push('Identical name');
        }

        // GPS proximity
        if (loc1.latitude && loc1.longitude && loc2.latitude && loc2.longitude) {
          const distance = this.haversineDistance(
            loc1.latitude,
            loc1.longitude,
            loc2.latitude,
            loc2.longitude,
          );
          if (distance < 100) { // 100 meters
            score += 0.4;
            reasons.push(`Within ${Math.round(distance)}m`);
          }
        }

        // Same address
        if (loc1.address && loc2.address && loc1.address === loc2.address) {
          score += 0.3;
          reasons.push('Same address');
        }

        if (score >= threshold) {
          duplicates.push({
            location1: loc1,
            location2: loc2,
            confidence: Math.min(score, 1),
            reasons,
          });
        }
      }
    }

    return duplicates;
  }

  /**
   * Calculate haversine distance between two points in meters
   */
  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Map database row to Location entity
   * Column names aligned with desktop schema
   */
  private mapRowToLocation(row: Record<string, unknown>): Location {
    // Parse tags from JSON string
    let tags: string[] = [];
    if (row.tags) {
      try {
        tags = JSON.parse(row.tags as string);
      } catch {
        tags = [];
      }
    }

    return {
      id: row.locid as string,
      loc12: row.loc12 as string | undefined,
      name: row.locnam as string,
      type: row.type as Location['type'],
      status: (row.status as Location['status']) || 'unknown',
      category: row.category as string | undefined,
      tags,
      latitude: row.gps_lat as number | undefined,
      longitude: row.gps_lng as number | undefined,
      gpsAccuracy: row.gps_accuracy as number | undefined,
      gpsSource: row.gps_source as Location['gpsSource'],
      gpsStatus: row.gps_status as string | undefined,
      address: row.address_street as string | undefined,
      city: row.address_city as string | undefined,
      county: row.address_county as string | undefined,
      state: row.address_state as string | undefined,
      postalCode: row.address_zipcode as string | undefined,
      description: row.description as string | undefined,
      notes: row.notes as string | undefined,
      heroImageHash: row.heroimg as string | undefined,
      heroImageFocalX: row.hero_focal_x as number | undefined,
      heroImageFocalY: row.hero_focal_y as number | undefined,
      imageCount: (row.imgct as number) || 0,
      videoCount: (row.vidct as number) || 0,
      documentCount: (row.docct as number) || 0,
      discoveredAt: row.discovered_at ? new Date(row.discovered_at as string) : undefined,
      visitedAt: row.visited_at ? new Date(row.visited_at as string) : undefined,
      builtYear: row.built_year as number | undefined,
      abandonedYear: row.abandoned_year as number | undefined,
      demolishedYear: row.demolished_year as number | undefined,
      condition: row.condition as string | undefined,
      access: row.access as string | undefined,
      favorite: (row.favorite as number) === 1,
      historic: (row.historic as number) === 1,
      createdAt: row.created_at ? new Date(row.created_at as string) : new Date(),
      updatedAt: row.updated_at ? new Date(row.updated_at as string) : new Date(),
      createdBy: row.created_by as string | undefined,
      updatedBy: row.updated_by as string | undefined,
    };
  }
}
