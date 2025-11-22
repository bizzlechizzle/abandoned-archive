/**
 * Location Domain Model
 *
 * Represents an abandoned location in the archive.
 *
 * @module domain/location
 */

import { z } from 'zod';

/** GPS source types */
export const GPSSourceSchema = z.enum([
  'user_map_click',
  'photo_exif',
  'geocoded_address',
  'manual_entry',
]);
export type GPSSource = z.infer<typeof GPSSourceSchema>;

/** Location status values */
export const LocationStatusSchema = z.enum([
  'active',
  'demolished',
  'renovated',
  'unknown',
  'restricted',
]);
export type LocationStatus = z.infer<typeof LocationStatusSchema>;

/** Location condition values */
export const LocationConditionSchema = z.enum([
  'excellent',
  'good',
  'fair',
  'poor',
  'dangerous',
  'collapsed',
  'unknown',
]);
export type LocationCondition = z.infer<typeof LocationConditionSchema>;

/** Location input schema for creation/updates */
export const LocationInputSchema = z.object({
  locnam: z.string().min(1, 'Location name is required'),
  slocnam: z.string().nullable().optional(),
  akanam: z.string().nullable().optional(),

  // Classification
  type: z.string().nullable().optional(),
  stype: z.string().nullable().optional(),

  // GPS
  gps_lat: z.number().min(-90).max(90).nullable().optional(),
  gps_lng: z.number().min(-180).max(180).nullable().optional(),
  gps_accuracy: z.number().nullable().optional(),
  gps_source: GPSSourceSchema.nullable().optional(),
  gps_verified_on_map: z.boolean().optional(),

  // Address
  address_street: z.string().nullable().optional(),
  address_city: z.string().nullable().optional(),
  address_county: z.string().nullable().optional(),
  address_state: z.string().length(2).nullable().optional(),
  address_zipcode: z.string().nullable().optional(),

  // Status
  condition: LocationConditionSchema.nullable().optional(),
  status: LocationStatusSchema.nullable().optional(),
  historic: z.boolean().optional(),
});

export type LocationInput = z.infer<typeof LocationInputSchema>;

/** Full location schema (includes generated fields) */
export const LocationSchema = LocationInputSchema.extend({
  locid: z.string().uuid(),
  loc12: z.string().length(12),
  locadd: z.string(), // ISO8601 date added
  locup: z.string().nullable(), // ISO8601 date updated
  auth_imp: z.string().nullable(),
});

export type Location = z.infer<typeof LocationSchema>;

/** Minimal location data needed for imports */
export interface LocationRef {
  locid: string;
  locnam: string;
  slocnam: string | null;
  loc12: string;
  address_state: string | null;
  type: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
}
