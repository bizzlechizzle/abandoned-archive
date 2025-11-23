/**
 * Users IPC Handlers
 * Handles users:* IPC channels
 */
import { ipcMain } from 'electron';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '../database';
import { SQLiteUsersRepository } from '../../repositories/sqlite-users-repository';

export function registerUsersHandlers(db: Kysely<Database>) {
  const usersRepo = new SQLiteUsersRepository(db);

  ipcMain.handle('users:create', async (_event, input: unknown) => {
    try {
      const UserInputSchema = z.object({
        username: z.string().min(1),
        display_name: z.string().nullable().optional(),
      });
      const validatedInput = UserInputSchema.parse(input);
      return await usersRepo.create(validatedInput);
    } catch (error) {
      console.error('Error creating user:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });

  ipcMain.handle('users:findAll', async () => {
    try {
      return await usersRepo.findAll();
    } catch (error) {
      console.error('Error finding users:', error);
      throw error;
    }
  });

  ipcMain.handle('users:findByUsername', async (_event, username: unknown) => {
    try {
      const validatedUsername = z.string().parse(username);
      return await usersRepo.findByUsername(validatedUsername);
    } catch (error) {
      console.error('Error finding user by username:', error);
      throw error;
    }
  });

  ipcMain.handle('users:delete', async (_event, user_id: unknown) => {
    try {
      const validatedId = z.string().uuid().parse(user_id);
      await usersRepo.delete(validatedId);
    } catch (error) {
      console.error('Error deleting user:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  });
}
