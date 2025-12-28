/**
 * Dispatch Hub IPC Handlers
 *
 * Handles authentication, connection status, job management,
 * and file uploads to the dispatch hub.
 */

import { ipcMain } from 'electron';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { getDispatchClient, destroyDispatchClient, type JobSubmission } from '@aa/services';

const Blake3IdSchema = z.string().length(16).regex(/^[a-f0-9]+$/);

export function registerApiDispatchHandlers() {
  // Authentication handlers

  ipcMain.handle('dispatch:login', async (_event, username: string, password: string) => {
    try {
      const validatedUsername = z.string().min(1).parse(username);
      const validatedPassword = z.string().min(1).parse(password);
      const client = getDispatchClient();
      return await client.login(validatedUsername, validatedPassword);
    } catch (error) {
      console.error('Error logging in:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('dispatch:logout', async () => {
    try {
      const client = getDispatchClient();
      await client.logout();
      return true;
    } catch (error) {
      console.error('Error logging out:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('dispatch:isAuthenticated', () => {
    const client = getDispatchClient();
    return client.isAuthenticated();
  });

  // Connection status handlers

  ipcMain.handle('dispatch:status', () => {
    const client = getDispatchClient();
    return client.getStatus();
  });

  ipcMain.handle('dispatch:isConnected', () => {
    const client = getDispatchClient();
    return client.isConnected();
  });

  ipcMain.handle('dispatch:checkConnection', async () => {
    try {
      const client = getDispatchClient();
      return await client.checkConnection();
    } catch (error) {
      console.error('Error checking connection:', error);
      return false;
    }
  });

  ipcMain.handle('dispatch:initialize', async () => {
    try {
      const client = getDispatchClient();
      await client.initialize();
      return true;
    } catch (error) {
      console.error('Error initializing dispatch client:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  // Job management handlers

  ipcMain.handle('dispatch:submitJob', async (_event, job: JobSubmission) => {
    try {
      const client = getDispatchClient();
      return await client.submitJob(job);
    } catch (error) {
      console.error('Error submitting job:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('dispatch:getJob', async (_event, jobId: string) => {
    try {
      const validatedId = z.string().uuid().parse(jobId);
      const client = getDispatchClient();
      return await client.getJob(validatedId);
    } catch (error) {
      console.error('Error getting job:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('dispatch:cancelJob', async (_event, jobId: string) => {
    try {
      const validatedId = z.string().uuid().parse(jobId);
      const client = getDispatchClient();
      await client.cancelJob(validatedId);
      return true;
    } catch (error) {
      console.error('Error cancelling job:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('dispatch:listJobs', async (_event, filter?: { status?: string; limit?: number }) => {
    try {
      const client = getDispatchClient();
      return await client.listJobs(filter);
    } catch (error) {
      console.error('Error listing jobs:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  // Worker handlers

  ipcMain.handle('dispatch:listWorkers', async () => {
    try {
      const client = getDispatchClient();
      return await client.listWorkers();
    } catch (error) {
      console.error('Error listing workers:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  // File upload handlers

  ipcMain.handle('dispatch:uploadFile', async (
    _event,
    locationId: string,
    filePath: string,
    sublocationId?: string
  ) => {
    try {
      const validatedLocationId = Blake3IdSchema.parse(locationId);
      const validatedFilePath = z.string().min(1).parse(filePath);
      const validatedSublocationId = sublocationId ? z.string().uuid().parse(sublocationId) : undefined;

      // Read file from disk
      const data = await fs.readFile(validatedFilePath);
      const filename = path.basename(validatedFilePath);

      // Determine MIME type from extension
      const ext = path.extname(filename).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.heic': 'image/heic',
        '.heif': 'image/heif',
        '.mp4': 'video/mp4',
        '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo',
        '.mkv': 'video/x-matroska',
        '.webm': 'video/webm',
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.kml': 'application/vnd.google-earth.kml+xml',
        '.gpx': 'application/gpx+xml',
        '.geojson': 'application/geo+json',
        '.tiff': 'image/tiff',
        '.tif': 'image/tiff',
      };
      const mimeType = mimeTypes[ext] || 'application/octet-stream';

      const client = getDispatchClient();
      return await client.uploadFile(
        validatedLocationId,
        { name: filename, data, mimeType },
        validatedSublocationId
      );
    } catch (error) {
      console.error('Error uploading file:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });

  ipcMain.handle('dispatch:uploadFiles', async (
    _event,
    locationId: string,
    filePaths: string[],
    sublocationId?: string
  ) => {
    try {
      const validatedLocationId = Blake3IdSchema.parse(locationId);
      const validatedFilePaths = z.array(z.string().min(1)).parse(filePaths);
      const validatedSublocationId = sublocationId ? z.string().uuid().parse(sublocationId) : undefined;

      const results: Array<{ path: string; jobId?: string; error?: string }> = [];
      const client = getDispatchClient();

      for (const filePath of validatedFilePaths) {
        try {
          const data = await fs.readFile(filePath);
          const filename = path.basename(filePath);
          const ext = path.extname(filename).toLowerCase();

          const mimeTypes: Record<string, string> = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.heic': 'image/heic',
            '.heif': 'image/heif',
            '.mp4': 'video/mp4',
            '.mov': 'video/quicktime',
            '.avi': 'video/x-msvideo',
            '.mkv': 'video/x-matroska',
            '.webm': 'video/webm',
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.kml': 'application/vnd.google-earth.kml+xml',
            '.gpx': 'application/gpx+xml',
            '.geojson': 'application/geo+json',
            '.tiff': 'image/tiff',
            '.tif': 'image/tiff',
          };
          const mimeType = mimeTypes[ext] || 'application/octet-stream';

          const result = await client.uploadFile(
            validatedLocationId,
            { name: filename, data, mimeType },
            validatedSublocationId
          );
          results.push({ path: filePath, jobId: result.jobId });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          results.push({ path: filePath, error: message });
        }
      }

      return results;
    } catch (error) {
      console.error('Error uploading files:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });
}

export function shutdownApiDispatchHandlers() {
  destroyDispatchClient();
}
