/**
 * Sub-Location IPC Handlers
 * Handles sublocation:* IPC channels
 */
import { ipcMain } from 'electron';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '../database';
import { SQLiteSubLocationRepository } from '../../repositories/sqlite-sublocation-repository';

export function registerSubLocationHandlers(db: Kysely<Database>) {
  const sublocRepo = new SQLiteSubLocationRepository(db);

  ipcMain.handle('sublocation:create', async (_event, input: unknown) => {
    try {
      const CreateSchema = z.object({
        locid: z.string().uuid(),
        subnam: z.string().min(1),
        ssubname: z.string().nullable().optional(),
        type: z.string().nullable().optional(),
        status: z.string().nullable().optional(),
        is_primary: z.boolean().optional(),
        created_by: z.string().nullable().optional(),
      });
      const validatedInput = CreateSchema.parse(input);
      return await sublocRepo.create(validatedInput);
    } catch (error) {
      console.error('Error creating sub-location:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('sublocation:findById', async (_event, subid: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(subid);
      return await sublocRepo.findById(validatedId);
    } catch (error) {
      console.error('Error finding sub-location:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('sublocation:findByLocation', async (_event, locid: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(locid);
      return await sublocRepo.findByLocationId(validatedId);
    } catch (error) {
      console.error('Error finding sub-locations by location:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('sublocation:findWithHeroImages', async (_event, locid: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(locid);
      return await sublocRepo.findWithHeroImages(validatedId);
    } catch (error) {
      console.error('Error finding sub-locations with hero images:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('sublocation:update', async (_event, subid: unknown, updates: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(subid);
      const UpdateSchema = z.object({
        subnam: z.string().min(1).optional(),
        ssubname: z.string().nullable().optional(),
        type: z.string().nullable().optional(),
        status: z.string().nullable().optional(),
        hero_imghash: z.string().nullable().optional(),
        hero_focal_x: z.number().min(0).max(1).optional(),  // OPT-095: Hero focal point X
        hero_focal_y: z.number().min(0).max(1).optional(),  // OPT-095: Hero focal point Y
        is_primary: z.boolean().optional(),
        modified_by: z.string().nullable().optional(),
        // Migration 32: AKA and historical name
        akanam: z.string().nullable().optional(),
        historicalName: z.string().nullable().optional(),
      });
      const validatedUpdates = UpdateSchema.parse(updates);
      return await sublocRepo.update(validatedId, validatedUpdates);
    } catch (error) {
      console.error('Error updating sub-location:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('sublocation:delete', async (_event, subid: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(subid);
      await sublocRepo.delete(validatedId);
    } catch (error) {
      console.error('Error deleting sub-location:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('sublocation:setPrimary', async (_event, locid: unknown, subid: unknown) => {
    try {
      const validatedLocid = z.string().uuid().parse(locid);
      const validatedSubid = z.string().uuid().parse(subid);
      await sublocRepo.setPrimary(validatedLocid, validatedSubid);
    } catch (error) {
      console.error('Error setting primary sub-location:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('sublocation:checkName', async (_event, locid: unknown, subnam: unknown, excludeSubid?: unknown) => {
    try {
      const validatedLocid = z.string().uuid().parse(locid);
      const validatedSubnam = z.string().min(1).parse(subnam);
      const validatedExclude = excludeSubid ? z.string().uuid().parse(excludeSubid) : undefined;
      return await sublocRepo.checkNameExists(validatedLocid, validatedSubnam, validatedExclude);
    } catch (error) {
      console.error('Error checking sub-location name:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('sublocation:count', async (_event, locid: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(locid);
      return await sublocRepo.countByLocationId(validatedId);
    } catch (error) {
      console.error('Error counting sub-locations:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  // Migration 31: GPS handlers for sub-locations
  ipcMain.handle('sublocation:updateGps', async (_event, subid: unknown, gps: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(subid);
      const GpsSchema = z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        accuracy: z.number().nullable().optional(),
        source: z.string().min(1),
      });
      const validatedGps = GpsSchema.parse(gps);
      return await sublocRepo.updateGps(validatedId, validatedGps);
    } catch (error) {
      console.error('Error updating sub-location GPS:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('sublocation:clearGps', async (_event, subid: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(subid);
      return await sublocRepo.clearGps(validatedId);
    } catch (error) {
      console.error('Error clearing sub-location GPS:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('sublocation:verifyGps', async (_event, subid: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(subid);
      return await sublocRepo.verifyGpsOnMap(validatedId);
    } catch (error) {
      console.error('Error verifying sub-location GPS:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('sublocation:findWithGps', async (_event, locid: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(locid);
      return await sublocRepo.findWithGpsByLocationId(validatedId);
    } catch (error) {
      console.error('Error finding sub-locations with GPS:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  return sublocRepo;
}
