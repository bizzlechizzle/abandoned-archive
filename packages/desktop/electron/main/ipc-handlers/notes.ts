/**
 * Notes IPC Handlers
 * Handles notes:* IPC channels
 */
import { ipcMain } from 'electron';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '../database';
import { SQLiteNotesRepository } from '../../repositories/sqlite-notes-repository';
import { validate, LimitSchema } from '../ipc-validation';

export function registerNotesHandlers(db: Kysely<Database>) {
  const notesRepo = new SQLiteNotesRepository(db);

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

  ipcMain.handle('notes:findRecent', async (_event, limit: unknown = 10) => {
    try {
      const validatedLimit = validate(LimitSchema, limit);
      return await notesRepo.findRecent(validatedLimit);
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
}
