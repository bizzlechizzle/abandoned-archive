/**
 * API-based Location Authors Repository
 *
 * Tracks which users contributed to each location
 * (who added media, notes, etc.)
 *
 * TODO: Dispatch hub needs author tracking endpoints
 */

import type { DispatchClient } from '@aa/services';

export interface LocationAuthor {
  locid: string;
  author: string;
  contribution_count: number;
  first_contribution: string;
  last_contribution: string;
}

export interface AuthorStats {
  author: string;
  location_count: number;
  total_contributions: number;
}

/**
 * API-based location authors repository
 *
 * NOTE: Author tracking requires dispatch hub support
 */
export class ApiLocationAuthorsRepository {
  constructor(private readonly client: DispatchClient) {}

  /**
   * Record a contribution by an author
   */
  async recordContribution(locid: string, author: string): Promise<void> {
    // TODO: Dispatch hub needs contribution tracking
    console.warn('ApiLocationAuthorsRepository.recordContribution: Not yet implemented');
  }

  /**
   * Get authors for a location
   */
  async getAuthorsForLocation(locid: string): Promise<LocationAuthor[]> {
    console.warn('ApiLocationAuthorsRepository.getAuthorsForLocation: Not yet implemented');
    return [];
  }

  /**
   * Get locations by author
   */
  async getLocationsByAuthor(author: string): Promise<string[]> {
    console.warn('ApiLocationAuthorsRepository.getLocationsByAuthor: Not yet implemented');
    return [];
  }

  /**
   * Get all unique authors
   */
  async getAllAuthors(): Promise<string[]> {
    console.warn('ApiLocationAuthorsRepository.getAllAuthors: Not yet implemented');
    return [];
  }

  /**
   * Get author statistics
   */
  async getAuthorStats(): Promise<AuthorStats[]> {
    console.warn('ApiLocationAuthorsRepository.getAuthorStats: Not yet implemented');
    return [];
  }

  /**
   * Get primary author for a location
   */
  async getPrimaryAuthor(locid: string): Promise<string | null> {
    console.warn('ApiLocationAuthorsRepository.getPrimaryAuthor: Not yet implemented');
    return null;
  }
}
