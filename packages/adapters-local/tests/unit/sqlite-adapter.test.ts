/**
 * SQLiteAdapter Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { SQLiteAdapter } from '../../src/adapters/sqlite-adapter.js';
import type { LocationInput } from '@au-archive/import-core';

describe('SQLiteAdapter', () => {
  let adapter: SQLiteAdapter;
  let testDir: string;
  let dbPath: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'au-sqlite-test-'));
    dbPath = path.join(testDir, 'test.db');
    adapter = new SQLiteAdapter(dbPath);
    await adapter.connect();
  });

  afterEach(async () => {
    await adapter.disconnect();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('connection', () => {
    it('should connect to database', () => {
      expect(adapter.isConnected()).toBe(true);
    });

    it('should disconnect from database', async () => {
      await adapter.disconnect();
      expect(adapter.isConnected()).toBe(false);
    });
  });

  describe('location operations', () => {
    const testLocation: LocationInput = {
      locnam: 'Test Asylum',
      slocnam: 'Main Building',
      type: 'hospital',
      gps_lat: 40.7128,
      gps_lng: -74.006,
      address_state: 'NY',
    };

    it('should create a location', async () => {
      const location = await adapter.createLocation(testLocation);

      expect(location.locnam).toBe('Test Asylum');
      expect(location.locid).toMatch(/^[0-9a-f-]{36}$/);
      expect(location.loc12).toHaveLength(12);
    });

    it('should find location by ID', async () => {
      const created = await adapter.createLocation(testLocation);
      const found = await adapter.findLocation(created.locid);

      expect(found).not.toBeNull();
      expect(found!.locnam).toBe('Test Asylum');
    });

    it('should find location by loc12', async () => {
      const created = await adapter.createLocation(testLocation);
      const found = await adapter.findLocationByLoc12(created.loc12);

      expect(found).not.toBeNull();
      expect(found!.locid).toBe(created.locid);
    });

    it('should return null for non-existent location', async () => {
      const found = await adapter.findLocation('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });

    it('should update a location', async () => {
      const created = await adapter.createLocation(testLocation);
      await adapter.updateLocation(created.locid, { locnam: 'Updated Asylum' });

      const updated = await adapter.findLocation(created.locid);
      expect(updated!.locnam).toBe('Updated Asylum');
      expect(updated!.locup).not.toBeNull();
    });
  });

  describe('media operations', () => {
    let locationId: string;

    beforeEach(async () => {
      const location = await adapter.createLocation({ locnam: 'Test Location' });
      locationId = location.locid;
    });

    it('should insert and find image by hash', async () => {
      const imageData = {
        sha: 'a'.repeat(64),
        type: 'image' as const,
        locid: locationId,
        originalName: 'photo.jpg',
        archiveName: 'a'.repeat(64) + '.jpg',
        originalPath: '/source/photo.jpg',
        archivePath: '/archive/a.jpg',
        authImp: 'test-user',
        addedAt: new Date().toISOString(),
      };

      await adapter.transaction(async (trx) => {
        await adapter.insertMedia(trx, imageData);
      });

      const found = await adapter.findMediaByHash('a'.repeat(64), 'image');
      expect(found).not.toBeNull();
      expect(found!.originalName).toBe('photo.jpg');
    });

    it('should check if media exists', async () => {
      const hash = 'b'.repeat(64);

      expect(await adapter.mediaExists(hash, 'image')).toBe(false);

      await adapter.transaction(async (trx) => {
        await adapter.insertMedia(trx, {
          sha: hash,
          type: 'image' as const,
          locid: locationId,
          originalName: 'test.jpg',
          archiveName: hash + '.jpg',
          originalPath: '/source/test.jpg',
          archivePath: '/archive/b.jpg',
          authImp: null,
          addedAt: new Date().toISOString(),
        });
      });

      expect(await adapter.mediaExists(hash, 'image')).toBe(true);
    });

    it('should handle video media type', async () => {
      const videoData = {
        sha: 'c'.repeat(64),
        type: 'video' as const,
        locid: locationId,
        originalName: 'video.mp4',
        archiveName: 'c'.repeat(64) + '.mp4',
        originalPath: '/source/video.mp4',
        archivePath: '/archive/c.mp4',
        authImp: null,
        addedAt: new Date().toISOString(),
        duration: 120.5,
        codec: 'h264',
        fps: 30,
      };

      await adapter.transaction(async (trx) => {
        await adapter.insertMedia(trx, videoData);
      });

      const found = await adapter.findMediaByHash('c'.repeat(64), 'video');
      expect(found).not.toBeNull();
      expect(found!.type).toBe('video');
      if (found!.type === 'video') {
        expect(found!.duration).toBe(120.5);
        expect(found!.codec).toBe('h264');
      }
    });
  });

  describe('provenance operations', () => {
    let locationId: string;

    beforeEach(async () => {
      const location = await adapter.createLocation({ locnam: 'Provenance Test' });
      locationId = location.locid;
    });

    it('should insert and retrieve provenance', async () => {
      const provenance = {
        provenanceId: 'prov-123',
        mediaSha: 'd'.repeat(64),
        mediaType: 'image' as const,
        importedBy: 'test-user',
        originalFilename: 'photo.jpg',
        sourcePath: '/source/photo.jpg',
        importedAt: new Date().toISOString(),
        capturedBy: 'John Doe',
        capturedByRole: 'researcher' as const,
        institution: 'Test University',
        project: 'Field Study 2024',
        sourceVolume: 'usb_drive' as const,
      };

      await adapter.transaction(async (trx) => {
        await adapter.insertProvenance(trx, provenance);
      });

      const found = await adapter.getProvenance('d'.repeat(64), 'image');
      expect(found).not.toBeNull();
      expect(found!.importedBy).toBe('test-user');
      expect(found!.capturedBy).toBe('John Doe');
      expect(found!.sourceVolume).toBe('usb_drive');
    });
  });

  describe('audit log operations', () => {
    it('should append and retrieve audit entries', async () => {
      await adapter.appendAuditLog({
        action: 'import',
        entityType: 'image',
        entityId: 'img-123',
        actor: 'system',
        details: { count: 10 },
      });

      await adapter.appendAuditLog({
        action: 'edit',
        entityType: 'location',
        entityId: 'loc-456',
        actor: 'user1',
      });

      const entries = await adapter.getRecentAuditEntries(10);
      expect(entries.length).toBe(2);
      expect(entries[0].action).toBe('edit'); // Most recent first
      expect(entries[1].action).toBe('import');
    });
  });

  describe('fixity operations', () => {
    it('should insert and retrieve fixity checks', async () => {
      const fixityRecord = {
        checkId: 'check-123',
        mediaSha: 'e'.repeat(64),
        mediaType: 'image' as const,
        filePath: '/archive/e.jpg',
        checkedAt: new Date().toISOString(),
        checkedBy: 'system',
        expectedHash: 'e'.repeat(64),
        actualHash: 'e'.repeat(64),
        status: 'valid' as const,
      };

      await adapter.insertFixityCheck(fixityRecord);

      const found = await adapter.getLastFixityCheck('e'.repeat(64), 'image');
      expect(found).not.toBeNull();
      expect(found!.status).toBe('valid');
    });

    it('should get corrupted files', async () => {
      await adapter.insertFixityCheck({
        checkId: 'check-bad',
        mediaSha: 'f'.repeat(64),
        mediaType: 'image' as const,
        filePath: '/archive/f.jpg',
        checkedAt: new Date().toISOString(),
        checkedBy: 'system',
        expectedHash: 'f'.repeat(64),
        actualHash: 'g'.repeat(64),
        status: 'corrupted' as const,
        errorMessage: 'Hash mismatch',
      });

      const corrupted = await adapter.getCorruptedFiles();
      expect(corrupted.length).toBe(1);
      expect(corrupted[0].status).toBe('corrupted');
    });
  });

  describe('import operations', () => {
    let locationId: string;

    beforeEach(async () => {
      const location = await adapter.createLocation({ locnam: 'Import Test' });
      locationId = location.locid;
    });

    it('should create and retrieve import records', async () => {
      const importData = {
        importId: 'imp-789',
        locid: locationId,
        importDate: new Date().toISOString(),
        authImp: 'test-user',
        imgCount: 10,
        vidCount: 2,
        docCount: 1,
        mapCount: 0,
        notes: 'Test import',
      };

      await adapter.transaction(async (trx) => {
        await adapter.createImportRecord(trx, importData);
      });

      const found = await adapter.getImport('imp-789');
      expect(found).not.toBeNull();
      expect(found!.imgCount).toBe(10);
      expect(found!.notes).toBe('Test import');
    });

    it('should get recent imports', async () => {
      await adapter.transaction(async (trx) => {
        await adapter.createImportRecord(trx, {
          importId: 'imp-1',
          locid: locationId,
          importDate: '2024-01-01T00:00:00Z',
          authImp: null,
          imgCount: 5,
          vidCount: 0,
          docCount: 0,
          mapCount: 0,
        });
        await adapter.createImportRecord(trx, {
          importId: 'imp-2',
          locid: locationId,
          importDate: '2024-01-02T00:00:00Z',
          authImp: null,
          imgCount: 10,
          vidCount: 0,
          docCount: 0,
          mapCount: 0,
        });
      });

      const recent = await adapter.getRecentImports(10);
      expect(recent.length).toBe(2);
      expect(recent[0].importId).toBe('imp-2'); // Most recent first
    });
  });

  describe('transaction handling', () => {
    it('should commit successful transactions', async () => {
      const location = await adapter.transaction(async () => {
        return adapter.createLocation({ locnam: 'Transaction Test' });
      });

      const found = await adapter.findLocation(location.locid);
      expect(found).not.toBeNull();
    });

    it('should rollback failed transactions', async () => {
      const locationBefore = await adapter.createLocation({ locnam: 'Before' });

      try {
        await adapter.transaction(async () => {
          await adapter.updateLocation(locationBefore.locid, { locnam: 'During' });
          throw new Error('Intentional failure');
        });
      } catch {
        // Expected
      }

      const locationAfter = await adapter.findLocation(locationBefore.locid);
      expect(locationAfter!.locnam).toBe('Before');
    });
  });
});
