import { ipcMain, shell, dialog } from 'electron';
import { getDatabase, getDatabasePath } from './database';
import { SQLiteLocationRepository } from '../repositories/sqlite-location-repository';
import { SQLiteImportRepository } from '../repositories/sqlite-import-repository';
import { SQLiteMediaRepository } from '../repositories/sqlite-media-repository';
import { SQLiteNotesRepository } from '../repositories/sqlite-notes-repository';
import { SQLiteProjectsRepository } from '../repositories/sqlite-projects-repository';
import { SQLiteBookmarksRepository } from '../repositories/sqlite-bookmarks-repository';
import { CryptoService } from '../services/crypto-service';
import { ExifToolService } from '../services/exiftool-service';
import { FFmpegService } from '../services/ffmpeg-service';
import { FileImportService } from '../services/file-import-service';
import { LocationInputSchema } from '@au-archive/core';
import type { LocationInput, LocationFilters } from '@au-archive/core';
import { z } from 'zod';
import fs from 'fs/promises';

export function registerIpcHandlers() {
  const db = getDatabase();
  const locationRepo = new SQLiteLocationRepository(db);
  const importRepo = new SQLiteImportRepository(db);
  const mediaRepo = new SQLiteMediaRepository(db);
  const notesRepo = new SQLiteNotesRepository(db);
  const projectsRepo = new SQLiteProjectsRepository(db);
  const bookmarksRepo = new SQLiteBookmarksRepository(db);

  // Initialize services
  const cryptoService = new CryptoService();
  const exifToolService = new ExifToolService();
  const ffmpegService = new FFmpegService();

  // Location queries
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
      return await locationRepo.create(validatedInput);
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
      return await locationRepo.update(validatedId, validatedInput);
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

  // Special filters
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
      const results = await db
        .selectFrom('locs')
        .selectAll()
        .where('historic', '=', 1)
        .execute();

      const locations = [];
      for (const row of results) {
        const loc = await locationRepo.findById(row.locid);
        if (loc) locations.push(loc);
      }
      return locations;
    } catch (error) {
      console.error('Error getting historical locations:', error);
      throw error;
    }
  });

  ipcMain.handle('location:favorites', async () => {
    try {
      const results = await db
        .selectFrom('locs')
        .selectAll()
        .where('favorite', '=', 1)
        .orderBy('locup', 'desc')
        .execute();

      const locations = [];
      for (const row of results) {
        const loc = await locationRepo.findById(row.locid);
        if (loc) locations.push(loc);
      }
      return locations;
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
      await locationRepo.update(validatedId, { favorite: newFavoriteState });
      return newFavoriteState;
    } catch (error) {
      console.error('Error toggling favorite:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  // Stats queries
  ipcMain.handle('stats:topStates', async (_event, limit: number = 5) => {
    try {
      const result = await db
        .selectFrom('locs')
        .select(['address_state as state', (eb) => eb.fn.count('locid').as('count')])
        .where('address_state', 'is not', null)
        .groupBy('address_state')
        .orderBy('count', 'desc')
        .limit(limit)
        .execute();
      return result;
    } catch (error) {
      console.error('Error getting top states:', error);
      throw error;
    }
  });

  ipcMain.handle('stats:topTypes', async (_event, limit: number = 5) => {
    try {
      const result = await db
        .selectFrom('locs')
        .select(['type', (eb) => eb.fn.count('locid').as('count')])
        .where('type', 'is not', null)
        .groupBy('type')
        .orderBy('count', 'desc')
        .limit(limit)
        .execute();
      return result;
    } catch (error) {
      console.error('Error getting top types:', error);
      throw error;
    }
  });

  // Settings queries
  ipcMain.handle('settings:get', async (_event, key: unknown) => {
    try {
      const validatedKey = z.string().min(1).parse(key);
      const result = await db
        .selectFrom('settings')
        .select('value')
        .where('key', '=', validatedKey)
        .executeTakeFirst();
      return result?.value ?? null;
    } catch (error) {
      console.error('Error getting setting:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('settings:getAll', async () => {
    try {
      const results = await db
        .selectFrom('settings')
        .selectAll()
        .execute();
      return results.reduce((acc, row) => {
        acc[row.key] = row.value;
        return acc;
      }, {} as Record<string, string>);
    } catch (error) {
      console.error('Error getting all settings:', error);
      throw error;
    }
  });

  ipcMain.handle('settings:set', async (_event, key: unknown, value: unknown) => {
    try {
      const validatedKey = z.string().min(1).parse(key);
      const validatedValue = z.string().parse(value);
      await db
        .insertInto('settings')
        .values({ key: validatedKey, value: validatedValue })
        .onConflict((oc) => oc.column('key').doUpdateSet({ value: validatedValue }))
        .execute();
    } catch (error) {
      console.error('Error setting value:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  // Shell operations
  ipcMain.handle('shell:openExternal', async (_event, url: unknown) => {
    try {
      const validatedUrl = z.string().url().parse(url);
      // Security: Only allow http, https, and mailto protocols
      if (!validatedUrl.match(/^(https?|mailto):/)) {
        throw new Error('Only http, https, and mailto URLs are allowed');
      }
      await shell.openExternal(validatedUrl);
    } catch (error) {
      console.error('Error opening external URL:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  // Dialog operations
  ipcMain.handle('dialog:selectFolder', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select Archive Folder',
        buttonLabel: 'Select Folder',
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return result.filePaths[0];
    } catch (error) {
      console.error('Error selecting folder:', error);
      throw error;
    }
  });

  // Import operations
  ipcMain.handle('imports:create', async (_event, input: unknown) => {
    try {
      const ImportInputSchema = z.object({
        locid: z.string().uuid().nullable(),
        auth_imp: z.string().nullable(),
        img_count: z.number().int().min(0).optional(),
        vid_count: z.number().int().min(0).optional(),
        doc_count: z.number().int().min(0).optional(),
        map_count: z.number().int().min(0).optional(),
        notes: z.string().nullable().optional(),
      });

      const validatedInput = ImportInputSchema.parse(input);
      return await importRepo.create(validatedInput);
    } catch (error) {
      console.error('Error creating import record:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('imports:findRecent', async (_event, limit: number = 5) => {
    try {
      return await importRepo.findRecent(limit);
    } catch (error) {
      console.error('Error finding recent imports:', error);
      throw error;
    }
  });

  ipcMain.handle('imports:findByLocation', async (_event, locid: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(locid);
      return await importRepo.findByLocation(validatedId);
    } catch (error) {
      console.error('Error finding imports by location:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('imports:findAll', async () => {
    try {
      return await importRepo.findAll();
    } catch (error) {
      console.error('Error finding all imports:', error);
      throw error;
    }
  });

  ipcMain.handle('imports:getTotalMediaCount', async () => {
    try {
      return await importRepo.getTotalMediaCount();
    } catch (error) {
      console.error('Error getting total media count:', error);
      throw error;
    }
  });

  // Media operations
  ipcMain.handle('media:selectFiles', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        title: 'Select Media Files',
        filters: [
          { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp'] },
          { name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm'] },
          { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return result.filePaths;
    } catch (error) {
      console.error('Error selecting files:', error);
      throw error;
    }
  });

  ipcMain.handle('media:import', async (_event, input: unknown) => {
    try {
      const ImportInputSchema = z.object({
        files: z.array(
          z.object({
            filePath: z.string(),
            originalName: z.string(),
          })
        ),
        locid: z.string().uuid(),
        subid: z.string().uuid().nullable().optional(),
        auth_imp: z.string().nullable(),
        deleteOriginals: z.boolean().default(false),
      });

      const validatedInput = ImportInputSchema.parse(input);

      // Get archive path from settings
      const archivePath = await db
        .selectFrom('settings')
        .select('value')
        .where('key', '=', 'archive_folder')
        .executeTakeFirst();

      if (!archivePath?.value) {
        throw new Error('Archive folder not configured. Please set it in Settings.');
      }

      // Initialize FileImportService
      const fileImportService = new FileImportService(
        cryptoService,
        exifToolService,
        ffmpegService,
        mediaRepo,
        importRepo,
        archivePath.value
      );

      // Prepare files for import
      const filesForImport = validatedInput.files.map((f) => ({
        filePath: f.filePath,
        originalName: f.originalName,
        locid: validatedInput.locid,
        subid: validatedInput.subid || null,
        auth_imp: validatedInput.auth_imp,
      }));

      // Import files
      const result = await fileImportService.importFiles(
        filesForImport,
        validatedInput.deleteOriginals
      );

      return result;
    } catch (error) {
      console.error('Error importing media:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('media:findByLocation', async (_event, locid: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(locid);
      return await mediaRepo.findAllMediaByLocation(validatedId);
    } catch (error) {
      console.error('Error finding media by location:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('media:openFile', async (_event, filePath: unknown) => {
    try {
      const validatedPath = z.string().parse(filePath);
      await shell.openPath(validatedPath);
    } catch (error) {
      console.error('Error opening file:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  // Notes operations
  ipcMain.handle('notes:create', async (_event, input: unknown) => {
    try {
      const NoteInputSchema = z.object({
        locid: z.string().uuid(),
        note_text: z.string().min(1),
        auth_imp: z.string().nullable().optional(),
        note_type: z.string().optional(),
      });

      const validatedInput = NoteInputSchema.parse(input);
      return await notesRepo.create(validatedInput);
    } catch (error) {
      console.error('Error creating note:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('notes:findById', async (_event, note_id: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(note_id);
      return await notesRepo.findById(validatedId);
    } catch (error) {
      console.error('Error finding note:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('notes:findByLocation', async (_event, locid: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(locid);
      return await notesRepo.findByLocation(validatedId);
    } catch (error) {
      console.error('Error finding notes by location:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('notes:findRecent', async (_event, limit: number = 10) => {
    try {
      return await notesRepo.findRecent(limit);
    } catch (error) {
      console.error('Error finding recent notes:', error);
      throw error;
    }
  });

  ipcMain.handle('notes:update', async (_event, note_id: unknown, updates: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(note_id);
      const NoteUpdateSchema = z.object({
        note_text: z.string().min(1).optional(),
        note_type: z.string().optional(),
      });
      const validatedUpdates = NoteUpdateSchema.parse(updates);
      return await notesRepo.update(validatedId, validatedUpdates);
    } catch (error) {
      console.error('Error updating note:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('notes:delete', async (_event, note_id: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(note_id);
      await notesRepo.delete(validatedId);
    } catch (error) {
      console.error('Error deleting note:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('notes:countByLocation', async (_event, locid: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(locid);
      return await notesRepo.countByLocation(validatedId);
    } catch (error) {
      console.error('Error counting notes:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  // Projects operations
  ipcMain.handle('projects:create', async (_event, input: unknown) => {
    try {
      const ProjectInputSchema = z.object({
        project_name: z.string().min(1),
        description: z.string().nullable().optional(),
        auth_imp: z.string().nullable().optional(),
      });

      const validatedInput = ProjectInputSchema.parse(input);
      return await projectsRepo.create(validatedInput);
    } catch (error) {
      console.error('Error creating project:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('projects:findById', async (_event, project_id: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(project_id);
      return await projectsRepo.findById(validatedId);
    } catch (error) {
      console.error('Error finding project:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('projects:findByIdWithLocations', async (_event, project_id: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(project_id);
      return await projectsRepo.findByIdWithLocations(validatedId);
    } catch (error) {
      console.error('Error finding project with locations:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('projects:findAll', async () => {
    try {
      return await projectsRepo.findAll();
    } catch (error) {
      console.error('Error finding all projects:', error);
      throw error;
    }
  });

  ipcMain.handle('projects:findRecent', async (_event, limit: number = 5) => {
    try {
      return await projectsRepo.findRecent(limit);
    } catch (error) {
      console.error('Error finding recent projects:', error);
      throw error;
    }
  });

  ipcMain.handle('projects:findTopByLocationCount', async (_event, limit: number = 5) => {
    try {
      return await projectsRepo.findTopByLocationCount(limit);
    } catch (error) {
      console.error('Error finding top projects:', error);
      throw error;
    }
  });

  ipcMain.handle('projects:findByLocation', async (_event, locid: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(locid);
      return await projectsRepo.findByLocation(validatedId);
    } catch (error) {
      console.error('Error finding projects by location:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('projects:update', async (_event, project_id: unknown, updates: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(project_id);
      const ProjectUpdateSchema = z.object({
        project_name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
      });
      const validatedUpdates = ProjectUpdateSchema.parse(updates);
      return await projectsRepo.update(validatedId, validatedUpdates);
    } catch (error) {
      console.error('Error updating project:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('projects:delete', async (_event, project_id: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(project_id);
      await projectsRepo.delete(validatedId);
    } catch (error) {
      console.error('Error deleting project:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('projects:addLocation', async (_event, project_id: unknown, locid: unknown) => {
    try {
      const validatedProjectId = z.string().uuid().parse(project_id);
      const validatedLocId = z.string().uuid().parse(locid);
      await projectsRepo.addLocation(validatedProjectId, validatedLocId);
    } catch (error) {
      console.error('Error adding location to project:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('projects:removeLocation', async (_event, project_id: unknown, locid: unknown) => {
    try {
      const validatedProjectId = z.string().uuid().parse(project_id);
      const validatedLocId = z.string().uuid().parse(locid);
      await projectsRepo.removeLocation(validatedProjectId, validatedLocId);
    } catch (error) {
      console.error('Error removing location from project:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('projects:isLocationInProject', async (_event, project_id: unknown, locid: unknown) => {
    try {
      const validatedProjectId = z.string().uuid().parse(project_id);
      const validatedLocId = z.string().uuid().parse(locid);
      return await projectsRepo.isLocationInProject(validatedProjectId, validatedLocId);
    } catch (error) {
      console.error('Error checking if location is in project:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  // Bookmarks operations
  ipcMain.handle('bookmarks:create', async (_event, input: unknown) => {
    try {
      const BookmarkInputSchema = z.object({
        url: z.string().url(),
        title: z.string().nullable().optional(),
        locid: z.string().uuid().nullable().optional(),
        auth_imp: z.string().nullable().optional(),
        thumbnail_path: z.string().nullable().optional(),
      });

      const validatedInput = BookmarkInputSchema.parse(input);
      return await bookmarksRepo.create(validatedInput);
    } catch (error) {
      console.error('Error creating bookmark:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('bookmarks:findById', async (_event, bookmark_id: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(bookmark_id);
      return await bookmarksRepo.findById(validatedId);
    } catch (error) {
      console.error('Error finding bookmark:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('bookmarks:findByLocation', async (_event, locid: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(locid);
      return await bookmarksRepo.findByLocation(validatedId);
    } catch (error) {
      console.error('Error finding bookmarks by location:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('bookmarks:findRecent', async (_event, limit: number = 10) => {
    try {
      return await bookmarksRepo.findRecent(limit);
    } catch (error) {
      console.error('Error finding recent bookmarks:', error);
      throw error;
    }
  });

  ipcMain.handle('bookmarks:findAll', async () => {
    try {
      return await bookmarksRepo.findAll();
    } catch (error) {
      console.error('Error finding all bookmarks:', error);
      throw error;
    }
  });

  ipcMain.handle('bookmarks:update', async (_event, bookmark_id: unknown, updates: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(bookmark_id);
      const BookmarkUpdateSchema = z.object({
        url: z.string().url().optional(),
        title: z.string().nullable().optional(),
        locid: z.string().uuid().nullable().optional(),
        thumbnail_path: z.string().nullable().optional(),
      });
      const validatedUpdates = BookmarkUpdateSchema.parse(updates);
      return await bookmarksRepo.update(validatedId, validatedUpdates);
    } catch (error) {
      console.error('Error updating bookmark:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('bookmarks:delete', async (_event, bookmark_id: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(bookmark_id);
      await bookmarksRepo.delete(validatedId);
    } catch (error) {
      console.error('Error deleting bookmark:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('bookmarks:count', async () => {
    try {
      return await bookmarksRepo.count();
    } catch (error) {
      console.error('Error counting bookmarks:', error);
      throw error;
    }
  });

  ipcMain.handle('bookmarks:countByLocation', async (_event, locid: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(locid);
      return await bookmarksRepo.countByLocation(validatedId);
    } catch (error) {
      console.error('Error counting bookmarks by location:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  // Database operations
  ipcMain.handle('database:backup', async () => {
    try {
      const dbPath = getDatabasePath();

      // Create timestamped filename
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const defaultFilename = `au-archive-backup-${timestamp}.db`;

      // Show save dialog
      const result = await dialog.showSaveDialog({
        title: 'Backup Database',
        defaultPath: defaultFilename,
        filters: [
          { name: 'SQLite Database', extensions: ['db'] },
          { name: 'All Files', extensions: ['*'] }
        ],
      });

      if (result.canceled || !result.filePath) {
        return { success: false, message: 'Backup canceled' };
      }

      // Copy database file to selected location
      await fs.copyFile(dbPath, result.filePath);

      return { success: true, path: result.filePath };
    } catch (error) {
      console.error('Error backing up database:', error);
      throw error;
    }
  });

  console.log('IPC handlers registered');
}
