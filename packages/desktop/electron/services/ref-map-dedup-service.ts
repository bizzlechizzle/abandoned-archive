/**
 * Reference Map Points Deduplication Service
 *
 * Two-tier deduplication:
 * 1. GPS-based cleanup within ref_map_points (~10m = 4 decimal places)
 * 2. Cross-table matching against catalogued locations (locs table)
 *
 * Migration 39: Adds aka_names column for storing merged alternate names.
 *
 * For GPS duplicate groups:
 * - Keeps the pin with the best (longest/most descriptive) name
 * - Stores alternate names in aka_names field (pipe-separated)
 * - Deletes the duplicate pins
 *
 * Also provides import-time duplicate checking to prevent future duplicates.
 */

import type { Kysely } from 'kysely';
import type { Database } from '../main/database.types';
import { normalizedSimilarity, normalizeName, isSmartMatch, getAdjustedThreshold } from './jaro-winkler-service';
import { haversineDistance } from './geo-utils';
import { DUPLICATE_CONFIG } from '../../src/lib/constants';
import { getStateCodeFromName, isValidStateCode } from './us-state-codes';

// Use centralized constants for duplicate detection
const { GPS_RADIUS_METERS, NAME_MATCH_RADIUS_METERS, NAME_SIMILARITY_THRESHOLD } = DUPLICATE_CONFIG;

/**
 * Normalize a state value to a 2-letter code for comparison.
 * Handles "NY", "New York", "new york", etc.
 */
function normalizeState(state: string | null | undefined): string | null {
  if (!state) return null;
  const trimmed = state.trim().toUpperCase();
  // If it's already a valid 2-letter code, return it
  if (trimmed.length === 2 && isValidStateCode(trimmed)) {
    return trimmed;
  }
  // Try to get code from full name
  return getStateCodeFromName(state) || trimmed;
}

/**
 * Types for import preview and deduplication
 */
export type MatchConfidence = 'gps' | 'name_gps' | 'name_state' | 'exact_name';

export interface DuplicateMatch {
  type: 'catalogued' | 'reference';
  matchType?: MatchConfidence; // How the match was determined
  newPoint: {
    name: string | null;
    lat: number;
    lng: number;
    state?: string | null; // State from the ref point (for auto-fill)
  };
  existingId: string;
  existingName: string;
  existingState?: string; // State of the existing location
  existingHasGps?: boolean; // Whether the existing location has GPS coordinates
  nameSimilarity?: number;
  distanceMeters?: number;
  mapName?: string;
  needsConfirmation?: boolean; // True for state-based matches that need user review
}

export interface DedupeResult {
  totalParsed: number;
  newPoints: Array<{
    name: string | null;
    description: string | null;
    lat: number;
    lng: number;
    state: string | null;
    category: string | null;
    rawMetadata: Record<string, unknown> | null;
  }>;
  cataloguedMatches: DuplicateMatch[];
  referenceMatches: DuplicateMatch[];
}

export interface CataloguedMatch {
  pointId: string;
  pointName: string | null;
  mapName: string;
  matchedLocid: string;
  matchedLocName: string;
  nameSimilarity: number;
  distanceMeters: number;
}

export interface DedupStats {
  totalPoints: number;
  uniqueLocations: number;
  duplicateGroups: number;
  pointsRemoved: number;
  pointsWithAka: number;
}

export interface DuplicateGroup {
  roundedLat: number;
  roundedLng: number;
  points: Array<{
    pointId: string;
    name: string | null;
    mapId: string;
    description: string | null;
  }>;
}

/**
 * Score a name for quality - higher is better
 * Prefers longer, more descriptive names over short/generic ones
 */
function scoreName(name: string | null): number {
  if (!name) return 0;

  let score = name.length;

  // Penalize coordinate-style names (e.g., "44.29951983081727,-75.9590595960617")
  if (/^-?\d+\.\d+,-?\d+\.\d+$/.test(name)) {
    score = 1;
  }

  // Penalize very short names
  if (name.length < 5) {
    score -= 10;
  }

  // Penalize generic names
  const genericPatterns = [
    /^house$/i,
    /^building$/i,
    /^place$/i,
    /^location$/i,
    /^point$/i,
    /^site$/i,
  ];
  for (const pattern of genericPatterns) {
    if (pattern.test(name)) {
      score -= 20;
    }
  }

  // Bonus for names with proper nouns (capitalized words)
  const properNouns = name.match(/[A-Z][a-z]+/g);
  if (properNouns) {
    score += properNouns.length * 5;
  }

  // Bonus for descriptive suffixes
  const descriptiveSuffixes = [
    /factory/i,
    /hospital/i,
    /school/i,
    /church/i,
    /theater/i,
    /theatre/i,
    /mill/i,
    /farm/i,
    /brewery/i,
    /county/i,
    /poorhouse/i,
  ];
  for (const suffix of descriptiveSuffixes) {
    if (suffix.test(name)) {
      score += 10;
    }
  }

  return score;
}

/**
 * Pick the best name from a group of duplicates
 * Returns the name with the highest score
 */
function pickBestName(names: (string | null)[]): string | null {
  const validNames = names.filter((n): n is string => n !== null && n.trim() !== '');
  if (validNames.length === 0) return null;

  let bestName = validNames[0];
  let bestScore = scoreName(bestName);

  for (const name of validNames.slice(1)) {
    const score = scoreName(name);
    if (score > bestScore) {
      bestName = name;
      bestScore = score;
    }
  }

  return bestName;
}

/**
 * Collect alternate names (excluding the primary name)
 */
function collectAkaNames(names: (string | null)[], primaryName: string | null): string | null {
  const validNames = names.filter((n): n is string =>
    n !== null &&
    n.trim() !== '' &&
    n !== primaryName &&
    // Exclude coordinate-style names from AKA
    !/^-?\d+\.\d+,-?\d+\.\d+$/.test(n)
  );

  // Remove duplicates (case-insensitive)
  const uniqueNames = [...new Set(validNames.map(n => n.toLowerCase()))]
    .map(lower => validNames.find(n => n.toLowerCase() === lower)!);

  if (uniqueNames.length === 0) return null;
  return uniqueNames.join(' | ');
}

export class RefMapDedupService {
  constructor(private db: Kysely<Database>) {}

  /**
   * Find all duplicate groups in ref_map_points
   * Groups points by rounded GPS coordinates (4 decimal places ≈ 10m precision)
   */
  async findDuplicateGroups(): Promise<DuplicateGroup[]> {
    // Get all points with their rounded coordinates
    const points = await this.db
      .selectFrom('ref_map_points')
      .select([
        'point_id',
        'name',
        'map_id',
        'description',
        'lat',
        'lng',
      ])
      .execute();

    // Group by rounded coordinates
    const groups = new Map<string, DuplicateGroup>();

    for (const point of points) {
      const roundedLat = Math.round(point.lat * 10000) / 10000;
      const roundedLng = Math.round(point.lng * 10000) / 10000;
      const key = `${roundedLat},${roundedLng}`;

      if (!groups.has(key)) {
        groups.set(key, {
          roundedLat,
          roundedLng,
          points: [],
        });
      }

      groups.get(key)!.points.push({
        pointId: point.point_id,
        name: point.name,
        mapId: point.map_id,
        description: point.description,
      });
    }

    // Return only groups with duplicates (2+ points)
    return Array.from(groups.values()).filter(g => g.points.length > 1);
  }

  /**
   * Run deduplication on all ref_map_points
   * Returns stats about what was cleaned up
   */
  async deduplicate(): Promise<DedupStats> {
    const duplicateGroups = await this.findDuplicateGroups();

    const stats: DedupStats = {
      totalPoints: 0,
      uniqueLocations: 0,
      duplicateGroups: duplicateGroups.length,
      pointsRemoved: 0,
      pointsWithAka: 0,
    };

    // Get total count
    const countResult = await this.db
      .selectFrom('ref_map_points')
      .select(eb => eb.fn.count('point_id').as('count'))
      .executeTakeFirst();
    stats.totalPoints = Number(countResult?.count || 0);

    console.log(`[RefMapDedup] Found ${duplicateGroups.length} duplicate groups`);

    for (const group of duplicateGroups) {
      const names = group.points.map(p => p.name);
      const bestName = pickBestName(names);
      const akaNames = collectAkaNames(names, bestName);

      // Find the point to keep (the one with the best name, or first if tie)
      let keepPoint = group.points[0];
      let keepScore = scoreName(keepPoint.name);

      for (const point of group.points.slice(1)) {
        const score = scoreName(point.name);
        if (score > keepScore) {
          keepPoint = point;
          keepScore = score;
        }
      }

      // Update the keeper with the best name and AKA names
      await this.db
        .updateTable('ref_map_points')
        .set({
          name: bestName,
          aka_names: akaNames,
        })
        .where('point_id', '=', keepPoint.pointId)
        .execute();

      if (akaNames) {
        stats.pointsWithAka++;
      }

      // Delete the duplicates
      const deleteIds = group.points
        .filter(p => p.pointId !== keepPoint.pointId)
        .map(p => p.pointId);

      if (deleteIds.length > 0) {
        await this.db
          .deleteFrom('ref_map_points')
          .where('point_id', 'in', deleteIds)
          .execute();

        stats.pointsRemoved += deleteIds.length;

        console.log(`[RefMapDedup] Merged ${group.points.length} pins at (${group.roundedLat}, ${group.roundedLng})`);
        console.log(`  Kept: "${bestName}" | AKA: "${akaNames || 'none'}"`);
      }
    }

    // Calculate unique locations
    stats.uniqueLocations = stats.totalPoints - stats.pointsRemoved;

    console.log(`[RefMapDedup] Complete: Removed ${stats.pointsRemoved} duplicates, ${stats.pointsWithAka} pins have AKA names`);

    return stats;
  }

  /**
   * Check if a point already exists at the given GPS coordinates
   * Used during import to prevent adding duplicates
   *
   * @param lat Latitude
   * @param lng Longitude
   * @param precision Decimal places for rounding (default 4 ≈ 10m)
   * @returns Existing point if found, null otherwise
   */
  async findExistingPoint(lat: number, lng: number, precision = 4): Promise<{
    pointId: string;
    name: string | null;
    akaNames: string | null;
  } | null> {
    const multiplier = Math.pow(10, precision);
    const roundedLat = Math.round(lat * multiplier) / multiplier;
    const roundedLng = Math.round(lng * multiplier) / multiplier;

    // Search for points within the precision window
    const existing = await this.db
      .selectFrom('ref_map_points')
      .select(['point_id', 'name', 'aka_names'])
      .where('lat', '>=', roundedLat - 0.5 / multiplier)
      .where('lat', '<=', roundedLat + 0.5 / multiplier)
      .where('lng', '>=', roundedLng - 0.5 / multiplier)
      .where('lng', '<=', roundedLng + 0.5 / multiplier)
      .executeTakeFirst();

    if (!existing) return null;

    return {
      pointId: existing.point_id,
      name: existing.name,
      akaNames: existing.aka_names,
    };
  }

  /**
   * Add a new point, merging with existing if duplicate found
   * Returns the point ID (either new or existing)
   */
  async addOrMergePoint(
    mapId: string,
    name: string | null,
    lat: number,
    lng: number,
    description: string | null,
    state: string | null,
    category: string | null,
    rawMetadata: Record<string, unknown> | null
  ): Promise<{ pointId: string; merged: boolean }> {
    const existing = await this.findExistingPoint(lat, lng);

    if (existing) {
      // Merge: Add new name to AKA if different
      const existingNames = [existing.name, ...(existing.akaNames?.split(' | ') || [])];
      const newNameLower = name?.toLowerCase();

      const isDifferentName = name &&
        !existingNames.some(n => n?.toLowerCase() === newNameLower);

      if (isDifferentName) {
        const updatedAka = existing.akaNames
          ? `${existing.akaNames} | ${name}`
          : name;

        await this.db
          .updateTable('ref_map_points')
          .set({ aka_names: updatedAka })
          .where('point_id', '=', existing.pointId)
          .execute();

        console.log(`[RefMapDedup] Merged "${name}" into existing point "${existing.name}"`);
      }

      return { pointId: existing.pointId, merged: true };
    }

    // No duplicate - insert new point
    const { randomUUID } = await import('crypto');
    const pointId = randomUUID();

    await this.db
      .insertInto('ref_map_points')
      .values({
        point_id: pointId,
        map_id: mapId,
        name,
        description,
        lat,
        lng,
        state,
        category,
        raw_metadata: rawMetadata ? JSON.stringify(rawMetadata) : null,
        aka_names: null,
      })
      .execute();

    return { pointId, merged: false };
  }

  /**
   * Get deduplication preview without making changes
   */
  async preview(): Promise<{
    stats: DedupStats;
    groups: Array<{
      lat: number;
      lng: number;
      bestName: string | null;
      akaNames: string | null;
      pointCount: number;
      allNames: string[];
    }>;
  }> {
    const duplicateGroups = await this.findDuplicateGroups();

    const countResult = await this.db
      .selectFrom('ref_map_points')
      .select(eb => eb.fn.count('point_id').as('count'))
      .executeTakeFirst();

    const totalPoints = Number(countResult?.count || 0);
    let pointsRemoved = 0;
    let pointsWithAka = 0;

    const groups = duplicateGroups.map(group => {
      const names = group.points.map(p => p.name).filter((n): n is string => n !== null);
      const bestName = pickBestName(group.points.map(p => p.name));
      const akaNames = collectAkaNames(group.points.map(p => p.name), bestName);

      pointsRemoved += group.points.length - 1;
      if (akaNames) pointsWithAka++;

      return {
        lat: group.roundedLat,
        lng: group.roundedLng,
        bestName,
        akaNames,
        pointCount: group.points.length,
        allNames: names,
      };
    });

    return {
      stats: {
        totalPoints,
        uniqueLocations: totalPoints - pointsRemoved,
        duplicateGroups: duplicateGroups.length,
        pointsRemoved,
        pointsWithAka,
      },
      groups,
    };
  }

  // ========================================================================
  // CROSS-TABLE METHODS - Check ref_map_points against locs table
  // ========================================================================

  /**
   * Find ref_map_points that match existing locations in the locs table.
   * These are points that have already been "catalogued" as real locations.
   * Returns matches based on GPS proximity, name similarity, or state+name.
   */
  async findCataloguedRefPoints(): Promise<CataloguedMatch[]> {
    // Get all ref points with their state
    const refPoints = await this.db
      .selectFrom('ref_map_points')
      .innerJoin('ref_maps', 'ref_maps.map_id', 'ref_map_points.map_id')
      .select([
        'ref_map_points.point_id',
        'ref_map_points.name',
        'ref_map_points.lat',
        'ref_map_points.lng',
        'ref_map_points.state',
        'ref_maps.map_name',
      ])
      .execute();

    // Get ALL catalogued locations (including those without GPS)
    const locations = await this.db
      .selectFrom('locs')
      .select(['locid', 'locnam', 'gps_lat', 'gps_lng', 'akanam', 'state'])
      .execute();

    const matches: CataloguedMatch[] = [];

    for (const point of refPoints) {
      const pointStateNorm = normalizeState(point.state);

      for (const loc of locations) {
        const locHasGps = loc.gps_lat != null && loc.gps_lng != null;
        const locStateNorm = normalizeState(loc.state);

        if (locHasGps) {
          // LOCATION HAS GPS - use distance-based matching
          const distance = haversineDistance(point.lat, point.lng, loc.gps_lat!, loc.gps_lng!);

          if (distance <= GPS_RADIUS_METERS) {
            // GPS match - high confidence
            const nameSim = point.name && loc.locnam
              ? normalizedSimilarity(point.name, loc.locnam)
              : 0;

            matches.push({
              pointId: point.point_id,
              pointName: point.name,
              mapName: point.map_name,
              matchedLocid: loc.locid,
              matchedLocName: loc.locnam,
              nameSimilarity: Math.round(nameSim * 100),
              distanceMeters: Math.round(distance),
            });
            break; // Found match, move to next point
          }

          // Check name similarity with distance limit (uses smart matching with word-overlap boost)
          if (point.name) {
            const namesToCheck = [loc.locnam, loc.akanam].filter(Boolean) as string[];

            let foundMatch = false;
            for (const locName of namesToCheck) {
              const nameSim = normalizedSimilarity(point.name, locName);
              const isExactMatch = nameSim >= 0.99;
              // Use smart matching - applies word-overlap boost for cases like "Chevy" vs "Chevrolet"
              const isSimilarMatch = isSmartMatch(point.name, locName, NAME_SIMILARITY_THRESHOLD) && distance <= NAME_MATCH_RADIUS_METERS;

              if (isExactMatch || isSimilarMatch) {
                matches.push({
                  pointId: point.point_id,
                  pointName: point.name,
                  mapName: point.map_name,
                  matchedLocid: loc.locid,
                  matchedLocName: loc.locnam,
                  nameSimilarity: Math.round(nameSim * 100),
                  distanceMeters: Math.round(distance),
                });
                foundMatch = true;
                break;
              }
            }
            if (foundMatch) break;
          }
        } else if (locStateNorm && pointStateNorm) {
          // LOCATION HAS NO GPS BUT HAS STATE - use state-based matching
          const sameState = locStateNorm === pointStateNorm;

          if (sameState && point.name) {
            const namesToCheck = [loc.locnam, loc.akanam].filter(Boolean) as string[];

            let foundMatch = false;
            for (const locName of namesToCheck) {
              // Use smart matching with word-overlap boost
              if (isSmartMatch(point.name, locName, NAME_SIMILARITY_THRESHOLD)) {
                const nameSim = normalizedSimilarity(point.name, locName);
                // State + name match
                matches.push({
                  pointId: point.point_id,
                  pointName: point.name,
                  mapName: point.map_name,
                  matchedLocid: loc.locid,
                  matchedLocName: loc.locnam,
                  nameSimilarity: Math.round(nameSim * 100),
                  distanceMeters: 0, // No GPS, no distance
                });
                foundMatch = true;
                break;
              }
            }
            if (foundMatch) break;
          }
        } else if (point.name) {
          // LOCATION HAS NO GPS AND NO STATE - exact name match only
          const namesToCheck = [loc.locnam, loc.akanam].filter(Boolean) as string[];

          let foundMatch = false;
          for (const locName of namesToCheck) {
            const nameSim = normalizedSimilarity(point.name, locName);

            if (nameSim >= 0.99) { // 99%+ = exact match only
              matches.push({
                pointId: point.point_id,
                pointName: point.name,
                mapName: point.map_name,
                matchedLocid: loc.locid,
                matchedLocName: loc.locnam,
                nameSimilarity: Math.round(nameSim * 100),
                distanceMeters: 0, // No GPS, no distance
              });
              foundMatch = true;
              break;
            }
          }
          if (foundMatch) break;
        }
      }
    }

    return matches;
  }

  /**
   * Check incoming points against existing ref_map_points and locs.
   * Used during import preview to identify duplicates before importing.
   */
  async checkForDuplicates(points: Array<{
    name: string | null;
    description: string | null;
    lat: number;
    lng: number;
    state: string | null;
    category: string | null;
    rawMetadata: Record<string, unknown> | null;
  }>): Promise<DedupeResult> {
    const result: DedupeResult = {
      totalParsed: points.length,
      newPoints: [],
      cataloguedMatches: [],
      referenceMatches: [],
    };

    // Get existing ref points for checking
    const existingRefPoints = await this.db
      .selectFrom('ref_map_points')
      .innerJoin('ref_maps', 'ref_maps.map_id', 'ref_map_points.map_id')
      .select([
        'ref_map_points.point_id',
        'ref_map_points.name',
        'ref_map_points.lat',
        'ref_map_points.lng',
        'ref_maps.map_name',
      ])
      .execute();

    // Get ALL catalogued locations (including those without GPS)
    const locations = await this.db
      .selectFrom('locs')
      .select(['locid', 'locnam', 'gps_lat', 'gps_lng', 'akanam', 'state'])
      .execute();

    // Track locations already matched for enrichment - one ref point per location
    const matchedEnrichmentLocIds = new Set<string>();

    for (const point of points) {
      let isDuplicate = false;
      const pointStateNorm = normalizeState(point.state);

      // Check against catalogued locations (locs table)
      for (const loc of locations) {
        const locHasGps = loc.gps_lat != null && loc.gps_lng != null;
        const locStateNorm = normalizeState(loc.state);

        if (locHasGps) {
          // LOCATION HAS GPS - use distance-based matching
          const distance = haversineDistance(point.lat, point.lng, loc.gps_lat!, loc.gps_lng!);

          if (distance <= GPS_RADIUS_METERS) {
            // GPS match - high confidence, auto-skip
            const nameSim = point.name && loc.locnam
              ? normalizedSimilarity(point.name, loc.locnam)
              : 0;
            result.cataloguedMatches.push({
              type: 'catalogued',
              matchType: 'gps',
              newPoint: { name: point.name, lat: point.lat, lng: point.lng, state: point.state },
              existingId: loc.locid,
              existingName: loc.locnam,
              existingState: locStateNorm || undefined,
              existingHasGps: true, // GPS match means existing has GPS
              nameSimilarity: Math.round(nameSim * 100),
              distanceMeters: Math.round(distance),
              needsConfirmation: false,
            });
            isDuplicate = true;
            break;
          }

          // Check name similarity with distance limit (uses smart matching with word-overlap boost)
          if (point.name) {
            const namesToCheck = [loc.locnam, loc.akanam].filter(Boolean) as string[];

            for (const locName of namesToCheck) {
              const nameSim = normalizedSimilarity(point.name, locName);
              const isExactMatch = nameSim >= 0.99;
              // Use smart matching - applies word-overlap boost for cases like "Chevy" vs "Chevrolet"
              const isSimilarMatch = isSmartMatch(point.name, locName, NAME_SIMILARITY_THRESHOLD) && distance <= NAME_MATCH_RADIUS_METERS;

              if (isExactMatch || isSimilarMatch) {
                result.cataloguedMatches.push({
                  type: 'catalogued',
                  matchType: 'name_gps',
                  newPoint: { name: point.name, lat: point.lat, lng: point.lng, state: point.state },
                  existingId: loc.locid,
                  existingName: loc.locnam,
                  existingState: locStateNorm || undefined,
                  existingHasGps: true, // Name+GPS match means existing has GPS
                  nameSimilarity: Math.round(nameSim * 100),
                  distanceMeters: Math.round(distance),
                  needsConfirmation: false,
                });
                isDuplicate = true;
                break;
              }
            }
            if (isDuplicate) break;
          }
        } else if (locStateNorm && pointStateNorm) {
          // LOCATION HAS NO GPS BUT HAS STATE - use state-based matching
          // Skip if this location already has a better match
          if (matchedEnrichmentLocIds.has(loc.locid)) continue;

          const sameState = locStateNorm === pointStateNorm;

          if (sameState && point.name) {
            const namesToCheck = [loc.locnam, loc.akanam].filter(Boolean) as string[];

            for (const locName of namesToCheck) {
              // Use smart matching with word-overlap boost
              if (isSmartMatch(point.name, locName, NAME_SIMILARITY_THRESHOLD)) {
                const nameSim = normalizedSimilarity(point.name, locName);
                // State + name match - needs user confirmation
                // This is an ENRICHMENT OPPORTUNITY - existing location has no GPS
                result.cataloguedMatches.push({
                  type: 'catalogued',
                  matchType: 'name_state',
                  newPoint: { name: point.name, lat: point.lat, lng: point.lng, state: point.state },
                  existingId: loc.locid,
                  existingName: loc.locnam,
                  existingState: locStateNorm,
                  existingHasGps: false, // State-based match = existing has NO GPS
                  nameSimilarity: Math.round(nameSim * 100),
                  needsConfirmation: true, // User must confirm
                });
                matchedEnrichmentLocIds.add(loc.locid); // Mark location as matched
                isDuplicate = true;
                break;
              }
            }
            if (isDuplicate) break;
          }
        } else if (point.name) {
          // LOCATION HAS NO GPS AND NO STATE - name match for enrichment
          // Skip if this location already has a better match
          if (matchedEnrichmentLocIds.has(loc.locid)) continue;

          const namesToCheck = [loc.locnam, loc.akanam].filter(Boolean) as string[];

          for (const locName of namesToCheck) {
            // Use smart matching with word-overlap boost
            if (isSmartMatch(point.name, locName, NAME_SIMILARITY_THRESHOLD)) {
              const nameSim = normalizedSimilarity(point.name, locName);
              // This is an ENRICHMENT OPPORTUNITY - existing location has no GPS
              result.cataloguedMatches.push({
                type: 'catalogued',
                matchType: 'name_only',
                newPoint: { name: point.name, lat: point.lat, lng: point.lng, state: point.state },
                existingId: loc.locid,
                existingName: loc.locnam,
                existingHasGps: false, // Name match = existing has NO GPS
                nameSimilarity: Math.round(nameSim * 100),
                needsConfirmation: true, // User must confirm
              });
              matchedEnrichmentLocIds.add(loc.locid); // Mark location as matched
              isDuplicate = true;
              break;
            }
          }
          if (isDuplicate) break;
        }
      }

      if (isDuplicate) continue;

      // Check against existing ref_map_points (GPS proximity ~10m)
      for (const refPoint of existingRefPoints) {
        const roundedNewLat = Math.round(point.lat * 10000) / 10000;
        const roundedNewLng = Math.round(point.lng * 10000) / 10000;
        const roundedExistingLat = Math.round(refPoint.lat * 10000) / 10000;
        const roundedExistingLng = Math.round(refPoint.lng * 10000) / 10000;

        if (roundedNewLat === roundedExistingLat && roundedNewLng === roundedExistingLng) {
          result.referenceMatches.push({
            type: 'reference',
            newPoint: { name: point.name, lat: point.lat, lng: point.lng },
            existingId: refPoint.point_id,
            existingName: refPoint.name || 'Unnamed',
            mapName: refPoint.map_name,
            distanceMeters: Math.round(haversineDistance(point.lat, point.lng, refPoint.lat, refPoint.lng)),
          });
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        result.newPoints.push(point);
      }
    }

    return result;
  }

  /**
   * Delete ref_map_points by their IDs.
   * Used when purging catalogued points or after conversion to locations.
   */
  async deleteRefPoints(pointIds: string[]): Promise<number> {
    if (pointIds.length === 0) return 0;

    const result = await this.db
      .deleteFrom('ref_map_points')
      .where('point_id', 'in', pointIds)
      .execute();

    const deleted = Number(result[0]?.numDeletedRows ?? 0);
    console.log(`[RefMapDedup] Deleted ${deleted} ref_map_points`);
    return deleted;
  }
}

export default RefMapDedupService;
