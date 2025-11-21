import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteMediaRepository } from '../../repositories/sqlite-media-repository';
import { SQLiteLocationRepository } from '../../repositories/sqlite-location-repository';
import { createTestDatabase, createTestImage } from './helpers/test-database';
import type { Kysely } from 'kysely';
import type { Database } from '../../main/database.types';

describe('SQLiteMediaRepository Integration', () => {
  let db: Kysely<Database>;
  let mediaRepo: SQLiteMediaRepository;
  let locationRepo: SQLiteLocationRepository;
  let cleanup: () => void;
  let testLocationId: string;

  beforeEach(async () => {
    const testDb = createTestDatabase();
    db = testDb.db;
    cleanup = testDb.cleanup;
    mediaRepo = new SQLiteMediaRepository(db);
    locationRepo = new SQLiteLocationRepository(db);

    // Create a test location for media to reference
    const location = await locationRepo.create({ locnam: 'Test Location' });
    testLocationId = location.locid;
  });

  afterEach(() => {
    cleanup();
  });

  describe('insertImage', () => {
    it('should insert an image', async () => {
      const imageData = {
        imgsha: 'a'.repeat(64),
        imgnam: 'test.jpg',
        imgnamo: 'original.jpg',
        imgloc: '/archive/images/test.jpg',
        imgloco: '/original/test.jpg',
        locid: testLocationId,
      };

      await mediaRepo.insertImage(imageData);

      const images = await mediaRepo.findImagesByLocation(testLocationId);
      expect(images).toHaveLength(1);
      expect(images[0].imgnam).toBe('test.jpg');
    });

    it('should handle duplicate hash (same file)', async () => {
      const hash = 'b'.repeat(64);
      const imageData = {
        imgsha: hash,
        imgnam: 'test.jpg',
        imgnamo: 'original.jpg',
        imgloc: '/archive/images/test.jpg',
        imgloco: '/original/test.jpg',
        locid: testLocationId,
      };

      await mediaRepo.insertImage(imageData);

      // Try to insert same hash again - should fail due to PRIMARY KEY
      await expect(mediaRepo.insertImage(imageData)).rejects.toThrow();
    });
  });

  describe('findImagesByLocation', () => {
    it('should find all images for a location', async () => {
      const image1 = createTestImage(testLocationId, { imgnam: 'image1.jpg' });
      const image2 = createTestImage(testLocationId, { imgnam: 'image2.jpg' });

      await mediaRepo.insertImage(image1);
      await mediaRepo.insertImage(image2);

      const images = await mediaRepo.findImagesByLocation(testLocationId);
      expect(images).toHaveLength(2);
    });

    it('should return empty array for location with no images', async () => {
      const images = await mediaRepo.findImagesByLocation(testLocationId);
      expect(images).toHaveLength(0);
    });
  });

  describe('findAllMediaByLocation', () => {
    it('should find all media types for a location', async () => {
      const image = createTestImage(testLocationId);
      await mediaRepo.insertImage(image);

      const media = await mediaRepo.findAllMediaByLocation(testLocationId);
      expect(media.images).toHaveLength(1);
      expect(media.videos).toHaveLength(0);
      expect(media.documents).toHaveLength(0);
    });
  });

  describe('checkDuplicate', () => {
    it('should detect duplicate image', async () => {
      const hash = 'c'.repeat(64);
      const image = createTestImage(testLocationId, { imgsha: hash });
      await mediaRepo.insertImage(image);

      const isDuplicate = await mediaRepo.checkDuplicate(hash, 'image');
      expect(isDuplicate).toBe(true);
    });

    it('should return false for non-existent image', async () => {
      const hash = 'd'.repeat(64);
      const isDuplicate = await mediaRepo.checkDuplicate(hash, 'image');
      expect(isDuplicate).toBe(false);
    });
  });

  describe('foreign key constraints', () => {
    it('should prevent inserting image with non-existent location', async () => {
      const fakeLocationId = crypto.randomUUID();
      const image = createTestImage(fakeLocationId);

      await expect(mediaRepo.insertImage(image)).rejects.toThrow();
    });

    it('should cascade delete images when location is deleted', async () => {
      const image = createTestImage(testLocationId);
      await mediaRepo.insertImage(image);

      // Delete the location
      await locationRepo.delete(testLocationId);

      // Images should be deleted too
      const images = await mediaRepo.findImagesByLocation(testLocationId);
      expect(images).toHaveLength(0);
    });
  });
});
