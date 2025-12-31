/**
 * API Repository Factory Tests
 *
 * Tests the repository factory initialization and all 14 API repositories.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create mock dispatch client with all required methods
const mockDispatchClient = {
  isConnected: vi.fn(() => true),
  isAuthenticated: vi.fn(() => true),
  checkConnection: vi.fn(() => Promise.resolve(true)),

  // Location methods
  getLocations: vi.fn(() =>
    Promise.resolve({
      data: [{ id: 'loc-1', name: 'Test Location' }],
      pagination: { total: 1, page: 1, limit: 20, pages: 1 },
    })
  ),
  getLocation: vi.fn(() => Promise.resolve({ id: 'loc-1', name: 'Test Location' })),
  createLocation: vi.fn(() => Promise.resolve({ id: 'loc-1', name: 'New Location' })),
  updateLocation: vi.fn(() => Promise.resolve({ id: 'loc-1', name: 'Updated' })),
  deleteLocation: vi.fn(() => Promise.resolve()),
  recordLocationView: vi.fn(() => Promise.resolve()),
  getLocationBounds: vi.fn(() =>
    Promise.resolve({ minLat: 0, maxLat: 1, minLon: 0, maxLon: 1, count: 1 })
  ),
  getNearbyLocations: vi.fn(() => Promise.resolve([])),
  getLocationFilterOptions: vi.fn(() =>
    Promise.resolve({ states: [], cities: [], categories: [], classes: [] })
  ),

  // Sublocation methods
  getSublocations: vi.fn(() =>
    Promise.resolve([{ id: 'sub-1', name: 'Floor 1', locationId: 'loc-1' }])
  ),
  createSublocation: vi.fn(() => Promise.resolve({ id: 'sub-1', name: 'Floor 1' })),
  deleteSublocation: vi.fn(() => Promise.resolve()),

  // Media methods
  getMedia: vi.fn(() =>
    Promise.resolve({
      data: [],
      pagination: { total: 0, page: 1, limit: 20, pages: 0 },
    })
  ),
  getMediaById: vi.fn(() => Promise.resolve({ id: 'media-1', hash: 'abc123' })),
  getMediaByHash: vi.fn(() => Promise.resolve(null)),
  createMedia: vi.fn(() => Promise.resolve({ id: 'media-1', hash: 'abc123' })),
  updateMedia: vi.fn(() => Promise.resolve({ id: 'media-1', hash: 'abc123' })),
  deleteMedia: vi.fn(() => Promise.resolve()),
  setMediaThumbnails: vi.fn(() => Promise.resolve()),
  hideMedia: vi.fn(() => Promise.resolve({ id: 'media-1', hidden: true })),
  unhideMedia: vi.fn(() => Promise.resolve({ id: 'media-1', hidden: false })),
  getMediaTags: vi.fn(() => Promise.resolve([])),
  addMediaTag: vi.fn(() => Promise.resolve({ id: 'tag-1', name: 'test' })),
  removeMediaTag: vi.fn(() => Promise.resolve()),

  // Map methods
  parseMapFile: vi.fn(() => Promise.resolve({ points: [] })),
  deduplicatePoints: vi.fn(() => Promise.resolve({ unique: [], duplicates: [] })),
  matchPointsToLocations: vi.fn(() => Promise.resolve({ matched: [], unmatched: [] })),
  exportPoints: vi.fn(() => Promise.resolve({ data: '' })),
  getReferenceMaps: vi.fn(() => Promise.resolve([])),
  createReferenceMap: vi.fn(() => Promise.resolve({ id: 'map-1' })),
  deleteReferenceMap: vi.fn(() => Promise.resolve()),
  getReferenceMapPoints: vi.fn(() => Promise.resolve([])),
  addReferenceMapPoints: vi.fn(() => Promise.resolve({ count: 0 })),
  matchReferenceMapPoint: vi.fn(() => Promise.resolve()),

  // Notes methods
  getLocationNotes: vi.fn(() => Promise.resolve([])),
  createLocationNote: vi.fn(() =>
    Promise.resolve({ id: 'note-1', noteText: 'Test', noteType: 'general', createdAt: new Date().toISOString() })
  ),
  deleteLocationNote: vi.fn(() => Promise.resolve()),

  // Job methods
  submitJob: vi.fn(() => Promise.resolve('job-1')),
  getJob: vi.fn(() => Promise.resolve({ id: 'job-1', status: 'completed' })),
  listJobs: vi.fn(() => Promise.resolve([])),
  cancelJob: vi.fn(() => Promise.resolve()),

  // Worker methods
  listWorkers: vi.fn(() => Promise.resolve([])),

  // File upload
  uploadFile: vi.fn(() => Promise.resolve({ hash: 'abc123', path: '/uploads/file' })),
};

// Mock the dispatch client module
vi.mock('@aa/services', () => ({
  getDispatchClient: vi.fn(() => mockDispatchClient),
}));

describe('API Repository Factory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('getRepositoryFactory', () => {
    it('should create a factory with all 14 repositories', async () => {
      const { getRepositoryFactory } = await import('../api-repository-factory');
      const factory = getRepositoryFactory();

      // Core repositories
      expect(factory.locations).toBeDefined();
      expect(factory.sublocations).toBeDefined();
      expect(factory.media).toBeDefined();
      expect(factory.maps).toBeDefined();

      // Content repositories
      expect(factory.notes).toBeDefined();
      expect(factory.users).toBeDefined();
      expect(factory.imports).toBeDefined();
      expect(factory.projects).toBeDefined();

      // Archive repositories
      expect(factory.timeline).toBeDefined();
      expect(factory.websources).toBeDefined();

      // Metadata repositories
      expect(factory.locationViews).toBeDefined();
      expect(factory.locationAuthors).toBeDefined();
      expect(factory.locationExclusions).toBeDefined();
      expect(factory.dateExtraction).toBeDefined();

      // Client
      expect(factory.client).toBeDefined();
    });

    it('should return the same factory instance on multiple calls', async () => {
      const { getRepositoryFactory } = await import('../api-repository-factory');

      const factory1 = getRepositoryFactory();
      const factory2 = getRepositoryFactory();

      expect(factory1).toBe(factory2);
    });
  });

  describe('isHubReady', () => {
    it('should return true when connected and authenticated', async () => {
      const { isHubReady, getRepositoryFactory } = await import('../api-repository-factory');
      getRepositoryFactory();

      const ready = await isHubReady();
      expect(ready).toBe(true);
    });

    it('should return false when not connected', async () => {
      mockDispatchClient.isConnected.mockReturnValueOnce(false);

      const { isHubReady, getRepositoryFactory } = await import('../api-repository-factory');
      getRepositoryFactory();

      const ready = await isHubReady();
      expect(ready).toBe(false);
    });

    it('should return false when not authenticated', async () => {
      mockDispatchClient.isAuthenticated.mockReturnValueOnce(false);

      const { isHubReady, getRepositoryFactory } = await import('../api-repository-factory');
      getRepositoryFactory();

      const ready = await isHubReady();
      expect(ready).toBe(false);
    });
  });

  describe('waitForHubConnection', () => {
    it('should succeed if connection succeeds on first try', async () => {
      const { waitForHubConnection, getRepositoryFactory } = await import('../api-repository-factory');
      getRepositoryFactory();

      const connected = await waitForHubConnection(3, 100);
      expect(connected).toBe(true);
      expect(mockDispatchClient.checkConnection).toHaveBeenCalledTimes(1);
    });

    it('should retry on connection failure', async () => {
      mockDispatchClient.checkConnection
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const { waitForHubConnection, getRepositoryFactory } = await import('../api-repository-factory');
      getRepositoryFactory();

      const connected = await waitForHubConnection(5, 10);
      expect(connected).toBe(true);
      expect(mockDispatchClient.checkConnection).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      mockDispatchClient.checkConnection.mockResolvedValue(false);

      const { waitForHubConnection, getRepositoryFactory } = await import('../api-repository-factory');
      getRepositoryFactory();

      const connected = await waitForHubConnection(3, 10);
      expect(connected).toBe(false);
      expect(mockDispatchClient.checkConnection).toHaveBeenCalledTimes(3);
    });
  });

  describe('destroyRepositoryFactory', () => {
    it('should clear the factory instance', async () => {
      const { getRepositoryFactory, destroyRepositoryFactory } = await import('../api-repository-factory');

      const factory1 = getRepositoryFactory();
      destroyRepositoryFactory();
      const factory2 = getRepositoryFactory();

      // After destroy, a new factory should be created
      expect(factory1).not.toBe(factory2);
    });
  });
});

describe('Individual Repository Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ApiLocationRepository', () => {
    it('should fetch locations with pagination', async () => {
      const { getRepositoryFactory } = await import('../api-repository-factory');
      const factory = getRepositoryFactory();

      const locations = await factory.locations.findAll();
      expect(locations).toHaveLength(1);
      expect(locations[0].locid).toBe('loc-1');
      expect(mockDispatchClient.getLocations).toHaveBeenCalled();
    });

    it('should create a location', async () => {
      const { getRepositoryFactory } = await import('../api-repository-factory');
      const factory = getRepositoryFactory();

      // Create with minimum required fields from LocationInput
      const location = await factory.locations.create({
        locnam: 'New Location',
        category: 'industrial',
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
      } as any);
      expect(location).toBeDefined();
      expect(mockDispatchClient.createLocation).toHaveBeenCalled();
    });

    it('should record a view', async () => {
      const { getRepositoryFactory } = await import('../api-repository-factory');
      const factory = getRepositoryFactory();

      await factory.locations.recordView('loc-1');
      expect(mockDispatchClient.recordLocationView).toHaveBeenCalledWith('loc-1');
    });
  });

  describe('ApiSublocationRepository', () => {
    it('should fetch sublocations by location', async () => {
      const { getRepositoryFactory } = await import('../api-repository-factory');
      const factory = getRepositoryFactory();

      const subs = await factory.sublocations.findByLocationId('loc-1');
      expect(subs).toHaveLength(1);
      expect(mockDispatchClient.getSublocations).toHaveBeenCalledWith('loc-1');
    });

    it('should create a sublocation', async () => {
      const { getRepositoryFactory } = await import('../api-repository-factory');
      const factory = getRepositoryFactory();

      const sub = await factory.sublocations.create({
        locid: 'loc-1',
        subnam: 'Floor 1',
      });
      expect(sub).toBeDefined();
      expect(mockDispatchClient.createSublocation).toHaveBeenCalled();
    });
  });

  describe('ApiNotesRepository', () => {
    it('should create a note', async () => {
      const { getRepositoryFactory } = await import('../api-repository-factory');
      const factory = getRepositoryFactory();

      const note = await factory.notes.create({
        locid: 'loc-1',
        note_text: 'Test note',
      });
      expect(note).toBeDefined();
      expect(note.note_id).toBe('note-1');
      expect(mockDispatchClient.createLocationNote).toHaveBeenCalled();
    });

    it('should fetch notes by location', async () => {
      mockDispatchClient.getLocationNotes.mockResolvedValueOnce([
        { id: 'note-1', noteText: 'Test', noteType: 'general', createdAt: new Date().toISOString() },
      ] as any);

      const { getRepositoryFactory } = await import('../api-repository-factory');
      const factory = getRepositoryFactory();

      const notes = await factory.notes.findByLocation('loc-1');
      expect(notes).toHaveLength(1);
      expect(mockDispatchClient.getLocationNotes).toHaveBeenCalledWith('loc-1');
    });
  });

  describe('ApiLocationViewsRepository', () => {
    it('should record a view', async () => {
      const { getRepositoryFactory } = await import('../api-repository-factory');
      const factory = getRepositoryFactory();

      await factory.locationViews.recordView('loc-1');
      expect(mockDispatchClient.recordLocationView).toHaveBeenCalledWith('loc-1');
    });

    it('should get view count from location', async () => {
      mockDispatchClient.getLocation.mockResolvedValueOnce({
        id: 'loc-1',
        name: 'Test',
        viewCount: 42,
      } as any);

      const { getRepositoryFactory } = await import('../api-repository-factory');
      const factory = getRepositoryFactory();

      const count = await factory.locationViews.getViewCount('loc-1');
      expect(count).toBe(42);
    });
  });

  describe('ApiImportRepository', () => {
    it('should submit import job', async () => {
      const { getRepositoryFactory } = await import('../api-repository-factory');
      const factory = getRepositoryFactory();

      const importRecord = await factory.imports.create({
        locid: 'loc-1',
        source_path: '/path/to/files',
      });
      expect(importRecord).toBeDefined();
      expect(importRecord.import_id).toBe('job-1');
      expect(mockDispatchClient.submitJob).toHaveBeenCalled();
    });
  });

  describe('ApiMediaRepository', () => {
    it('should fetch images by location', async () => {
      const { getRepositoryFactory } = await import('../api-repository-factory');
      const factory = getRepositoryFactory();

      const images = await factory.media.getImagesByLocation('loc-1');
      expect(images).toBeDefined();
      expect(mockDispatchClient.getMedia).toHaveBeenCalled();
    });
  });

  describe('ApiMapRepository', () => {
    it('should get reference maps', async () => {
      const { getRepositoryFactory } = await import('../api-repository-factory');
      const factory = getRepositoryFactory();

      const maps = await factory.maps.getReferenceMaps();
      expect(maps).toBeDefined();
      expect(mockDispatchClient.getReferenceMaps).toHaveBeenCalled();
    });
  });
});

describe('Repository Method Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('all 14 repositories should be instantiated', async () => {
    const { getRepositoryFactory } = await import('../api-repository-factory');
    const factory = getRepositoryFactory();

    const repos = [
      factory.locations,
      factory.sublocations,
      factory.media,
      factory.maps,
      factory.notes,
      factory.users,
      factory.imports,
      factory.projects,
      factory.timeline,
      factory.websources,
      factory.locationViews,
      factory.locationAuthors,
      factory.locationExclusions,
      factory.dateExtraction,
    ];

    expect(repos.length).toBe(14);
    repos.forEach((repo, index) => {
      expect(repo).toBeDefined();
      expect(repo.constructor).toBeDefined();
    });
  });

  it('repositories should have expected method signatures', async () => {
    const { getRepositoryFactory } = await import('../api-repository-factory');
    const factory = getRepositoryFactory();

    // Location repository core methods
    expect(typeof factory.locations.create).toBe('function');
    expect(typeof factory.locations.findById).toBe('function');
    expect(typeof factory.locations.findAll).toBe('function');
    expect(typeof factory.locations.update).toBe('function');
    expect(typeof factory.locations.delete).toBe('function');

    // Notes repository core methods
    expect(typeof factory.notes.create).toBe('function');
    expect(typeof factory.notes.findByLocation).toBe('function');
    expect(typeof factory.notes.delete).toBe('function');

    // Import repository core methods
    expect(typeof factory.imports.create).toBe('function');
    expect(typeof factory.imports.findById).toBe('function');

    // Timeline repository core methods
    expect(typeof factory.timeline.getEntries).toBe('function');
    expect(typeof factory.timeline.getYearsWithMedia).toBe('function');

    // Websources repository core methods
    expect(typeof factory.websources.create).toBe('function');
    expect(typeof factory.websources.findByLocation).toBe('function');
  });
});
