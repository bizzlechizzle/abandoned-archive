/**
 * API-based Projects Repository
 *
 * Projects are groupings of locations for organizational purposes.
 * All operations flow through the dispatch hub.
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
 */
export class ApiProjectsRepository {
  constructor(private readonly client: DispatchClient) {}

  async create(input: ProjectInput): Promise<Project> {
    const result = await this.client.createProject({
      name: input.project_name,
      description: input.description ?? undefined,
    });

    return this.mapApiToLocal(result.project);
  }

  async findById(project_id: string): Promise<Project | null> {
    try {
      const result = await this.client.getProject(project_id);
      return this.mapApiToLocal(result.project);
    } catch {
      return null;
    }
  }

  async findByIdWithLocations(project_id: string): Promise<ProjectWithLocations | null> {
    try {
      const result = await this.client.getProject(project_id);
      return {
        ...this.mapApiToLocal(result.project),
        locations: result.project.locations.map((loc) => ({
          locid: loc.locid,
          locnam: loc.locnam,
          address_state: loc.address_state,
          added_date: loc.added_date ?? new Date().toISOString(),
        })),
      };
    } catch {
      return null;
    }
  }

  async findAll(): Promise<Project[]> {
    const result = await this.client.getProjects({ limit: 100 });
    return result.projects.map((p) => this.mapApiToLocal(p));
  }

  async update(project_id: string, updates: ProjectUpdate): Promise<Project | null> {
    try {
      const result = await this.client.updateProject(project_id, {
        name: updates.project_name,
        description: updates.description ?? undefined,
      });
      return this.mapApiToLocal(result.project);
    } catch {
      return null;
    }
  }

  async delete(project_id: string): Promise<void> {
    await this.client.deleteProject(project_id);
  }

  async addLocation(project_id: string, locid: string): Promise<void> {
    await this.client.addLocationToProject(project_id, locid);
  }

  async removeLocation(project_id: string, locid: string): Promise<void> {
    await this.client.removeLocationFromProject(project_id, locid);
  }

  async countLocations(project_id: string): Promise<number> {
    try {
      const result = await this.client.getProject(project_id);
      return result.project.locationCount;
    } catch {
      return 0;
    }
  }

  async getLocationsForProject(project_id: string): Promise<string[]> {
    try {
      const result = await this.client.getProject(project_id);
      return result.project.locations.map((l) => l.locid);
    } catch {
      return [];
    }
  }

  async getProjectsForLocation(locid: string): Promise<Project[]> {
    try {
      const result = await this.client.getProjectsForLocation(locid);
      return result.projects.map((p) => ({
        project_id: p.id,
        project_name: p.name,
        description: p.description,
        created_date: p.addedAt,
        auth_imp: null,
      }));
    } catch {
      return [];
    }
  }

  private mapApiToLocal(api: {
    id: string;
    name: string;
    description: string | null;
    createdAt: string;
    updatedAt?: string;
    locationCount?: number;
  }): Project {
    return {
      project_id: api.id,
      project_name: api.name,
      description: api.description,
      created_date: api.createdAt,
      auth_imp: null,
      location_count: api.locationCount ?? 0,
    };
  }
}
