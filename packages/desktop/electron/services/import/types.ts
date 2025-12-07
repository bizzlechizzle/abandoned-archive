/**
 * Import System v2.0 - Shared Types
 *
 * Centralized type definitions to ensure consistency across
 * scanner, hasher, copier, validator, finalizer, and orchestrator.
 *
 * @module services/import/types
 */

/**
 * Location context for import operations
 *
 * Contains all information needed to:
 * - Build archive folder paths
 * - Assign media to correct location/sub-location
 * - Track import provenance
 *
 * Single source of truth - used by copier, finalizer, orchestrator
 */
export interface LocationInfo {
  /** UUID of the host location */
  locid: string;

  /** 12-character short ID for folder naming */
  loc12: string;

  /** Two-letter state code (e.g., "NY") for folder hierarchy */
  address_state: string | null;

  /** Location type (e.g., "Hospital", "Factory") for folder hierarchy */
  type: string | null;

  /** Short location name for folder naming */
  slocnam: string | null;

  /**
   * Sub-location UUID (null if importing to host location)
   * When provided, media records will have this subid set
   */
  subid: string | null;

  /**
   * Sub-location 12-character short ID for folder naming
   * Optional - derived from subid if not provided
   */
  sub12?: string | null;
}

/**
 * Media type classification
 */
export type MediaType = 'image' | 'video' | 'document' | 'map' | 'unknown';

/**
 * Base file info from scanner
 */
export interface BaseFileInfo {
  /** Unique ID for tracking through pipeline */
  id: string;

  /** Original filename */
  filename: string;

  /** Original full path */
  originalPath: string;

  /** File extension (with dot) */
  extension: string;

  /** File size in bytes */
  size: number;

  /** Detected media type */
  mediaType: MediaType;
}
