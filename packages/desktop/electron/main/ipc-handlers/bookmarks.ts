/**
 * Bookmarks IPC Handlers
 * Handles bookmarks:* IPC channels
 */
import { ipcMain } from 'electron';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '../database';
import { SQLiteBookmarksRepository } from '../../repositories/sqlite-bookmarks-repository';
import { validate, LimitSchema } from '../ipc-validation';

export function registerBookmarksHandlers(db: Kysely<Database>) {
  const bookmarksRepo = new SQLiteBookmarksRepository(db);

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

  ipcMain.handle('bookmarks:findRecent', async (_event, limit: unknown = 10) => {
    try {
      const validatedLimit = validate(LimitSchema, limit);
      return await bookmarksRepo.findRecent(validatedLimit);
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
}
