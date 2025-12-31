/**
 * Location domain types
 */

import { z } from 'zod';

// ============================================================================
// Location Status
// ============================================================================

export const LocationStatusSchema = z.enum([
  'active',
  'explored',
  'photographed',
  'demolished',
  'partially_demolished',
  'renovated',
  'secured',
  'unknown',
]);
export type LocationStatus = z.infer<typeof LocationStatusSchema>;

// ============================================================================
// Location Type
// ============================================================================

export const LocationTypeSchema = z.enum([
  'industrial',
  'residential',
  'commercial',
  'institutional',
  'religious',
  'infrastructure',
  'agricultural',
  'military',
  'recreational',
  'other',
]);
export type LocationType = z.infer<typeof LocationTypeSchema>;

// ============================================================================
// GPS Source
// ============================================================================

export const GpsSourceSchema = z.enum([
  'exif',
  'geocoded',
  'user_input',
  'user_map_click',
  'reference_map',
  'imported',
  'unknown',
]);
export type GpsSource = z.infer<typeof GpsSourceSchema>;

// ============================================================================
// Location Entity
// ============================================================================

export const LocationSchema = z.object({
  // Identity
  id: z.string().regex(/^[a-f0-9]{16}$/, 'Must be 16-char BLAKE3 hex'),
  loc12: z.string().length(12).optional(), // Short display ID
  name: z.string().min(1).max(500),

  // Classification
  type: LocationTypeSchema.optional(),
  status: LocationStatusSchema.default('unknown'),
  category: z.string().optional(), // Sub-category within type
  tags: z.array(z.string()).default([]),

  // GPS
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  gpsAccuracy: z.number().positive().optional(),
  gpsSource: GpsSourceSchema.optional(),
  gpsStatus: z.string().optional(), // Verification status

  // Address
  address: z.string().optional(),
  city: z.string().optional(),
  county: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),

  // Description
  description: z.string().optional(),
  notes: z.string().optional(),

  // Status flags
  condition: z.string().optional(), // Physical condition
  access: z.string().optional(), // Access difficulty
  favorite: z.boolean().default(false),
  historic: z.boolean().default(false),

  // Media
  heroImageHash: z.string().optional(),
  heroImageFocalX: z.number().min(0).max(1).optional(),
  heroImageFocalY: z.number().min(0).max(1).optional(),
  imageCount: z.number().int().nonnegative().default(0),
  videoCount: z.number().int().nonnegative().default(0),
  documentCount: z.number().int().nonnegative().default(0),

  // Dates
  discoveredAt: z.date().optional(),
  visitedAt: z.date().optional(),
  builtYear: z.number().int().optional(),
  abandonedYear: z.number().int().optional(),
  demolishedYear: z.number().int().optional(),

  // Metadata
  createdAt: z.date(),
  updatedAt: z.date(),
  createdBy: z.string().optional(),
  updatedBy: z.string().optional(),
});

export type Location = z.infer<typeof LocationSchema>;

// ============================================================================
// Location Input (for creation)
// ============================================================================

export const LocationInputSchema = z.object({
  name: z.string().min(1).max(500),
  type: LocationTypeSchema.optional(),
  status: LocationStatusSchema.optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  gpsSource: GpsSourceSchema.optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  county: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  condition: z.string().optional(),
  access: z.string().optional(),
  favorite: z.boolean().optional(),
  historic: z.boolean().optional(),
  discoveredAt: z.date().optional(),
  builtYear: z.number().int().optional(),
  abandonedYear: z.number().int().optional(),
});

export type LocationInput = z.infer<typeof LocationInputSchema>;

// ============================================================================
// Location Update (for partial updates)
// ============================================================================

export const LocationUpdateSchema = LocationInputSchema.partial();
export type LocationUpdate = z.infer<typeof LocationUpdateSchema>;

// ============================================================================
// Location Filters
// ============================================================================

export const LocationFiltersSchema = z.object({
  // Text search
  search: z.string().optional(),

  // Classification filters
  type: LocationTypeSchema.optional(),
  types: z.array(LocationTypeSchema).optional(),
  status: LocationStatusSchema.optional(),
  statuses: z.array(LocationStatusSchema).optional(),
  tags: z.array(z.string()).optional(),

  // Geographic filters
  state: z.string().optional(),
  county: z.string().optional(),
  city: z.string().optional(),
  culturalRegion: z.string().optional(),

  // Bounding box
  north: z.number().min(-90).max(90).optional(),
  south: z.number().min(-90).max(90).optional(),
  east: z.number().min(-180).max(180).optional(),
  west: z.number().min(-180).max(180).optional(),

  // Near point
  nearLat: z.number().min(-90).max(90).optional(),
  nearLon: z.number().min(-180).max(180).optional(),
  nearRadius: z.number().positive().optional(), // meters

  // Date filters
  createdAfter: z.date().optional(),
  createdBefore: z.date().optional(),
  updatedAfter: z.date().optional(),
  updatedBefore: z.date().optional(),

  // Media filters
  hasImages: z.boolean().optional(),
  hasVideos: z.boolean().optional(),
  hasDocuments: z.boolean().optional(),
  hasHeroImage: z.boolean().optional(),

  // Pagination
  limit: z.number().int().positive().max(1000).optional(),
  offset: z.number().int().nonnegative().optional(),

  // Sorting
  sortBy: z.enum([
    'name',
    'createdAt',
    'updatedAt',
    'state',
    'city',
    'imageCount',
  ]).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export type LocationFilters = z.infer<typeof LocationFiltersSchema>;

// ============================================================================
// Geocoding Types
// ============================================================================

export const GeocodingResultSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().positive().optional(),
  formattedAddress: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  county: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
  source: z.string(),
});

export type GeocodingResult = z.infer<typeof GeocodingResultSchema>;

export const ReverseGeocodingResultSchema = z.object({
  formattedAddress: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  county: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
  source: z.string(),
});

export type ReverseGeocodingResult = z.infer<typeof ReverseGeocodingResultSchema>;

// ============================================================================
// Location Stats
// ============================================================================

export interface LocationStats {
  totalLocations: number;
  byStatus: Record<LocationStatus, number>;
  byType: Record<LocationType, number>;
  byState: Record<string, number>;
  withGps: number;
  withHeroImage: number;
  totalImages: number;
  totalVideos: number;
  totalDocuments: number;
}

// ============================================================================
// Duplicate Detection
// ============================================================================

export interface LocationDuplicate {
  location1: Location;
  location2: Location;
  confidence: number;
  reasons: string[];
  distance?: number; // meters
  nameSimilarity?: number;
}
