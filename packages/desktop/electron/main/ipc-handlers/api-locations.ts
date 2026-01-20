/**
 * API-based Location IPC Handlers
 *
 * Handles all location:* IPC channels using dispatch hub API
 * instead of local SQLite database.
 */

import { ipcMain } from 'electron';
import { z } from 'zod';
import { getDispatchClient } from '@aa/services';
import { ApiLocationRepository } from '../../repositories/api-location-repository';
import { LocationInputSchema, type LocationFilters, type LocationInput } from '@aa/core';

const Blake3IdSchema = z.string().length(16).regex(/^[a-f0-9]+$/);

let locationRepo: ApiLocationRepository | null = null;

function getLocationRepo(): ApiLocationRepository {
  if (!locationRepo) {
    const client = getDispatchClient();
    locationRepo = new ApiLocationRepository(client);
  }
  return locationRepo;
}

export function registerApiLocationHandlers() {
  ipcMain.handle('location:findAll', async (_event, filters?: LocationFilters) => {
    try {
      const repo = getLocationRepo();
      return await repo.findAll(filters);
    } catch (error) {
      console.error('Error finding locations:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('location:findById', async (_event, id: unknown) => {
    try {
      const validatedId = Blake3IdSchema.parse(id);
      const repo = getLocationRepo();
      return await repo.findById(validatedId);
    } catch (error) {
      console.error('Error finding location:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('location:create', async (_event, input: unknown) => {
    try {
      const validatedInput = LocationInputSchema.parse(input);
      const repo = getLocationRepo();
      const location = await repo.create(validatedInput as LocationInput);
      return location;
    } catch (error) {
      console.error('Error creating location:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('location:update', async (_event, id: unknown, input: unknown) => {
    try {
      const validatedId = Blake3IdSchema.parse(id);
      const validatedInput = LocationInputSchema.partial().parse(input);
      const repo = getLocationRepo();
      const location = await repo.update(validatedId, validatedInput as Partial<LocationInput>);
      return location;
    } catch (error) {
      console.error('Error updating location:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('location:delete', async (_event, id: unknown) => {
    try {
      const validatedId = Blake3IdSchema.parse(id);
      const repo = getLocationRepo();
      await repo.delete(validatedId);
      return true;
    } catch (error) {
      console.error('Error deleting location:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('location:count', async (_event, filters?: LocationFilters) => {
    try {
      const repo = getLocationRepo();
      return await repo.count(filters);
    } catch (error) {
      console.error('Error counting locations:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('location:recordView', async (_event, id: unknown) => {
    try {
      const validatedId = Blake3IdSchema.parse(id);
      const repo = getLocationRepo();
      await repo.recordView(validatedId);
      return true;
    } catch (error) {
      console.error('Error recording view:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  // Alias for trackView - used by LocationDetail.svelte
  ipcMain.handle('location:trackView', async (_event, id: unknown) => {
    try {
      const validatedId = Blake3IdSchema.parse(id);
      const repo = getLocationRepo();
      await repo.recordView(validatedId);
      return 1; // Return view count increment
    } catch (error) {
      console.error('Error tracking view:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('location:nearby', async (_event, lat: number, lon: number, radiusKm?: number, limit?: number) => {
    try {
      const repo = getLocationRepo();
      return await repo.findNearby(lat, lon, radiusKm ?? 50, limit ?? 20);
    } catch (error) {
      console.error('Error finding nearby locations:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('location:bounds', async (_event, filters?: LocationFilters) => {
    try {
      const repo = getLocationRepo();
      return await repo.getBounds(filters);
    } catch (error) {
      console.error('Error getting location bounds:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('location:filterOptions', async () => {
    try {
      const repo = getLocationRepo();
      return await repo.getFilterOptions();
    } catch (error) {
      console.error('Error getting filter options:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  // Sublocation handlers

  ipcMain.handle('sublocation:findByLocation', async (_event, locationId: unknown) => {
    try {
      const validatedId = Blake3IdSchema.parse(locationId);
      const repo = getLocationRepo();
      return await repo.getSublocations(validatedId);
    } catch (error) {
      console.error('Error finding sublocations:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  // Find sublocations with hero images - used by LocationDetail.svelte
  ipcMain.handle('sublocation:findWithHeroImages', async (_event, locationId: unknown) => {
    try {
      const validatedId = Blake3IdSchema.parse(locationId);
      const repo = getLocationRepo();
      const sublocations = await repo.getSublocations(validatedId);
      // Transform to match expected format with hero_thumb_path
      // TODO: Implement hero image lookup from media table when available
      return sublocations.map((sub) => ({
        subid: sub.id,
        locid: sub.locationId,
        subnam: sub.name,
        ssubname: sub.shortName || null,
        type: sub.category || null,
        status: sub.status || null,
        is_primary: sub.isPrimary || false,
        created_date: sub.createdAt,
        created_by: null,
        modified_date: sub.updatedAt || null,
        modified_by: null,
        akanam: sub.akaName || null,
        historicalName: sub.historicalName || null,
        gps_lat: sub.gpsLat || null,
        gps_lng: sub.gpsLon || null,
        gps_accuracy: sub.gpsAccuracy || null,
        gps_source: sub.gpsSource || null,
        gps_verified_on_map: sub.gpsVerifiedOnMap || false,
        gps_captured_at: sub.gpsCapturedAt || null,
        hero_thumb_path: null, // TODO: Look up from heroMediaId
      }));
    } catch (error) {
      console.error('Error finding sublocations with hero images:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('sublocation:create', async (_event, locationId: unknown, data: { name: string; shortName?: string }) => {
    try {
      const validatedId = Blake3IdSchema.parse(locationId);
      const repo = getLocationRepo();
      return await repo.createSublocation(validatedId, data);
    } catch (error) {
      console.error('Error creating sublocation:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('sublocation:delete', async (_event, locationId: unknown, sublocationId: unknown) => {
    try {
      const validatedLocationId = Blake3IdSchema.parse(locationId);
      const validatedSublocationId = z.string().uuid().parse(sublocationId);
      const repo = getLocationRepo();
      await repo.deleteSublocation(validatedLocationId, validatedSublocationId);
      return true;
    } catch (error) {
      console.error('Error deleting sublocation:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  // Note handlers

  ipcMain.handle('note:findByLocation', async (_event, locationId: unknown) => {
    try {
      const validatedId = Blake3IdSchema.parse(locationId);
      const repo = getLocationRepo();
      return await repo.getNotes(validatedId);
    } catch (error) {
      console.error('Error finding notes:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('note:create', async (_event, locationId: unknown, data: { noteText: string; noteType?: string }) => {
    try {
      const validatedId = Blake3IdSchema.parse(locationId);
      const repo = getLocationRepo();
      return await repo.createNote(validatedId, data);
    } catch (error) {
      console.error('Error creating note:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('note:delete', async (_event, locationId: unknown, noteId: unknown) => {
    try {
      const validatedLocationId = Blake3IdSchema.parse(locationId);
      const validatedNoteId = z.string().uuid().parse(noteId);
      const repo = getLocationRepo();
      await repo.deleteNote(validatedLocationId, validatedNoteId);
      return true;
    } catch (error) {
      console.error('Error deleting note:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });
}

export function shutdownApiLocationHandlers() {
  locationRepo = null;
}
