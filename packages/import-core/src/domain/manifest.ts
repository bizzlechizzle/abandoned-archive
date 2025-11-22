/**
 * Import Manifest Domain Model
 *
 * Tracks import state for recovery, audit, and progress reporting.
 * Manifest files are saved to disk and can be resumed if interrupted.
 *
 * @module domain/manifest
 */

import { z } from 'zod';
import { randomUUID } from 'crypto';
import type { LocationRef } from './location.js';

/** Import phases */
export const ImportPhaseSchema = z.enum([
  'pending',
  'phase_1_log',
  'phase_2_serialize',
  'phase_3_copy',
  'phase_4_dump',
  'complete',
  'failed',
]);
export type ImportPhase = z.infer<typeof ImportPhaseSchema>;

/** File status within import */
export const FileStatusSchema = z.enum([
  'pending',
  'hashing',
  'hashed',
  'extracting_metadata',
  'serialized',
  'copying',
  'copied',
  'verified',
  'complete',
  'error',
  'duplicate',
  'skipped',
]);
export type FileStatus = z.infer<typeof FileStatusSchema>;

/** Individual file entry in manifest */
export const ManifestFileSchema = z.object({
  index: z.number(),
  originalPath: z.string(),
  originalName: z.string(),
  sizeBytes: z.number(),

  // Phase 2: Serialize
  sha256: z.string().nullable(),
  type: z.enum(['image', 'video', 'document', 'map']).nullable(),
  isDuplicate: z.boolean(),
  metadata: z.record(z.unknown()).nullable(),

  // Phase 3: Copy
  archivePath: z.string().nullable(),
  archiveName: z.string().nullable(),
  verified: z.boolean(),

  // Status tracking
  status: FileStatusSchema,
  error: z.string().nullable(),
});
export type ManifestFile = z.infer<typeof ManifestFileSchema>;

/** Import options */
export const ImportOptionsSchema = z.object({
  deleteOriginals: z.boolean().default(false),
  useHardlinks: z.boolean().default(false),
  verifyChecksums: z.boolean().default(true),
  useRsync: z.boolean().default(true),
});
export type ImportOptions = z.infer<typeof ImportOptionsSchema>;

/** Import summary statistics */
export const ImportSummarySchema = z.object({
  total: z.number(),
  imported: z.number(),
  duplicates: z.number(),
  errors: z.number(),
  skipped: z.number(),
  images: z.number(),
  videos: z.number(),
  documents: z.number(),
  maps: z.number(),
  bytesProcessed: z.number(),
});
export type ImportSummary = z.infer<typeof ImportSummarySchema>;

/** Progress callback data */
export interface ImportProgress {
  phase: ImportPhase;
  percent: number;
  currentFile?: string;
  filesProcessed: number;
  totalFiles: number;
  bytesProcessed?: number;
  totalBytes?: number;
}

/** Full manifest schema */
export const ManifestSchema = z.object({
  importId: z.string(),
  version: z.literal('1.0'),
  createdAt: z.string(),
  updatedAt: z.string(),
  phase: ImportPhaseSchema,

  location: z.object({
    locid: z.string(),
    locnam: z.string(),
    slocnam: z.string().nullable(),
    loc12: z.string(),
    state: z.string().nullable(),
    type: z.string().nullable(),
  }),

  options: ImportOptionsSchema,
  files: z.array(ManifestFileSchema),
  summary: ImportSummarySchema.nullable(),

  // Audit info
  authImp: z.string().nullable(),
  subid: z.string().nullable(),
});
export type Manifest = z.infer<typeof ManifestSchema>;

/** Input for creating a new import */
export interface ImportInput {
  files: Array<{ path: string; name: string; size: number }>;
  locationId: string;
  location: LocationRef;
  options?: Partial<ImportOptions>;
  authImp?: string | null;
  subid?: string | null;
}

/** Result of import operation */
export interface ImportResult {
  success: boolean;
  importId: string;
  manifestPath: string;
  summary: ImportSummary;
  errors: string[];
}

/**
 * Generate a unique import ID.
 *
 * Format: imp-YYYYMMDD-xxxxxxxx
 */
export function generateImportId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const uuid = randomUUID().slice(0, 8);
  return `imp-${date}-${uuid}`;
}

/**
 * Create a new manifest from import input.
 */
export function createManifest(input: ImportInput): Manifest {
  const now = new Date().toISOString();

  return {
    importId: generateImportId(),
    version: '1.0',
    createdAt: now,
    updatedAt: now,
    phase: 'phase_1_log',

    location: {
      locid: input.location.locid,
      locnam: input.location.locnam,
      slocnam: input.location.slocnam,
      loc12: input.location.loc12,
      state: input.location.address_state,
      type: input.location.type,
    },

    options: {
      deleteOriginals: input.options?.deleteOriginals ?? false,
      useHardlinks: input.options?.useHardlinks ?? false,
      verifyChecksums: input.options?.verifyChecksums ?? true,
      useRsync: input.options?.useRsync ?? true,
    },

    files: input.files.map((f, index) => ({
      index,
      originalPath: f.path,
      originalName: f.name,
      sizeBytes: f.size,
      sha256: null,
      type: null,
      isDuplicate: false,
      metadata: null,
      archivePath: null,
      archiveName: null,
      verified: false,
      status: 'pending',
      error: null,
    })),

    summary: null,
    authImp: input.authImp ?? null,
    subid: input.subid ?? null,
  };
}

/**
 * Calculate summary from manifest files.
 */
export function calculateSummary(files: ManifestFile[]): ImportSummary {
  const summary: ImportSummary = {
    total: files.length,
    imported: 0,
    duplicates: 0,
    errors: 0,
    skipped: 0,
    images: 0,
    videos: 0,
    documents: 0,
    maps: 0,
    bytesProcessed: 0,
  };

  for (const file of files) {
    if (file.status === 'complete') {
      summary.imported++;
      summary.bytesProcessed += file.sizeBytes;

      switch (file.type) {
        case 'image': summary.images++; break;
        case 'video': summary.videos++; break;
        case 'document': summary.documents++; break;
        case 'map': summary.maps++; break;
      }
    } else if (file.status === 'duplicate') {
      summary.duplicates++;
    } else if (file.status === 'error') {
      summary.errors++;
    } else if (file.status === 'skipped') {
      summary.skipped++;
    }
  }

  return summary;
}
