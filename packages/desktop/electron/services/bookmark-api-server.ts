/**
 * bookmark-api-server.ts
 *
 * HTTP server that receives bookmark data from the browser extension.
 * Runs on localhost:47123 - only accepts local connections for security.
 *
 * Migration Note (OPT-109): Now uses web_sources table instead of bookmarks.
 * HTTP API endpoint names preserved for extension backward compatibility.
 *
 * Endpoints:
 * - GET  /api/status          - Health check
 * - POST /api/bookmark        - Save a web source (with optional subid)
 * - POST /api/location        - Create a new location
 * - GET  /api/locations       - Search locations
 * - GET  /api/search          - Unified search for locations AND sub-locations
 * - GET  /api/recent          - Recent web sources
 * - GET  /api/recent-locations - Recently used locations
 */
import http from 'http';
import { URL } from 'url';
import { getLogger } from './logger-service';
import {
  notifyWebSourceSaved,
  notifyLocationsUpdated,
} from './websocket-server';
import { detectSourceType } from './source-type-detector';
import type { SQLiteWebSourcesRepository, WebSource } from '../repositories/sqlite-websources-repository';
import type { SQLiteLocationRepository } from '../repositories/sqlite-location-repository';
import type { SQLiteSubLocationRepository } from '../repositories/sqlite-sublocation-repository';

const PORT = 47123;
const logger = getLogger();

let webSourcesRepository: SQLiteWebSourcesRepository | null = null;
let locationsRepository: SQLiteLocationRepository | null = null;
let subLocationsRepository: SQLiteSubLocationRepository | null = null;
let server: http.Server | null = null;

/**
 * Parse JSON body from incoming request
 */
function parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Send JSON response with CORS headers
 */
function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

/**
 * Map WebSource to legacy bookmark response format for extension compatibility
 */
function mapToBookmarkResponse(source: WebSource): {
  bookmark_id: string;
  url: string;
  title: string | null;
  locid: string | null;
  subid: string | null;
  bookmark_date: string;
  source_type: string;
} {
  return {
    bookmark_id: source.source_id,
    url: source.url,
    title: source.title,
    locid: source.locid,
    subid: source.subid,
    bookmark_date: source.created_at,
    source_type: source.source_type,
  };
}

/**
 * Handle incoming HTTP requests
 */
async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method || 'GET';

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    sendJson(res, 200, {});
    return;
  }

  logger.info('BookmarkAPI', `${method} ${path}`);

  try {
    // GET /api/status - Check if app is running
    if (method === 'GET' && path === '/api/status') {
      sendJson(res, 200, { running: true, version: '2.0.0' });
      return;
    }

    // POST /api/bookmark - Save a web source (endpoint name kept for extension compat)
    if (method === 'POST' && path === '/api/bookmark') {
      if (!webSourcesRepository) {
        sendJson(res, 500, { error: 'Web sources repository not initialized' });
        return;
      }

      const body = await parseBody(req);

      if (!body.url || typeof body.url !== 'string') {
        sendJson(res, 400, { error: 'URL is required' });
        return;
      }

      // Check for duplicate before creating
      const existingSource = await webSourcesRepository.findByUrl(body.url);
      if (existingSource) {
        // Return existing source info with duplicate flag for premium UX
        sendJson(res, 200, {
          success: true,
          duplicate: true,
          bookmark_id: existingSource.source_id,
          source_type: existingSource.source_type,
          message: `Already saved${existingSource.locnam ? ` to ${existingSource.locnam}` : ''}`,
        });
        return;
      }

      // Auto-detect source type from URL
      const detectedType = detectSourceType(body.url);

      try {
        const source = await webSourcesRepository.create({
          url: body.url,
          title: typeof body.title === 'string' ? body.title : null,
          locid: typeof body.locid === 'string' ? body.locid : null,
          subid: typeof body.subid === 'string' ? body.subid : null,
          source_type: detectedType,
          auth_imp: null,
        });

        // Notify WebSocket clients about the new web source
        notifyWebSourceSaved(source.source_id, source.locid, source.subid, source.source_type);

        // Return with backward-compatible field names for extension
        sendJson(res, 201, {
          success: true,
          bookmark_id: source.source_id,
          source_type: source.source_type,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('BookmarkAPI', `Create web source error: ${message}`);
        sendJson(res, 500, { error: message });
      }
      return;
    }

    // POST /api/location - Create a new location from the extension
    if (method === 'POST' && path === '/api/location') {
      if (!locationsRepository) {
        sendJson(res, 500, { error: 'Locations repository not initialized' });
        return;
      }

      const body = await parseBody(req);

      if (!body.name || typeof body.name !== 'string') {
        sendJson(res, 400, { error: 'Location name is required' });
        return;
      }

      try {
        const location = await locationsRepository.create({
          locnam: body.name.trim(),
          address: {
            state:
              typeof body.state === 'string'
                ? body.state.toUpperCase().substring(0, 2)
                : undefined,
            verified: false,
          },
          category: typeof body.type === 'string' ? body.type : undefined,
          // Required boolean defaults
          historic: false,
          favorite: false,
          project: false,
          docInterior: false,
          docExterior: false,
          docDrone: false,
          docWebHistory: false,
          docMapFind: false,
          locnamVerified: false,
          akanamVerified: false,
          isHostOnly: false,
        });

        // Notify WebSocket clients about the new location
        notifyLocationsUpdated();

        sendJson(res, 201, {
          success: true,
          locid: location.locid,
          locnam: location.locnam,
        });
      } catch (error) {
        logger.error('BookmarkAPI', `Create location error: ${error}`);
        sendJson(res, 500, { error: 'Failed to create location' });
      }
      return;
    }

    // GET /api/locations?search=query - Search locations for autocomplete
    if (method === 'GET' && path === '/api/locations') {
      if (!locationsRepository) {
        sendJson(res, 500, { error: 'Locations repository not initialized' });
        return;
      }

      const search = url.searchParams.get('search') || '';
      const locations = await locationsRepository.findAll({ search, limit: 10 });

      sendJson(res, 200, {
        locations: locations.map((loc) => ({
          locid: loc.locid,
          locnam: loc.locnam,
          address_state: loc.address?.state || null,
        })),
      });
      return;
    }

    // GET /api/search?q=query - Unified search for locations AND sub-locations
    if (method === 'GET' && path === '/api/search') {
      if (!locationsRepository || !subLocationsRepository) {
        sendJson(res, 500, { error: 'Repositories not initialized' });
        return;
      }

      const query = (url.searchParams.get('q') || '').toLowerCase().trim();
      const limit = parseInt(url.searchParams.get('limit') || '15', 10);

      if (!query) {
        sendJson(res, 200, { results: [] });
        return;
      }

      // Search locations
      const locations = await locationsRepository.findAll({ search: query, limit: 10 });
      const locationResults = locations.map((loc) => ({
        type: 'location' as const,
        locid: loc.locid,
        subid: null,
        name: loc.locnam,
        parentName: null,
        address_state: loc.address?.state || null,
      }));

      // Search sub-locations: We need to search across all sub-locations
      // Since there's no search method, we'll get all locations and filter their sub-locations
      const allLocations = await locationsRepository.findAll({ limit: 100 });
      const subLocationResults: Array<{
        type: 'sublocation';
        locid: string;
        subid: string;
        name: string;
        parentName: string;
        address_state: string | null;
      }> = [];

      for (const loc of allLocations) {
        const sublocs = await subLocationsRepository.findByLocationId(loc.locid);
        for (const subloc of sublocs) {
          const matchesName = subloc.subnam.toLowerCase().includes(query);
          const matchesAka = subloc.akanam?.toLowerCase().includes(query);

          if (matchesName || matchesAka) {
            subLocationResults.push({
              type: 'sublocation',
              locid: loc.locid,
              subid: subloc.subid,
              name: subloc.subnam,
              parentName: loc.locnam,
              address_state: loc.address?.state || null,
            });
          }
        }
        // Stop if we have enough sub-location results
        if (subLocationResults.length >= 10) break;
      }

      // Combine and limit results (locations first, then sub-locations)
      const allResults = [...locationResults, ...subLocationResults].slice(0, limit);

      sendJson(res, 200, { results: allResults });
      return;
    }

    // GET /api/recent?limit=5 - Get recent web sources (endpoint name kept for compat)
    if (method === 'GET' && path === '/api/recent') {
      if (!webSourcesRepository) {
        sendJson(res, 500, { error: 'Web sources repository not initialized' });
        return;
      }

      const limit = parseInt(url.searchParams.get('limit') || '5', 10);
      const sources = await webSourcesRepository.findRecent(limit);

      // Map to legacy format for extension compatibility
      sendJson(res, 200, { bookmarks: sources.map(mapToBookmarkResponse) });
      return;
    }

    // GET /api/recent-locations?limit=5 - Get recently used/created locations
    if (method === 'GET' && path === '/api/recent-locations') {
      if (!webSourcesRepository || !locationsRepository) {
        sendJson(res, 500, { error: 'Repositories not initialized' });
        return;
      }

      const limit = parseInt(url.searchParams.get('limit') || '5', 10);
      const seenLocids = new Set<string>();
      const recentLocations: Array<{ locid: string; locnam: string; address_state: string | null }> = [];

      // First: Get locations from recent web sources (most recently used)
      const recentSources = await webSourcesRepository.findRecent(50);
      for (const source of recentSources) {
        if (source.locid && !seenLocids.has(source.locid)) {
          seenLocids.add(source.locid);
          try {
            const location = await locationsRepository.findById(source.locid);
            if (location) {
              recentLocations.push({
                locid: location.locid,
                locnam: location.locnam,
                address_state: location.address?.state || null,
              });
            }
          } catch {
            // Location may have been deleted, skip
          }
          if (recentLocations.length >= limit) break;
        }
      }

      // Second: Fill remaining slots with recently created locations
      if (recentLocations.length < limit) {
        const allLocations = await locationsRepository.findAll();
        // findAll returns ordered by locadd desc (most recent first)
        for (const location of allLocations) {
          if (!seenLocids.has(location.locid)) {
            seenLocids.add(location.locid);
            recentLocations.push({
              locid: location.locid,
              locnam: location.locnam,
              address_state: location.address?.state || null,
            });
            if (recentLocations.length >= limit) break;
          }
        }
      }

      sendJson(res, 200, { locations: recentLocations });
      return;
    }

    // 404 for unknown routes
    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    logger.error('BookmarkAPI', `Error: ${error}`);
    sendJson(res, 500, { error: 'Internal server error' });
  }
}

/**
 * Start the HTTP server
 *
 * @param webSourcesRepo - Web sources repository (OPT-109 replacement for bookmarks)
 * @param locationsRepo - Locations repository
 * @param subLocationsRepo - Sub-locations repository
 */
export function startBookmarkAPIServer(
  webSourcesRepo: SQLiteWebSourcesRepository,
  locationsRepo: SQLiteLocationRepository,
  subLocationsRepo: SQLiteSubLocationRepository
): Promise<void> {
  return new Promise((resolve, reject) => {
    webSourcesRepository = webSourcesRepo;
    locationsRepository = locationsRepo;
    subLocationsRepository = subLocationsRepo;

    server = http.createServer((req, res) => {
      handleRequest(req, res).catch((error) => {
        logger.error('BookmarkAPI', `Unhandled error: ${error}`);
        sendJson(res, 500, { error: 'Internal server error' });
      });
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        logger.error('BookmarkAPI', `Port ${PORT} is already in use`);
        reject(new Error(`Port ${PORT} is already in use`));
      } else {
        reject(err);
      }
    });

    server.listen(PORT, '127.0.0.1', () => {
      logger.info('BookmarkAPI', `Server running on http://localhost:${PORT}`);
      resolve();
    });
  });
}

/**
 * Stop the HTTP server
 */
export function stopBookmarkAPIServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        logger.info('BookmarkAPI', 'Server stopped');
        server = null;
        webSourcesRepository = null;
        locationsRepository = null;
        subLocationsRepository = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

/**
 * Check if server is running
 */
export function isBookmarkAPIServerRunning(): boolean {
  return server !== null && server.listening;
}
