/**
 * API-based Location Authors Repository
 *
 * Tracks which users contributed to each location
 * (who added media, notes, etc.) through dispatch hub.
 */

import type { DispatchClient } from '@aa/services';

export interface LocationAuthor {
  locid: string;
  author: string;
  userId: string;
  contribution_count: number;
  media_count: number;
  note_count: number;
  first_contribution: string;
  last_contribution: string;
}

export interface AuthorStats {
  author: string;
  userId: string;
  location_count: number;
  total_contributions: number;
}

/**
 * API-based location authors repository
 *
 * Author tracking is derived from:
 * - locations.createdBy
 * - media.importedBy
 * - locationNotes.createdBy
 */
export class ApiLocationAuthorsRepository {
  constructor(private readonly client: DispatchClient) {}

  /**
   * Record a contribution by an author
   *
   * Note: In API mode, contributions are tracked automatically
   * when media is imported or notes are created via the hub.
   * This method is a no-op for backwards compatibility.
   */
  async recordContribution(_locid: string, _author: string): Promise<void> {
    // Contributions are tracked automatically via hub when:
    // - Media is imported (media.importedBy set)
    // - Notes are created (locationNotes.createdBy set)
    // - Locations are created (locations.createdBy set)
    // No explicit recording needed
  }

  /**
   * Get authors for a location
   */
  async getAuthorsForLocation(locid: string): Promise<LocationAuthor[]> {
    try {
      const authors = await this.client.getLocationAuthors(locid);
      return authors.map(a => ({
        locid,
        author: a.username,
        userId: a.userId,
        contribution_count: a.contributionCount,
        media_count: a.mediaCount,
        note_count: a.noteCount,
        first_contribution: a.firstContribution,
        last_contribution: a.lastContribution,
      }));
    } catch (error) {
      console.error('ApiLocationAuthorsRepository.getAuthorsForLocation error:', error);
      return [];
    }
  }

  /**
   * Get locations by author (user ID)
   */
  async getLocationsByAuthor(authorUserId: string): Promise<string[]> {
    try {
      const locations = await this.client.getAuthorLocations(authorUserId);
      return locations.map(l => l.id);
    } catch (error) {
      console.error('ApiLocationAuthorsRepository.getLocationsByAuthor error:', error);
      return [];
    }
  }

  /**
   * Get all unique authors
   */
  async getAllAuthors(): Promise<string[]> {
    try {
      const authors = await this.client.getAllAuthors();
      return authors.map(a => a.username);
    } catch (error) {
      console.error('ApiLocationAuthorsRepository.getAllAuthors error:', error);
      return [];
    }
  }

  /**
   * Get author statistics
   */
  async getAuthorStats(): Promise<AuthorStats[]> {
    try {
      const authors = await this.client.getAllAuthors();
      return authors.map(a => ({
        author: a.username,
        userId: a.userId,
        location_count: a.locationCount,
        total_contributions: a.mediaCount,
      }));
    } catch (error) {
      console.error('ApiLocationAuthorsRepository.getAuthorStats error:', error);
      return [];
    }
  }

  /**
   * Get primary author for a location (author with most contributions)
   */
  async getPrimaryAuthor(locid: string): Promise<string | null> {
    try {
      const authors = await this.client.getLocationAuthors(locid);
      if (authors.length === 0) return null;
      // Authors are already sorted by contribution count (highest first)
      return authors[0].username;
    } catch (error) {
      console.error('ApiLocationAuthorsRepository.getPrimaryAuthor error:', error);
      return null;
    }
  }

  /**
   * Get global author statistics
   */
  async getGlobalAuthorStats(): Promise<{ totalAuthors: number; totalContributions: number }> {
    try {
      const stats = await this.client.getAuthorStats();
      return {
        totalAuthors: stats.totalAuthors,
        totalContributions: stats.totalContributions,
      };
    } catch (error) {
      console.error('ApiLocationAuthorsRepository.getGlobalAuthorStats error:', error);
      return { totalAuthors: 0, totalContributions: 0 };
    }
  }
}
