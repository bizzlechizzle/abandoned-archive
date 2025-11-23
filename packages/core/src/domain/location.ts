import { z } from 'zod';
import slugify from 'slugify';

// GPS Coordinates Schema
export const GPSCoordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().optional(),
  source: z.enum(['user_map_click', 'photo_exif', 'geocoded_address', 'manual_entry']),
  verifiedOnMap: z.boolean().default(false),
  capturedAt: z.string().datetime().optional(),
  leafletData: z.record(z.unknown()).optional()
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
  geocodedAt: z.string().datetime().optional()
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
  hero_imgsha: z.string().optional(),
  auth_imp: z.string().optional()
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
  state: z.string().optional()
});

export type Location = z.infer<typeof LocationSchema>;

// GPS Confidence Type
export type GPSConfidence = 'verified' | 'high' | 'medium' | 'low' | 'none';

// Location class with business logic
export class LocationEntity {
  constructor(private readonly data: Location) {}

  // Generate short name from location name
  static generateShortName(name: string): string {
    const slug = slugify(name, {
      lower: true,
      strict: true,
      remove: /[*+~.()'"!:@]/g
    });
    return slug.substring(0, 12);
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
