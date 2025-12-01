/**
 * Location Duplicate Detection Service
 *
 * Provides safety net to prevent duplicate locations in the archive.
 * Checks for matches by:
 * 1. GPS proximity (within 150m = same physical site)
 * 2. Name similarity (≥85% Jaro-Winkler = high confidence match)
 *
 * ADR Reference: ADR-pin-conversion-duplicate-prevention.md
 */

import type { Kysely } from 'kysely';
import type { Database } from '../main/database.types';
import { haversineDistance, getBoundingBox } from './geo-utils';
import { jaroWinklerSimilarity } from './jaro-winkler-service';
import { DUPLICATE_CONFIG } from '../../src/lib/constants';

// Use centralized constants for duplicate detection
const { GPS_RADIUS_METERS, NAME_SIMILARITY_THRESHOLD } = DUPLICATE_CONFIG;

/**
 * Input for duplicate check
 */
export interface DuplicateCheckInput {
  name: string;
  lat?: number | null;
  lng?: number | null;
}

/**
 * Exclusion pair (names previously marked as "different")
 */
export interface ExclusionPair {
  nameA: string;
  nameB: string;
}

/**
 * Match details when duplicate found
 */
export interface DuplicateMatch {
  locationId: string;
  locnam: string;
  akanam: string | null;
  historicalName: string | null;
  state: string | null;
  matchType: 'gps' | 'name';
  distanceMeters?: number;
  nameSimilarity?: number;
  matchedField?: 'locnam' | 'akanam' | 'historicalName';
  mediaCount: number;
  /** GPS coordinates of the matched location (for map view) */
  lat?: number | null;
  lng?: number | null;
}

/**
 * Result of duplicate check
 */
export interface DuplicateCheckResult {
  hasDuplicate: boolean;
  match?: DuplicateMatch;
}

/**
 * Normalize a name for comparison
 * - Lowercase
 * - Strip leading articles (The, A, An)
 * - Expand common abbreviations
 */
export function normalizeName(name: string): string {
  if (!name) return '';

  let normalized = name.toLowerCase().trim();

  // Strip leading articles
  normalized = normalized.replace(/^(the|a|an)\s+/i, '');

  // Expand abbreviations (order matters - process longer patterns first)
  const abbreviations: [RegExp, string][] = [
    [/\bst\.\s*/gi, 'saint '],
    [/\bmt\.\s*/gi, 'mount '],
    [/\bhosp\.\s*/gi, 'hospital '],
    [/\bmfg\.\s*/gi, 'manufacturing '],
    [/\bco\.\s*/gi, 'company '],
    [/\bcorp\.\s*/gi, 'corporation '],
    [/\binc\.\s*/gi, 'incorporated '],
    [/\bave\.\s*/gi, 'avenue '],
    [/\bblvd\.\s*/gi, 'boulevard '],
    [/\brd\.\s*/gi, 'road '],
  ];

  for (const [pattern, replacement] of abbreviations) {
    normalized = normalized.replace(pattern, replacement);
  }

  // Collapse multiple spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Check if a name pair is in the exclusion list
 */
function isExcluded(name1: string, name2: string, exclusions: ExclusionPair[]): boolean {
  const n1 = name1.toLowerCase();
  const n2 = name2.toLowerCase();

  return exclusions.some((ex) => {
    const a = ex.nameA.toLowerCase();
    const b = ex.nameB.toLowerCase();
    return (n1 === a && n2 === b) || (n1 === b && n2 === a);
  });
}

/**
 * Location Duplicate Service
 */
export class LocationDuplicateService {
  constructor(private db: Kysely<Database>) {}

  /**
   * Check if a new location would be a duplicate of an existing one
   *
   * @param input - Name and optional GPS coordinates
   * @param exclusions - Previously marked "different" pairs to skip
   * @returns Check result with match details if duplicate found
   */
  async checkForDuplicate(
    input: DuplicateCheckInput,
    exclusions: ExclusionPair[] = []
  ): Promise<DuplicateCheckResult> {
    const normalizedInputName = normalizeName(input.name);

    // 1. GPS CHECK (if coordinates provided)
    if (input.lat != null && input.lng != null) {
      const gpsMatch = await this.checkGpsProximity(
        input.lat,
        input.lng,
        input.name,
        exclusions
      );
      if (gpsMatch) {
        return { hasDuplicate: true, match: gpsMatch };
      }
    }

    // 2. NAME CHECK (always runs)
    const nameMatch = await this.checkNameSimilarity(normalizedInputName, exclusions);
    if (nameMatch) {
      return { hasDuplicate: true, match: nameMatch };
    }

    // 3. NO MATCH
    return { hasDuplicate: false };
  }

  /**
   * Check for GPS proximity matches within 150m
   */
  private async checkGpsProximity(
    lat: number,
    lng: number,
    inputName: string,
    exclusions: ExclusionPair[]
  ): Promise<DuplicateMatch | null> {
    // Get bounding box for efficient query
    const bbox = getBoundingBox(lat, lng, GPS_RADIUS_METERS);

    // Query locations within bounding box
    const nearbyLocations = await this.db
      .selectFrom('locs')
      .select([
        'locid',
        'locnam',
        'akanam',
        'historical_name',
        'state',
        'gps_lat',
        'gps_lng',
      ])
      .where('gps_lat', '>=', bbox.minLat)
      .where('gps_lat', '<=', bbox.maxLat)
      .where('gps_lng', '>=', bbox.minLng)
      .where('gps_lng', '<=', bbox.maxLng)
      .execute();

    for (const loc of nearbyLocations) {
      if (loc.gps_lat == null || loc.gps_lng == null) continue;

      const distance = haversineDistance(lat, lng, loc.gps_lat, loc.gps_lng);

      if (distance <= GPS_RADIUS_METERS) {
        // Check if this pair was previously marked "different"
        if (isExcluded(inputName, loc.locnam, exclusions)) continue;
        if (loc.akanam && isExcluded(inputName, loc.akanam, exclusions)) continue;

        // Get media count
        const mediaCount = await this.getMediaCount(loc.locid);

        return {
          locationId: loc.locid,
          locnam: loc.locnam,
          akanam: loc.akanam,
          historicalName: loc.historical_name,
          state: loc.state,
          matchType: 'gps',
          distanceMeters: Math.round(distance),
          mediaCount,
          lat: loc.gps_lat,
          lng: loc.gps_lng,
        };
      }
    }

    return null;
  }

  /**
   * Check for name similarity matches ≥50%
   */
  private async checkNameSimilarity(
    normalizedInputName: string,
    exclusions: ExclusionPair[]
  ): Promise<DuplicateMatch | null> {
    // Query all locations with names
    const locations = await this.db
      .selectFrom('locs')
      .select([
        'locid',
        'locnam',
        'akanam',
        'historical_name',
        'state',
        'gps_lat',
        'gps_lng',
      ])
      .execute();

    for (const loc of locations) {
      // Check against each name field
      const namesToCheck: Array<{
        field: 'locnam' | 'akanam' | 'historicalName';
        value: string | null;
      }> = [
        { field: 'locnam', value: loc.locnam },
        { field: 'akanam', value: loc.akanam },
        { field: 'historicalName', value: loc.historical_name },
      ];

      for (const { field, value } of namesToCheck) {
        if (!value) continue;

        const normalizedValue = normalizeName(value);
        const similarity = jaroWinklerSimilarity(normalizedInputName, normalizedValue);

        if (similarity >= NAME_SIMILARITY_THRESHOLD) {
          // Check if this pair was previously marked "different"
          if (isExcluded(normalizedInputName, normalizedValue, exclusions)) continue;

          // Get media count
          const mediaCount = await this.getMediaCount(loc.locid);

          return {
            locationId: loc.locid,
            locnam: loc.locnam,
            akanam: loc.akanam,
            historicalName: loc.historical_name,
            state: loc.state,
            matchType: 'name',
            nameSimilarity: Math.round(similarity * 100),
            matchedField: field,
            mediaCount,
            lat: loc.gps_lat,
            lng: loc.gps_lng,
          };
        }
      }
    }

    return null;
  }

  /**
   * Get count of media files associated with a location
   */
  private async getMediaCount(locationId: string): Promise<number> {
    // Count images
    const imageCount = await this.db
      .selectFrom('imgs')
      .select((eb) => eb.fn.count('imgsha').as('count'))
      .where('locid', '=', locationId)
      .executeTakeFirst();

    // Count videos
    const videoCount = await this.db
      .selectFrom('vids')
      .select((eb) => eb.fn.count('vidsha').as('count'))
      .where('locid', '=', locationId)
      .executeTakeFirst();

    // Count documents
    const docCount = await this.db
      .selectFrom('docs')
      .select((eb) => eb.fn.count('docsha').as('count'))
      .where('locid', '=', locationId)
      .executeTakeFirst();

    return (
      Number(imageCount?.count || 0) +
      Number(videoCount?.count || 0) +
      Number(docCount?.count || 0)
    );
  }
}

export default LocationDuplicateService;
