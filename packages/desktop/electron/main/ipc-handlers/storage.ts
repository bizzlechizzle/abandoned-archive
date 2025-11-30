/**
 * Storage IPC Handlers
 * Handles storage:* IPC channels for disk space monitoring
 */
import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { getDatabase } from '../database';

/**
 * Get total size of a directory recursively
 */
async function getDirectorySize(dirPath: string): Promise<number> {
  let totalSize = 0;

  try {
    const files = await fs.promises.readdir(dirPath, { withFileTypes: true });

    for (const file of files) {
      const filePath = path.join(dirPath, file.name);

      if (file.isDirectory()) {
        totalSize += await getDirectorySize(filePath);
      } else if (file.isFile()) {
        try {
          const stats = await fs.promises.stat(filePath);
          totalSize += stats.size;
        } catch {
          // Skip files we can't access
        }
      }
    }
  } catch {
    // Directory doesn't exist or can't be accessed
  }

  return totalSize;
}

/**
 * Get disk space info for a path using Node.js fs.statfs (Node 18.15+)
 */
async function getDiskSpace(targetPath: string): Promise<{ total: number; free: number }> {
  try {
    // fs.statfs available in Node.js 18.15+
    const stats = await fs.promises.statfs(targetPath);
    return {
      total: stats.blocks * stats.bsize,
      free: stats.bfree * stats.bsize,
    };
  } catch (error) {
    console.error('Error getting disk space:', error);
    // Fallback: return zeros if statfs fails
    return { total: 0, free: 0 };
  }
}

export function registerStorageHandlers() {
  ipcMain.handle('storage:getStats', async () => {
    try {
      const db = getDatabase();

      // Get archive path from settings
      const archivePathRow = db.prepare(
        "SELECT value FROM settings WHERE key = 'archive_path'"
      ).get() as { value: string } | undefined;

      const archivePath = archivePathRow?.value;

      if (!archivePath) {
        return null; // No archive path configured
      }

      // Check if archive path exists
      try {
        await fs.promises.access(archivePath);
      } catch {
        return null; // Archive path doesn't exist
      }

      // Get disk space for the archive drive
      const diskSpace = await getDiskSpace(archivePath);

      // Get size of archive folder
      const archiveBytes = await getDirectorySize(archivePath);

      // Determine the drive/mount point
      const drivePath = process.platform === 'win32'
        ? path.parse(archivePath).root
        : '/';

      return {
        totalBytes: diskSpace.total,
        availableBytes: diskSpace.free,
        archiveBytes,
        drivePath,
      };
    } catch (error) {
      console.error('Error getting storage stats:', error);
      throw error;
    }
  });
}
