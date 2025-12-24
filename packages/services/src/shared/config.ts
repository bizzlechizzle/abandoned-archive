/**
 * Service configuration management
 */

import { z } from 'zod';
import { join } from 'path';
import { homedir } from 'os';

// ============================================================================
// Config Schema
// ============================================================================

export const ServiceConfigSchema = z.object({
  databasePath: z.string().default(() =>
    join(homedir(), '.abandoned-archive', 'archive.db')
  ),
  archiveDir: z.string().default(() =>
    join(homedir(), 'Pictures', 'abandoned-archive')
  ),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  aiProvider: z.enum(['ollama', 'litellm', 'openai']).optional(),
  geocodingApiKey: z.string().optional(),

  // Import settings
  import: z.object({
    hashAlgorithm: z.enum(['blake3', 'sha256']).default('blake3'),
    generateThumbnails: z.boolean().default(true),
    extractMetadata: z.boolean().default(true),
    recursive: z.boolean().default(true),
  }).default({}),

  // Thumbnail settings
  thumbnails: z.object({
    sizes: z.array(z.number()).default([256, 512, 1024]),
    format: z.enum(['jpeg', 'webp', 'png']).default('webp'),
    quality: z.number().min(1).max(100).default(80),
  }).default({}),

  // Queue settings
  queue: z.object({
    concurrency: z.number().min(1).max(20).default(3),
    maxRetries: z.number().min(0).max(10).default(3),
    retryDelay: z.number().min(100).max(60000).default(1000),
  }).default({}),

  // Web scraping settings
  web: z.object({
    headless: z.boolean().default(true),
    timeout: z.number().min(1000).max(120000).default(30000),
    userAgent: z.string().optional(),
  }).default({}),
});

export type ServiceConfig = z.infer<typeof ServiceConfigSchema>;

// ============================================================================
// Config Instance
// ============================================================================

let configInstance: ServiceConfig | null = null;

/**
 * Get the current configuration
 */
export function getConfig(): ServiceConfig {
  if (!configInstance) {
    configInstance = ServiceConfigSchema.parse({});
  }
  return configInstance;
}

/**
 * Set configuration values
 */
export function setConfig(config: Partial<ServiceConfig>): ServiceConfig {
  const currentConfig = getConfig();
  configInstance = ServiceConfigSchema.parse({ ...currentConfig, ...config });
  return configInstance;
}

/**
 * Reset configuration to defaults
 */
export function resetConfig(): ServiceConfig {
  configInstance = ServiceConfigSchema.parse({});
  return configInstance;
}

/**
 * Load configuration from environment variables
 */
export function loadConfigFromEnv(): ServiceConfig {
  const envConfig: Partial<ServiceConfig> = {};

  if (process.env.AA_DATABASE_PATH) {
    envConfig.databasePath = process.env.AA_DATABASE_PATH;
  }
  if (process.env.AA_ARCHIVE_DIR) {
    envConfig.archiveDir = process.env.AA_ARCHIVE_DIR;
  }
  if (process.env.AA_LOG_LEVEL) {
    const level = process.env.AA_LOG_LEVEL.toLowerCase();
    if (['debug', 'info', 'warn', 'error'].includes(level)) {
      envConfig.logLevel = level as ServiceConfig['logLevel'];
    }
  }
  if (process.env.AA_AI_PROVIDER) {
    const provider = process.env.AA_AI_PROVIDER.toLowerCase();
    if (['ollama', 'litellm', 'openai'].includes(provider)) {
      envConfig.aiProvider = provider as ServiceConfig['aiProvider'];
    }
  }
  if (process.env.GEOCODING_API_KEY) {
    envConfig.geocodingApiKey = process.env.GEOCODING_API_KEY;
  }

  return setConfig(envConfig);
}

// ============================================================================
// Path Helpers
// ============================================================================

/**
 * Get the data directory path
 */
export function getDataDir(): string {
  return join(homedir(), '.abandoned-archive');
}

/**
 * Get the cache directory path
 */
export function getCacheDir(): string {
  return join(getDataDir(), 'cache');
}

/**
 * Get the logs directory path
 */
export function getLogsDir(): string {
  return join(getDataDir(), 'logs');
}

/**
 * Get the temp directory path
 */
export function getTempDir(): string {
  return join(getDataDir(), 'temp');
}
