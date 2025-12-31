/**
 * Shared types for all services
 */

import { z } from 'zod';

// ============================================================================
// Result Types
// ============================================================================

/**
 * Standard result type for operations that can fail
 */
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Create a success result
 */
export function ok<T>(data: T): Result<T, never> {
  return { success: true, data };
}

/**
 * Create a failure result
 */
export function err<E>(error: E): Result<never, E> {
  return { success: false, error };
}

// ============================================================================
// Pagination Types
// ============================================================================

export const PaginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(1000).default(50),
  offset: z.number().int().nonnegative().optional(),
});

export type Pagination = z.infer<typeof PaginationSchema>;

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// ============================================================================
// Sort Types
// ============================================================================

export const SortOrderSchema = z.enum(['asc', 'desc']);
export type SortOrder = z.infer<typeof SortOrderSchema>;

export interface SortOptions<T> {
  field: keyof T;
  order: SortOrder;
}

// ============================================================================
// Filter Types
// ============================================================================

export interface DateRange {
  from?: Date;
  to?: Date;
}

export interface NumberRange {
  min?: number;
  max?: number;
}

// ============================================================================
// GPS Types
// ============================================================================

export const CoordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export type Coordinates = z.infer<typeof CoordinatesSchema>;

export const BoundingBoxSchema = z.object({
  north: z.number().min(-90).max(90),
  south: z.number().min(-90).max(90),
  east: z.number().min(-180).max(180),
  west: z.number().min(-180).max(180),
});

export type BoundingBox = z.infer<typeof BoundingBoxSchema>;

// ============================================================================
// Media Types
// ============================================================================

export const MediaTypeSchema = z.enum(['image', 'video', 'document', 'map']);
export type MediaType = z.infer<typeof MediaTypeSchema>;

export const ImageFormatSchema = z.enum([
  'jpeg',
  'jpg',
  'png',
  'gif',
  'webp',
  'tiff',
  'tif',
  'heic',
  'heif',
  'raw',
  'dng',
  'cr2',
  'nef',
  'arw',
]);
export type ImageFormat = z.infer<typeof ImageFormatSchema>;

export const VideoFormatSchema = z.enum([
  'mp4',
  'mov',
  'avi',
  'mkv',
  'webm',
  'wmv',
  'flv',
]);
export type VideoFormat = z.infer<typeof VideoFormatSchema>;

// ============================================================================
// Job Types
// ============================================================================

export const JobStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobTypeSchema = z.enum([
  'import',
  'thumbnail',
  'metadata',
  'tag',
  'ocr',
  'backup',
  'export',
  'scrape',
  'download',
  'capture',
]);
export type JobType = z.infer<typeof JobTypeSchema>;

export interface Job<T = unknown> {
  id: string;
  type: JobType;
  status: JobStatus;
  payload: T;
  priority: number;
  attempts: number;
  maxAttempts: number;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

// ============================================================================
// Event Types
// ============================================================================

export interface ServiceEvent<T = unknown> {
  type: string;
  payload: T;
  timestamp: Date;
  source: string;
}

export type EventHandler<T = unknown> = (event: ServiceEvent<T>) => void | Promise<void>;

// Note: ServiceConfig is defined in config.ts with full Zod schema
