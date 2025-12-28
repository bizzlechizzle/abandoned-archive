/**
 * Location Service Tests
 *
 * Note: These are integration tests that require better-sqlite3.
 * They will be skipped if the native module is not available or compiled
 * for a different Node version (e.g., when compiled for Electron but
 * tests run with system Node).
 *
 * For full SQLite integration testing, see the desktop package tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LocationService } from '../src/location/location-service';
import type { LocationInput } from '../src/location/types';
import type Database from 'better-sqlite3';

// Check if better-sqlite3 is available
let DatabaseClass: typeof Database | null = null;
let skipTests = false;

try {
  // Try to require the module synchronously
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const bs3 = require('better-sqlite3');
  // Try to create a test instance to verify it works
  const testDb = new bs3(':memory:');
  testDb.close();
  DatabaseClass = bs3;
} catch {
  skipTests = true;
  console.log(
    'Skipping LocationService tests: better-sqlite3 not available for current Node version'
  );
}

// Skip all tests if better-sqlite3 isn't available
const describeIfAvailable = skipTests ? describe.skip : describe;

describeIfAvailable('LocationService', () => {
  let db: Database.Database;
  let service: LocationService;

  beforeEach(() => {
    if (!DatabaseClass) return;

    // Create in-memory database
    db = new DatabaseClass(':memory:');

    // Create schema (aligned with desktop)
    db.exec(`
      CREATE TABLE locs (
        locid TEXT PRIMARY KEY,
        loc12 TEXT UNIQUE,
        locnam TEXT NOT NULL,
        type TEXT,
        status TEXT DEFAULT 'unknown',
        category TEXT,
        tags TEXT DEFAULT '[]',
        gps_lat REAL,
        gps_lng REAL,
        gps_accuracy REAL,
        gps_source TEXT,
        gps_status TEXT,
        address_street TEXT,
        address_city TEXT,
        address_county TEXT,
        address_state TEXT,
        address_zipcode TEXT,
        description TEXT,
        notes TEXT,
        condition TEXT,
        access TEXT,
        favorite INTEGER DEFAULT 0,
        historic INTEGER DEFAULT 0,
        heroimg TEXT,
        hero_focal_x REAL,
        hero_focal_y REAL,
        imgct INTEGER DEFAULT 0,
        vidct INTEGER DEFAULT 0,
        docct INTEGER DEFAULT 0,
        discovered_at TEXT,
        visited_at TEXT,
        built_year INTEGER,
        abandoned_year INTEGER,
        demolished_year INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        created_by TEXT,
        updated_by TEXT
      )
    `);

    service = new LocationService(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  describe('create', () => {
    it('should create a location with required fields', async () => {
      const input: LocationInput = {
        name: 'Test Location',
      };

      const location = await service.create(input);

      expect(location).toBeDefined();
      expect(location.id).toHaveLength(16);
      expect(location.loc12).toHaveLength(12);
      expect(location.name).toBe('Test Location');
      expect(location.status).toBe('unknown');
      expect(location.favorite).toBe(false);
      expect(location.historic).toBe(false);
    });

    it('should create a location with GPS coordinates', async () => {
      const input: LocationInput = {
        name: 'GPS Location',
        latitude: 42.8864,
        longitude: -78.8784,
      };

      const location = await service.create(input);

      expect(location.latitude).toBe(42.8864);
      expect(location.longitude).toBe(-78.8784);
    });

    it('should create a location with all fields', async () => {
      const input: LocationInput = {
        name: 'Full Location',
        type: 'industrial',
        status: 'explored',
        tags: ['factory', 'urbex'],
        latitude: 42.8864,
        longitude: -78.8784,
        address: '123 Main St',
        city: 'Buffalo',
        state: 'NY',
        description: 'An old factory',
        builtYear: 1920,
        abandonedYear: 1990,
      };

      const location = await service.create(input);

      expect(location.name).toBe('Full Location');
      expect(location.type).toBe('industrial');
      expect(location.status).toBe('explored');
      expect(location.tags).toEqual(['factory', 'urbex']);
      expect(location.city).toBe('Buffalo');
      expect(location.state).toBe('NY');
      expect(location.builtYear).toBe(1920);
      expect(location.abandonedYear).toBe(1990);
    });
  });

  describe('findById', () => {
    it('should find a location by ID', async () => {
      const created = await service.create({ name: 'Find Me' });
      const found = await service.findById(created.id);

      expect(found).toBeDefined();
      expect(found?.name).toBe('Find Me');
    });

    it('should return null for non-existent ID', async () => {
      const found = await service.findById('nonexistent12345');

      expect(found).toBeNull();
    });
  });

  describe('findAll', () => {
    beforeEach(async () => {
      await service.create({ name: 'Location A', state: 'NY', type: 'industrial' });
      await service.create({ name: 'Location B', state: 'NY', type: 'residential' });
      await service.create({ name: 'Location C', state: 'PA', type: 'industrial' });
    });

    it('should find all locations', async () => {
      const locations = await service.findAll();

      expect(locations).toHaveLength(3);
    });

    it('should filter by state', async () => {
      const locations = await service.findAll({ state: 'NY' });

      expect(locations).toHaveLength(2);
      expect(locations.every(l => l.state === 'NY')).toBe(true);
    });

    it('should filter by type', async () => {
      const locations = await service.findAll({ type: 'industrial' });

      expect(locations).toHaveLength(2);
      expect(locations.every(l => l.type === 'industrial')).toBe(true);
    });

    it('should search by name', async () => {
      const locations = await service.findAll({ search: 'Location A' });

      expect(locations).toHaveLength(1);
      expect(locations[0].name).toBe('Location A');
    });

    it('should limit results', async () => {
      const locations = await service.findAll({ limit: 2 });

      expect(locations).toHaveLength(2);
    });
  });

  describe('update', () => {
    it('should update a location', async () => {
      const created = await service.create({ name: 'Original' });
      const updated = await service.update(created.id, { name: 'Updated' });

      expect(updated.name).toBe('Updated');
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
    });

    it('should partially update a location', async () => {
      const created = await service.create({
        name: 'Partial',
        city: 'Buffalo',
        state: 'NY',
      });

      const updated = await service.update(created.id, { city: 'Rochester' });

      expect(updated.city).toBe('Rochester');
      expect(updated.state).toBe('NY');
      expect(updated.name).toBe('Partial');
    });

    it('should throw for non-existent location', async () => {
      await expect(service.update('nonexistent12345', { name: 'X' }))
        .rejects.toThrow('not found');
    });
  });

  describe('delete', () => {
    it('should delete a location', async () => {
      const created = await service.create({ name: 'Delete Me' });
      await service.delete(created.id);

      const found = await service.findById(created.id);
      expect(found).toBeNull();
    });

    it('should throw for non-existent location', async () => {
      await expect(service.delete('nonexistent12345'))
        .rejects.toThrow('not found');
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      await service.create({ name: 'A', status: 'explored', state: 'NY', latitude: 42.0, longitude: -78.0 });
      await service.create({ name: 'B', status: 'explored', state: 'NY' });
      await service.create({ name: 'C', status: 'unknown', state: 'PA', latitude: 40.0, longitude: -75.0 });
    });

    it('should return statistics', async () => {
      const stats = await service.getStats();

      expect(stats.totalLocations).toBe(3);
      expect(stats.withGps).toBe(2);
      expect(stats.byStatus.explored).toBe(2);
      expect(stats.byStatus.unknown).toBe(1);
      expect(stats.byState.NY).toBe(2);
      expect(stats.byState.PA).toBe(1);
    });
  });

  describe('findDuplicates', () => {
    it('should find locations with identical names', async () => {
      await service.create({ name: 'Duplicate Location' });
      await service.create({ name: 'Duplicate Location' });
      await service.create({ name: 'Unique Location' });

      const duplicates = await service.findDuplicates(0.5);

      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].reasons).toContain('Identical name');
    });

    it('should find locations within proximity', async () => {
      await service.create({ name: 'Near A', latitude: 42.8864, longitude: -78.8784 });
      await service.create({ name: 'Near B', latitude: 42.8865, longitude: -78.8785 });
      await service.create({ name: 'Far Away', latitude: 40.0, longitude: -75.0 });

      const duplicates = await service.findDuplicates(0.3);

      expect(duplicates.length).toBeGreaterThan(0);
      expect(duplicates.some(d => d.reasons.some(r => r.includes('Within')))).toBe(true);
    });
  });
});
