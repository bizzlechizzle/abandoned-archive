/**
 * Device Service - Backbone Wrapper for wake-n-blake
 *
 * Provides device detection, camera fingerprinting, and source type detection.
 */

import {
  detectSourceDevice,
  getRemovableVolumes,
  getDeviceChain,
  isRemovableMedia,
  getSourceType,
  CameraFingerprinter,
  detectStorageType,
  getStorageConfig,
  detectCameraFromFolder,
  getVendorName,
  getDeviceName,
  hashString,
  type DeviceDetectionResult,
  type MountedVolume,
  type DeviceChain,
  type CameraMatch,
  type CameraSignature,
  type ImportSourceDevice,
  type SourceType,
  type StorageType,
} from 'wake-n-blake';
import * as path from 'node:path';

export interface DeviceDetectionOptions {
  /** Path to camera signatures database */
  cameraDbPath?: string;
  /** Include detailed USB device info */
  includeUsb?: boolean;
  /** Include card reader info */
  includeCardReader?: boolean;
}

export interface DetectedDevice {
  sourceType: SourceType;
  storageType: StorageType;
  volumeName?: string;
  deviceChain?: DeviceChain;
  camera?: CameraMatch;
  fingerprint?: ImportSourceDevice;
  fingerprintId: string;
  found: boolean;
  errors: string[];
}

let fingerprinterInstance: CameraFingerprinter | null = null;

export class DeviceService {
  /**
   * Initialize the camera fingerprinter (call once at startup)
   */
  static async initialize(dataDir: string): Promise<void> {
    fingerprinterInstance = new CameraFingerprinter(dataDir);
    await fingerprinterInstance.loadDatabase();
  }

  /**
   * Detect the source device for a file path
   */
  static async detectDevice(
    filePath: string,
    _options: DeviceDetectionOptions = {}
  ): Promise<DetectedDevice> {
    // Detect source device (USB, camera, network, etc.)
    const detection = await detectSourceDevice(filePath);

    // Detect storage type
    const storageType = detectStorageType(filePath);

    // Get device chain if detection found something
    let deviceChain: DeviceChain | undefined = detection.chain;

    // Determine source type from chain
    const sourceType = getSourceType(detection.chain);

    // Try camera fingerprinting
    let camera: CameraMatch | undefined;
    if (fingerprinterInstance && detection.chain?.usb) {
      const metadata = {
        make: detection.chain.usb.deviceName?.split(' ')[0],
        model: detection.chain.usb.deviceName,
        folderPath: path.dirname(filePath),
        filename: path.basename(filePath),
      };
      camera = fingerprinterInstance.match(metadata) ?? undefined;
    }

    // Also try folder-based camera detection
    if (!camera && fingerprinterInstance) {
      const folderCamera = detectCameraFromFolder(filePath);
      if (folderCamera) {
        const metadata = {
          make: folderCamera,
          folderPath: path.dirname(filePath),
          filename: path.basename(filePath),
        };
        camera = fingerprinterInstance.match(metadata) ?? undefined;
      }
    }

    // Generate fingerprint ID
    const fingerprintId = await this.generateFingerprintId(detection.device);

    return {
      sourceType,
      storageType,
      volumeName: detection.chain?.volume.volumeName,
      deviceChain,
      camera,
      fingerprint: detection.device,
      fingerprintId,
      found: detection.found,
      errors: detection.errors,
    };
  }

  /**
   * Get all removable volumes (memory cards, USB drives)
   */
  static async getRemovableVolumes(): Promise<MountedVolume[]> {
    return getRemovableVolumes();
  }

  /**
   * Check if a path is on removable media
   */
  static async isRemovable(filePath: string): Promise<boolean> {
    return isRemovableMedia(filePath);
  }

  /**
   * Get source type for a device chain
   */
  static getSourceType(chain?: DeviceChain): SourceType {
    return getSourceType(chain);
  }

  /**
   * Get storage configuration for a path (buffer size, concurrency)
   */
  static getStorageConfig(filePath: string) {
    const storageType = detectStorageType(filePath);
    return getStorageConfig(storageType);
  }

  /**
   * Get human-readable vendor name from USB vendor ID
   */
  static getVendorName(vendorId: number): string | undefined {
    return getVendorName(vendorId);
  }

  /**
   * Get human-readable device name from USB vendor+product ID
   */
  static getDeviceName(vendorId: number, productId: number): string | undefined {
    return getDeviceName(vendorId, productId);
  }

  /**
   * Match camera from EXIF metadata
   */
  static matchCamera(
    make: string,
    model: string,
    filePath?: string
  ): CameraMatch | null {
    if (!fingerprinterInstance) return null;

    return fingerprinterInstance.match({
      make,
      model,
      folderPath: filePath ? path.dirname(filePath) : undefined,
      filename: filePath ? path.basename(filePath) : undefined,
    });
  }

  /**
   * Get expected sidecar patterns for a camera
   */
  static getExpectedSidecars(camera: CameraSignature): string[] {
    if (!fingerprinterInstance) return ['.xmp'];
    return fingerprinterInstance.getExpectedSidecars(camera);
  }

  /**
   * Check if camera footage needs deinterlacing
   */
  static needsDeinterlace(camera: CameraSignature): boolean {
    if (!fingerprinterInstance) return false;
    return fingerprinterInstance.needsDeinterlace(camera);
  }

  /**
   * Get quality tier for a camera
   */
  static getQualityTier(
    camera: CameraSignature
  ): 'pro' | 'prosumer' | 'consumer' | 'legacy' {
    if (!fingerprinterInstance) return 'consumer';
    return fingerprinterInstance.getQualityTier(camera);
  }

  /**
   * Generate a unique fingerprint ID from device info
   */
  private static async generateFingerprintId(
    fingerprint?: ImportSourceDevice
  ): Promise<string> {
    if (!fingerprint) {
      // Generate a random ID if no fingerprint
      const { generateBlake3Id } = await import('wake-n-blake');
      return generateBlake3Id();
    }

    // Create a composite key from available identifiers
    const parts: string[] = [];

    if (fingerprint.usb?.vendorId) parts.push(fingerprint.usb.vendorId);
    if (fingerprint.usb?.productId) parts.push(fingerprint.usb.productId);
    if (fingerprint.usb?.serial) parts.push(fingerprint.usb.serial);
    if (fingerprint.cameraBodySerial) parts.push(fingerprint.cameraBodySerial);
    if (fingerprint.media?.serial) parts.push(fingerprint.media.serial);

    // If no unique identifiers, use a hash of the whole fingerprint
    const key = parts.length > 0
      ? parts.join('|')
      : JSON.stringify(fingerprint);

    const hash = await hashString(key);
    return hash;
  }
}

export {
  DeviceDetectionResult,
  MountedVolume,
  DeviceChain,
  CameraMatch,
  CameraSignature,
  ImportSourceDevice,
  SourceType,
  StorageType,
};
