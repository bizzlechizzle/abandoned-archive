/**
 * Unified Repository Factory
 *
 * All data operations go through the Dispatch Hub's PostgreSQL database.
 * There is no local SQLite storage - the desktop app is a thin client.
 *
 * Configuration:
 * - DISPATCH_HUB_URL: Hub URL (default: http://192.168.1.199:3000)
 */

import { getDispatchClient, type DispatchClient } from '@aa/services';

// API repositories (PostgreSQL via Dispatch Hub)
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
  dispatchHubUrl: string;
}

const config: RepositoryConfig = {
  dispatchHubUrl: process.env.DISPATCH_HUB_URL || 'http://192.168.1.199:3000',
};

/**
 * Get current repository configuration
 */
export function getRepositoryConfig(): RepositoryConfig {
  return { ...config };
}

// ============================================================================
// Repository Types
// ============================================================================

export type LocationRepository = ApiLocationRepository;
export type SublocationRepository = ApiSublocationRepository;
export type MediaRepository = ApiMediaRepository;
export type MapRepository = ApiMapRepository;
export type NotesRepository = ApiNotesRepository;
export type UsersRepository = ApiUsersRepository;
export type ImportRepository = ApiImportRepository;
export type ProjectsRepository = ApiProjectsRepository;
export type TimelineRepository = ApiTimelineRepository;
export type WebSourcesRepository = ApiWebSourcesRepository;
export type LocationViewsRepository = ApiLocationViewsRepository;
export type LocationAuthorsRepository = ApiLocationAuthorsRepository;
export type LocationExclusionsRepository = ApiLocationExclusionsRepository;
export type DateExtractionRepository = ApiDateExtractionRepository;

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
  backend: 'api';
  client: DispatchClient;
}

let repositoryInstance: UnifiedRepositories | null = null;

/**
 * Create API repositories connected to Dispatch Hub
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
 * Get repositories connected to Dispatch Hub.
 *
 * @returns Repository collection for API backend
 */
export function getUnifiedRepositories(): UnifiedRepositories {
  if (!repositoryInstance) {
    repositoryInstance = createApiRepositories();
  }
  return repositoryInstance;
}

/**
 * Get a specific repository by name.
 * Convenience method for IPC handlers that only need one repository.
 */
export function getRepository<K extends keyof Omit<UnifiedRepositories, 'backend' | 'client'>>(
  name: K
): UnifiedRepositories[K] {
  const repos = getUnifiedRepositories();
  return repos[name];
}

/**
 * Destroy repository instance.
 * Call on app shutdown.
 */
export function destroyUnifiedRepositories(): void {
  repositoryInstance = null;
}

/**
 * Force recreation of repository instance.
 * Useful after configuration changes or reconnection.
 */
export function resetUnifiedRepositories(): UnifiedRepositories {
  destroyUnifiedRepositories();
  return getUnifiedRepositories();
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if API backend is ready (connected and authenticated)
 */
export async function isApiBackendReady(): Promise<boolean> {
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
  mode: 'api';
  configured: boolean;
  connected: boolean;
  hubUrl: string;
} {
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

// ============================================================================
// Backwards Compatibility (deprecated - will be removed)
// ============================================================================

/**
 * @deprecated Use getRepositoryConfig() instead
 */
export function isUsingApiBackend(): boolean {
  return true; // Always using API backend now
}

/**
 * @deprecated Configuration is now API-only
 */
export function setRepositoryConfig(_updates: Partial<RepositoryConfig>): void {
  console.warn('setRepositoryConfig is deprecated - app now always uses API backend');
}
