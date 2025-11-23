/**
 * Geocoding IPC Handlers
 * Handles geocode:* IPC channels
 */
import { ipcMain } from 'electron';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '../database';
import { GeocodingService } from '../../services/geocoding-service';

export function registerGeocodeHandlers(db: Kysely<Database>) {
  const geocodingService = new GeocodingService(db);

  // Initialize geocoding cache table
  geocodingService.initCache().catch((error) => {
    console.warn('Failed to initialize geocoding cache:', error);
  });

  ipcMain.handle('geocode:reverse', async (_event, lat: unknown, lng: unknown) => {
    try {
      const GeoInputSchema = z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      });

      const { lat: validLat, lng: validLng } = GeoInputSchema.parse({ lat, lng });
      const result = await geocodingService.reverseGeocode(validLat, validLng);

      if (!result) {
        return null;
      }

      return {
        lat: result.lat,
        lng: result.lng,
        displayName: result.displayName,
        address: result.address,
        confidence: result.confidence,
        source: result.source,
      };
    } catch (error) {
      console.error('Error reverse geocoding:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('geocode:forward', async (_event, address: unknown) => {
    try {
      const validAddress = z.string().min(3).max(500).parse(address);
      const result = await geocodingService.forwardGeocode(validAddress);

      if (!result) {
        return null;
      }

      return {
        lat: result.lat,
        lng: result.lng,
        displayName: result.displayName,
        address: result.address,
        confidence: result.confidence,
        source: result.source,
      };
    } catch (error) {
      console.error('Error forward geocoding:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('geocode:clearCache', async (_event, daysOld: unknown = 90) => {
    try {
      const validDays = z.number().int().positive().max(365).parse(daysOld);
      const deleted = await geocodingService.clearOldCache(validDays);
      return { deleted };
    } catch (error) {
      console.error('Error clearing geocode cache:', error);
      throw error;
    }
  });

  return geocodingService;
}
