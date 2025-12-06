import { z } from 'zod';

/**
 * IPC Input Validation Schemas
 * Validates all user inputs from renderer process
 */

// Common validators
export const UuidSchema = z.string().uuid();
export const PositiveIntSchema = z.number().int().positive();
export const NonNegativeIntSchema = z.number().int().nonnegative();
export const LimitSchema = z.number().int().positive().max(1000).default(10);
export const OffsetSchema = z.number().int().nonnegative().default(0);
export const FilePathSchema = z.string().min(1).max(4096);
export const UrlSchema = z.string().url().max(2048);

// OPT-058: Chunk progress tracking for unified progress bars
export const ChunkOffsetSchema = z.number().int().min(0).default(0);
export const TotalOverallSchema = z.number().int().min(1).optional();

// Validation helper function
export function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new Error(`Validation error: ${messages}`);
    }
    throw error;
  }
}

// Common parameter schemas
export const IdParamSchema = z.object({
  id: UuidSchema,
});

export const TwoIdParamsSchema = z.object({
  id1: UuidSchema,
  id2: UuidSchema,
});

export const PaginationSchema = z.object({
  limit: LimitSchema,
  offset: OffsetSchema,
});

// Settings validation - whitelist of allowed setting keys
export const SettingKeySchema = z.enum([
  // UI preferences
  'theme',
  'defaultView',
  'sortBy',
  'sortOrder',
  // Backup settings
  'enableBackups',
  'backupInterval',
  'maxBackups',
  'last_backup_date',
  // Core app settings (used by Setup/Settings pages)
  'archive_folder',
  'current_user',
  'current_user_id',
  'delete_on_import',
  'setup_complete',
  'app_mode',
  'require_login',
  'login_required',
  'import_map',
  'map_import',
]);

export const SettingValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);
