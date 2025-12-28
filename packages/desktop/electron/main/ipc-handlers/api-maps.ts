/**
 * API-based Maps IPC Handlers
 *
 * Handles all maps:* IPC channels using dispatch hub API
 * instead of local SQLite database.
 */

import { ipcMain } from 'electron';
import { z } from 'zod';
import { getDispatchClient, type MapPoint } from '@aa/services';
import { ApiMapRepository } from '../../repositories/api-map-repository';

const UuidSchema = z.string().uuid();
const Blake3IdSchema = z.string().length(16).regex(/^[a-f0-9]+$/);

const MapPointSchema = z.object({
  name: z.string().optional(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

let mapRepo: ApiMapRepository | null = null;

function getMapRepo(): ApiMapRepository {
  if (!mapRepo) {
    const client = getDispatchClient();
    mapRepo = new ApiMapRepository(client);
  }
  return mapRepo;
}

export function registerApiMapHandlers() {
  // Reference Map CRUD

  ipcMain.handle('maps:references:list', async (_event, locationId?: unknown) => {
    try {
      const validatedLocationId = locationId ? Blake3IdSchema.parse(locationId) : undefined;
      const repo = getMapRepo();
      return await repo.getReferenceMaps(validatedLocationId);
    } catch (error) {
      console.error('Error listing reference maps:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('maps:references:create', async (_event, data: { name: string; sourceFile: string; format: string; locationId?: string }) => {
    try {
      const validated = z.object({
        name: z.string().min(1),
        sourceFile: z.string().min(1),
        format: z.string().min(1),
        locationId: Blake3IdSchema.optional(),
      }).parse(data);
      const repo = getMapRepo();
      return await repo.createReferenceMap(validated);
    } catch (error) {
      console.error('Error creating reference map:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('maps:references:delete', async (_event, id: unknown) => {
    try {
      const validatedId = UuidSchema.parse(id);
      const repo = getMapRepo();
      await repo.deleteReferenceMap(validatedId);
      return true;
    } catch (error) {
      console.error('Error deleting reference map:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  // Reference Map Points

  ipcMain.handle('maps:references:points:list', async (_event, mapId: unknown) => {
    try {
      const validatedId = UuidSchema.parse(mapId);
      const repo = getMapRepo();
      return await repo.getReferenceMapPoints(validatedId);
    } catch (error) {
      console.error('Error listing reference map points:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('maps:references:points:add', async (_event, mapId: unknown, points: unknown) => {
    try {
      const validatedId = UuidSchema.parse(mapId);
      const validatedPoints = z.array(MapPointSchema).parse(points) as MapPoint[];
      const repo = getMapRepo();
      return await repo.addReferenceMapPoints(validatedId, validatedPoints);
    } catch (error) {
      console.error('Error adding reference map points:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('maps:references:points:match', async (_event, mapId: unknown, pointId: unknown, locationId: unknown) => {
    try {
      const validatedMapId = UuidSchema.parse(mapId);
      const validatedPointId = UuidSchema.parse(pointId);
      const validatedLocationId = Blake3IdSchema.parse(locationId);
      const repo = getMapRepo();
      await repo.matchReferenceMapPoint(validatedMapId, validatedPointId, validatedLocationId);
      return true;
    } catch (error) {
      console.error('Error matching reference map point:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  // Map File Operations

  ipcMain.handle('maps:parse', async (_event, format: string, content: string, name?: string) => {
    try {
      const validatedFormat = z.string().min(1).parse(format);
      const validatedContent = z.string().min(1).parse(content);
      const repo = getMapRepo();
      return await repo.parseMapFile(validatedFormat, validatedContent, name);
    } catch (error) {
      console.error('Error parsing map file:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('maps:dedup', async (_event, points: unknown, radiusMeters?: number) => {
    try {
      const validatedPoints = z.array(MapPointSchema).parse(points) as MapPoint[];
      const validatedRadius = radiusMeters ?? 100;
      const repo = getMapRepo();
      return await repo.deduplicatePoints(validatedPoints, validatedRadius);
    } catch (error) {
      console.error('Error deduplicating points:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('maps:match', async (_event, points: unknown, options?: { radiusMeters?: number; requireName?: boolean }) => {
    try {
      const validatedPoints = z.array(MapPointSchema).parse(points) as MapPoint[];
      const repo = getMapRepo();
      return await repo.matchPointsToLocations(validatedPoints, options);
    } catch (error) {
      console.error('Error matching points to locations:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('maps:export', async (_event, points: unknown, format: 'kml' | 'gpx' | 'geojson' | 'csv', name?: string) => {
    try {
      const validatedPoints = z.array(MapPointSchema).parse(points) as MapPoint[];
      const validatedFormat = z.enum(['kml', 'gpx', 'geojson', 'csv']).parse(format);
      const repo = getMapRepo();
      return await repo.exportPoints(validatedPoints, validatedFormat, name);
    } catch (error) {
      console.error('Error exporting points:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  // Convenience methods

  ipcMain.handle('maps:import', async (
    _event,
    format: string,
    content: string,
    name: string,
    sourceFile: string,
    locationId?: string
  ) => {
    try {
      const validatedFormat = z.string().min(1).parse(format);
      const validatedContent = z.string().min(1).parse(content);
      const validatedName = z.string().min(1).parse(name);
      const validatedSourceFile = z.string().min(1).parse(sourceFile);
      const validatedLocationId = locationId ? Blake3IdSchema.parse(locationId) : undefined;
      const repo = getMapRepo();
      return await repo.importMapToReferenceMap(
        validatedFormat,
        validatedContent,
        validatedName,
        validatedSourceFile,
        validatedLocationId
      );
    } catch (error) {
      console.error('Error importing map:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('maps:automatch', async (_event, mapId: unknown, options?: { radiusMeters?: number; requireName?: boolean }) => {
    try {
      const validatedId = UuidSchema.parse(mapId);
      const repo = getMapRepo();
      return await repo.autoMatchReferenceMap(validatedId, options);
    } catch (error) {
      console.error('Error auto-matching reference map:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });
}

export function shutdownApiMapHandlers() {
  mapRepo = null;
}
