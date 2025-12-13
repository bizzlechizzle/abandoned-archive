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
let dbInstance: Kysely<Database> | null = null;

/**
 * Initialize and get the timeline service singleton
 */
function getService(db: Kysely<Database>): TimelineService {
  if (!timelineService) {
    timelineRepository = new SqliteTimelineRepository(db);
    timelineService = new TimelineService(timelineRepository);
    dbInstance = db;
  }
  return timelineService;
}

/**
 * Backfill web page timeline events for existing websources
 * Creates timeline events for websources that have extracted_date but no timeline event
 */
async function backfillWebPageTimeline(
  db: Kysely<Database>,
  service: TimelineService
): Promise<{ processed: number; created: number; skipped: number; errors: number }> {
  const stats = { processed: 0, created: 0, skipped: 0, errors: 0 };

  try {
    // Find all websources with extracted_date and locid
    const websources = await db
      .selectFrom('web_sources')
      .select(['source_id', 'locid', 'subid', 'extracted_date', 'title', 'extracted_title'])
      .where('extracted_date', 'is not', null)
      .where('locid', 'is not', null)
      .execute();

    console.log(`[Timeline Backfill] Found ${websources.length} websources with dates`);

    for (const ws of websources) {
      stats.processed++;
      try {
        // Use extracted_title if available, otherwise title
        const displayTitle = ws.extracted_title || ws.title || 'Web Page';

        const result = await service.createWebPageEvent(
          ws.locid!,
          ws.subid ?? null,
          ws.source_id,
          ws.extracted_date!,
          displayTitle
        );

        if (result) {
          stats.created++;
        } else {
          stats.skipped++;
        }
      } catch (err) {
        console.error(`[Timeline Backfill] Error for websource ${ws.source_id}:`, err);
        stats.errors++;
      }
    }

    console.log(`[Timeline Backfill] Complete: ${stats.created} created, ${stats.skipped} skipped, ${stats.errors} errors`);
  } catch (err) {
    console.error('[Timeline Backfill] Failed to run backfill:', err);
    throw err;
  }

  return stats;
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

  // Create web page timeline event (from archived websource)
  ipcMain.handle(
    'timeline:createWebPageEvent',
    async (
      _,
      locid: string,
      subid: string | null,
      websourceId: string,
      publishDate: string,
      title: string | null,
      userId?: string
    ) => {
      return service.createWebPageEvent(locid, subid, websourceId, publishDate, title, userId);
    }
  );

  // Delete web page timeline event (cascade from websource deletion)
  ipcMain.handle(
    'timeline:deleteWebPageEvent',
    async (_, websourceId: string) => {
      return service.deleteWebPageEvent(websourceId);
    }
  );

  // Check if web page event exists for a websource
  ipcMain.handle(
    'timeline:hasWebPageEvent',
    async (_, websourceId: string) => {
      return service.hasWebPageEvent(websourceId);
    }
  );

  // Backfill web page timeline events for existing websources
  ipcMain.handle('timeline:backfillWebPages', async () => {
    if (!dbInstance) {
      throw new Error('Database not initialized');
    }
    return backfillWebPageTimeline(dbInstance, service);
  });

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
