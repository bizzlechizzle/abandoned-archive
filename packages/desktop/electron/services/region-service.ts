/**
 * RegionService - Auto-populate Census regions, divisions, and state direction
 *
 * Per DECISION-012: Auto-Population of Regions
 * Per DECISION-017: Local & Region sections overhaul
 *
 * Features:
 * - Census Region lookup from state (4 regions: Northeast, Midwest, South, West)
 * - Census Division lookup from state (9 divisions)
 * - State Direction calculation from GPS vs state center
 * - Local Cultural Region suggestion from county lookup
 * - Country Cultural Region lookup from GPS (point-in-polygon)
 *
 * All calculations are offline-first using embedded data.
 */

import {
  getCensusRegion,
  getCensusDivision,
  getStateDirection,
  getCulturalRegionFromCounty,
  getCulturalRegionsForState,
} from '../../src/lib/census-regions';

import {
  getCountryCulturalRegion,
  getNearbyCountryCulturalRegions,
  getCountryCulturalRegionsByCategory,
  isValidCountryCulturalRegion,
  type CountryCulturalRegionWithDistance,
} from '../../src/lib/country-cultural-regions';

/**
 * Region fields for a location
 */
export interface RegionFields {
  censusRegion: string | null;           // Northeast, Midwest, South, West
  censusDivision: string | null;         // New England, Middle Atlantic, etc.
  stateDirection: string | null;         // e.g., "Eastern NY", "Central TX"
  culturalRegion: string | null;         // e.g., "Capital Region", "Hudson Valley" (local/state-level)
  countryCulturalRegion: string | null;  // e.g., "NYC Metro", "Cascadia" (national-level)
}

/**
 * Input data for calculating region fields
 */
export interface RegionInput {
  state?: string | null;
  addressState?: string | null;                  // Fallback if state is empty
  county?: string | null;
  lat?: number | null;
  lng?: number | null;
  existingCulturalRegion?: string | null;        // Don't overwrite if already set
  existingCountryCulturalRegion?: string | null; // Don't overwrite if already set
}

/**
 * Calculate all region fields from location data
 * Returns region fields that should be auto-populated
 */
export function calculateRegionFields(input: RegionInput): RegionFields {
  const { state, addressState, county, lat, lng, existingCulturalRegion, existingCountryCulturalRegion } = input;

  // Use state or fall back to addressState
  const effectiveState = state || addressState || null;

  // Census Region from state (always recalculate)
  const censusRegion = getCensusRegion(effectiveState);

  // Census Division from state (always recalculate)
  const censusDivision = getCensusDivision(effectiveState);

  // State Direction from GPS + state (always recalculate)
  const stateDirection = getStateDirection(lat, lng, effectiveState);

  // Local Cultural Region from county lookup (only suggest if not already set)
  let culturalRegion = existingCulturalRegion || null;
  if (!culturalRegion && county && effectiveState) {
    culturalRegion = getCulturalRegionFromCounty(effectiveState, county);
  }

  // Country Cultural Region from GPS (only suggest if not already set)
  let countryCulturalRegion = existingCountryCulturalRegion || null;
  if (!countryCulturalRegion && lat && lng) {
    countryCulturalRegion = getCountryCulturalRegion(lat, lng);
  }

  return {
    censusRegion,
    censusDivision,
    stateDirection,
    culturalRegion,
    countryCulturalRegion,
  };
}

/**
 * Get cultural region options for a state (for dropdown)
 */
export function getCulturalRegionOptions(state: string | null | undefined): string[] {
  return getCulturalRegionsForState(state);
}

/**
 * Validate that a cultural region is valid for the given state
 */
export function isValidCulturalRegion(
  state: string | null | undefined,
  culturalRegion: string | null | undefined
): boolean {
  if (!culturalRegion) return true; // null is always valid
  const options = getCulturalRegionsForState(state);
  return options.includes(culturalRegion);
}

// Re-export individual functions for direct use
export {
  getCensusRegion,
  getCensusDivision,
  getStateDirection,
  getCulturalRegionFromCounty,
  getCulturalRegionsForState,
  // DECISION-017: Country Cultural Region exports
  getCountryCulturalRegion,
  getNearbyCountryCulturalRegions,
  getCountryCulturalRegionsByCategory,
  isValidCountryCulturalRegion,
};

// Re-export types
export type { CountryCulturalRegionWithDistance };
