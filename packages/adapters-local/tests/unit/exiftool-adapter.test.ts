/**
 * ExifToolAdapter Unit Tests
 *
 * Note: These tests primarily test the adapter logic without requiring
 * actual ExifTool installation. Integration tests would require real files.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExifToolAdapter } from '../../src/adapters/exiftool-adapter.js';

describe('ExifToolAdapter', () => {
  let adapter: ExifToolAdapter;

  beforeEach(() => {
    adapter = new ExifToolAdapter();
  });

  afterEach(async () => {
    if (adapter.isReady()) {
      await adapter.shutdown();
    }
  });

  describe('lifecycle', () => {
    it('should not be ready before initialization', () => {
      expect(adapter.isReady()).toBe(false);
    });

    it('should be ready after initialization', async () => {
      await adapter.initialize();
      expect(adapter.isReady()).toBe(true);
    });

    it('should not be ready after shutdown', async () => {
      await adapter.initialize();
      await adapter.shutdown();
      expect(adapter.isReady()).toBe(false);
    });

    it('should handle multiple initialize calls gracefully', async () => {
      await adapter.initialize();
      await adapter.initialize();
      expect(adapter.isReady()).toBe(true);
    });

    it('should handle shutdown when not initialized', async () => {
      await adapter.shutdown();
      expect(adapter.isReady()).toBe(false);
    });
  });

  describe('extract without initialization', () => {
    it('should return error when not initialized', async () => {
      const result = await adapter.extract('/nonexistent.jpg', 'image');
      expect(result.success).toBe(false);
      expect(result.error).toBe('ExifTool not initialized');
    });
  });

  describe('extractBatch without initialization', () => {
    it('should return errors for all files when not initialized', async () => {
      const files = [
        { path: '/file1.jpg', type: 'image' as const },
        { path: '/file2.mp4', type: 'video' as const },
      ];

      const results = await adapter.extractBatch(files);

      expect(results.size).toBe(2);
      expect(results.get('/file1.jpg')!.success).toBe(false);
      expect(results.get('/file2.mp4')!.success).toBe(false);
    });
  });

  describe('extractGPS', () => {
    it('should extract GPS from metadata with gps field', () => {
      const metadata = {
        gps: { lat: 40.7128, lng: -74.006, altitude: 100 },
      };

      const gps = adapter.extractGPS(metadata);
      expect(gps).not.toBeNull();
      expect(gps!.lat).toBe(40.7128);
      expect(gps!.lng).toBe(-74.006);
      expect(gps!.altitude).toBe(100);
    });

    it('should return null when no GPS in metadata', () => {
      const metadata = {
        width: 1920,
        height: 1080,
      };

      const gps = adapter.extractGPS(metadata);
      expect(gps).toBeNull();
    });

    it('should return null for undefined gps field', () => {
      const metadata = {
        gps: undefined,
      };

      const gps = adapter.extractGPS(metadata);
      expect(gps).toBeNull();
    });
  });

  describe('extract with non-existent file', () => {
    it('should return error for non-existent file', async () => {
      await adapter.initialize();
      const result = await adapter.extract('/definitely/not/a/real/file.jpg', 'image');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

describe('ExifToolAdapter metadata parsing (unit)', () => {
  // These tests verify the internal parsing logic by testing the public interface
  // with mocked ExifTool responses

  describe('GPS extraction patterns', () => {
    it('should handle GPS with accuracy', () => {
      const adapter = new ExifToolAdapter();
      const metadata = {
        gps: {
          lat: 51.5074,
          lng: -0.1278,
          altitude: 11,
          accuracy: 5,
        },
      };

      const gps = adapter.extractGPS(metadata);
      expect(gps?.lat).toBe(51.5074);
      expect(gps?.lng).toBe(-0.1278);
      expect(gps?.altitude).toBe(11);
      expect(gps?.accuracy).toBe(5);
    });

    it('should handle GPS without altitude', () => {
      const adapter = new ExifToolAdapter();
      const metadata = {
        gps: {
          lat: 35.6762,
          lng: 139.6503,
        },
      };

      const gps = adapter.extractGPS(metadata);
      expect(gps?.lat).toBe(35.6762);
      expect(gps?.lng).toBe(139.6503);
      expect(gps?.altitude).toBeUndefined();
    });
  });
});

describe('ExifToolAdapter integration', () => {
  // Skip these tests if running in CI without ExifTool
  const hasExifTool = process.env.CI !== 'true';

  describe.skipIf(!hasExifTool)('with real ExifTool', () => {
    let adapter: ExifToolAdapter;

    beforeEach(async () => {
      adapter = new ExifToolAdapter();
      await adapter.initialize();
    });

    afterEach(async () => {
      await adapter.shutdown();
    });

    it('should extract metadata from image', async () => {
      // This test would require a real test image file
      // For now, we just verify the adapter initializes correctly
      expect(adapter.isReady()).toBe(true);
    });
  });
});
