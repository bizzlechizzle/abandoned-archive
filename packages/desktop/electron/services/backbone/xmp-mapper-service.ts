/**
 * XMP Mapper Service - Backbone Integration
 *
 * Maps XMP sidecar data (source of truth) to database tables.
 * XMP sidecars are created by wake-n-blake during import and contain
 * all provenance data. This service populates the database from XMP.
 *
 * Architecture:
 * - XMP sidecars are THE source of truth (portable, self-contained)
 * - Database is a queryable index (can be rebuilt from XMP)
 */

import {
  readSidecar,
  type XmpSidecarData,
  type CustodyEvent,
  type ImportSourceDevice,
} from 'wake-n-blake';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { HashService } from './hash-service.js';
import type { Database } from 'better-sqlite3';

export interface XmpMappingResult {
  success: boolean;
  xmpPath: string;
  contentHash?: string;
  deviceFingerprintId?: string;
  custodyEventCount: number;
  error?: string;
}

export interface RebuildResult {
  totalFiles: number;
  successful: number;
  failed: number;
  errors: Array<{ path: string; error: string }>;
}

export class XmpMapperService {
  constructor(private db: Database) {}

  /**
   * Map XMP sidecar data to database tables
   * This is the core function that populates the database from XMP
   */
  async mapXmpToDatabase(
    xmpPath: string,
    locid: string,
    mediaType: 'image' | 'video' | 'document'
  ): Promise<XmpMappingResult> {
    try {
      // Read XMP sidecar
      const parseResult = await readSidecar(xmpPath);
      if (!parseResult.isValid || parseResult.errors.length > 0) {
        return {
          success: false,
          xmpPath,
          custodyEventCount: 0,
          error: parseResult.errors.join('; ') || 'Failed to parse XMP sidecar',
        };
      }

      const xmp = parseResult.data;

      // 1. Upsert device fingerprint (if present)
      let deviceFingerprintId: string | undefined;
      if (xmp.sourceDevice) {
        deviceFingerprintId = await this.upsertDeviceFingerprint(xmp.sourceDevice);
      }

      // 2. Insert custody events
      let custodyEventCount = 0;
      if (xmp.custodyChain && xmp.custodyChain.length > 0) {
        for (const event of xmp.custodyChain) {
          await this.insertCustodyEvent(xmp.contentHash, event);
          custodyEventCount++;
        }
      }

      // 3. Update media record with XMP-derived data
      await this.updateMediaRecord(xmp, locid, mediaType, deviceFingerprintId, xmpPath);

      return {
        success: true,
        xmpPath,
        contentHash: xmp.contentHash,
        deviceFingerprintId,
        custodyEventCount,
      };
    } catch (err) {
      return {
        success: false,
        xmpPath,
        custodyEventCount: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Rebuild database from XMP sidecars (disaster recovery)
   * Scans an archive path for all .xmp files and populates database
   */
  async rebuildFromXmp(
    archivePath: string,
    locid: string,
    onProgress?: (current: number, total: number) => void
  ): Promise<RebuildResult> {
    const result: RebuildResult = {
      totalFiles: 0,
      successful: 0,
      failed: 0,
      errors: [],
    };

    // Find all XMP files recursively
    const xmpFiles = await this.findXmpFiles(archivePath);
    result.totalFiles = xmpFiles.length;

    for (let i = 0; i < xmpFiles.length; i++) {
      const xmpPath = xmpFiles[i];

      // Determine media type from sibling file
      const mediaType = await this.detectMediaType(xmpPath);

      const mappingResult = await this.mapXmpToDatabase(xmpPath, locid, mediaType);

      if (mappingResult.success) {
        result.successful++;
      } else {
        result.failed++;
        result.errors.push({
          path: xmpPath,
          error: mappingResult.error ?? 'Unknown error',
        });
      }

      if (onProgress) {
        onProgress(i + 1, result.totalFiles);
      }
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // PRIVATE: Database Operations
  // ---------------------------------------------------------------------------

  /**
   * Upsert device fingerprint and return its ID
   */
  private async upsertDeviceFingerprint(device: ImportSourceDevice): Promise<string> {
    // Generate fingerprint ID from device identifiers
    const fingerprintId = await this.generateFingerprintId(device);

    // Check if exists
    const existing = this.db.prepare(
      'SELECT fingerprint_id FROM device_fingerprints WHERE fingerprint_id = ?'
    ).get(fingerprintId);

    if (existing) {
      // Update existing
      this.db.prepare(`
        UPDATE device_fingerprints SET
          updated_at = datetime('now'),
          usb_vendor_id = ?,
          usb_product_id = ?,
          usb_serial = ?,
          usb_device_path = ?,
          usb_device_name = ?,
          camera_body_serial = ?,
          media_type = ?,
          media_serial = ?,
          storage_type = ?,
          storage_volume_name = ?
        WHERE fingerprint_id = ?
      `).run(
        device.usb?.vendorId ?? null,
        device.usb?.productId ?? null,
        device.usb?.serial ?? null,
        device.usb?.devicePath ?? null,
        device.usb?.deviceName ?? null,
        device.cameraBodySerial ?? null,
        device.media?.type ?? null,
        device.media?.serial ?? null,
        device.storageInfo?.type ?? null,
        device.storageInfo?.volumeName ?? null,
        fingerprintId
      );
    } else {
      // Insert new
      this.db.prepare(`
        INSERT INTO device_fingerprints (
          fingerprint_id, created_at, updated_at,
          usb_vendor_id, usb_product_id, usb_serial, usb_device_path, usb_device_name,
          card_reader_vendor, card_reader_model, card_reader_serial,
          media_type, media_serial, media_manufacturer,
          camera_body_serial,
          storage_type, storage_volume_name
        ) VALUES (
          ?, datetime('now'), datetime('now'),
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?,
          ?, ?
        )
      `).run(
        fingerprintId,
        device.usb?.vendorId ?? null,
        device.usb?.productId ?? null,
        device.usb?.serial ?? null,
        device.usb?.devicePath ?? null,
        device.usb?.deviceName ?? null,
        device.cardReader?.vendor ?? null,
        device.cardReader?.model ?? null,
        device.cardReader?.serial ?? null,
        device.media?.type ?? null,
        device.media?.serial ?? null,
        device.media?.manufacturer ?? null,
        device.cameraBodySerial ?? null,
        device.storageInfo?.type ?? null,
        device.storageInfo?.volumeName ?? null
      );
    }

    return fingerprintId;
  }

  /**
   * Insert a custody event
   */
  private async insertCustodyEvent(contentHash: string, event: CustodyEvent): Promise<void> {
    const eventId = await HashService.generateId();

    this.db.prepare(`
      INSERT OR IGNORE INTO custody_events (
        event_id, content_hash, created_at,
        event_timestamp, event_action, event_outcome,
        event_location, event_host, event_user, event_tool,
        event_hash, event_hash_algorithm,
        event_notes, event_details
      ) VALUES (
        ?, ?, datetime('now'),
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?, ?
      )
    `).run(
      eventId,
      contentHash,
      event.eventTimestamp,
      event.eventAction,
      event.eventOutcome,
      event.eventLocation ?? null,
      event.eventHost ?? null,
      event.eventUser ?? null,
      event.eventTool ?? null,
      event.eventHash ?? null,
      event.eventHashAlgorithm ?? null,
      event.eventNotes ?? null,
      event.eventDetails ?? null
    );
  }

  /**
   * Update media record with XMP data
   */
  private async updateMediaRecord(
    xmp: XmpSidecarData,
    locid: string,
    mediaType: 'image' | 'video' | 'document',
    deviceFingerprintId: string | undefined,
    xmpPath: string
  ): Promise<void> {
    const tableName = mediaType === 'image' ? 'imgs' : mediaType === 'video' ? 'vids' : 'docs';
    const hashColumn = mediaType === 'image' ? 'imghash' : mediaType === 'video' ? 'vidhash' : 'dochash';

    // Check if record exists
    const existing = this.db.prepare(
      `SELECT ${hashColumn} FROM ${tableName} WHERE ${hashColumn} = ?`
    ).get(xmp.contentHash);

    if (existing) {
      // Update existing record
      this.db.prepare(`
        UPDATE ${tableName} SET
          device_fingerprint_id = ?,
          xmp_sidecar_path = ?,
          source_type = ?,
          file_size_bytes = ?
        WHERE ${hashColumn} = ?
      `).run(
        deviceFingerprintId ?? null,
        xmpPath,
        xmp.sourceType ?? null,
        xmp.fileSize ?? null,
        xmp.contentHash
      );
    }

    // For images, update additional fields
    if (mediaType === 'image' && existing) {
      // Update Live Photo info if present
      // XMP stores: isLivePhoto, livePhotoPairHash, relatedFiles (as paths)
      if (xmp.isLivePhoto || xmp.livePhotoPairHash) {
        this.db.prepare(`
          UPDATE imgs SET
            is_live_photo = ?,
            live_photo_pair_hash = ?
          WHERE imghash = ?
        `).run(
          xmp.isLivePhoto ? 1 : 0,
          xmp.livePhotoPairHash ?? null,
          xmp.contentHash
        );
      }

      // Update GPS if present (photo metadata is under xmp.photo)
      if (xmp.photo?.gpsLatitude && xmp.photo?.gpsLongitude) {
        this.db.prepare(`
          UPDATE imgs SET
            meta_gps_lat = ?,
            meta_gps_lng = ?
          WHERE imghash = ?
        `).run(
          xmp.photo.gpsLatitude,
          xmp.photo.gpsLongitude,
          xmp.contentHash
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // PRIVATE: Helpers
  // ---------------------------------------------------------------------------

  /**
   * Generate a fingerprint ID from device info
   */
  private async generateFingerprintId(device: ImportSourceDevice): Promise<string> {
    const parts: string[] = [];

    if (device.usb?.vendorId) parts.push(device.usb.vendorId);
    if (device.usb?.productId) parts.push(device.usb.productId);
    if (device.usb?.serial) parts.push(device.usb.serial);
    if (device.cameraBodySerial) parts.push(device.cameraBodySerial);
    if (device.media?.serial) parts.push(device.media.serial);

    const key = parts.length > 0 ? parts.join('|') : JSON.stringify(device);
    return HashService.hashBuffer(Buffer.from(key));
  }

  /**
   * Find all XMP files recursively
   */
  private async findXmpFiles(dir: string): Promise<string[]> {
    const results: string[] = [];

    async function walk(currentDir: string): Promise<void> {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.xmp')) {
          results.push(fullPath);
        }
      }
    }

    await walk(dir);
    return results;
  }

  /**
   * Detect media type from sibling file of XMP
   */
  private async detectMediaType(xmpPath: string): Promise<'image' | 'video' | 'document'> {
    // XMP should be named like "file.ext.xmp" or "file.xmp"
    // Try to find the sibling media file
    const dir = path.dirname(xmpPath);
    const xmpName = path.basename(xmpPath);

    // Remove .xmp extension
    let baseName = xmpName.replace(/\.xmp$/i, '');

    // Check for common image extensions
    const imageExts = ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.dng', '.arw', '.cr2', '.cr3', '.nef', '.raf'];
    const videoExts = ['.mp4', '.mov', '.avi', '.mkv', '.mts', '.m2ts'];

    for (const ext of imageExts) {
      const check = path.join(dir, baseName + ext);
      try {
        await fs.access(check);
        return 'image';
      } catch {
        // Continue
      }
    }

    for (const ext of videoExts) {
      const check = path.join(dir, baseName + ext);
      try {
        await fs.access(check);
        return 'video';
      } catch {
        // Continue
      }
    }

    // Default to image
    return 'image';
  }
}
