/**
 * Provenance Domain Model
 *
 * Tracks the chain of custody for media files.
 * Essential for institutional trust and archive-grade credibility.
 *
 * @module domain/provenance
 */

import { z } from 'zod';
import type { MediaType } from './media.js';

/** Contributor role in institution */
export const ContributorRoleSchema = z.enum([
  'student',
  'faculty',
  'staff',
  'volunteer',
  'researcher',
  'contractor',
  'unknown',
]);
export type ContributorRole = z.infer<typeof ContributorRoleSchema>;

/** Source volume types */
export const SourceVolumeSchema = z.enum([
  'sd_card',
  'usb_drive',
  'internal_storage',
  'network_share',
  'cloud_storage',
  'email_attachment',
  'web_download',
  'scanner',
  'unknown',
]);
export type SourceVolume = z.infer<typeof SourceVolumeSchema>;

/** Chain of custody entry */
export const CustodyEntrySchema = z.object({
  timestamp: z.string(), // ISO8601
  action: z.string(), // 'captured', 'transferred', 'imported', 'verified'
  actor: z.string(), // Who performed action
  location: z.string().optional(), // Where action occurred
  notes: z.string().optional(),
});
export type CustodyEntry = z.infer<typeof CustodyEntrySchema>;

/** Provenance record schema */
export const ProvenanceRecordSchema = z.object({
  provenanceId: z.string().uuid(),

  // Link to media
  mediaSha: z.string().length(64),
  mediaType: z.enum(['image', 'video', 'document', 'map']),

  // WHO captured/imported
  capturedBy: z.string().nullable().optional(),
  capturedByRole: ContributorRoleSchema.nullable().optional(),
  importedBy: z.string(),
  institution: z.string().nullable().optional(),

  // WHAT (original context)
  originalFilename: z.string(),
  originalDevice: z.string().nullable().optional(),
  originalDeviceSerial: z.string().nullable().optional(),

  // WHEN
  capturedAt: z.string().nullable().optional(), // ISO8601
  importedAt: z.string(), // ISO8601

  // WHERE (capture location)
  captureGpsLat: z.number().nullable().optional(),
  captureGpsLng: z.number().nullable().optional(),
  captureGpsAccuracy: z.number().nullable().optional(),

  // WHY (context)
  project: z.string().nullable().optional(),
  fieldTripId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),

  // Chain of custody
  sourcePath: z.string(),
  sourceVolume: SourceVolumeSchema.nullable().optional(),
  custodyChain: z.array(CustodyEntrySchema).optional(),
});

export type ProvenanceRecord = z.infer<typeof ProvenanceRecordSchema>;

/**
 * Create a new provenance record.
 *
 * @param mediaSha - SHA256 hash of media file
 * @param mediaType - Type of media
 * @param importedBy - Username of importer
 * @param originalFilename - Original filename
 * @param sourcePath - Original file path
 */
export function createProvenanceRecord(
  mediaSha: string,
  mediaType: MediaType,
  importedBy: string,
  originalFilename: string,
  sourcePath: string
): Omit<ProvenanceRecord, 'provenanceId'> {
  return {
    mediaSha,
    mediaType,
    importedBy,
    originalFilename,
    sourcePath,
    importedAt: new Date().toISOString(),
    capturedBy: null,
    capturedByRole: null,
    institution: null,
    originalDevice: null,
    originalDeviceSerial: null,
    capturedAt: null,
    captureGpsLat: null,
    captureGpsLng: null,
    captureGpsAccuracy: null,
    project: null,
    fieldTripId: null,
    notes: null,
    sourceVolume: null,
    custodyChain: [
      {
        timestamp: new Date().toISOString(),
        action: 'imported',
        actor: importedBy,
      },
    ],
  };
}
