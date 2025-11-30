/**
 * IPC Handlers for Reference Maps
 * Handles importing, listing, and deleting reference map files.
 */

import { ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { SqliteRefMapsRepository } from '../../repositories/sqlite-ref-maps-repository';
import { parseMapFile, getSupportedExtensions, isSupportedMapFile } from '../../services/map-parser-service';
import { RefMapMatcherService } from '../../services/ref-map-matcher-service';
import { RefMapDedupService, type DuplicateMatch, type DedupeResult } from '../../services/ref-map-dedup-service';
import type { Kysely } from 'kysely';
import type { Database } from '../database.types';

export function registerRefMapsHandlers(db: Kysely<Database>): void {
  const repository = new SqliteRefMapsRepository(db);
  const matcher = new RefMapMatcherService(db);
  const dedupService = new RefMapDedupService(db);

  /**
   * Select a map file (dialog only, no import)
   * Used for preview flow before actual import
   */
  ipcMain.handle('refMaps:selectFile', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Import Reference Map',
        filters: [
          { name: 'Map Files', extensions: ['kml', 'kmz', 'gpx', 'geojson', 'json', 'csv'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return result.filePaths[0];
    } catch (error) {
      console.error('Error selecting map file:', error);
      return null;
    }
  });

  /**
   * Select and import a map file
   */
  ipcMain.handle('refMaps:import', async (_event, importedBy?: string) => {
    try {
      // Show file dialog
      const result = await dialog.showOpenDialog({
        title: 'Import Reference Map',
        filters: [
          { name: 'Map Files', extensions: ['kml', 'kmz', 'gpx', 'geojson', 'json', 'csv'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      const filePath = result.filePaths[0];

      // Verify it's a supported file
      if (!isSupportedMapFile(filePath)) {
        return {
          success: false,
          error: `Unsupported file type. Supported: ${getSupportedExtensions().join(', ')}`
        };
      }

      // Parse the file
      const parseResult = await parseMapFile(filePath);

      if (!parseResult.success) {
        return {
          success: false,
          error: parseResult.error || 'Failed to parse map file'
        };
      }

      if (parseResult.points.length === 0) {
        return {
          success: false,
          error: 'No points found in map file'
        };
      }

      // Create the map record with points
      const mapName = path.basename(filePath, path.extname(filePath));
      const refMap = await repository.create({
        mapName,
        filePath,
        fileType: parseResult.fileType,
        importedBy,
        points: parseResult.points
      });

      return {
        success: true,
        map: {
          mapId: refMap.mapId,
          mapName: refMap.mapName,
          filePath: refMap.filePath,
          fileType: refMap.fileType,
          pointCount: refMap.pointCount,
          importedAt: refMap.importedAt,
          importedBy: refMap.importedBy
        },
        pointCount: parseResult.points.length
      };
    } catch (error) {
      console.error('Error importing reference map:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error importing map'
      };
    }
  });

  /**
   * Import a map file from a specific path (for drag-drop)
   */
  ipcMain.handle('refMaps:importFromPath', async (_event, filePath: string, importedBy?: string) => {
    try {
      // Verify file exists
      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: 'File not found'
        };
      }

      // Verify it's a supported file
      if (!isSupportedMapFile(filePath)) {
        return {
          success: false,
          error: `Unsupported file type. Supported: ${getSupportedExtensions().join(', ')}`
        };
      }

      // Parse the file
      const parseResult = await parseMapFile(filePath);

      if (!parseResult.success) {
        return {
          success: false,
          error: parseResult.error || 'Failed to parse map file'
        };
      }

      if (parseResult.points.length === 0) {
        return {
          success: false,
          error: 'No points found in map file'
        };
      }

      // Create the map record with points
      const mapName = path.basename(filePath, path.extname(filePath));
      const refMap = await repository.create({
        mapName,
        filePath,
        fileType: parseResult.fileType,
        importedBy,
        points: parseResult.points
      });

      return {
        success: true,
        map: {
          mapId: refMap.mapId,
          mapName: refMap.mapName,
          filePath: refMap.filePath,
          fileType: refMap.fileType,
          pointCount: refMap.pointCount,
          importedAt: refMap.importedAt,
          importedBy: refMap.importedBy
        },
        pointCount: parseResult.points.length
      };
    } catch (error) {
      console.error('Error importing reference map from path:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error importing map'
      };
    }
  });

  /**
   * Get all reference maps (metadata only, no points)
   */
  ipcMain.handle('refMaps:findAll', async () => {
    try {
      const maps = await repository.findAll();
      return maps.map(m => ({
        mapId: m.mapId,
        mapName: m.mapName,
        filePath: m.filePath,
        fileType: m.fileType,
        pointCount: m.pointCount,
        importedAt: m.importedAt,
        importedBy: m.importedBy
      }));
    } catch (error) {
      console.error('Error finding all reference maps:', error);
      return [];
    }
  });

  /**
   * Get a specific map with all its points
   */
  ipcMain.handle('refMaps:findById', async (_event, mapId: string) => {
    try {
      const map = await repository.findByIdWithPoints(mapId);
      if (!map) return null;

      return {
        mapId: map.mapId,
        mapName: map.mapName,
        filePath: map.filePath,
        fileType: map.fileType,
        pointCount: map.pointCount,
        importedAt: map.importedAt,
        importedBy: map.importedBy,
        points: map.points.map(p => ({
          pointId: p.pointId,
          mapId: p.mapId,
          name: p.name,
          description: p.description,
          lat: p.lat,
          lng: p.lng,
          state: p.state,
          category: p.category,
          rawMetadata: p.rawMetadata
        }))
      };
    } catch (error) {
      console.error('Error finding reference map by ID:', error);
      return null;
    }
  });

  /**
   * Get all points from all maps (for Atlas layer)
   * Filters out points that are already catalogued in the locs table
   */
  ipcMain.handle('refMaps:getAllPoints', async () => {
    try {
      const points = await repository.getAllPoints();

      // Find points that are already catalogued
      const cataloguedMatches = await dedupService.findCataloguedRefPoints();
      const cataloguedPointIds = new Set(cataloguedMatches.map(m => m.pointId));

      // Filter out catalogued points
      const uncataloguedPoints = points.filter(p => !cataloguedPointIds.has(p.pointId));

      return uncataloguedPoints.map(p => ({
        pointId: p.pointId,
        mapId: p.mapId,
        name: p.name,
        description: p.description,
        lat: p.lat,
        lng: p.lng,
        state: p.state,
        category: p.category,
        rawMetadata: p.rawMetadata
      }));
    } catch (error) {
      console.error('Error getting all reference map points:', error);
      return [];
    }
  });

  /**
   * Update a map's name
   */
  ipcMain.handle('refMaps:update', async (_event, mapId: string, updates: { mapName?: string }) => {
    try {
      const map = await repository.update(mapId, updates);
      if (!map) return null;

      return {
        mapId: map.mapId,
        mapName: map.mapName,
        filePath: map.filePath,
        fileType: map.fileType,
        pointCount: map.pointCount,
        importedAt: map.importedAt,
        importedBy: map.importedBy
      };
    } catch (error) {
      console.error('Error updating reference map:', error);
      return null;
    }
  });

  /**
   * Delete a reference map and all its points
   */
  ipcMain.handle('refMaps:delete', async (_event, mapId: string) => {
    try {
      await repository.delete(mapId);
      return { success: true };
    } catch (error) {
      console.error('Error deleting reference map:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error deleting map'
      };
    }
  });

  /**
   * Get statistics about reference maps
   */
  ipcMain.handle('refMaps:getStats', async () => {
    try {
      const mapCount = await repository.count();
      const pointCount = await repository.countPoints();
      const categories = await repository.getCategories();
      const states = await repository.getStates();

      return {
        mapCount,
        pointCount,
        categories,
        states
      };
    } catch (error) {
      console.error('Error getting reference map stats:', error);
      return {
        mapCount: 0,
        pointCount: 0,
        categories: [],
        states: []
      };
    }
  });

  /**
   * Get supported file extensions
   */
  ipcMain.handle('refMaps:getSupportedExtensions', () => {
    return getSupportedExtensions();
  });

  /**
   * Preview import with deduplication check
   * Returns analysis without importing - user can then choose to proceed
   */
  ipcMain.handle('refMaps:previewImport', async (_event, filePath: string) => {
    try {
      // Verify file exists
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' };
      }

      // Verify it's a supported file
      if (!isSupportedMapFile(filePath)) {
        return {
          success: false,
          error: `Unsupported file type. Supported: ${getSupportedExtensions().join(', ')}`
        };
      }

      // Parse the file
      const parseResult = await parseMapFile(filePath);

      if (!parseResult.success) {
        return { success: false, error: parseResult.error || 'Failed to parse map file' };
      }

      if (parseResult.points.length === 0) {
        return { success: false, error: 'No points found in map file' };
      }

      // Run deduplication check
      const dedupResult = await dedupService.checkForDuplicates(parseResult.points);

      // Format matches for display (limit to first 10 of each type)
      const formatMatch = (m: DuplicateMatch) => ({
        type: m.type,
        newPointName: m.newPoint.name || 'Unnamed',
        existingName: m.existingName,
        existingId: m.existingId,
        nameSimilarity: m.nameSimilarity,
        distanceMeters: m.distanceMeters,
        mapName: m.mapName,
      });

      return {
        success: true,
        fileName: path.basename(filePath),
        filePath,
        fileType: parseResult.fileType,
        totalPoints: dedupResult.totalParsed,
        newPoints: dedupResult.newPoints.length,
        cataloguedCount: dedupResult.cataloguedMatches.length,
        referenceCount: dedupResult.referenceMatches.length,
        cataloguedMatches: dedupResult.cataloguedMatches.slice(0, 10).map(formatMatch),
        referenceMatches: dedupResult.referenceMatches.slice(0, 10).map(formatMatch),
      };
    } catch (error) {
      console.error('Error previewing reference map import:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  /**
   * Import with deduplication options (after preview)
   */
  ipcMain.handle('refMaps:importWithOptions', async (
    _event,
    filePath: string,
    options: { skipDuplicates: boolean; importedBy?: string }
  ) => {
    try {
      // Verify file exists
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' };
      }

      // Parse the file
      const parseResult = await parseMapFile(filePath);

      if (!parseResult.success) {
        return { success: false, error: parseResult.error || 'Failed to parse map file' };
      }

      let pointsToImport = parseResult.points;

      // If skipping duplicates, filter them out
      if (options.skipDuplicates) {
        const dedupResult = await dedupService.checkForDuplicates(parseResult.points);
        pointsToImport = dedupResult.newPoints;
      }

      if (pointsToImport.length === 0) {
        return {
          success: true,
          skippedAll: true,
          message: 'All points were duplicates - nothing imported',
          pointCount: 0
        };
      }

      // Create the map record with filtered points
      const mapName = path.basename(filePath, path.extname(filePath));
      const refMap = await repository.create({
        mapName,
        filePath,
        fileType: parseResult.fileType,
        importedBy: options.importedBy,
        points: pointsToImport
      });

      return {
        success: true,
        map: {
          mapId: refMap.mapId,
          mapName: refMap.mapName,
          filePath: refMap.filePath,
          fileType: refMap.fileType,
          pointCount: refMap.pointCount,
          importedAt: refMap.importedAt,
          importedBy: refMap.importedBy
        },
        pointCount: pointsToImport.length,
        skippedCount: parseResult.points.length - pointsToImport.length
      };
    } catch (error) {
      console.error('Error importing reference map with options:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error importing map'
      };
    }
  });

  /**
   * Find matching reference map points for a location name
   * Phase 2: Auto-matching during location creation
   */
  ipcMain.handle('refMaps:findMatches', async (
    _event,
    query: string,
    options?: { threshold?: number; limit?: number; state?: string | null }
  ) => {
    try {
      const matches = await matcher.findMatches(query, options);
      return matches.map(m => ({
        pointId: m.pointId,
        mapId: m.mapId,
        name: m.name,
        description: m.description,
        lat: m.lat,
        lng: m.lng,
        state: m.state,
        category: m.category,
        mapName: m.mapName,
        score: m.score
      }));
    } catch (error) {
      console.error('Error finding reference map matches:', error);
      return [];
    }
  });

  /**
   * Find reference points that are already catalogued as locations.
   * Returns matches that can be purged to keep the reference layer slim.
   */
  ipcMain.handle('refMaps:findCataloguedPoints', async () => {
    try {
      const matches = await dedupService.findCataloguedRefPoints();
      return {
        success: true,
        matches: matches.map(m => ({
          pointId: m.pointId,
          pointName: m.pointName,
          mapName: m.mapName,
          matchedLocid: m.matchedLocid,
          matchedLocName: m.matchedLocName,
          nameSimilarity: m.nameSimilarity,
          distanceMeters: m.distanceMeters,
        })),
        count: matches.length,
      };
    } catch (error) {
      console.error('Error finding catalogued reference points:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        matches: [],
        count: 0,
      };
    }
  });

  /**
   * Purge (delete) reference points that match catalogued locations.
   * Keeps the reference layer lean by removing points that are now in the database.
   */
  ipcMain.handle('refMaps:purgeCataloguedPoints', async () => {
    try {
      // Find all matches first
      const matches = await dedupService.findCataloguedRefPoints();

      if (matches.length === 0) {
        return {
          success: true,
          deleted: 0,
          message: 'No catalogued reference points found to purge',
        };
      }

      // Delete them
      const pointIds = matches.map(m => m.pointId);
      const deleted = await dedupService.deleteRefPoints(pointIds);

      return {
        success: true,
        deleted,
        message: `Purged ${deleted} reference points that were already catalogued`,
      };
    } catch (error) {
      console.error('Error purging catalogued reference points:', error);
      return {
        success: false,
        deleted: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });
}
