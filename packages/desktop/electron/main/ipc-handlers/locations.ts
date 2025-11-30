/**
 * Location IPC Handlers
 * Handles all location:* IPC channels
 * Migration 25: Activity tracking - passes current user to repository
 * Migration 25 - Phase 3: Author attribution via location_authors table
 * Migration 38: Duplicate detection for pin-to-location conversion
 */
import { ipcMain } from 'electron';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '../database';
import { SQLiteLocationRepository } from '../../repositories/sqlite-location-repository';
import { SQLiteLocationAuthorsRepository } from '../../repositories/sqlite-location-authors-repository';
import { SQLiteLocationViewsRepository } from '../../repositories/sqlite-location-views-repository';
import { SQLiteLocationExclusionsRepository } from '../../repositories/sqlite-location-exclusions-repository';
import { LocationInputSchema } from '@au-archive/core';
import type { LocationFilters } from '@au-archive/core';
import { AddressService, type NormalizedAddress } from '../../services/address-service';
import { LocationDuplicateService } from '../../services/location-duplicate-service';

/**
 * Get current user context from settings
 * Returns { userId, username } or null if no user logged in
 */
async function getCurrentUser(db: Kysely<Database>): Promise<{ userId: string; username: string } | null> {
  try {
    const userIdRow = await db.selectFrom('settings').select('value').where('key', '=', 'current_user_id').executeTakeFirst();
    const usernameRow = await db.selectFrom('settings').select('value').where('key', '=', 'current_user').executeTakeFirst();

    if (userIdRow?.value && usernameRow?.value) {
      return { userId: userIdRow.value, username: usernameRow.value };
    }
    return null;
  } catch (error) {
    console.warn('[Location IPC] Failed to get current user:', error);
    return null;
  }
}

export function registerLocationHandlers(db: Kysely<Database>) {
  const locationRepo = new SQLiteLocationRepository(db);
  // Migration 25 - Phase 3: Location authors repository for attribution tracking
  const authorsRepo = new SQLiteLocationAuthorsRepository(db);
  // Migration 34: Location views repository for per-user view tracking
  const viewsRepo = new SQLiteLocationViewsRepository(db);
  // Migration 38: Duplicate detection for pin-to-location conversion
  const exclusionsRepo = new SQLiteLocationExclusionsRepository(db);
  const duplicateService = new LocationDuplicateService(db);

  ipcMain.handle('location:findAll', async (_event, filters?: LocationFilters) => {
    try {
      return await locationRepo.findAll(filters);
    } catch (error) {
      console.error('Error finding locations:', error);
      throw error;
    }
  });

  ipcMain.handle('location:findById', async (_event, id: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(id);
      return await locationRepo.findById(validatedId);
    } catch (error) {
      console.error('Error finding location:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('location:create', async (_event, input: unknown) => {
    try {
      const validatedInput = LocationInputSchema.parse(input);

      // Migration 25: Inject current user context
      const currentUser = await getCurrentUser(db);
      if (currentUser) {
        validatedInput.created_by_id = currentUser.userId;
        validatedInput.created_by = currentUser.username;
        validatedInput.modified_by_id = currentUser.userId;
        validatedInput.modified_by = currentUser.username;
      }

      const location = await locationRepo.create(validatedInput);

      // Migration 25 - Phase 3: Track the creator in location_authors table
      if (currentUser && location) {
        await authorsRepo.trackUserContribution(location.locid, currentUser.userId, 'create').catch((err) => {
          console.warn('[Location IPC] Failed to track creator:', err);
          // Non-fatal - don't fail location creation
        });
      }

      return location;
    } catch (error) {
      console.error('Error creating location:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('location:update', async (_event, id: unknown, input: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(id);
      const validatedInput = LocationInputSchema.partial().parse(input);

      // Migration 25: Inject current user context for modification tracking
      const currentUser = await getCurrentUser(db);
      if (currentUser) {
        validatedInput.modified_by_id = currentUser.userId;
        validatedInput.modified_by = currentUser.username;
      }

      const location = await locationRepo.update(validatedId, validatedInput);

      // Migration 25 - Phase 3: Track the contributor in location_authors table
      if (currentUser) {
        await authorsRepo.trackUserContribution(validatedId, currentUser.userId, 'edit').catch((err) => {
          console.warn('[Location IPC] Failed to track contributor:', err);
          // Non-fatal - don't fail location update
        });
      }

      return location;
    } catch (error) {
      console.error('Error updating location:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('location:delete', async (_event, id: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(id);
      await locationRepo.delete(validatedId);
    } catch (error) {
      console.error('Error deleting location:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('location:count', async (_event, filters?: LocationFilters) => {
    try {
      return await locationRepo.count(filters);
    } catch (error) {
      console.error('Error counting locations:', error);
      throw error;
    }
  });

  ipcMain.handle('location:findNearby', async (_event, lat: number, lng: number, radiusKm: number) => {
    try {
      if (typeof lat !== 'number' || lat < -90 || lat > 90) {
        throw new Error('Invalid latitude');
      }
      if (typeof lng !== 'number' || lng < -180 || lng > 180) {
        throw new Error('Invalid longitude');
      }
      if (typeof radiusKm !== 'number' || radiusKm <= 0 || radiusKm > 1000) {
        throw new Error('Invalid radius (must be 0-1000 km)');
      }
      return await locationRepo.findNearby(lat, lng, radiusKm);
    } catch (error) {
      console.error('Error finding nearby locations:', error);
      throw error;
    }
  });

  ipcMain.handle('location:random', async () => {
    try {
      const count = await db.selectFrom('locs').select((eb) => eb.fn.count('locid').as('count')).executeTakeFirst();
      const total = Number(count?.count || 0);
      if (total === 0) return null;

      const randomOffset = Math.floor(Math.random() * total);
      const result = await db
        .selectFrom('locs')
        .selectAll()
        .limit(1)
        .offset(randomOffset)
        .executeTakeFirst();

      if (!result) return null;
      return await locationRepo.findById(result.locid);
    } catch (error) {
      console.error('Error getting random location:', error);
      throw error;
    }
  });

  ipcMain.handle('location:undocumented', async () => {
    try {
      return await locationRepo.findAll({ documented: false });
    } catch (error) {
      console.error('Error getting undocumented locations:', error);
      throw error;
    }
  });

  ipcMain.handle('location:historical', async () => {
    try {
      return await locationRepo.findAll({ historic: true });
    } catch (error) {
      console.error('Error getting historical locations:', error);
      throw error;
    }
  });

  ipcMain.handle('location:favorites', async () => {
    try {
      return await locationRepo.findAll({ favorite: true });
    } catch (error) {
      console.error('Error getting favorite locations:', error);
      throw error;
    }
  });

  ipcMain.handle('location:toggleFavorite', async (_event, id: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(id);
      const location = await locationRepo.findById(validatedId);
      if (!location) {
        throw new Error('Location not found');
      }
      const newFavoriteState = !location.favorite;

      // Migration 25: Track who toggled favorite
      const currentUser = await getCurrentUser(db);
      const updateData: { favorite: boolean; modified_by_id?: string; modified_by?: string } = {
        favorite: newFavoriteState,
      };
      if (currentUser) {
        updateData.modified_by_id = currentUser.userId;
        updateData.modified_by = currentUser.username;
      }

      await locationRepo.update(validatedId, updateData);
      return newFavoriteState;
    } catch (error) {
      console.error('Error toggling favorite:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  /**
   * Kanye9: Check for duplicate locations by address
   * Returns potential matches with confidence scores
   */
  ipcMain.handle('location:checkDuplicates', async (_event, address: unknown) => {
    try {
      // Validate input address
      const AddressSchema = z.object({
        street: z.string().nullable().optional(),
        city: z.string().nullable().optional(),
        county: z.string().nullable().optional(),
        state: z.string().nullable().optional(),
        zipcode: z.string().nullable().optional(),
      });

      const newAddress = AddressSchema.parse(address) as NormalizedAddress;

      // Get all existing locations with addresses
      const allLocations = await locationRepo.findAll();
      const existingAddresses = allLocations
        .filter(loc => loc.address && (loc.address.street || loc.address.city || loc.address.zipcode))
        .map(loc => ({
          id: loc.locid,
          name: loc.locnam,
          address: {
            street: loc.address?.street || null,
            city: loc.address?.city || null,
            county: loc.address?.county || null,
            state: loc.address?.state || null,
            zipcode: loc.address?.zipcode || null,
          } as NormalizedAddress,
        }));

      // Find duplicates using AddressService
      const duplicates = AddressService.findDuplicates(newAddress, existingAddresses);

      // Enrich with location names
      return duplicates.map(dup => {
        const loc = existingAddresses.find(e => e.id === dup.id);
        return {
          ...dup,
          name: loc?.name || 'Unknown',
          address: loc?.address,
        };
      });
    } catch (error) {
      console.error('Error checking duplicates:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  /**
   * DECISION-012: Backfill region fields for existing locations
   * Calculates Census region, division, state direction, and cultural region
   * for all locations that don't have these fields populated yet.
   */
  ipcMain.handle('location:backfillRegions', async () => {
    try {
      console.log('[Location IPC] Starting region backfill...');
      const result = await locationRepo.backfillRegions();
      console.log(`[Location IPC] Region backfill complete: ${result.updated}/${result.total} locations updated`);
      return result;
    } catch (error) {
      console.error('Error backfilling regions:', error);
      throw error;
    }
  });

  /**
   * DECISION-017: Update cultural regions and verification status
   * Updates local cultural region, country cultural region, and their verification flags
   */
  ipcMain.handle('location:updateRegionData', async (_event, id: unknown, regionData: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(id);

      // Validate region data
      const RegionDataSchema = z.object({
        culturalRegion: z.string().nullable(),
        localCulturalRegionVerified: z.boolean(),
        countryCulturalRegion: z.string().nullable(),
        countryCulturalRegionVerified: z.boolean(),
      });

      const validatedRegionData = RegionDataSchema.parse(regionData);

      // Migration 25: Get current user for modification tracking
      const currentUser = await getCurrentUser(db);
      const now = new Date().toISOString();

      // Update directly in database
      await db.updateTable('locs')
        .set({
          cultural_region: validatedRegionData.culturalRegion,
          local_cultural_region_verified: validatedRegionData.localCulturalRegionVerified ? 1 : 0,
          country_cultural_region: validatedRegionData.countryCulturalRegion,
          country_cultural_region_verified: validatedRegionData.countryCulturalRegionVerified ? 1 : 0,
          locup: now,
          // Migration 25: Activity tracking
          modified_by_id: currentUser?.userId || null,
          modified_by: currentUser?.username || null,
          modified_at: now,
        })
        .where('locid', '=', validatedId)
        .execute();

      console.log(`[Location IPC] Updated region data for location ${validatedId}`);
    } catch (error) {
      console.error('Error updating region data:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  // Get distinct types for autocomplete
  ipcMain.handle('location:getDistinctTypes', async () => {
    try {
      const types = await db
        .selectFrom('locs')
        .select('type')
        .distinct()
        .where('type', 'is not', null)
        .where('type', '!=', '')
        .orderBy('type')
        .execute();

      return types.map(r => r.type).filter(Boolean) as string[];
    } catch (error) {
      console.error('Error getting distinct types:', error);
      throw error;
    }
  });

  // Get distinct sub-types for autocomplete
  ipcMain.handle('location:getDistinctSubTypes', async () => {
    try {
      const stypes = await db
        .selectFrom('locs')
        .select('stype')
        .distinct()
        .where('stype', 'is not', null)
        .where('stype', '!=', '')
        .orderBy('stype')
        .execute();

      return stypes.map(r => r.stype).filter(Boolean) as string[];
    } catch (error) {
      console.error('Error getting distinct sub-types:', error);
      throw error;
    }
  });

  /**
   * Migration 34: Track location views with per-user tracking
   * Records view in location_views table and updates denormalized count on locs
   */
  ipcMain.handle('location:trackView', async (_event, id: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(id);

      // Get current user - required for per-user tracking
      const currentUser = await getCurrentUser(db);
      if (!currentUser) {
        // If no user logged in, fall back to simple counter (no per-user tracking)
        return await locationRepo.trackView(validatedId);
      }

      // Track with per-user view record
      return await viewsRepo.trackView(validatedId, currentUser.userId);
    } catch (error) {
      console.error('Error tracking view:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  /**
   * Migration 34: Get view statistics for a location
   */
  ipcMain.handle('location:getViewStats', async (_event, id: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(id);
      return await viewsRepo.getViewStats(validatedId);
    } catch (error) {
      console.error('Error getting view stats:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  /**
   * Migration 34: Get view history for a location
   */
  ipcMain.handle('location:getViewHistory', async (_event, id: unknown, limit?: number) => {
    try {
      const validatedId = z.string().uuid().parse(id);
      return await viewsRepo.getViewHistory(validatedId, limit ?? 50);
    } catch (error) {
      console.error('Error getting view history:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  /**
   * Dashboard: Find recently viewed locations with hero thumbnails
   */
  ipcMain.handle('location:findRecentlyViewed', async (_event, limit?: number) => {
    try {
      return await locationRepo.findRecentlyViewed(limit ?? 5);
    } catch (error) {
      console.error('Error finding recently viewed locations:', error);
      throw error;
    }
  });

  /**
   * Dashboard: Find project locations with hero thumbnails
   */
  ipcMain.handle('location:findProjects', async (_event, limit?: number) => {
    try {
      return await locationRepo.findProjects(limit ?? 5);
    } catch (error) {
      console.error('Error finding project locations:', error);
      throw error;
    }
  });

  /**
   * Migration 38: Check for duplicate locations before creation
   * ADR: ADR-pin-conversion-duplicate-prevention.md
   *
   * Checks by GPS proximity (≤150m) OR name similarity (≥50%)
   * Returns match info if duplicate found, null otherwise
   */
  ipcMain.handle('location:checkDuplicateByNameAndGps', async (_event, input: unknown) => {
    try {
      const InputSchema = z.object({
        name: z.string().min(1),
        lat: z.number().nullable().optional(),
        lng: z.number().nullable().optional(),
      });

      const validatedInput = InputSchema.parse(input);

      // Get all exclusions for filtering
      const exclusions = await exclusionsRepo.getAllExclusions();

      return await duplicateService.checkForDuplicate(validatedInput, exclusions);
    } catch (error) {
      console.error('Error checking for duplicates:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      throw error;
    }
  });

  /**
   * Migration 38: Record that two names refer to different places
   * ADR: ADR-pin-conversion-duplicate-prevention.md
   *
   * Prevents future duplicate prompts for this pair
   */
  ipcMain.handle('location:addExclusion', async (_event, nameA: unknown, nameB: unknown) => {
    try {
      const validatedNameA = z.string().min(1).parse(nameA);
      const validatedNameB = z.string().min(1).parse(nameB);

      const currentUser = await getCurrentUser(db);
      await exclusionsRepo.addExclusion(validatedNameA, validatedNameB, currentUser?.username);

      return { success: true };
    } catch (error) {
      console.error('Error adding exclusion:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      throw error;
    }
  });

  /**
   * Migration 38: Get count of stored exclusions (for debugging/stats)
   */
  ipcMain.handle('location:getExclusionCount', async () => {
    try {
      return await exclusionsRepo.count();
    } catch (error) {
      console.error('Error getting exclusion count:', error);
      throw error;
    }
  });

  return locationRepo;
}
