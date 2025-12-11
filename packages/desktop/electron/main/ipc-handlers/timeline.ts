/**
 * Timeline IPC Handlers
 * Handles timeline:* channels for location history events
 */

import { ipcMain } from 'electron';
import { Kysely } from 'kysely';
import { SqliteTimelineRepository } from '../../repositories/sqlite-timeline-repository';
import { TimelineService } from '../../services/timeline-service';
import type { Database } from '../database.types';
import type { TimelineEventInput } from '@au-archive/core';

let timelineService: TimelineService | null = null;
let timelineRepository: SqliteTimelineRepository | null = null;

/**
 * Initialize and get the timeline service singleton
 */
function getService(db: Kysely<Database>): TimelineService {
  if (!timelineService) {
    timelineRepository = new SqliteTimelineRepository(db);
    timelineService = new TimelineService(timelineRepository);
  }
  return timelineService;
}

/**
 * Register all timeline IPC handlers
 */
export function registerTimelineHandlers(db: Kysely<Database>): TimelineService {
  const service = getService(db);

  // Get timeline for location (host only, excludes sub-locations)
  ipcMain.handle('timeline:findByLocation', async (_, locid: string) => {
    return service.getTimeline(locid);
  });

  // Get timeline for a specific sub-location
  ipcMain.handle(
    'timeline:findBySubLocation',
    async (_, locid: string, subid: string) => {
      return service.getSubLocationTimeline(locid, subid);
    }
  );

  // Get combined timeline for host location (includes sub-location events)
  ipcMain.handle('timeline:findCombined', async (_, locid: string) => {
    return service.getCombinedTimeline(locid);
  });

  // Parse a date string (for smart date input)
  ipcMain.handle('timeline:parseDate', async (_, input: string) => {
    return service.parseDateInput(input);
  });

  // Create a new timeline event
  ipcMain.handle(
    'timeline:create',
    async (_, input: TimelineEventInput, userId?: string) => {
      return service.createEvent(input, userId);
    }
  );

  // Update an existing timeline event
  ipcMain.handle(
    'timeline:update',
    async (
      _,
      eventId: string,
      updates: Partial<TimelineEventInput>,
      userId?: string
    ) => {
      return service.updateEvent(eventId, updates, userId);
    }
  );

  // Delete a timeline event
  ipcMain.handle('timeline:delete', async (_, eventId: string) => {
    return service.deleteEvent(eventId);
  });

  // Approve a timeline event (user verification)
  ipcMain.handle(
    'timeline:approve',
    async (_, eventId: string, userId: string) => {
      return service.approveEvent(eventId, userId);
    }
  );

  // Initialize timeline for a new location
  ipcMain.handle(
    'timeline:initializeLocation',
    async (_, locid: string, locadd: string | null, userId?: string) => {
      return service.initializeLocationTimeline(locid, locadd, userId);
    }
  );

  // Initialize timeline for a new sub-location
  ipcMain.handle(
    'timeline:initializeSubLocation',
    async (_, locid: string, subid: string, userId?: string) => {
      return service.initializeSubLocationTimeline(locid, subid, userId);
    }
  );

  // Get visit count for a location
  ipcMain.handle('timeline:getVisitCount', async (_, locid: string) => {
    return service.getVisitCount(locid);
  });

  // Get the established event for a location
  ipcMain.handle(
    'timeline:getEstablished',
    async (_, locid: string, subid?: string | null) => {
      return service.getEstablishedEvent(locid, subid);
    }
  );

  // Update established date (smart date input)
  ipcMain.handle(
    'timeline:updateEstablished',
    async (
      _,
      locid: string,
      subid: string | null,
      dateInput: string,
      eventSubtype?: string,
      userId?: string
    ) => {
      return service.updateEstablishedDate(
        locid,
        subid,
        dateInput,
        eventSubtype || 'built',
        userId
      );
    }
  );

  console.log('Timeline IPC handlers registered');
  return service;
}

/**
 * Get the timeline service instance (for use by other handlers)
 */
export function getTimelineService(): TimelineService | null {
  return timelineService;
}

/**
 * Get the timeline repository instance (for use by other handlers)
 */
export function getTimelineRepository(): SqliteTimelineRepository | null {
  return timelineRepository;
}
