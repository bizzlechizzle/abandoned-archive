/**
 * API-based Timeline Repository
 *
 * Timeline provides chronological view of events across all locations.
 * Uses dispatch hub timeline endpoints for event tracking.
 */

import type { DispatchClient, TimelineEvent } from '@aa/services';

export interface TimelineEntry {
  id: string;
  date: string;
  dateDisplay?: string;
  locationId: string;
  locationName?: string;
  sublocationId?: string;
  sublocationName?: string;
  eventType: 'visit' | 'established' | 'database_entry' | 'custom';
  eventSubtype?: string;
  notes?: string;
  mediaCount?: number;
  approved?: boolean;
}

export interface TimelineMonth {
  year: number;
  month: number;
  count: number;
}

export interface TimelineFilters {
  locationId?: string;
  eventType?: string;
  year?: number;
  month?: number;
  limit?: number;
  offset?: number;
}

export interface TimelineStats {
  total: number;
  visits: number;
  established: number;
  approved: number;
  pending: number;
}

/**
 * API-based timeline repository
 *
 * Uses dispatch hub timeline endpoints for event tracking.
 */
export class ApiTimelineRepository {
  constructor(private readonly client: DispatchClient) {}

  /**
   * Get timeline events with optional filters
   */
  async getEvents(filters?: TimelineFilters): Promise<{
    events: TimelineEntry[];
    total: number;
  }> {
    const result = await this.client.getTimelineEvents({
      locationId: filters?.locationId,
      eventType: filters?.eventType,
      year: filters?.year,
      month: filters?.month,
      limit: filters?.limit ?? 50,
      offset: filters?.offset ?? 0,
    });
    return {
      events: result.events.map((e) => this.mapApiToLocal(e)),
      total: result.total,
    };
  }

  /**
   * Get a specific timeline event by ID
   */
  async getEvent(id: string): Promise<TimelineEntry | null> {
    try {
      const event = await this.client.getTimelineEvent(id);
      return this.mapApiToLocal(event);
    } catch {
      return null;
    }
  }

  /**
   * Get timeline events for a specific location
   */
  async getEventsByLocation(locationId: string, options?: {
    limit?: number;
    offset?: number;
  }): Promise<TimelineEntry[]> {
    const result = await this.client.getTimelineByLocation(locationId, options);
    return result.events.map((e) => this.mapApiToLocal(e));
  }

  /**
   * Get entries for a specific year/month
   */
  async getEntriesForMonth(year: number, month: number, filters?: TimelineFilters): Promise<TimelineEntry[]> {
    const result = await this.client.getTimelineEvents({
      locationId: filters?.locationId,
      eventType: filters?.eventType,
      year,
      month,
      limit: 100,
    });
    return result.events.map((e) => this.mapApiToLocal(e));
  }

  /**
   * Get list of years that have events
   */
  async getYearsWithEvents(): Promise<number[]> {
    const result = await this.client.getTimelineYears();
    return result.years;
  }

  /**
   * Get timeline statistics
   */
  async getStats(): Promise<TimelineStats> {
    return this.client.getTimelineStats();
  }

  /**
   * Create a new timeline event
   */
  async createEvent(data: {
    locationId: string;
    sublocationId?: string;
    eventType: 'visit' | 'established' | 'database_entry' | 'custom';
    eventSubtype?: string;
    dateStart?: string;
    dateEnd?: string;
    datePrecision?: string;
    dateDisplay?: string;
    dateSort?: number;
    sourceType?: string;
    sourceRefs?: string;
    mediaCount?: number;
    notes?: string;
    autoApproved?: boolean;
  }): Promise<TimelineEntry> {
    const event = await this.client.createTimelineEvent(data);
    return this.mapApiToLocal(event);
  }

  /**
   * Update a timeline event
   */
  async updateEvent(id: string, data: {
    eventSubtype?: string | null;
    dateStart?: string | null;
    dateEnd?: string | null;
    datePrecision?: string;
    dateDisplay?: string | null;
    dateSort?: number | null;
    notes?: string | null;
    userApproved?: boolean;
  }): Promise<TimelineEntry | null> {
    try {
      const event = await this.client.updateTimelineEvent(id, data);
      return this.mapApiToLocal(event);
    } catch {
      return null;
    }
  }

  /**
   * Delete a timeline event
   */
  async deleteEvent(id: string): Promise<void> {
    await this.client.deleteTimelineEvent(id);
  }

  /**
   * Map API TimelineEvent to local format
   */
  private mapApiToLocal(event: TimelineEvent): TimelineEntry {
    return {
      id: event.id,
      date: event.dateStart ?? event.createdAt,
      dateDisplay: event.dateDisplay ?? undefined,
      locationId: event.locationId,
      sublocationId: event.sublocationId ?? undefined,
      eventType: event.eventType,
      eventSubtype: event.eventSubtype ?? undefined,
      notes: event.notes ?? undefined,
      mediaCount: event.mediaCount ?? undefined,
      approved: event.userApproved ?? event.autoApproved ?? false,
    };
  }
}
