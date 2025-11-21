import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteLocationRepository } from '../../repositories/sqlite-location-repository';
import { createTestDatabase, createTestLocation } from './helpers/test-database';
import type { Kysely } from 'kysely';
import type { Database } from '../../main/database.types';

describe('SQLiteLocationRepository Integration', () => {
  let db: Kysely<Database>;
  let repo: SQLiteLocationRepository;
  let cleanup: () => void;

  beforeEach(() => {
    const testDb = createTestDatabase();
    db = testDb.db;
    cleanup = testDb.cleanup;
    repo = new SQLiteLocationRepository(db);
  });

  afterEach(() => {
    cleanup();
  });

  describe('create', () => {
    it('should create a new location', async () => {
      const locationData = {
        locnam: 'Abandoned Factory',
        gps_lat: 45.5231,
        gps_lng: -122.6765,
        address_state: 'OR',
        type: 'industrial',
        condition: 'deteriorating',
      };

      const location = await repo.create(locationData);

      expect(location.locid).toBeDefined();
      expect(location.loc12).toBeDefined();
      expect(location.locnam).toBe(locationData.locnam);
      expect(location.gps?.lat).toBe(locationData.gps_lat);
      expect(location.gps?.lng).toBe(locationData.gps_lng);
      expect(location.address?.state).toBe(locationData.address_state);
    });

    it('should generate unique loc12 identifier', async () => {
      const location1 = await repo.create({ locnam: 'Location 1' });
      const location2 = await repo.create({ locnam: 'Location 2' });

      expect(location1.loc12).not.toBe(location2.loc12);
      expect(location1.loc12).toMatch(/^L-[A-Z0-9]{6}$/);
    });
  });

  describe('findById', () => {
    it('should find location by ID', async () => {
      const created = await repo.create({ locnam: 'Test Location' });
      const found = await repo.findById(created.locid);

      expect(found).toBeDefined();
      expect(found?.locid).toBe(created.locid);
      expect(found?.locnam).toBe('Test Location');
    });

    it('should return null for non-existent ID', async () => {
      const found = await repo.findById(crypto.randomUUID());
      expect(found).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return all locations', async () => {
      await repo.create({ locnam: 'Location 1' });
      await repo.create({ locnam: 'Location 2' });
      await repo.create({ locnam: 'Location 3' });

      const locations = await repo.findAll();
      expect(locations).toHaveLength(3);
    });

    it('should filter by state', async () => {
      await repo.create({ locnam: 'Oregon Location', address_state: 'OR' });
      await repo.create({ locnam: 'Washington Location', address_state: 'WA' });

      const locations = await repo.findAll({ state: 'OR' });
      expect(locations).toHaveLength(1);
      expect(locations[0].address?.state).toBe('OR');
    });

    it('should filter by type', async () => {
      await repo.create({ locnam: 'Factory', type: 'industrial' });
      await repo.create({ locnam: 'House', type: 'residential' });

      const locations = await repo.findAll({ type: 'industrial' });
      expect(locations).toHaveLength(1);
      expect(locations[0].type).toBe('industrial');
    });
  });

  describe('update', () => {
    it('should update location fields', async () => {
      const created = await repo.create({ locnam: 'Original Name' });

      const updated = await repo.update(created.locid, {
        locnam: 'Updated Name',
        condition: 'ruins',
      });

      expect(updated.locnam).toBe('Updated Name');
      expect(updated.condition).toBe('ruins');
    });

    it('should update GPS coordinates', async () => {
      const created = await repo.create({
        locnam: 'Test',
        gps_lat: 45.0,
        gps_lng: -122.0,
      });

      const updated = await repo.update(created.locid, {
        gps_lat: 46.0,
        gps_lng: -123.0,
      });

      expect(updated.gps?.lat).toBe(46.0);
      expect(updated.gps?.lng).toBe(-123.0);
    });
  });

  describe('delete', () => {
    it('should delete location', async () => {
      const created = await repo.create({ locnam: 'To Delete' });

      await repo.delete(created.locid);

      const found = await repo.findById(created.locid);
      expect(found).toBeNull();
    });

    it('should not throw when deleting non-existent location', async () => {
      await expect(repo.delete(crypto.randomUUID())).resolves.not.toThrow();
    });
  });

  describe('count', () => {
    it('should count all locations', async () => {
      await repo.create({ locnam: 'Location 1' });
      await repo.create({ locnam: 'Location 2' });

      const count = await repo.count();
      expect(count).toBe(2);
    });

    it('should count with filters', async () => {
      await repo.create({ locnam: 'OR 1', address_state: 'OR' });
      await repo.create({ locnam: 'OR 2', address_state: 'OR' });
      await repo.create({ locnam: 'WA 1', address_state: 'WA' });

      const count = await repo.count({ state: 'OR' });
      expect(count).toBe(2);
    });
  });

  describe('transactions', () => {
    it('should rollback on error', async () => {
      const initialCount = await repo.count();

      try {
        await db.transaction().execute(async (trx) => {
          // Create location
          const testLoc = createTestLocation();
          await trx.insertInto('locs').values(testLoc).execute();

          // Force an error
          throw new Error('Test error');
        });
      } catch (error) {
        // Expected error
      }

      const finalCount = await repo.count();
      expect(finalCount).toBe(initialCount);
    });

    it('should commit on success', async () => {
      await db.transaction().execute(async (trx) => {
        const testLoc = createTestLocation();
        await trx.insertInto('locs').values(testLoc).execute();
      });

      const count = await repo.count();
      expect(count).toBe(1);
    });
  });
});
