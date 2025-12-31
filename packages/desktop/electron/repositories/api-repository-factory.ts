/**
 * API Repository Factory
 *
 * Creates repository instances that use the dispatch hub API
 * instead of local SQLite database. This is the entry point
 * for the API-first architecture where all data flows through
 * the central hub to PostgreSQL.
 *
 * All 14 repositories are available here:
 * - locations, sublocations, media, maps (core)
 * - notes, users, imports, projects (content)
 * - timeline, websources (archives)
 * - locationViews, locationAuthors, locationExclusions, dateExtraction (metadata)
 */

import { getDispatchClient, type DispatchClient } from '@aa/services';
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

export interface RepositoryFactory {
  // Core repositories
  locations: ApiLocationRepository;
  sublocations: ApiSublocationRepository;
  media: ApiMediaRepository;
  maps: ApiMapRepository;

  // Content repositories
  notes: ApiNotesRepository;
  users: ApiUsersRepository;
  imports: ApiImportRepository;
  projects: ApiProjectsRepository;

  // Archive repositories
  timeline: ApiTimelineRepository;
  websources: ApiWebSourcesRepository;

  // Metadata repositories
  locationViews: ApiLocationViewsRepository;
  locationAuthors: ApiLocationAuthorsRepository;
  locationExclusions: ApiLocationExclusionsRepository;
  dateExtraction: ApiDateExtractionRepository;

  // Dispatch client
  client: DispatchClient;
}

let factoryInstance: RepositoryFactory | null = null;

/**
 * Initialize and get the repository factory.
 * Repositories are API-based and require dispatch hub connection.
 */
export function getRepositoryFactory(): RepositoryFactory {
  if (!factoryInstance) {
    const client = getDispatchClient();

    factoryInstance = {
      // Core repositories
      locations: new ApiLocationRepository(client),
      sublocations: new ApiSublocationRepository(client),
      media: new ApiMediaRepository(client),
      maps: new ApiMapRepository(client),

      // Content repositories
      notes: new ApiNotesRepository(client),
      users: new ApiUsersRepository(client),
      imports: new ApiImportRepository(client),
      projects: new ApiProjectsRepository(client),

      // Archive repositories
      timeline: new ApiTimelineRepository(client),
      websources: new ApiWebSourcesRepository(client),

      // Metadata repositories
      locationViews: new ApiLocationViewsRepository(client),
      locationAuthors: new ApiLocationAuthorsRepository(client),
      locationExclusions: new ApiLocationExclusionsRepository(client),
      dateExtraction: new ApiDateExtractionRepository(client),

      // Dispatch client
      client,
    };
  }

  return factoryInstance;
}

/**
 * Destroy the repository factory and cleanup.
 */
export function destroyRepositoryFactory(): void {
  factoryInstance = null;
}

/**
 * Check if the dispatch hub is connected and authenticated.
 */
export async function isHubReady(): Promise<boolean> {
  const factory = getRepositoryFactory();
  const client = factory.client;

  if (!client.isConnected()) {
    return false;
  }

  if (!client.isAuthenticated()) {
    return false;
  }

  return true;
}

/**
 * Wait for hub connection with retry.
 */
export async function waitForHubConnection(
  maxRetries: number = 10,
  retryDelayMs: number = 1000
): Promise<boolean> {
  const factory = getRepositoryFactory();
  const client = factory.client;

  for (let i = 0; i < maxRetries; i++) {
    if (await client.checkConnection()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }

  return false;
}

// Re-export repository types for convenience
export { ApiLocationRepository } from './api-location-repository';
export { ApiSublocationRepository } from './api-sublocation-repository';
export { ApiMediaRepository } from './api-media-repository';
export { ApiMapRepository } from './api-map-repository';
export { ApiNotesRepository } from './api-notes-repository';
export { ApiUsersRepository } from './api-users-repository';
export { ApiImportRepository } from './api-import-repository';
export { ApiProjectsRepository } from './api-projects-repository';
export { ApiTimelineRepository } from './api-timeline-repository';
export { ApiWebSourcesRepository } from './api-websources-repository';
export { ApiLocationViewsRepository } from './api-location-views-repository';
export { ApiLocationAuthorsRepository } from './api-location-authors-repository';
export { ApiLocationExclusionsRepository } from './api-location-exclusions-repository';
export { ApiDateExtractionRepository } from './api-date-extraction-repository';
