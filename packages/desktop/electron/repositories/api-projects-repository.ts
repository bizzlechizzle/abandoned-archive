/**
 * API-based Projects Repository
 *
 * Projects are groupings of locations for organizational purposes.
 * In dispatch architecture, this could be a tagging system or
 * a dedicated projects table.
 *
 * TODO: Dispatch hub needs projects/collections endpoints:
 * - GET /api/projects
 * - POST /api/projects
 * - GET /api/projects/:id
 * - PUT /api/projects/:id
 * - DELETE /api/projects/:id
 * - POST /api/projects/:id/locations
 * - DELETE /api/projects/:id/locations/:locid
 */

import type { DispatchClient } from '@aa/services';

export interface ProjectInput {
  project_name: string;
  description?: string | null;
  auth_imp?: string | null;
}

export interface ProjectUpdate {
  project_name?: string;
  description?: string | null;
}

export interface Project {
  project_id: string;
  project_name: string;
  description: string | null;
  created_date: string;
  auth_imp: string | null;
  location_count?: number;
}

export interface ProjectWithLocations extends Project {
  locations: Array<{
    locid: string;
    locnam: string;
    address_state: string | null;
    added_date: string;
  }>;
}

/**
 * API-based projects repository
 *
 * NOTE: Dispatch hub does not yet have projects endpoints.
 * This is a stub that will throw errors until implemented.
 */
export class ApiProjectsRepository {
  constructor(private readonly client: DispatchClient) {}

  async create(input: ProjectInput): Promise<Project> {
    // TODO: Dispatch hub needs POST /api/projects
    throw new Error('Projects not yet implemented in dispatch hub');
  }

  async findById(project_id: string): Promise<Project | null> {
    // TODO: Dispatch hub needs GET /api/projects/:id
    throw new Error('Projects not yet implemented in dispatch hub');
  }

  async findByIdWithLocations(project_id: string): Promise<ProjectWithLocations | null> {
    // TODO: Dispatch hub needs GET /api/projects/:id?include=locations
    throw new Error('Projects not yet implemented in dispatch hub');
  }

  async findAll(): Promise<Project[]> {
    // TODO: Dispatch hub needs GET /api/projects
    console.warn('ApiProjectsRepository: Projects not yet implemented in dispatch hub');
    return [];
  }

  async update(project_id: string, updates: ProjectUpdate): Promise<Project | null> {
    // TODO: Dispatch hub needs PUT /api/projects/:id
    throw new Error('Projects not yet implemented in dispatch hub');
  }

  async delete(project_id: string): Promise<void> {
    // TODO: Dispatch hub needs DELETE /api/projects/:id
    throw new Error('Projects not yet implemented in dispatch hub');
  }

  async addLocation(project_id: string, locid: string): Promise<void> {
    // TODO: Dispatch hub needs POST /api/projects/:id/locations
    throw new Error('Projects not yet implemented in dispatch hub');
  }

  async removeLocation(project_id: string, locid: string): Promise<void> {
    // TODO: Dispatch hub needs DELETE /api/projects/:id/locations/:locid
    throw new Error('Projects not yet implemented in dispatch hub');
  }

  async countLocations(project_id: string): Promise<number> {
    return 0;
  }

  async getLocationsForProject(project_id: string): Promise<string[]> {
    return [];
  }

  async getProjectsForLocation(locid: string): Promise<Project[]> {
    return [];
  }
}
