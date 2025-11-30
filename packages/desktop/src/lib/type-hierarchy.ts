/**
 * Type Hierarchy Map
 *
 * Defines the relationship between location types and their sub-types.
 * Used for auto-filling the type field when user enters a known sub-type.
 */

export const TYPE_HIERARCHY: Record<string, string[]> = {
  'Faith': ['Church', 'Chapel', 'Monastery', 'Temple', 'Synagogue', 'Mosque', 'Cathedral', 'Convent', 'Abbey', 'Shrine'],
  'Medical': ['Hospital', 'Sanatorium', 'Asylum', 'Psychiatric', 'Clinic', 'Infirmary', 'Nursing Home', 'Sanitarium'],
  'Industrial': ['Factory', 'Mill', 'Foundry', 'Warehouse', 'Power Plant', 'Refinery', 'Mine', 'Quarry', 'Smelter'],
  'Education': ['School', 'College', 'University', 'Academy', 'Seminary', 'Library', 'Gymnasium'],
  'Residential': ['Hotel', 'Mansion', 'Resort', 'Apartment', 'Dormitory', 'Orphanage', 'Motel', 'Inn', 'Lodge'],
  'Government': ['Courthouse', 'Prison', 'Jail', 'Post Office', 'Armory', 'City Hall', 'Penitentiary'],
  'Commercial': ['Theater', 'Bank', 'Department Store', 'Office Building', 'Shopping Center', 'Restaurant'],
  'Transportation': ['Train Station', 'Airport', 'Bus Station', 'Depot', 'Terminal', 'Hangar'],
  'Military': ['Base', 'Fort', 'Bunker', 'Barracks', 'Arsenal', 'Missile Silo'],
  'Recreation': ['Amusement Park', 'Stadium', 'Pool', 'Country Club', 'Golf Course', 'Skating Rink', 'Bowling Alley'],
  'Agricultural': ['Farm', 'Barn', 'Silo', 'Granary', 'Dairy', 'Greenhouse'],
};

// Build reverse lookup: subtype (lowercase) → type
const SUBTYPE_TO_TYPE: Record<string, string> = {};
for (const [type, subtypes] of Object.entries(TYPE_HIERARCHY)) {
  for (const subtype of subtypes) {
    SUBTYPE_TO_TYPE[subtype.toLowerCase()] = type;
  }
}

/**
 * Get the parent type for a given sub-type.
 * Returns null if sub-type is not in the hierarchy.
 *
 * @example
 * getTypeForSubtype('church') // Returns 'Faith'
 * getTypeForSubtype('hospital') // Returns 'Medical'
 * getTypeForSubtype('unknown') // Returns null
 */
export function getTypeForSubtype(subtype: string): string | null {
  if (!subtype) return null;
  return SUBTYPE_TO_TYPE[subtype.toLowerCase().trim()] || null;
}

/**
 * Get all known types.
 */
export function getAllTypes(): string[] {
  return Object.keys(TYPE_HIERARCHY);
}

/**
 * Get all known sub-types for a given type.
 */
export function getSubtypesForType(type: string): string[] {
  return TYPE_HIERARCHY[type] || [];
}
