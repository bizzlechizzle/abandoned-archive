/**
 * API-based Media IPC Handlers
 *
 * Handles all media:* IPC channels using dispatch hub API
 * instead of local SQLite database.
 */

import { ipcMain } from 'electron';
import { z } from 'zod';
import { getDispatchClient } from '@aa/services';
import { ApiMediaRepository, type MediaQueryOptions } from '../../repositories/api-media-repository';

const Blake3HashSchema = z.string().length(16).regex(/^[a-f0-9]+$/);
const Blake3IdSchema = z.string().length(16).regex(/^[a-f0-9]+$/);

let mediaRepo: ApiMediaRepository | null = null;

function getMediaRepo(): ApiMediaRepository {
  if (!mediaRepo) {
    const client = getDispatchClient();
    mediaRepo = new ApiMediaRepository(client);
  }
  return mediaRepo;
}

export function registerApiMediaHandlers() {
  // Image handlers

  ipcMain.handle('media:images:findByLocation', async (_event, locid: unknown, options?: MediaQueryOptions) => {
    try {
      const validatedId = Blake3IdSchema.parse(locid);
      const repo = getMediaRepo();
      return await repo.getImagesByLocation(validatedId, options);
    } catch (error) {
      console.error('Error finding images:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('media:images:findByHash', async (_event, hash: unknown) => {
    try {
      const validatedHash = Blake3HashSchema.parse(hash);
      const repo = getMediaRepo();
      return await repo.getImageByHash(validatedHash);
    } catch (error) {
      console.error('Error finding image:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('media:images:countByLocation', async (_event, locid: unknown) => {
    try {
      const validatedId = Blake3IdSchema.parse(locid);
      const repo = getMediaRepo();
      return await repo.countImagesByLocation(validatedId);
    } catch (error) {
      console.error('Error counting images:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  // Video handlers

  ipcMain.handle('media:videos:findByLocation', async (_event, locid: unknown, options?: MediaQueryOptions) => {
    try {
      const validatedId = Blake3IdSchema.parse(locid);
      const repo = getMediaRepo();
      return await repo.getVideosByLocation(validatedId, options);
    } catch (error) {
      console.error('Error finding videos:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('media:videos:findByHash', async (_event, hash: unknown) => {
    try {
      const validatedHash = Blake3HashSchema.parse(hash);
      const repo = getMediaRepo();
      return await repo.getVideoByHash(validatedHash);
    } catch (error) {
      console.error('Error finding video:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('media:videos:countByLocation', async (_event, locid: unknown) => {
    try {
      const validatedId = Blake3IdSchema.parse(locid);
      const repo = getMediaRepo();
      return await repo.countVideosByLocation(validatedId);
    } catch (error) {
      console.error('Error counting videos:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  // Document handlers

  ipcMain.handle('media:docs:findByLocation', async (_event, locid: unknown, options?: MediaQueryOptions) => {
    try {
      const validatedId = Blake3IdSchema.parse(locid);
      const repo = getMediaRepo();
      return await repo.getDocumentsByLocation(validatedId, options);
    } catch (error) {
      console.error('Error finding documents:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('media:docs:findByHash', async (_event, hash: unknown) => {
    try {
      const validatedHash = Blake3HashSchema.parse(hash);
      const repo = getMediaRepo();
      return await repo.getDocumentByHash(validatedHash);
    } catch (error) {
      console.error('Error finding document:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('media:docs:countByLocation', async (_event, locid: unknown) => {
    try {
      const validatedId = Blake3IdSchema.parse(locid);
      const repo = getMediaRepo();
      return await repo.countDocumentsByLocation(validatedId);
    } catch (error) {
      console.error('Error counting documents:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  // Map handlers

  ipcMain.handle('media:maps:findByLocation', async (_event, locid: unknown, options?: MediaQueryOptions) => {
    try {
      const validatedId = Blake3IdSchema.parse(locid);
      const repo = getMediaRepo();
      return await repo.getMapsByLocation(validatedId, options);
    } catch (error) {
      console.error('Error finding maps:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('media:maps:findByHash', async (_event, hash: unknown) => {
    try {
      const validatedHash = Blake3HashSchema.parse(hash);
      const repo = getMediaRepo();
      return await repo.getMapByHash(validatedHash);
    } catch (error) {
      console.error('Error finding map:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  // Hide/unhide handlers

  ipcMain.handle('media:hide', async (_event, hash: unknown, reason?: string) => {
    try {
      const validatedHash = Blake3HashSchema.parse(hash);
      const repo = getMediaRepo();
      await repo.hideMedia(validatedHash, reason);
      return true;
    } catch (error) {
      console.error('Error hiding media:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('media:unhide', async (_event, hash: unknown) => {
    try {
      const validatedHash = Blake3HashSchema.parse(hash);
      const repo = getMediaRepo();
      await repo.unhideMedia(validatedHash);
      return true;
    } catch (error) {
      console.error('Error unhiding media:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  // Tag handlers

  ipcMain.handle('media:tags:get', async (_event, hash: unknown) => {
    try {
      const validatedHash = Blake3HashSchema.parse(hash);
      const repo = getMediaRepo();
      return await repo.getTags(validatedHash);
    } catch (error) {
      console.error('Error getting tags:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('media:tags:add', async (_event, hash: unknown, tag: { tag: string; confidence?: number; source?: 'manual' | 'ml' | 'exif' | 'import'; category?: string }) => {
    try {
      const validatedHash = Blake3HashSchema.parse(hash);
      const repo = getMediaRepo();
      return await repo.addTag(validatedHash, tag);
    } catch (error) {
      console.error('Error adding tag:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('media:tags:remove', async (_event, hash: unknown, tagId: unknown) => {
    try {
      const validatedHash = Blake3HashSchema.parse(hash);
      const validatedTagId = z.string().uuid().parse(tagId);
      const repo = getMediaRepo();
      await repo.removeTag(validatedHash, validatedTagId);
      return true;
    } catch (error) {
      console.error('Error removing tag:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  // Thumbnail handlers

  ipcMain.handle('media:thumbnails:set', async (
    _event,
    hash: unknown,
    thumbnails: { thumbPath?: string; thumbPathSm?: string; thumbPathLg?: string; previewPath?: string; posterPath?: string }
  ) => {
    try {
      const validatedHash = Blake3HashSchema.parse(hash);
      const repo = getMediaRepo();
      await repo.setThumbnails(validatedHash, thumbnails);
      return true;
    } catch (error) {
      console.error('Error setting thumbnails:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });
}

export function shutdownApiMediaHandlers() {
  mediaRepo = null;
}
