/**
 * Unified Repository Factory
 *
 * Provides a single interface for getting repositories that can
 * switch between SQLite (local) and API (dispatch hub) backends
 * based on configuration.
 *
 * Configuration is determined by:
 * 1. Environment variable: USE_DISPATCH_API=true
 * 2. Runtime setting: Settings → Data Source → Use Dispatch Hub
 *
 * In API mode, all data operations go through the dispatch hub's PostgreSQL.
 * In SQLite mode (default), data stays local in au-archive.db.
 */

import type { Kysely } from 'kysely';
import type { Database } from '../main/database.types';
import { getDispatchClient, type DispatchClient } from '@aa/services';

// SQLite repositories
import { SQLiteLocationRepository } from './sqlite-location-repository';
import { SQLiteSubLocationRepository } from './sqlite-sublocation-repository';
import { SQLiteMediaRepository } from './sqlite-media-repository';
import { SqliteRefMapsRepository } from './sqlite-ref-maps-repository';
import { SQLiteNotesRepository } from './sqlite-notes-repository';
import { SQLiteUsersRepository } from './sqlite-users-repository';
import { SQLiteImportRepository } from './sqlite-import-repository';
import { SQLiteProjectsRepository } from './sqlite-projects-repository';
import { SqliteTimelineRepository } from './sqlite-timeline-repository';
import { SQLiteWebSourcesRepository } from './sqlite-websources-repository';
import { SQLiteLocationViewsRepository } from './sqlite-location-views-repository';
import { SQLiteLocationAuthorsRepository } from './sqlite-location-authors-repository';
import { SQLiteLocationExclusionsRepository } from './sqlite-location-exclusions-repository';
import { SqliteDateExtractionRepository } from './sqlite-date-extraction-repository';

// API repositories
import { ApiLocationRepository } from './api-location-repository';
import { ApiSublocationRepository } from './api-sublocation-repository';
import { ApiMediaRepository } from './api-media-repository';
import { ApiMapRepository } from './api-map-repository';
import { ApiNotesRepository } from './api-notes-repository';
import { ApiUsersRepository } from './api-users-repository';
import { ApiImportRepository } from './api-import-repository';
import { ApiProjectsRepository } from './api-projects-repository';
import { ApiTimelineRepository } from './api-timeline-repository';
import { ApiWebSourcesRepository } from './api-websources-repository';
import { ApiLocationViewsRepository } from './api-location-views-repository';
import { ApiLocationAuthorsRepository } from './api-location-authors-repository';
import { ApiLocationExclusionsRepository } from './api-location-exclusions-repository';
import { ApiDateExtractionRepository } from './api-date-extraction-repository';

// ============================================================================
// Configuration
// ============================================================================

export interface RepositoryConfig {
  useDispatchApi: boolean;
  dispatchHubUrl: string;
  offlineMode: boolean;
}

let config: RepositoryConfig = {
  useDispatchApi: process.env.USE_DISPATCH_API === 'true',
  dispatchHubUrl: process.env.DISPATCH_HUB_URL || 'http://192.168.1.199:3000',
  offlineMode: process.env.OFFLINE_MODE === 'true',
};

/**
 * Get current repository configuration
 */
export function getRepositoryConfig(): RepositoryConfig {
  return { ...config };
}

/**
 * Update repository configuration
 * Note: Changing useDispatchApi requires app restart to take full effect
 */
export function setRepositoryConfig(updates: Partial<RepositoryConfig>): void {
  config = { ...config, ...updates };
}

/**
 * Check if currently using API backend
 */
export function isUsingApiBackend(): boolean {
  return config.useDispatchApi && !config.offlineMode;
}

// ============================================================================
// Repository Types (common interface)
// ============================================================================

export type LocationRepository = SQLiteLocationRepository | ApiLocationRepository;
export type SublocationRepository = SQLiteSubLocationRepository | ApiSublocationRepository;
export type MediaRepository = SQLiteMediaRepository | ApiMediaRepository;
export type MapRepository = SqliteRefMapsRepository | ApiMapRepository;
export type NotesRepository = SQLiteNotesRepository | ApiNotesRepository;
export type UsersRepository = SQLiteUsersRepository | ApiUsersRepository;
export type ImportRepository = SQLiteImportRepository | ApiImportRepository;
export type ProjectsRepository = SQLiteProjectsRepository | ApiProjectsRepository;
export type TimelineRepository = SqliteTimelineRepository | ApiTimelineRepository;
export type WebSourcesRepository = SQLiteWebSourcesRepository | ApiWebSourcesRepository;
export type LocationViewsRepository = SQLiteLocationViewsRepository | ApiLocationViewsRepository;
export type LocationAuthorsRepository = SQLiteLocationAuthorsRepository | ApiLocationAuthorsRepository;
export type LocationExclusionsRepository = SQLiteLocationExclusionsRepository | ApiLocationExclusionsRepository;
export type DateExtractionRepository = SqliteDateExtractionRepository | ApiDateExtractionRepository;

// ============================================================================
// Unified Factory
// ============================================================================

export interface UnifiedRepositories {
  // Core
  locations: LocationRepository;
  sublocations: SublocationRepository;
  media: MediaRepository;
  maps: MapRepository;

  // Content
  notes: NotesRepository;
  users: UsersRepository;
  imports: ImportRepository;
  projects: ProjectsRepository;

  // Archives
  timeline: TimelineRepository;
  websources: WebSourcesRepository;

  // Metadata
  locationViews: LocationViewsRepository;
  locationAuthors: LocationAuthorsRepository;
  locationExclusions: LocationExclusionsRepository;
  dateExtraction: DateExtractionRepository;

  // Backend info
  backend: 'sqlite' | 'api';
  client?: DispatchClient;
}

let sqliteFactoryInstance: UnifiedRepositories | null = null;
let apiFactoryInstance: UnifiedRepositories | null = null;

/**
 * Create SQLite repositories
 */
function createSqliteRepositories(db: Kysely<Database>): UnifiedRepositories {
  return {
    locations: new SQLiteLocationRepository(db),
    sublocations: new SQLiteSubLocationRepository(db),
    media: new SQLiteMediaRepository(db),
    maps: new SqliteRefMapsRepository(db),
    notes: new SQLiteNotesRepository(db),
    users: new SQLiteUsersRepository(db),
    imports: new SQLiteImportRepository(db),
    projects: new SQLiteProjectsRepository(db),
    timeline: new SqliteTimelineRepository(db),
    websources: new SQLiteWebSourcesRepository(db),
    locationViews: new SQLiteLocationViewsRepository(db),
    locationAuthors: new SQLiteLocationAuthorsRepository(db),
    locationExclusions: new SQLiteLocationExclusionsRepository(db),
    dateExtraction: new SqliteDateExtractionRepository(db),
    backend: 'sqlite',
  };
}

/**
 * Create API repositories
 */
function createApiRepositories(): UnifiedRepositories {
  const client = getDispatchClient();

  return {
    locations: new ApiLocationRepository(client),
    sublocations: new ApiSublocationRepository(client),
    media: new ApiMediaRepository(client),
    maps: new ApiMapRepository(client),
    notes: new ApiNotesRepository(client),
    users: new ApiUsersRepository(client),
    imports: new ApiImportRepository(client),
    projects: new ApiProjectsRepository(client),
    timeline: new ApiTimelineRepository(client),
    websources: new ApiWebSourcesRepository(client),
    locationViews: new ApiLocationViewsRepository(client),
    locationAuthors: new ApiLocationAuthorsRepository(client),
    locationExclusions: new ApiLocationExclusionsRepository(client),
    dateExtraction: new ApiDateExtractionRepository(client),
    backend: 'api',
    client,
  };
}

/**
 * Get repositories based on current configuration.
 *
 * @param db - Kysely database instance (required for SQLite mode)
 * @returns Repository collection for the configured backend
 */
export function getUnifiedRepositories(db?: Kysely<Database>): UnifiedRepositories {
  if (isUsingApiBackend()) {
    if (!apiFactoryInstance) {
      apiFactoryInstance = createApiRepositories();
    }
    return apiFactoryInstance;
  }

  // SQLite mode requires database
  if (!db) {
    throw new Error('Database instance required for SQLite mode. Pass db parameter or set USE_DISPATCH_API=true');
  }

  if (!sqliteFactoryInstance) {
    sqliteFactoryInstance = createSqliteRepositories(db);
  }

  return sqliteFactoryInstance;
}

/**
 * Get a specific repository by name.
 * Convenience method for IPC handlers that only need one repository.
 */
export function getRepository<K extends keyof Omit<UnifiedRepositories, 'backend' | 'client'>>(
  name: K,
  db?: Kysely<Database>
): UnifiedRepositories[K] {
  const repos = getUnifiedRepositories(db);
  return repos[name];
}

/**
 * Destroy all repository instances.
 * Call on app shutdown or when switching backends.
 */
export function destroyUnifiedRepositories(): void {
  sqliteFactoryInstance = null;
  apiFactoryInstance = null;
}

/**
 * Force recreation of repository instances.
 * Useful after configuration changes.
 */
export function resetUnifiedRepositories(db?: Kysely<Database>): UnifiedRepositories {
  destroyUnifiedRepositories();
  return getUnifiedRepositories(db);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if API backend is ready (connected and authenticated)
 */
export async function isApiBackendReady(): Promise<boolean> {
  if (!isUsingApiBackend()) {
    return false;
  }

  try {
    const client = getDispatchClient();
    return client.isConnected() && client.isAuthenticated();
  } catch {
    return false;
  }
}

/**
 * Get backend status for UI display
 */
export function getBackendStatus(): {
  mode: 'sqlite' | 'api';
  configured: boolean;
  connected: boolean;
  hubUrl: string;
} {
  const useApi = isUsingApiBackend();

  if (!useApi) {
    return {
      mode: 'sqlite',
      configured: true,
      connected: true,
      hubUrl: '',
    };
  }

  try {
    const client = getDispatchClient();
    return {
      mode: 'api',
      configured: true,
      connected: client.isConnected(),
      hubUrl: config.dispatchHubUrl,
    };
  } catch {
    return {
      mode: 'api',
      configured: false,
      connected: false,
      hubUrl: config.dispatchHubUrl,
    };
  }
}
