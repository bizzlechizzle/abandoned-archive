import { z } from 'zod';
import slugify from 'slugify';

// Words to filter out from short names for better uniqueness
const STOPWORDS = ['and', 'the', 'of', 'at', 'in', 'on', 'a', 'an'];
const LOCATION_SUFFIXES = [
  'church', 'hospital', 'factory', 'mill', 'school', 'building',
  'house', 'mansion', 'hotel', 'motel', 'inn', 'theater', 'theatre',
  'station', 'depot', 'warehouse', 'plant', 'complex', 'center',
  'centre', 'asylum', 'sanitarium', 'sanatorium', 'prison', 'jail',
  'penitentiary', 'cemetery', 'memorial', 'monument', 'cathedral',
  'chapel', 'temple', 'synagogue', 'mosque', 'abbey', 'monastery',
  'convent', 'rectory', 'parsonage', 'vicarage', 'catholic'
];

// GPS Coordinates Schema
export const GPSCoordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().optional(),
  // Extended source enum to support all GPS origins in the codebase
  source: z.enum([
    'user_map_click',    // User clicked on map
    'photo_exif',        // From photo EXIF data
    'geocoded_address',  // Forward geocoded from address
    'manual_entry',      // Manually typed coordinates
    'exif',              // Legacy: same as photo_exif
    'media_gps',         // From media file GPS
    'geocoding',         // Generic geocoding
    'reverse_geocode',   // GPS was reverse geocoded to get address
    'manual',            // Legacy: same as manual_entry
    'user_input',        // Legacy: same as manual_entry
  ]),
  verifiedOnMap: z.boolean().default(false),
  capturedAt: z.string().datetime().optional(),
  leafletData: z.record(z.unknown()).optional(),
  // Kanye9: Cascade geocoding tier (1-5, only for geocoded_address source)
  geocodeTier: z.number().min(1).max(5).optional(),
  geocodeQuery: z.string().optional(),
  // DECISION-010: GPS verification metadata
  verifiedAt: z.string().datetime().optional(),
  verifiedBy: z.enum(['user', 'api', 'import']).optional(),
});

export type GPSCoordinates = z.infer<typeof GPSCoordinatesSchema>;

// Address Schema
export const AddressSchema = z.object({
  street: z.string().optional(),
  city: z.string().optional(),
  county: z.string().optional(),
  state: z.string().length(2).optional(),
  zipcode: z.string().regex(/^\d{5}(-\d{4})?$/).optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  geocodedAt: z.string().datetime().optional(),
  // DECISION-010: Address verification
  verified: z.boolean().default(false),
  verifiedAt: z.string().datetime().optional(),
  verifiedBy: z.enum(['user', 'api', 'import']).optional(),
});

export type Address = z.infer<typeof AddressSchema>;

// Location Input Schema (for creating/updating)
export const LocationInputSchema = z.object({
  locnam: z.string().min(1).max(255),
  slocnam: z.string().max(12).optional(),
  akanam: z.string().optional(),
  type: z.string().optional(),
  stype: z.string().optional(),
  gps: GPSCoordinatesSchema.optional(),
  address: AddressSchema.optional(),
  condition: z.string().optional(),
  status: z.string().optional(),
  documentation: z.string().optional(),
  access: z.string().optional(),
  historic: z.boolean().default(false),
  favorite: z.boolean().default(false),
  // DECISION-013: Information box fields
  builtYear: z.string().optional(),       // Year, range, or date as text
  builtType: z.enum(['year', 'range', 'date']).optional(),
  abandonedYear: z.string().optional(),
  abandonedType: z.enum(['year', 'range', 'date']).optional(),
  project: z.boolean().default(false),
  docInterior: z.boolean().default(false),
  docExterior: z.boolean().default(false),
  docDrone: z.boolean().default(false),
  docWebHistory: z.boolean().default(false),
  hero_imgsha: z.string().optional(),
  auth_imp: z.string().optional(),
  // DECISION-019: Information Box overhaul fields
  historicalName: z.string().optional(),       // Historical/original name of location
  locnamVerified: z.boolean().default(false),  // User verified location name is correct
  historicalNameVerified: z.boolean().default(false), // User verified historical name is correct
  akanamVerified: z.boolean().default(false),  // User verified AKA name is correct
});

export type LocationInput = z.infer<typeof LocationInputSchema>;

// Full Location Schema (from database)
export const LocationSchema = LocationInputSchema.extend({
  locid: z.string().uuid(),
  loc12: z.string().length(12),
  locadd: z.string().datetime(),
  locup: z.string().datetime().optional(),
  sublocs: z.array(z.string()).default([]),
  sub12: z.string().optional(),
  regions: z.array(z.string()).default([]),
  state: z.string().optional(),
  // DECISION-010: Location-level verification (set when BOTH address AND GPS verified)
  locationVerified: z.boolean().default(false),
  locationVerifiedAt: z.string().datetime().optional(),
  // DECISION-011: Cultural region (user-entered, subjective, does NOT count toward Location ✓)
  culturalRegion: z.string().optional(),
  // DECISION-012: Census regions (auto-populated from state/GPS, offline-first)
  censusRegion: z.string().optional(),     // Northeast, Midwest, South, West
  censusDivision: z.string().optional(),   // New England, Middle Atlantic, etc. (9 divisions)
  stateDirection: z.string().optional(),   // e.g., "Eastern NY", "Central TX"
  // DECISION-017: Country Cultural Region and geographic hierarchy
  countryCulturalRegion: z.string().optional(),        // 50 national-level regions (NYC Metro, Cascadia, etc.)
  countryCulturalRegionVerified: z.boolean().default(false),  // User verified the country cultural region
  localCulturalRegionVerified: z.boolean().default(false),    // User verified the local cultural region
  country: z.string().default('United States'),        // Country name
  continent: z.string().default('North America'),      // Continent name
});

export type Location = z.infer<typeof LocationSchema>;

// GPS Confidence Type
export type GPSConfidence = 'verified' | 'high' | 'medium' | 'low' | 'none';

// Location class with business logic
export class LocationEntity {
  constructor(private readonly data: Location) {}

  // Generate short name from location name
  // Removes stopwords and location-type suffixes for maximum uniqueness in 12 chars
  static generateShortName(name: string): string {
    const slug = slugify(name, {
      lower: true,
      strict: true,
      remove: /[*+~.()'"!:@]/g
    });

    // Split on hyphens, remove stopwords and location suffixes, rejoin without hyphens
    const words = slug.split('-').filter(w =>
      !STOPWORDS.includes(w) && !LOCATION_SUFFIXES.includes(w)
    );
    const compact = words.join('');

    // Edge case: if all words filtered out, fall back to first 12 chars of original slug
    if (compact.length === 0) {
      return slug.replace(/-/g, '').substring(0, 12);
    }

    return compact.substring(0, 12);
  }

  // Generate 12-character unique ID
  static generateLoc12(uuid: string): string {
    return uuid.replace(/-/g, '').substring(0, 12);
  }

  // Get GPS confidence level
  getGPSConfidence(): GPSConfidence {
    if (!this.data.gps) return 'none';

    const { source, verifiedOnMap, accuracy } = this.data.gps;

    if (verifiedOnMap && source === 'user_map_click') {
      return 'verified';
    }

    if (source === 'photo_exif' && accuracy && accuracy < 10) {
      return 'high';
    }

    if (source === 'geocoded_address') {
      return 'medium';
    }

    return 'low';
  }

  // Check if location needs map verification
  needsMapVerification(): boolean {
    return this.data.gps?.verifiedOnMap === false;
  }

  // DECISION-010: Check if location is fully verified (both address AND GPS)
  isFullyVerified(): boolean {
    const addressVerified = this.data.address?.verified === true;
    const gpsVerified = this.data.gps?.verifiedOnMap === true;
    return addressVerified && gpsVerified;
  }

  // DECISION-010: Check if address is verified
  isAddressVerified(): boolean {
    return this.data.address?.verified === true;
  }

  // DECISION-010: Check if GPS is verified
  isGPSVerified(): boolean {
    return this.data.gps?.verifiedOnMap === true;
  }

  // Validate GPS coordinates are within reasonable bounds
  hasValidGPS(): boolean {
    if (!this.data.gps) return false;

    const { lat, lng } = this.data.gps;
    return (
      lat >= -90 && lat <= 90 &&
      lng >= -180 && lng <= 180
    );
  }

  // Get full address string
  getFullAddress(): string | null {
    const { address } = this.data;
    if (!address) return null;

    const parts = [
      address.street,
      address.city,
      address.state,
      address.zipcode
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(', ') : null;
  }

  // Get display name (with AKA if exists)
  getDisplayName(): string {
    if (this.data.akanam) {
      return `${this.data.locnam} (${this.data.akanam})`;
    }
    return this.data.locnam;
  }

  // Check if location is documented
  isDocumented(): boolean {
    return this.data.documentation !== 'No Visit / Keyboard Scout';
  }

  // Get raw data
  toJSON(): Location {
    return this.data;
  }
}
