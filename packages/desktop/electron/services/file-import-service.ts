import path from 'path';
import fs from 'fs/promises';
import { CryptoService } from './crypto-service';
import { ExifToolService } from './exiftool-service';
import { FFmpegService } from './ffmpeg-service';
import { PathValidator } from './path-validator';
import { GPSValidator } from './gps-validator';
// FIX 3.3: Import geocoding for #import_address
import { GeocodingService } from './geocoding-service';
// FIX 3.4: Import GPX/KML parser for map files
import { GPXKMLParser, type MapFileData } from './gpx-kml-parser';
// Kanye5: Import preview/thumbnail services for on-import extraction
import { MediaPathService } from './media-path-service';
// DECISION-018: Import region calculation for auto-population
import { calculateRegionFields } from './region-service';
import { LocationEntity } from '@au-archive/core';
import { ThumbnailService } from './thumbnail-service';
import { PreviewExtractorService } from './preview-extractor-service';
import { PosterFrameService } from './poster-frame-service';
import { SQLiteMediaRepository } from '../repositories/sqlite-media-repository';
import { SQLiteImportRepository } from '../repositories/sqlite-import-repository';
import { SQLiteLocationRepository } from '../repositories/sqlite-location-repository';
import type { ImgsTable, VidsTable, DocsTable } from '../main/database.types';
import type { Kysely } from 'kysely';
import type { Database } from '../main/database.types';

export interface ImportFileInput {
  filePath: string;
  originalName: string;
  locid: string;
  subid?: string | null;
  auth_imp: string | null;
  // Migration 25: Activity tracking
  imported_by_id?: string | null;
  imported_by?: string | null;
  media_source?: string | null;
  // Migration 26: Contributor tracking
  is_contributed?: number;           // 0 = author, 1 = contributor
  contribution_source?: string | null; // e.g., "John Smith via text"
}

export interface ImportResult {
  success: boolean;
  hash: string;
  type: 'image' | 'video' | 'map' | 'document' | 'skipped' | 'sidecar';  // 'sidecar' for metadata-only imports
  duplicate: boolean;
  skipped?: boolean;  // True if file was skipped (e.g., .aae, .psd)
  sidecarOnly?: boolean;  // True if only XML metadata was imported, not the media file
  archivePath?: string;
  error?: string;
  gpsWarning?: {
    message: string;
    distance: number;
    severity: 'minor' | 'major';
    locationGPS: { lat: number; lng: number };
    mediaGPS: { lat: number; lng: number };
  };
  // OPT-012: Track non-fatal warnings during import
  warnings?: string[];
  // FIX-PROGRESS: GPS data for post-import enrichment (Steps 8a-8b)
  // Returned from transaction so enrichment can run outside critical path
  _gpsForEnrichment?: { lat: number; lng: number } | null;
  _locid?: string;
}

export interface ImportSessionResult {
  total: number;
  imported: number;
  duplicates: number;
  skipped: number;     // Files with excluded extensions (.aae, .psd, etc.)
  sidecarOnly: number; // Files where only XML metadata was imported (no media copied)
  errors: number;
  results: ImportResult[];
  importId: string;
}

/**
 * Service for importing media files into the archive
 */
export class FileImportService {
  // Extensions to skip entirely during import (not copied, not logged)
  // .aae = Apple photo adjustments (sidecar metadata, not actual media)
  // .psd/.psb = Photoshop project files (large, not archival media)
  private readonly SKIP_EXTENSIONS = [
    '.aae',                            // Apple photo adjustment sidecar
    '.psd', '.psb',                    // Photoshop project files
  ];

  // Comprehensive format support based on ExifTool capabilities
  private readonly IMAGE_EXTENSIONS = [
    // Standard formats
    '.jpg', '.jpeg', '.jpe', '.jfif', '.png', '.gif', '.bmp', '.tiff', '.tif', '.webp',
    '.jp2', '.jpx', '.j2k', '.j2c',    // JPEG 2000
    '.jxl',                            // JPEG XL
    '.heic', '.heif', '.hif',          // Apple HEIF/HEVC
    '.avif',                           // AV1 Image
    // Removed: .psd, .psb - now in SKIP_EXTENSIONS
    '.ai', '.eps', '.epsf',            // Adobe Illustrator/PostScript
    '.svg', '.svgz',                   // Vector
    '.ico', '.cur',                    // Icons
    '.pcx', '.dcx',                    // PC Paintbrush
    '.ppm', '.pgm', '.pbm', '.pnm',    // Netpbm
    '.tga', '.icb', '.vda', '.vst',    // Targa
    '.dds',                            // DirectDraw Surface
    '.exr',                            // OpenEXR
    '.hdr',                            // Radiance HDR
    '.dpx', '.cin',                    // Digital Picture Exchange
    '.fits', '.fit', '.fts',           // Flexible Image Transport
    // RAW camera formats (ExifTool supported - comprehensive list)
    '.nef', '.nrw',                    // Nikon
    '.cr2', '.cr3', '.crw', '.ciff',   // Canon
    '.arw', '.arq', '.srf', '.sr2',    // Sony
    '.dng',                            // Adobe DNG (universal)
    '.orf', '.ori',                    // Olympus
    '.raf',                            // Fujifilm
    '.rw2', '.raw', '.rwl',            // Panasonic/Leica
    '.pef', '.ptx',                    // Pentax
    '.srw',                            // Samsung
    '.x3f',                            // Sigma
    '.3fr', '.fff',                    // Hasselblad
    '.dcr', '.k25', '.kdc',            // Kodak
    '.mef', '.mos',                    // Mamiya/Leaf
    '.mrw',                            // Minolta
    '.erf',                            // Epson
    '.iiq',                            // Phase One
    '.rwz',                            // Rawzor
    '.gpr',                            // GoPro RAW
  ];
  // Comprehensive video format support based on FFprobe/FFmpeg capabilities
  private readonly VIDEO_EXTENSIONS = [
    '.mp4', '.m4v', '.m4p',            // MPEG-4
    '.mov', '.qt',                     // QuickTime
    '.avi', '.divx',                   // AVI
    '.mkv', '.mka', '.mks', '.mk3d',   // Matroska
    '.webm',                           // WebM
    '.wmv', '.wma', '.asf',            // Windows Media
    '.flv', '.f4v', '.f4p', '.f4a', '.f4b', // Flash Video
    '.mpg', '.mpeg', '.mpe', '.mpv', '.m2v', // MPEG
    '.ts', '.mts', '.m2ts', '.tsv', '.tsa', // MPEG Transport Stream
    '.vob', '.ifo',                    // DVD Video
    '.3gp', '.3g2',                    // 3GPP
    '.ogv', '.ogg', '.ogm', '.oga', '.ogx', '.spx', '.opus', // Ogg/Vorbis
    '.rm', '.rmvb', '.rv',             // RealMedia
    '.dv', '.dif',                     // DV Video
    '.mxf',                            // Material eXchange Format
    '.gxf',                            // General eXchange Format
    '.nut',                            // NUT
    '.roq',                            // id RoQ
    '.nsv',                            // Nullsoft
    '.amv',                            // AMV
    '.swf',                            // Flash
    '.yuv', '.y4m',                    // Raw YUV
    '.bik', '.bk2',                    // Bink
    '.smk',                            // Smacker
    '.dpg',                            // Nintendo DS
    '.pva',                            // TechnoTrend PVA
  ];
  private readonly DOCUMENT_EXTENSIONS = [
    '.pdf',                            // Portable Document Format
    '.doc', '.docx', '.docm',          // Microsoft Word
    '.xls', '.xlsx', '.xlsm', '.xlsb', // Microsoft Excel
    '.ppt', '.pptx', '.pptm',          // Microsoft PowerPoint
    '.odt', '.ods', '.odp', '.odg',    // OpenDocument
    '.rtf',                            // Rich Text Format
    '.txt', '.text', '.log',           // Plain text
    '.csv', '.tsv',                    // Data files
    '.epub', '.mobi', '.azw', '.azw3', // E-books
    '.djvu', '.djv',                   // DjVu
    '.xps', '.oxps',                   // XML Paper Specification
  ];
  // Map-specific extensions (historical maps, floor plans, etc.)
  // These are images but stored separately for organizational purposes
  private readonly MAP_EXTENSIONS = [
    '.geotiff', '.gtiff',              // GeoTIFF
    '.gpx',                            // GPS Exchange Format
    '.kml', '.kmz',                    // Google Earth
    '.shp', '.shx', '.dbf', '.prj',    // Shapefile components
    '.geojson', '.topojson',           // GeoJSON
    '.osm',                            // OpenStreetMap
    '.mbtiles',                        // MapBox Tiles
    '.sid', '.ecw',                    // MrSID, ECW compressed imagery
  ];

  // FIX 3.4: GPX/KML parser for map files
  private readonly gpxKmlParser: GPXKMLParser;

  // Kanye5: Services for on-import preview/thumbnail extraction
  private readonly mediaPathService: MediaPathService;
  private readonly thumbnailService: ThumbnailService;
  private readonly previewExtractorService: PreviewExtractorService;
  private readonly posterFrameService: PosterFrameService;

  constructor(
    private readonly db: Kysely<Database>,
    private readonly cryptoService: CryptoService,
    private readonly exifToolService: ExifToolService,
    private readonly ffmpegService: FFmpegService,
    private readonly mediaRepo: SQLiteMediaRepository,
    private readonly importRepo: SQLiteImportRepository,
    private readonly locationRepo: SQLiteLocationRepository,
    private readonly archivePath: string,
    private readonly allowedImportDirs: string[] = [], // User's home dir, downloads, etc.
    // FIX 3.3: Optional geocoding service for #import_address
    private readonly geocodingService?: GeocodingService
  ) {
    // FIX 3.4: Initialize GPX/KML parser
    this.gpxKmlParser = new GPXKMLParser();

    // Kanye5: Initialize preview/thumbnail services for on-import extraction
    this.mediaPathService = new MediaPathService(archivePath);
    this.thumbnailService = new ThumbnailService(this.mediaPathService);
    this.previewExtractorService = new PreviewExtractorService(this.mediaPathService, exifToolService);
    this.posterFrameService = new PosterFrameService(this.mediaPathService, ffmpegService);
  }

  /**
   * Import multiple files in a batch
   * FIX 2.2: Per-file transactions - each file is committed independently
   * This allows partial success: if file 5 fails, files 1-4 are already saved
   * FIX 4.3: Supports abort signal for cancellation
   */
  async importFiles(
    files: ImportFileInput[],
    deleteOriginals: boolean = false,
    // FIX 4.1: Progress callback now includes filename
    onProgress?: (current: number, total: number, filename?: string) => void,
    // FIX 4.3: Abort signal for cancellation
    abortSignal?: AbortSignal
  ): Promise<ImportSessionResult> {
    // Validate all file paths before starting
    for (const file of files) {
      if (!PathValidator.isPathSafe(file.filePath, this.archivePath)) {
        // Check if file is in allowed import directories
        const isAllowed = this.allowedImportDirs.length === 0 ||
          this.allowedImportDirs.some(dir => PathValidator.isPathSafe(file.filePath, dir));

        if (!isAllowed) {
          throw new Error(`Security: File path not allowed: ${file.filePath}`);
        }
      }
    }

    console.log('[FileImport] Starting batch import of', files.length, 'files');

    // FIX 11: PRE-FETCH location ONCE before starting any file imports
    // All files in one import go to the same location, so we only need to fetch it once
    // CRITICAL: This MUST happen BEFORE any transactions to avoid SQLite deadlock
    // (whereswaldo11 identified this as the root cause of the import hang)
    const locid = files[0]?.locid;
    if (!locid) {
      throw new Error('No location ID provided');
    }

    console.log('[FileImport] Pre-fetching location data for locid:', locid);
    const location = await this.locationRepo.findById(locid);
    if (!location) {
      throw new Error(`Location not found: ${locid}`);
    }
    console.log('[FileImport] Location pre-fetched:', location.locnam);

    // FIX 2.2: Per-file transactions instead of wrapping all files in one transaction
    const results: ImportResult[] = [];
    let imported = 0;
    let duplicates = 0;
    let errors = 0;
    let skipped = 0;  // Files with excluded extensions (.aae, .psd, etc.)
    let sidecarOnly = 0;  // Files where only XML metadata was imported (no media copied)

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // FIX 4.3: Check for cancellation before each file
      if (abortSignal?.aborted) {
        console.log('[FileImport] Import cancelled by user after', i, 'files');
        break;
      }

      console.log('[FileImport] Processing file', i + 1, 'of', files.length, ':', file.originalName);

      try {
        // FIX 2.2: Each file gets its own transaction - committed on success, rolled back on failure
        // FIX 11: Pass pre-fetched location to avoid DB calls inside transaction (prevents deadlock)
        const result = await this.db.transaction().execute(async (trx) => {
          return await this.importSingleFile(file, deleteOriginals, trx, location);
        });
        results.push(result);

        if (result.success) {
          if (result.skipped) {
            skipped++;
            console.log('[FileImport] File', i + 1, 'SKIPPED (excluded extension)');
          } else if (result.sidecarOnly) {
            sidecarOnly++;
            console.log('[FileImport] File', i + 1, 'SIDECAR ONLY (XML metadata imported, no media)');
          } else if (result.duplicate) {
            duplicates++;
            console.log('[FileImport] File', i + 1, 'was duplicate');
          } else {
            imported++;
            console.log('[FileImport] File', i + 1, 'imported successfully');
          }
        } else {
          errors++;
          console.log('[FileImport] File', i + 1, 'failed');
        }

        // FIX 1.2 & 4.1: Report progress AFTER work completes with filename
        if (onProgress) {
          onProgress(i + 1, files.length, file.originalName);
        }

        // FIX-PROGRESS: Run Steps 8a-8b as fire-and-forget AFTER progress fires
        // Per docs/workflows/import.md: "Background job for metadata extraction (doesn't block)"
        if (result.success && !result.duplicate && result._gpsForEnrichment && result._locid) {
          this.runPostImportEnrichment(result._locid, result._gpsForEnrichment, location).catch(err => {
            console.warn('[FileImport] Post-import enrichment failed (non-blocking):', err);
          });
        }
      } catch (error) {
        console.error('[FileImport] Error importing file', file.originalName, ':', error);
        // FIX 1.1: Use 'document' instead of 'unknown' (valid type union value)
        results.push({
          success: false,
          hash: '',
          type: 'document',
          duplicate: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        errors++;

        // FIX 1.2 & 4.1: Report progress on error too with filename
        if (onProgress) {
          onProgress(i + 1, files.length, file.originalName);
        }
      }

      // FIX 2.1: Yield to event loop between files to prevent UI freeze
      await new Promise(resolve => setImmediate(resolve));
    }
    console.log('[FileImport] Batch processing complete:', imported, 'imported,', duplicates, 'duplicates,', skipped, 'skipped,', sidecarOnly, 'sidecar-only,', errors, 'errors');

    // Create import record in separate transaction (after all files processed)
    // NOTE: locid already pre-fetched at line 204, use auth_imp from first file
    const auth_imp = files[0]?.auth_imp || null;
    const imgCount = results.filter((r) => r.type === 'image' && !r.duplicate).length;
    const vidCount = results.filter((r) => r.type === 'video' && !r.duplicate).length;
    const mapCount = results.filter((r) => r.type === 'map' && !r.duplicate).length;
    const docCount = results.filter((r) => r.type === 'document' && !r.duplicate).length;

    // Create import record in its own transaction
    const importId = await this.db.transaction().execute(async (trx) => {
      return await this.createImportRecordInTransaction(trx, {
        locid,
        auth_imp,
        img_count: imgCount,
        vid_count: vidCount,
        map_count: mapCount,
        doc_count: docCount,
        notes: `Imported ${imported} files, ${duplicates} duplicates, ${skipped} skipped, ${sidecarOnly} sidecar-only, ${errors} errors`,
      });
    });

    // Auto-detect and hide Live Photo videos and SDR duplicates
    // Runs after all files imported so we can match pairs
    console.log('[FileImport] Step 10: Detecting Live Photos and SDR duplicates...');
    await this.detectAndHideLivePhotosAndSDR(locid);

    return {
      total: files.length,
      imported,
      duplicates,
      skipped,
      sidecarOnly,
      errors,
      results,
      importId,
    };
  }

  /**
   * Detect and auto-hide Live Photo videos and SDR duplicates for a location
   * - iPhone Live Photos: .MOV with matching .HEIC/.JPG filename
   * - Android Motion Photos: .mp4 with matching image (YYYYMMDD_HHMMSS pattern)
   * - SDR duplicates: Files with _SDR suffix when HDR version exists
   */
  private async detectAndHideLivePhotosAndSDR(locid: string): Promise<void> {
    try {
      // Get all images and videos for this location
      const images = await this.mediaRepo.getImageFilenamesByLocation(locid);
      const videos = await this.mediaRepo.getVideoFilenamesByLocation(locid);

      console.log(`[FileImport] Scanning ${images.length} images and ${videos.length} videos for Live Photos/SDR`);

      // Build set of image base names (without extension) for fast lookup
      const imageBaseNames = new Map<string, string>(); // baseName -> imgsha
      for (const img of images) {
        const baseName = this.getBaseFilename(img.imgnamo);
        imageBaseNames.set(baseName.toLowerCase(), img.imgsha);
      }

      // Detect Live Photo videos (MOV/MP4 with matching image)
      let livePhotosHidden = 0;
      for (const vid of videos) {
        const ext = path.extname(vid.vidnamo).toLowerCase();
        // iPhone: .MOV, Android: .mp4
        if (ext === '.mov' || ext === '.mp4') {
          const baseName = this.getBaseFilename(vid.vidnamo).toLowerCase();
          // Check if there's a matching image
          if (imageBaseNames.has(baseName)) {
            // This is a Live Photo video - hide it and mark both as live photo
            await this.mediaRepo.setVideoHidden(vid.vidsha, true, 'live_photo');
            await this.mediaRepo.setVideoLivePhoto(vid.vidsha, true);
            // Also mark the image as a live photo (but don't hide it)
            const imgsha = imageBaseNames.get(baseName);
            if (imgsha) {
              await this.mediaRepo.setImageLivePhoto(imgsha, true);
            }
            livePhotosHidden++;
            console.log(`[FileImport] Live Photo detected: ${vid.vidnamo} -> hidden`);
          }
        }
      }

      // Detect SDR duplicates (files with _SDR when HDR exists)
      let sdrHidden = 0;
      for (const img of images) {
        const filename = img.imgnamo;
        // Check for _SDR suffix (case insensitive)
        if (/_sdr\./i.test(filename)) {
          // Check if HDR version exists
          const hdrFilename = filename.replace(/_sdr\./i, '.');
          const hdrBaseName = this.getBaseFilename(hdrFilename).toLowerCase();
          // Also check for explicit _HDR version
          const hdrExplicitFilename = filename.replace(/_sdr\./i, '_HDR.');
          const hdrExplicitBaseName = this.getBaseFilename(hdrExplicitFilename).toLowerCase();

          if (imageBaseNames.has(hdrBaseName) || imageBaseNames.has(hdrExplicitBaseName)) {
            await this.mediaRepo.setImageHidden(img.imgsha, true, 'sdr_duplicate');
            sdrHidden++;
            console.log(`[FileImport] SDR duplicate detected: ${filename} -> hidden`);
          }
        }
      }

      // Check EXIF for Android Motion Photos (MotionPhoto=1)
      // This is an info flag, not hiding (video is embedded, nothing to hide)
      for (const img of images) {
        try {
          // Query the raw EXIF data from database
          const imgData = await this.mediaRepo.findImageByHash(img.imgsha);
          if (imgData?.meta_exiftool) {
            const exif = JSON.parse(imgData.meta_exiftool);
            if (exif.MotionPhoto === 1 || exif.MicroVideo || exif.MicroVideoOffset) {
              await this.mediaRepo.setImageLivePhoto(img.imgsha, true);
              console.log(`[FileImport] Android Motion Photo detected: ${img.imgnamo}`);
            }
          }
        } catch (e) {
          // Ignore parse errors
        }
      }

      console.log(`[FileImport] Detection complete: ${livePhotosHidden} Live Photo videos hidden, ${sdrHidden} SDR duplicates hidden`);
    } catch (error) {
      console.warn('[FileImport] Live Photo/SDR detection failed (non-fatal):', error);
    }
  }

  /**
   * Get base filename without extension
   */
  private getBaseFilename(filename: string): string {
    const ext = path.extname(filename);
    return path.basename(filename, ext);
  }

  /**
   * Import a single file with transaction support
   * CRITICAL: Validates path, checks GPS mismatch, uses transaction
   * FIX 11: Location is now passed as parameter (pre-fetched in importFiles) to avoid SQLite deadlock
   */
  private async importSingleFile(
    file: ImportFileInput,
    deleteOriginal: boolean,
    trx: any, // Transaction context
    location: any // FIX 11: Pre-fetched location from importFiles() - do NOT fetch again inside transaction!
  ): Promise<ImportResult> {
    console.log('[FileImport] === Starting import for:', file.originalName, '===');

    // FIX 11: Location is now pre-fetched in importFiles() and passed as parameter
    // This prevents SQLite deadlock that occurred when fetching inside a transaction
    console.log('[FileImport] Using pre-fetched location:', location.locnam);

    // 1. Validate file path security
    console.log('[FileImport] Step 1: Validating file path...');
    const sanitizedName = PathValidator.sanitizeFilename(file.originalName);
    console.log('[FileImport] Step 1 complete, sanitized name:', sanitizedName);

    // 1b. Check for skipped extensions (e.g., .aae, .psd)
    const fileExt = path.extname(sanitizedName).toLowerCase();
    if (this.shouldSkipFile(fileExt)) {
      console.log('[FileImport] SKIPPING file with excluded extension:', fileExt, '-', file.originalName);
      return {
        success: true,
        hash: '',
        type: 'skipped',
        duplicate: false,
        skipped: true,
      };
    }

    // 1c. Check for XML sidecar - if found, import metadata only (no media file)
    const xmlSidecar = await this.findXmlSidecar(file.filePath);
    if (xmlSidecar) {
      console.log('[FileImport] XML sidecar detected for:', file.originalName, '- importing metadata only');
      const mediaType = this.getFileType(fileExt);
      return await this.importSidecarOnly(trx, file, xmlSidecar, mediaType);
    }

    // 2. Calculate SHA256 hash (only once)
    console.log('[FileImport] Step 2: Calculating SHA256 hash...');
    const hashStart = Date.now();
    const hash = await this.cryptoService.calculateSHA256(file.filePath);
    console.log('[FileImport] Step 2 complete in', Date.now() - hashStart, 'ms, hash:', hash.substring(0, 16) + '...');

    // 3. Determine file type (image -> video -> map -> document)
    // We accept ALL files - unknown extensions default to 'document'
    const ext = path.extname(sanitizedName).toLowerCase();
    const type = this.getFileType(ext);
    console.log('[FileImport] Step 3: File type determined:', type, 'extension:', ext);

    // 4. Check for duplicates
    console.log('[FileImport] Step 4: Checking for duplicates...');
    const dupStart = Date.now();
    const isDuplicate = await this.checkDuplicateInTransaction(trx, hash, type);
    console.log('[FileImport] Step 4 complete in', Date.now() - dupStart, 'ms, duplicate:', isDuplicate);

    if (isDuplicate) {
      console.log('[FileImport] File is duplicate, skipping:', file.originalName);
      return {
        success: true,
        hash,
        type,
        duplicate: true,
      };
    }

    // 5. Extract metadata
    let metadata: any = null;
    let gpsWarning: ImportResult['gpsWarning'] = undefined;
    // OPT-012: Track non-fatal warnings during import
    const warnings: string[] = [];

    console.log('[FileImport] Step 5: Extracting metadata for', file.originalName, 'type:', type);

    try {
      // FIX 3.1 & 3.2: Extract metadata from ALL file types using ExifTool
      // ExifTool works on images, videos (GPS from dashcams), documents (PDF metadata), and maps
      console.log('[FileImport] Calling ExifTool for', type, '...');
      const exifStart = Date.now();
      const exifData = await this.exifToolService.extractMetadata(file.filePath);
      console.log('[FileImport] ExifTool completed in', Date.now() - exifStart, 'ms');

      if (type === 'image') {
        metadata = exifData;
      } else if (type === 'video') {
        // For videos, also get FFmpeg data for duration, codec, etc.
        console.log('[FileImport] Calling FFmpeg for video details...');
        const ffmpegData = await this.ffmpegService.extractMetadata(file.filePath);
        console.log('[FileImport] FFmpeg completed');

        // Merge: FFmpeg data + GPS from ExifTool
        metadata = {
          ...ffmpegData,
          gps: exifData?.gps || null,
          rawExif: exifData?.rawExif || null,
        };
      } else if (type === 'map') {
        // FIX 3.4: Parse GPX/KML files for GPS data
        const ext = path.extname(file.filePath).toLowerCase();
        if (ext === '.gpx' || ext === '.kml' || ext === '.kmz') {
          console.log('[FileImport] Parsing GPX/KML file...');
          const mapData = await this.gpxKmlParser.parseFile(file.filePath);
          console.log('[FileImport] GPX/KML parsed:', this.gpxKmlParser.getSummary(mapData));

          metadata = {
            ...exifData,
            mapData,
            gps: mapData.centerPoint ? { lat: mapData.centerPoint.lat, lng: mapData.centerPoint.lng } : null,
          };
        } else {
          // Other map formats (GeoTIFF, etc.) - just use ExifTool
          metadata = exifData;
        }
      } else if (type === 'document') {
        // FIX 3.1: Store ExifTool metadata for documents
        metadata = exifData;
      }

      // Check GPS mismatch for types with GPS data (images, videos, and maps can have GPS)
      if (type === 'image' || type === 'video' || type === 'map') {
        const gps = metadata?.gps || exifData?.gps;
        if (gps && GPSValidator.isValidGPS(gps.lat, gps.lng)) {
          console.log('[FileImport] Step 5b: Checking GPS mismatch...');

          // DECISION-013: Always check GPS mismatch when both location and media have GPS
          // This allows users to see when media has better GPS data than the location
          if (location.gps?.lat && location.gps?.lng) {
            const mismatch = GPSValidator.checkGPSMismatch(
              { lat: location.gps.lat, lng: location.gps.lng },
              { lat: gps.lat, lng: gps.lng },
              10000 // 10km threshold
            );

            if (mismatch.mismatch && mismatch.distance) {
              gpsWarning = {
                message: `GPS coordinates differ by ${GPSValidator.formatDistance(mismatch.distance)}`,
                distance: mismatch.distance,
                severity: mismatch.severity as 'minor' | 'major',
                locationGPS: { lat: location.gps.lat, lng: location.gps.lng },
                mediaGPS: { lat: gps.lat, lng: gps.lng },
              };
            }
          }
          console.log('[FileImport] GPS check complete');

          // NOTE: Geocoding moved to Step 8 (after file copy) per spec: LOG IT → SERIALIZE IT → COPY & NAME IT → DUMP
          // GPS → Address is part of DUMP phase, not metadata extraction phase
        }
      }
    } catch (error) {
      // OPT-012: Track metadata extraction failure as warning
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn('[FileImport] Failed to extract metadata:', errorMsg);
      warnings.push(`Metadata extraction failed: ${errorMsg}`);
      // Continue without metadata
    }

    // Store GPS data for post-copy geocoding (Step 8)
    const gpsForGeocode = (type === 'image' || type === 'video' || type === 'map')
      ? (metadata?.gps || null)
      : null;

    // Kanye5/Kanye3: Step 5d - Extract preview for RAW files and generate multi-tier thumbnails
    let rawPreviewPath: string | null = null;
    let thumbPathSm: string | null = null;
    let thumbPathLg: string | null = null;
    let previewPath: string | null = null;

    if (type === 'image') {
      // Extract embedded JPEG preview from RAW files
      if (this.previewExtractorService.isRawFormat(file.filePath)) {
        console.log('[FileImport] Step 5d: Extracting RAW preview...');
        const previewStart = Date.now();
        try {
          rawPreviewPath = await this.previewExtractorService.extractPreview(file.filePath, hash);
          if (rawPreviewPath) {
            console.log('[FileImport] Preview extracted in', Date.now() - previewStart, 'ms:', rawPreviewPath);
          } else {
            console.log('[FileImport] No embedded preview found (will use original for viewing)');
          }
        } catch (previewError) {
          // OPT-012: Track preview extraction failure as warning
          const errMsg = previewError instanceof Error ? previewError.message : String(previewError);
          console.warn('[FileImport] Preview extraction failed:', errMsg);
          warnings.push(`RAW preview extraction failed: ${errMsg}`);
        }
      }

      // Kanye3: Generate multi-tier thumbnails (400px, 800px, 1920px)
      console.log('[FileImport] Step 5e: Generating multi-tier thumbnails (Premium Archive)...');
      const thumbStart = Date.now();
      try {
        const sourceForThumb = rawPreviewPath || file.filePath;
        const thumbnails = await this.thumbnailService.generateAllSizes(sourceForThumb, hash);
        thumbPathSm = thumbnails.thumb_sm;
        thumbPathLg = thumbnails.thumb_lg;
        previewPath = thumbnails.preview;
        console.log('[FileImport] Multi-tier thumbnails generated in', Date.now() - thumbStart, 'ms');
        console.log(`  - thumb_sm (400px): ${thumbPathSm ? 'OK' : 'NULL'}`);
        console.log(`  - thumb_lg (800px): ${thumbPathLg ? 'OK' : 'NULL'}`);
        console.log(`  - preview (1920px): ${previewPath ? 'OK' : 'NULL'}`);
      } catch (thumbError) {
        // OPT-012: Track thumbnail generation failure as warning
        const errMsg = thumbError instanceof Error ? thumbError.message : String(thumbError);
        console.warn('[FileImport] Multi-tier thumbnail generation failed:', errMsg);
        warnings.push(`Thumbnail generation failed: ${errMsg}`);
      }
    } else if (type === 'video') {
      // Generate poster frame for videos, then generate multi-tier from poster
      console.log('[FileImport] Step 5d: Generating video poster frame...');
      const posterStart = Date.now();
      try {
        const posterPath = await this.posterFrameService.generatePoster(file.filePath, hash);
        if (posterPath) {
          console.log('[FileImport] Poster frame generated in', Date.now() - posterStart, 'ms:', posterPath);
          // Generate multi-tier thumbnails from poster frame
          const thumbnails = await this.thumbnailService.generateAllSizes(posterPath, hash);
          thumbPathSm = thumbnails.thumb_sm;
          thumbPathLg = thumbnails.thumb_lg;
          previewPath = thumbnails.preview;
        }
      } catch (posterError) {
        // OPT-012: Track poster frame generation failure as warning
        const errMsg = posterError instanceof Error ? posterError.message : String(posterError);
        console.warn('[FileImport] Poster frame generation failed:', errMsg);
        warnings.push(`Video poster frame generation failed: ${errMsg}`);
      }
    } else if (type === 'map') {
      // Maps can have thumbnails too (for image-based maps like scans)
      const isImageMap = /\.(jpg|jpeg|png|gif|webp|tiff?)$/i.test(file.filePath);
      if (isImageMap) {
        console.log('[FileImport] Step 5d: Generating map thumbnails...');
        try {
          const thumbnails = await this.thumbnailService.generateAllSizes(file.filePath, hash);
          thumbPathSm = thumbnails.thumb_sm;
          thumbPathLg = thumbnails.thumb_lg;
          previewPath = thumbnails.preview;
        } catch (thumbError) {
          // OPT-012: Track map thumbnail generation failure as warning
          const errMsg = thumbError instanceof Error ? thumbError.message : String(thumbError);
          console.warn('[FileImport] Map thumbnail generation failed:', errMsg);
          warnings.push(`Map thumbnail generation failed: ${errMsg}`);
        }
      }
    }

    // 6. Organize file to archive (validate path)
    // Pass pre-fetched location to avoid another DB call inside transaction
    console.log('[FileImport] Step 6: Organizing file to archive...');
    const organizeStart = Date.now();
    const archivePath = await this.organizeFileWithLocation(file, hash, ext, type, location);
    console.log('[FileImport] Step 6 complete in', Date.now() - organizeStart, 'ms, path:', archivePath);

    // 7. Insert record in database using transaction
    console.log('[FileImport] Step 7: Inserting database record...');
    const insertStart = Date.now();
    await this.insertMediaRecordInTransaction(
      trx,
      file,
      hash,
      type,
      archivePath,
      sanitizedName,
      metadata,
      // Kanye3: Multi-tier thumbnail paths
      thumbPathSm,
      thumbPathLg,
      previewPath,
      rawPreviewPath  // For RAW files
    );
    console.log('[FileImport] Step 7 complete in', Date.now() - insertStart, 'ms');

    // FIX-PROGRESS: Steps 8a-8b (GPS enrichment, geocoding) moved to importFiles()
    // These run AFTER progress fires so UI updates immediately on DB insert
    // See docs/workflows/import.md: "Background job for metadata extraction (doesn't block)"

    // 9. Delete original if requested (after DB success, before progress reports)
    if (deleteOriginal) {
      console.log('[FileImport] Step 9: Deleting original file...');
      try {
        await fs.unlink(file.filePath);
        console.log('[FileImport] Step 9 complete - original deleted');
      } catch (error) {
        console.warn('[FileImport] Failed to delete original file:', error);
        // Don't fail import if deletion fails
      }
    }

    console.log('[FileImport] File import COMPLETE:', file.originalName);
    return {
      success: true,
      hash,
      type,
      duplicate: false,
      archivePath,
      gpsWarning,
      // OPT-012: Include warnings in result (only if non-empty)
      warnings: warnings.length > 0 ? warnings : undefined,
      // FIX-PROGRESS: Return GPS data for post-import enrichment (Steps 8a-8b)
      // Processed outside transaction after progress fires
      _gpsForEnrichment: gpsForGeocode,
      _locid: file.locid,
    };
  }

  /**
   * FIX-PROGRESS: Run Steps 8a-8b as fire-and-forget post-import enrichment
   * These are non-blocking enrichments that run after progress fires.
   * Per docs/workflows/import.md: "Background job for metadata extraction (doesn't block)"
   */
  private async runPostImportEnrichment(
    locid: string,
    gps: { lat: number; lng: number },
    location: any
  ): Promise<void> {
    // Step 8a: Auto-populate location GPS from first media with GPS
    // If location has no GPS but media has GPS, transfer it to location
    if (!location.gps?.lat || !location.gps?.lng) {
      console.log('[FileImport] Step 8a (background): Auto-populating location GPS from media EXIF...');
      try {
        await this.db
          .updateTable('locs')
          .set({
            gps_lat: gps.lat,
            gps_lng: gps.lng,
            gps_source: 'media_gps',
          })
          .where('locid', '=', locid)
          .execute();
        console.log('[FileImport] Location GPS auto-populated from media EXIF:', gps);
        // DECISION-018: Recalculate region fields after GPS update
        await this.recalculateRegionsForLocation(locid, gps);
        // Update location cache so subsequent files don't re-run this
        location.gps = { lat: gps.lat, lng: gps.lng };
      } catch (dbError) {
        const errMsg = dbError instanceof Error ? dbError.message : String(dbError);
        console.warn('[FileImport] Failed to auto-populate location GPS:', errMsg);
      }
    }

    // Step 8b: Non-blocking geocoding (DUMP phase per spec: GPS → Address)
    // Only trigger if: geocodingService exists, location has no address
    if (this.geocodingService && !location.address_street && !location.address_city) {
      console.log('[FileImport] Step 8b (background): Running reverse geocode...');
      try {
        const geocodeResult = await this.geocodingService.reverseGeocode(gps.lat, gps.lng);
        if (geocodeResult && geocodeResult.address) {
          await this.db
            .updateTable('locs')
            .set({
              address_street: geocodeResult.address.street || null,
              address_city: geocodeResult.address.city || null,
              address_county: geocodeResult.address.county || null,
              address_state: geocodeResult.address.stateCode || geocodeResult.address.state || null,
              address_zipcode: geocodeResult.address.zipcode || null,
              address_geocoded_at: new Date().toISOString(),
            })
            .where('locid', '=', locid)
            .execute();
          console.log('[FileImport] Location address updated from media GPS');
          // DECISION-018: Recalculate region fields after address update
          await this.recalculateRegionsForLocation(locid, gps);
          // Update location cache
          location.address_street = geocodeResult.address.street;
          location.address_city = geocodeResult.address.city;
        }
      } catch (geocodeError) {
        const errMsg = geocodeError instanceof Error ? geocodeError.message : String(geocodeError);
        console.warn('[FileImport] Reverse geocoding failed:', errMsg);
      }
    }
  }

  /**
   * Check if file should be skipped entirely during import
   * Skipped files: .aae (Apple photo adjustments), .psd/.psb (Photoshop projects)
   */
  private shouldSkipFile(ext: string): boolean {
    return this.SKIP_EXTENSIONS.includes(ext);
  }

  /**
   * Check if a media file has a matching XML sidecar
   * Looks for: filename.xml or filename.jpg.xml patterns
   */
  private async findXmlSidecar(filePath: string): Promise<string | null> {
    const dir = path.dirname(filePath);
    const filename = path.basename(filePath);
    const filenameNoExt = path.basename(filePath, path.extname(filePath));

    // Try different XML sidecar naming conventions
    const possiblePaths = [
      path.join(dir, `${filenameNoExt}.xml`),     // IMG_1234.xml for IMG_1234.jpg
      path.join(dir, `${filename}.xml`),           // IMG_1234.jpg.xml
    ];

    for (const xmlPath of possiblePaths) {
      try {
        await fs.access(xmlPath);
        console.log('[FileImport] Found XML sidecar:', xmlPath);
        return xmlPath;
      } catch {
        // File doesn't exist, try next
      }
    }

    return null;
  }

  /**
   * Import a sidecar record (metadata only, no media file copied)
   * Stores the XML content and parsed metadata in sidecar_imports table
   */
  private async importSidecarOnly(
    trx: any,
    file: ImportFileInput,
    xmlPath: string,
    mediaType: string
  ): Promise<ImportResult> {
    const sidecarId = randomUUID();
    const timestamp = new Date().toISOString();

    // Read XML content
    let xmlContent: string | null = null;
    let parsedMetadata: string | null = null;

    try {
      xmlContent = await fs.readFile(xmlPath, 'utf-8');
      // Basic XML to JSON conversion (user can parse specific format later)
      parsedMetadata = JSON.stringify({
        _note: 'Raw XML imported. Parse according to your specific XML format.',
        _xmlLength: xmlContent.length,
        _importedAt: timestamp,
      });
    } catch (err) {
      console.warn('[FileImport] Failed to read XML sidecar:', err);
    }

    // Insert into sidecar_imports table
    await trx
      .insertInto('sidecar_imports')
      .values({
        sidecar_id: sidecarId,
        original_filename: file.originalName,
        original_path: file.filePath,
        xml_filename: path.basename(xmlPath),
        xml_path: xmlPath,
        xml_content: xmlContent,
        parsed_metadata: parsedMetadata,
        media_type: mediaType,
        import_date: timestamp,
        imported_by: file.imported_by || file.auth_imp || null,
        imported_by_id: file.imported_by_id || null,
        locid: file.locid,
        subid: file.subid || null,
      })
      .execute();

    console.log('[FileImport] Sidecar import complete:', file.originalName, '-> XML metadata stored');

    return {
      success: true,
      hash: sidecarId,  // Use sidecar ID as "hash" for tracking
      type: 'sidecar',
      duplicate: false,
      sidecarOnly: true,
    };
  }

  /**
   * Determine file type from extension
   * Logic: image -> video -> map -> default to document
   * We accept ALL files - if it's not image/video/map, catalog it as a document
   */
  private getFileType(ext: string): 'image' | 'video' | 'map' | 'document' {
    if (this.IMAGE_EXTENSIONS.includes(ext)) return 'image';
    if (this.VIDEO_EXTENSIONS.includes(ext)) return 'video';
    if (this.MAP_EXTENSIONS.includes(ext)) return 'map';
    // Default to document - we accept and catalog everything
    return 'document';
  }

  /**
   * Check if file is a duplicate within transaction
   */
  private async checkDuplicateInTransaction(
    trx: any,
    hash: string,
    type: 'image' | 'video' | 'map' | 'document'
  ): Promise<boolean> {
    if (type === 'image') {
      const result = await trx
        .selectFrom('imgs')
        .select('imgsha')
        .where('imgsha', '=', hash)
        .executeTakeFirst();
      return !!result;
    } else if (type === 'video') {
      const result = await trx
        .selectFrom('vids')
        .select('vidsha')
        .where('vidsha', '=', hash)
        .executeTakeFirst();
      return !!result;
    } else if (type === 'map') {
      const result = await trx
        .selectFrom('maps')
        .select('mapsha')
        .where('mapsha', '=', hash)
        .executeTakeFirst();
      return !!result;
    } else if (type === 'document') {
      const result = await trx
        .selectFrom('docs')
        .select('docsha')
        .where('docsha', '=', hash)
        .executeTakeFirst();
      return !!result;
    }
    return false;
  }

  /**
   * Organize file to archive folder with path validation
   * Archive structure per spec: [archivePath]/locations/[STATE]-[TYPE]/[SLOCNAM]-[LOC12]/org-[type]-[LOC12]/[SHA256].[ext]
   *
   * IMPORTANT: This version accepts pre-fetched location to avoid DB calls inside transaction
   */
  private async organizeFileWithLocation(
    file: ImportFileInput,
    hash: string,
    ext: string,
    type: 'image' | 'video' | 'map' | 'document',
    location: any // Pre-fetched location from Step 0
  ): Promise<string> {
    console.log('[organizeFile] Starting for:', file.originalName);
    console.log('[organizeFile] Using pre-fetched location:', location.locnam);

    // Build spec-compliant folder structure
    // [STATE]-[TYPE] folder (use "XX" for unknown state, "Unknown" for unknown type)
    const state = location.address?.state?.toUpperCase() || 'XX';
    const locType = location.type || 'Unknown';
    const stateTypeFolder = `${state}-${this.sanitizeFolderName(locType)}`;

    // [SLOCNAM]-[LOC12] folder
    const slocnam = location.slocnam || LocationEntity.generateShortName(location.locnam);
    const loc12 = location.loc12;
    const locationFolder = `${this.sanitizeFolderName(slocnam)}-${loc12}`;

    // org-[type]-[LOC12] folder
    const typePrefixMap: Record<string, string> = { image: 'img', video: 'vid', map: 'map', document: 'doc' };
    const typePrefix = typePrefixMap[type] || 'doc';
    const mediaFolder = `org-${typePrefix}-${loc12}`;

    // Build full path
    const targetDir = path.join(
      this.archivePath,
      'locations',
      stateTypeFolder,
      locationFolder,
      mediaFolder
    );
    const targetPath = path.join(targetDir, `${hash}${ext}`);
    console.log('[organizeFile] Target path:', targetPath);

    // CRITICAL: Validate target path doesn't escape archive
    if (!PathValidator.validateArchivePath(targetPath, this.archivePath)) {
      throw new Error(`Security: Target path escapes archive directory: ${targetPath}`);
    }
    console.log('[organizeFile] Path validated');

    // Ensure directory exists
    console.log('[organizeFile] Creating directory:', targetDir);
    await fs.mkdir(targetDir, { recursive: true });
    console.log('[organizeFile] Directory created');

    // Copy file
    console.log('[organizeFile] Copying file (this may take a while for large files)...');
    const copyStart = Date.now();
    await fs.copyFile(file.filePath, targetPath);
    console.log('[organizeFile] File copied in', Date.now() - copyStart, 'ms');

    // Verify integrity after copy
    console.log('[organizeFile] Verifying integrity...');
    const verifyStart = Date.now();
    const verifyHash = await this.cryptoService.calculateSHA256(targetPath);
    console.log('[organizeFile] Verification complete in', Date.now() - verifyStart, 'ms');

    if (verifyHash !== hash) {
      // Delete corrupted file
      await fs.unlink(targetPath).catch(() => {});
      throw new Error(`Integrity check failed: file corrupted during copy`);
    }

    console.log('[organizeFile] COMPLETE for:', file.originalName);
    return targetPath;
  }

  /**
   * Sanitize folder name - remove unsafe characters
   */
  private sanitizeFolderName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50); // Limit length
  }


  /**
   * Insert media record in database within transaction
   * Kanye3: Multi-tier thumbnails (400px, 800px, 1920px)
   */
  private async insertMediaRecordInTransaction(
    trx: any,
    file: ImportFileInput,
    hash: string,
    type: 'image' | 'video' | 'map' | 'document',
    archivePath: string,
    originalName: string,
    metadata: any,
    thumbPathSm: string | null = null,
    thumbPathLg: string | null = null,
    previewPath: string | null = null,
    rawPreviewPath: string | null = null
  ): Promise<void> {
    const timestamp = new Date().toISOString();

    if (type === 'image') {
      await trx
        .insertInto('imgs')
        .values({
          imgsha: hash,
          imgnam: path.basename(archivePath),
          imgnamo: originalName,
          imgloc: archivePath,
          imgloco: file.filePath,
          locid: file.locid,
          subid: file.subid || null,
          auth_imp: file.auth_imp,
          imgadd: timestamp,
          meta_exiftool: metadata?.rawExif || null,
          meta_width: metadata?.width || null,
          meta_height: metadata?.height || null,
          meta_date_taken: metadata?.dateTaken || null,
          meta_camera_make: metadata?.cameraMake || null,
          meta_camera_model: metadata?.cameraModel || null,
          meta_gps_lat: metadata?.gps?.lat || null,
          meta_gps_lng: metadata?.gps?.lng || null,
          // Kanye3: Multi-tier thumbnail paths
          thumb_path_sm: thumbPathSm,
          thumb_path_lg: thumbPathLg,
          // For RAW files, use extracted preview (full resolution); otherwise use generated thumbnail
          preview_path: rawPreviewPath || previewPath,
          // FIX: Set preview_extracted flag when preview exists
          preview_extracted: (rawPreviewPath || previewPath) ? 1 : 0,
          // Legacy column for backwards compatibility
          thumb_path: thumbPathSm,
          // Migration 25: Activity tracking
          imported_by_id: file.imported_by_id || null,
          imported_by: file.imported_by || null,
          media_source: file.media_source || null,
          // Migration 26: Contributor tracking
          is_contributed: file.is_contributed ?? 0,
          contribution_source: file.contribution_source || null,
        })
        .execute();
    } else if (type === 'video') {
      await trx
        .insertInto('vids')
        .values({
          vidsha: hash,
          vidnam: path.basename(archivePath),
          vidnamo: originalName,
          vidloc: archivePath,
          vidloco: file.filePath,
          locid: file.locid,
          subid: file.subid || null,
          auth_imp: file.auth_imp,
          vidadd: timestamp,
          meta_ffmpeg: metadata?.rawMetadata || null,
          // FIX 3.2: Store ExifTool data and GPS from videos
          meta_exiftool: metadata?.rawExif || null,
          meta_duration: metadata?.duration || null,
          meta_width: metadata?.width || null,
          meta_height: metadata?.height || null,
          meta_codec: metadata?.codec || null,
          meta_fps: metadata?.fps || null,
          meta_date_taken: metadata?.dateTaken || null,
          // FIX 3.2: Store GPS extracted from video metadata
          meta_gps_lat: metadata?.gps?.lat || null,
          meta_gps_lng: metadata?.gps?.lng || null,
          // Kanye3: Multi-tier thumbnail paths
          thumb_path_sm: thumbPathSm,
          thumb_path_lg: thumbPathLg,
          preview_path: previewPath,
          // Legacy column for backwards compatibility
          thumb_path: thumbPathSm,
          // Migration 25: Activity tracking
          imported_by_id: file.imported_by_id || null,
          imported_by: file.imported_by || null,
          media_source: file.media_source || null,
          // Migration 26: Contributor tracking
          is_contributed: file.is_contributed ?? 0,
          contribution_source: file.contribution_source || null,
        })
        .execute();
    } else if (type === 'map') {
      // FIX 3.4: Store parsed GPX/KML data in meta_map
      const mapDataJson = metadata?.mapData ? JSON.stringify(metadata.mapData) : null;

      await trx
        .insertInto('maps')
        .values({
          mapsha: hash,
          mapnam: path.basename(archivePath),
          mapnamo: originalName,
          maploc: archivePath,
          maploco: file.filePath,
          locid: file.locid,
          subid: file.subid || null,
          auth_imp: file.auth_imp,
          mapadd: timestamp,
          meta_exiftool: metadata?.rawExif || null,
          // FIX 3.4: Store parsed GPX/KML data
          meta_map: mapDataJson,
          // Store GPS center point for map files
          meta_gps_lat: metadata?.mapData?.centerPoint?.lat || metadata?.gps?.lat || null,
          meta_gps_lng: metadata?.mapData?.centerPoint?.lng || metadata?.gps?.lng || null,
          reference: null,
          map_states: null,
          map_verified: 0,
          // Kanye3: Multi-tier thumbnail paths (for image-based maps)
          thumb_path_sm: thumbPathSm,
          thumb_path_lg: thumbPathLg,
          preview_path: previewPath,
          // Migration 25: Activity tracking
          imported_by_id: file.imported_by_id || null,
          imported_by: file.imported_by || null,
          media_source: file.media_source || null,
        })
        .execute();
    } else if (type === 'document') {
      // FIX 3.1: Store ExifTool metadata for documents
      await trx
        .insertInto('docs')
        .values({
          docsha: hash,
          docnam: path.basename(archivePath),
          docnamo: originalName,
          docloc: archivePath,
          docloco: file.filePath,
          locid: file.locid,
          subid: file.subid || null,
          auth_imp: file.auth_imp,
          docadd: timestamp,
          meta_exiftool: metadata?.rawExif || null,
          meta_page_count: null, // ExifTool doesn't provide this consistently
          meta_author: null,     // Could extract from exif if available
          meta_title: null,      // Could extract from exif if available
          // Migration 25: Activity tracking
          imported_by_id: file.imported_by_id || null,
          imported_by: file.imported_by || null,
          media_source: file.media_source || null,
        })
        .execute();
    }
  }

  /**
   * Create import record within transaction
   */
  private async createImportRecordInTransaction(
    trx: any,
    input: {
      locid: string | null;
      auth_imp: string | null;
      img_count: number;
      vid_count: number;
      map_count: number;
      doc_count: number;
      notes: string;
    }
  ): Promise<string> {
    const importId = randomUUID();
    const importDate = new Date().toISOString();

    await trx
      .insertInto('imports')
      .values({
        import_id: importId,
        locid: input.locid,
        import_date: importDate,
        auth_imp: input.auth_imp,
        img_count: input.img_count,
        vid_count: input.vid_count,
        doc_count: input.doc_count,
        map_count: input.map_count,
        notes: input.notes,
      })
      .execute();

    return importId;
  }

  /**
   * DECISION-018: Recalculate region fields after GPS/address update
   * Called after fire-and-forget GPS or address updates to ensure region fields are populated
   */
  private async recalculateRegionsForLocation(
    locid: string,
    gps: { lat: number; lng: number }
  ): Promise<void> {
    try {
      // Get current location data for region calculation
      const location = await this.db
        .selectFrom('locs')
        .select(['address_state', 'address_county', 'cultural_region', 'country_cultural_region'])
        .where('locid', '=', locid)
        .executeTakeFirst();

      if (!location) {
        console.warn('[FileImport] Cannot recalculate regions - location not found:', locid);
        return;
      }

      // Calculate region fields using the shared region service
      const regionFields = calculateRegionFields({
        state: location.address_state,
        county: location.address_county,
        lat: gps.lat,
        lng: gps.lng,
        existingCulturalRegion: location.cultural_region,
        existingCountryCulturalRegion: location.country_cultural_region,
      });

      // Update region fields in database
      await this.db
        .updateTable('locs')
        .set({
          census_region: regionFields.censusRegion,
          census_division: regionFields.censusDivision,
          state_direction: regionFields.stateDirection,
          // Only update cultural regions if we got a value AND no existing value
          cultural_region: regionFields.culturalRegion ?? location.cultural_region,
          country_cultural_region: regionFields.countryCulturalRegion ?? location.country_cultural_region,
        })
        .where('locid', '=', locid)
        .execute();

      console.log('[FileImport] Region fields recalculated for location:', locid, {
        censusRegion: regionFields.censusRegion,
        stateDirection: regionFields.stateDirection,
        culturalRegion: regionFields.culturalRegion,
        countryCulturalRegion: regionFields.countryCulturalRegion,
      });
    } catch (error) {
      console.warn('[FileImport] Failed to recalculate regions:', error);
      // Non-fatal - don't fail the import
    }
  }
}

// Import randomUUID for transaction helper
import { randomUUID } from 'crypto';
