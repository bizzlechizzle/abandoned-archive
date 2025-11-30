/**
 * Reference Map Deduplication Service
 *
 * Detects potential duplicates when importing reference map files by checking:
 * 1. Against existing ref_map_points (Type A: reference duplicates)
 * 2. Against existing locs table (Type B: already catalogued locations)
 *
 * Detection criteria: Name similarity >= 85% AND GPS proximity <= 500m
 */

import type { Kysely } from 'kysely';
import type { Database } from '../main/database.types';
import type { ParsedMapPoint } from './map-parser-service';
import { jaroWinklerSimilarity } from './jaro-winkler-service';
import { haversineDistance, getBoundingBox } from './geo-utils';

/**
 * Represents a detected duplicate match
 */
export interface DuplicateMatch {
  type: 'catalogued' | 'reference';
  newPoint: ParsedMapPoint;
  existingName: string;
  existingId: string; // locid for catalogued, point_id for reference
  nameSimilarity: number; // 0-1 score
  distanceMeters: number;
  mapName?: string; // Only for reference matches
}

/**
 * Result of deduplication check
 */
export interface DedupeResult {
  newPoints: ParsedMapPoint[]; // Unique points that can be imported
  cataloguedMatches: DuplicateMatch[]; // Matches against locs table
  referenceMatches: DuplicateMatch[]; // Matches against ref_map_points
  totalParsed: number;
}

/**
 * Options for deduplication check
 */
export interface DedupeOptions {
  nameThreshold?: number; // Default: 0.85 (85% similarity)
  distanceThreshold?: number; // Default: 500 meters
}

const DEFAULT_NAME_THRESHOLD = 0.85;
const DEFAULT_DISTANCE_THRESHOLD = 500; // meters

export class RefMapDedupService {
  constructor(private db: Kysely<Database>) {}

  /**
   * Check parsed points for duplicates against existing data.
   *
   * @param parsedPoints - Points parsed from the import file
   * @param options - Threshold options
   * @returns Categorized results with new points and matches
   */
  async checkForDuplicates(
    parsedPoints: ParsedMapPoint[],
    options?: DedupeOptions
  ): Promise<DedupeResult> {
    const nameThreshold = options?.nameThreshold ?? DEFAULT_NAME_THRESHOLD;
    const distanceThreshold = options?.distanceThreshold ?? DEFAULT_DISTANCE_THRESHOLD;

    const newPoints: ParsedMapPoint[] = [];
    const cataloguedMatches: DuplicateMatch[] = [];
    const referenceMatches: DuplicateMatch[] = [];

    for (const point of parsedPoints) {
      // Skip points without names (can't match by name)
      if (!point.name) {
        newPoints.push(point);
        continue;
      }

      // Check against catalogued locations first (higher priority)
      const cataloguedMatch = await this.findCataloguedMatch(
        point,
        nameThreshold,
        distanceThreshold
      );

      if (cataloguedMatch) {
        cataloguedMatches.push(cataloguedMatch);
        continue;
      }

      // Check against existing reference points
      const referenceMatch = await this.findReferenceMatch(
        point,
        nameThreshold,
        distanceThreshold
      );

      if (referenceMatch) {
        referenceMatches.push(referenceMatch);
        continue;
      }

      // No match found - this is a new point
      newPoints.push(point);
    }

    return {
      newPoints,
      cataloguedMatches,
      referenceMatches,
      totalParsed: parsedPoints.length,
    };
  }

  /**
   * Find a match in the locs table (catalogued locations)
   */
  private async findCataloguedMatch(
    point: ParsedMapPoint,
    nameThreshold: number,
    distanceThreshold: number
  ): Promise<DuplicateMatch | null> {
    // Get bounding box for pre-filtering
    const bbox = getBoundingBox(point.lat, point.lng, distanceThreshold);

    // Query locations within bounding box that have GPS
    const candidates = await this.db
      .selectFrom('locs')
      .select(['locid', 'locnam', 'gps_lat', 'gps_lng'])
      .where('gps_lat', 'is not', null)
      .where('gps_lng', 'is not', null)
      .where('gps_lat', '>=', bbox.minLat)
      .where('gps_lat', '<=', bbox.maxLat)
      .where('gps_lng', '>=', bbox.minLng)
      .where('gps_lng', '<=', bbox.maxLng)
      .execute();

    for (const candidate of candidates) {
      if (!candidate.gps_lat || !candidate.gps_lng) continue;

      // Check exact distance
      const distance = haversineDistance(
        point.lat,
        point.lng,
        candidate.gps_lat,
        candidate.gps_lng
      );

      if (distance > distanceThreshold) continue;

      // Check name similarity
      const similarity = jaroWinklerSimilarity(point.name!, candidate.locnam);

      if (similarity >= nameThreshold) {
        return {
          type: 'catalogued',
          newPoint: point,
          existingName: candidate.locnam,
          existingId: candidate.locid,
          nameSimilarity: similarity,
          distanceMeters: Math.round(distance),
        };
      }
    }

    return null;
  }

  /**
   * Find a match in the ref_map_points table (existing references)
   */
  private async findReferenceMatch(
    point: ParsedMapPoint,
    nameThreshold: number,
    distanceThreshold: number
  ): Promise<DuplicateMatch | null> {
    // Get bounding box for pre-filtering
    const bbox = getBoundingBox(point.lat, point.lng, distanceThreshold);

    // Query reference points within bounding box
    const candidates = await this.db
      .selectFrom('ref_map_points')
      .innerJoin('ref_maps', 'ref_map_points.map_id', 'ref_maps.map_id')
      .select([
        'ref_map_points.point_id',
        'ref_map_points.name',
        'ref_map_points.lat',
        'ref_map_points.lng',
        'ref_maps.map_name',
      ])
      .where('ref_map_points.lat', '>=', bbox.minLat)
      .where('ref_map_points.lat', '<=', bbox.maxLat)
      .where('ref_map_points.lng', '>=', bbox.minLng)
      .where('ref_map_points.lng', '<=', bbox.maxLng)
      .where('ref_map_points.name', 'is not', null)
      .execute();

    for (const candidate of candidates) {
      if (!candidate.name) continue;

      // Check exact distance
      const distance = haversineDistance(
        point.lat,
        point.lng,
        candidate.lat,
        candidate.lng
      );

      if (distance > distanceThreshold) continue;

      // Check name similarity
      const similarity = jaroWinklerSimilarity(point.name!, candidate.name);

      if (similarity >= nameThreshold) {
        return {
          type: 'reference',
          newPoint: point,
          existingName: candidate.name,
          existingId: candidate.point_id,
          nameSimilarity: similarity,
          distanceMeters: Math.round(distance),
          mapName: candidate.map_name,
        };
      }
    }

    return null;
  }

  /**
   * Find all reference points that match catalogued locations.
   * Used for purging reference points that are no longer needed.
   *
   * @param options - Threshold options
   * @returns Array of point IDs that can be deleted
   */
  async findCataloguedRefPoints(
    options?: DedupeOptions
  ): Promise<Array<{
    pointId: string;
    pointName: string;
    mapName: string;
    matchedLocid: string;
    matchedLocName: string;
    nameSimilarity: number;
    distanceMeters: number;
  }>> {
    const nameThreshold = options?.nameThreshold ?? DEFAULT_NAME_THRESHOLD;
    const distanceThreshold = options?.distanceThreshold ?? DEFAULT_DISTANCE_THRESHOLD;

    // Get all reference points with their map names
    const refPoints = await this.db
      .selectFrom('ref_map_points')
      .innerJoin('ref_maps', 'ref_map_points.map_id', 'ref_maps.map_id')
      .select([
        'ref_map_points.point_id',
        'ref_map_points.name',
        'ref_map_points.lat',
        'ref_map_points.lng',
        'ref_maps.map_name',
      ])
      .where('ref_map_points.name', 'is not', null)
      .execute();

    const matches: Array<{
      pointId: string;
      pointName: string;
      mapName: string;
      matchedLocid: string;
      matchedLocName: string;
      nameSimilarity: number;
      distanceMeters: number;
    }> = [];

    for (const point of refPoints) {
      if (!point.name) continue;

      // Get bounding box for pre-filtering
      const bbox = getBoundingBox(point.lat, point.lng, distanceThreshold);

      // Query locations within bounding box that have GPS
      const candidates = await this.db
        .selectFrom('locs')
        .select(['locid', 'locnam', 'gps_lat', 'gps_lng'])
        .where('gps_lat', 'is not', null)
        .where('gps_lng', 'is not', null)
        .where('gps_lat', '>=', bbox.minLat)
        .where('gps_lat', '<=', bbox.maxLat)
        .where('gps_lng', '>=', bbox.minLng)
        .where('gps_lng', '<=', bbox.maxLng)
        .execute();

      for (const candidate of candidates) {
        if (!candidate.gps_lat || !candidate.gps_lng) continue;

        // Check exact distance
        const distance = haversineDistance(
          point.lat,
          point.lng,
          candidate.gps_lat,
          candidate.gps_lng
        );

        if (distance > distanceThreshold) continue;

        // Check name similarity
        const similarity = jaroWinklerSimilarity(point.name, candidate.locnam);

        if (similarity >= nameThreshold) {
          matches.push({
            pointId: point.point_id,
            pointName: point.name,
            mapName: point.map_name,
            matchedLocid: candidate.locid,
            matchedLocName: candidate.locnam,
            nameSimilarity: similarity,
            distanceMeters: Math.round(distance),
          });
          break; // Only need one match per ref point
        }
      }
    }

    return matches;
  }

  /**
   * Delete specific reference points by their IDs.
   *
   * @param pointIds - Array of point IDs to delete
   * @returns Number of points deleted
   */
  async deleteRefPoints(pointIds: string[]): Promise<number> {
    if (pointIds.length === 0) return 0;

    const result = await this.db
      .deleteFrom('ref_map_points')
      .where('point_id', 'in', pointIds)
      .executeTakeFirst();

    return Number(result.numDeletedRows);
  }
}
