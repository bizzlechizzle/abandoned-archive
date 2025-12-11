/**
 * Web Source Orchestrator Service
 * OPT-109: Coordinates the complete web archiving pipeline
 *
 * This service orchestrates:
 * - Page capture (Screenshot, PDF, HTML, WARC)
 * - Content extraction (Images, Videos, Text)
 * - Metadata extraction
 * - Repository updates
 * - Provenance hash generation
 * - Media linking to locations
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { Kysely } from 'kysely';
import type { Database } from '../main/database.types';
import {
  SQLiteWebSourcesRepository,
  WebSource,
  WebSourceInput,
  ComponentStatus,
} from '../repositories/sqlite-websources-repository';
import {
  captureScreenshot,
  capturePdf,
  captureHtml,
  captureWarc,
  captureAll,
  extractMetadata,
  CaptureOptions,
  closeBrowser,
} from './websource-capture-service';
import {
  extractImages,
  extractVideos,
  extractText,
  extractAll,
  ExtractionOptions,
  ExtractedImage,
  ExtractedVideo,
} from './websource-extraction-service';
import { calculateHash, calculateHashBuffer } from './crypto-service';

// =============================================================================
// Types and Interfaces
// =============================================================================

export interface ArchiveProgress {
  sourceId: string;
  url: string;
  phase: 'metadata' | 'capture' | 'extraction' | 'linking' | 'complete' | 'error';
  component?: string;
  progress: number; // 0-100
  message: string;
}

export interface ArchiveResult {
  success: boolean;
  sourceId: string;
  url: string;
  archivePath: string | null;
  screenshotPath: string | null;
  pdfPath: string | null;
  htmlPath: string | null;
  warcPath: string | null;
  extractedImages: number;
  extractedVideos: number;
  wordCount: number;
  error?: string;
  duration: number;
}

export interface ArchiveOptions {
  captureScreenshot?: boolean;
  capturePdf?: boolean;
  captureHtml?: boolean;
  captureWarc?: boolean;
  extractImages?: boolean;
  extractVideos?: boolean;
  extractText?: boolean;
  linkMedia?: boolean; // Link extracted media to location
  timeout?: number;
  maxImages?: number;
  maxVideos?: number;
}

const DEFAULT_OPTIONS: ArchiveOptions = {
  captureScreenshot: true,
  capturePdf: true,
  captureHtml: true,
  captureWarc: true,
  extractImages: true,
  extractVideos: true, // OPT-110: Always extract videos per user requirement
  extractText: true,
  linkMedia: true,
  timeout: 60000,
  maxImages: 50,
  maxVideos: 10, // OPT-110: Increased from 3 to allow more video extraction
};

// =============================================================================
// Orchestrator Class
// =============================================================================

export class WebSourceOrchestrator extends EventEmitter {
  private repository: SQLiteWebSourcesRepository;
  private archiveBasePath: string | null = null;
  private isProcessing = false;
  private currentSourceId: string | null = null;

  constructor(private readonly db: Kysely<Database>) {
    super();
    this.repository = new SQLiteWebSourcesRepository(db);
  }

  // ===========================================================================
  // Public Methods
  // ===========================================================================

  /**
   * Add a new URL to be archived
   */
  async addSource(input: WebSourceInput): Promise<WebSource> {
    return this.repository.create(input);
  }

  /**
   * Archive a single web source
   */
  async archiveSource(
    sourceId: string,
    options: ArchiveOptions = {}
  ): Promise<ArchiveResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const startTime = Date.now();

    try {
      // Get source from repository
      const source = await this.repository.findById(sourceId);
      if (!source) {
        throw new Error(`Web source not found: ${sourceId}`);
      }

      // Mark as archiving
      await this.repository.markArchiving(sourceId);
      this.currentSourceId = sourceId;
      this.isProcessing = true;

      // Get archive base path
      const archivePath = await this.getArchivePath(source);
      await fs.promises.mkdir(archivePath, { recursive: true });

      // Initialize component status
      const componentStatus: ComponentStatus = {};

      // Phase 1: Extract metadata
      this.emitProgress(sourceId, source.url, 'metadata', undefined, 10, 'Extracting metadata...');
      const metadata = await extractMetadata(source.url, opts.timeout);

      // Phase 2: Capture page in various formats
      let screenshotPath: string | null = null;
      let pdfPath: string | null = null;
      let htmlPath: string | null = null;
      let warcPath: string | null = null;
      let screenshotHash: string | null = null;
      let pdfHash: string | null = null;
      let htmlHash: string | null = null;
      let warcHash: string | null = null;

      const captureOptions: CaptureOptions = {
        url: source.url,
        outputDir: archivePath,
        sourceId,
        timeout: opts.timeout,
      };

      // Screenshot capture
      if (opts.captureScreenshot) {
        this.emitProgress(sourceId, source.url, 'capture', 'screenshot', 20, 'Capturing screenshot...');
        const result = await captureScreenshot(captureOptions);
        if (result.success) {
          screenshotPath = result.path || null;
          screenshotHash = result.hash || null;
          componentStatus.screenshot = 'done';
        } else {
          componentStatus.screenshot = 'failed';
        }
      } else {
        componentStatus.screenshot = 'skipped';
      }

      // PDF capture
      if (opts.capturePdf) {
        this.emitProgress(sourceId, source.url, 'capture', 'pdf', 30, 'Generating PDF...');
        const result = await capturePdf(captureOptions);
        if (result.success) {
          pdfPath = result.path || null;
          pdfHash = result.hash || null;
          componentStatus.pdf = 'done';
        } else {
          componentStatus.pdf = 'failed';
        }
      } else {
        componentStatus.pdf = 'skipped';
      }

      // HTML capture
      if (opts.captureHtml) {
        this.emitProgress(sourceId, source.url, 'capture', 'html', 40, 'Saving HTML...');
        const result = await captureHtml(captureOptions);
        if (result.success) {
          htmlPath = result.path || null;
          htmlHash = result.hash || null;
          componentStatus.html = 'done';
        } else {
          componentStatus.html = 'failed';
        }
      } else {
        componentStatus.html = 'skipped';
      }

      // WARC capture
      if (opts.captureWarc) {
        this.emitProgress(sourceId, source.url, 'capture', 'warc', 50, 'Creating WARC archive...');
        const result = await captureWarc(captureOptions);
        if (result.success) {
          warcPath = result.path || null;
          warcHash = result.hash || null;
          componentStatus.warc = 'done';
        } else {
          componentStatus.warc = 'failed';
        }
      } else {
        componentStatus.warc = 'skipped';
      }

      // Phase 3: Extract content
      const extractionOptions: ExtractionOptions = {
        url: source.url,
        outputDir: archivePath,
        sourceId,
        locid: source.locid || undefined,
        timeout: opts.timeout,
        maxImages: opts.maxImages,
        maxVideos: opts.maxVideos,
      };

      let extractedImages: ExtractedImage[] = [];
      let extractedVideos: ExtractedVideo[] = [];
      let wordCount = metadata.wordCount;
      let contentHash: string | null = null;
      let extractedTextContent: string | null = null; // OPT-110: Capture text for FTS5

      // Image extraction
      if (opts.extractImages) {
        this.emitProgress(sourceId, source.url, 'extraction', 'images', 60, 'Extracting images...');
        const result = await extractImages(extractionOptions);
        if (result.success) {
          extractedImages = result.images;
          componentStatus.images = 'done';
        } else {
          componentStatus.images = 'failed';
        }
      } else {
        componentStatus.images = 'skipped';
      }

      // Video extraction
      if (opts.extractVideos) {
        this.emitProgress(sourceId, source.url, 'extraction', 'videos', 70, 'Extracting videos...');
        const result = await extractVideos(extractionOptions);
        if (result.success) {
          extractedVideos = result.videos;
          componentStatus.videos = 'done';
        } else {
          componentStatus.videos = 'failed';
        }
      } else {
        componentStatus.videos = 'skipped';
      }

      // Text extraction
      if (opts.extractText) {
        this.emitProgress(sourceId, source.url, 'extraction', 'text', 80, 'Extracting text content...');
        const result = await extractText(extractionOptions);
        if (result.success && result.text) {
          wordCount = result.text.wordCount;
          contentHash = result.text.hash;
          extractedTextContent = result.text.content; // OPT-110: Capture text for FTS5 storage
          componentStatus.text = 'done';
        } else {
          componentStatus.text = 'failed';
        }
      } else {
        componentStatus.text = 'skipped';
      }

      // Phase 4: Link extracted media to location
      if (opts.linkMedia && source.locid && extractedImages.length > 0) {
        this.emitProgress(sourceId, source.url, 'linking', undefined, 90, 'Linking media to location...');
        await this.linkExtractedMedia(source.locid, source.subid, sourceId, extractedImages, extractedVideos);
      }

      // Calculate provenance hash (hash of all component hashes)
      const provenanceHash = this.calculateProvenanceHash({
        screenshotHash,
        pdfHash,
        htmlHash,
        warcHash,
        contentHash,
      });

      // Determine final status
      const hasAnySuccess =
        componentStatus.screenshot === 'done' ||
        componentStatus.pdf === 'done' ||
        componentStatus.html === 'done' ||
        componentStatus.warc === 'done' ||
        componentStatus.text === 'done';

      const hasAnyFailure =
        componentStatus.screenshot === 'failed' ||
        componentStatus.pdf === 'failed' ||
        componentStatus.html === 'failed' ||
        componentStatus.warc === 'failed' ||
        componentStatus.text === 'failed';

      if (hasAnySuccess && hasAnyFailure) {
        // Partial success - OPT-109 Fix: pass all successful component data
        // OPT-110: Now includes extracted_text for FTS5 search
        await this.repository.markPartial(sourceId, componentStatus, {
          archive_path: archivePath,
          screenshot_path: screenshotPath,
          pdf_path: pdfPath,
          html_path: htmlPath,
          warc_path: warcPath,
          screenshot_hash: screenshotHash,
          pdf_hash: pdfHash,
          html_hash: htmlHash,
          warc_hash: warcHash,
          content_hash: contentHash,
          provenance_hash: provenanceHash,
          extracted_title: metadata.title,
          extracted_author: metadata.author,
          extracted_date: metadata.date,
          extracted_publisher: metadata.publisher,
          extracted_text: extractedTextContent, // OPT-110: Store text for FTS5
          word_count: wordCount,
          image_count: extractedImages.length,
          video_count: extractedVideos.length,
        });
      } else if (hasAnySuccess) {
        // Complete success
        // OPT-110: Now includes extracted_text for FTS5 search
        await this.repository.markComplete(sourceId, {
          archive_path: archivePath,
          screenshot_path: screenshotPath,
          pdf_path: pdfPath,
          html_path: htmlPath,
          warc_path: warcPath,
          screenshot_hash: screenshotHash,
          pdf_hash: pdfHash,
          html_hash: htmlHash,
          warc_hash: warcHash,
          content_hash: contentHash,
          provenance_hash: provenanceHash,
          extracted_title: metadata.title,
          extracted_author: metadata.author,
          extracted_date: metadata.date,
          extracted_publisher: metadata.publisher,
          extracted_text: extractedTextContent, // OPT-110: Store text for FTS5
          word_count: wordCount,
          image_count: extractedImages.length,
          video_count: extractedVideos.length,
        });
      } else {
        // All failed
        await this.repository.markFailed(sourceId, 'All capture methods failed');
      }

      // Create version snapshot
      await this.repository.createVersion(sourceId, {
        archive_path: archivePath,
        screenshot_path: screenshotPath,
        pdf_path: pdfPath,
        html_path: htmlPath,
        warc_path: warcPath,
        screenshot_hash: screenshotHash,
        pdf_hash: pdfHash,
        html_hash: htmlHash,
        warc_hash: warcHash,
        content_hash: contentHash,
        word_count: wordCount,
        image_count: extractedImages.length,
        video_count: extractedVideos.length,
      });

      this.emitProgress(sourceId, source.url, 'complete', undefined, 100, 'Archive complete');

      return {
        success: true,
        sourceId,
        url: source.url,
        archivePath,
        screenshotPath,
        pdfPath,
        htmlPath,
        warcPath,
        extractedImages: extractedImages.length,
        extractedVideos: extractedVideos.length,
        wordCount,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.repository.markFailed(sourceId, errorMessage);
      this.emitProgress(sourceId, '', 'error', undefined, 0, errorMessage);

      return {
        success: false,
        sourceId,
        url: '',
        archivePath: null,
        screenshotPath: null,
        pdfPath: null,
        htmlPath: null,
        warcPath: null,
        extractedImages: 0,
        extractedVideos: 0,
        wordCount: 0,
        error: errorMessage,
        duration: Date.now() - startTime,
      };
    } finally {
      this.currentSourceId = null;
      this.isProcessing = false;
    }
  }

  /**
   * Archive all pending sources
   */
  async archivePending(
    limit: number = 10,
    options: ArchiveOptions = {}
  ): Promise<ArchiveResult[]> {
    const pendingSources = await this.repository.findPendingForArchive(limit);
    const results: ArchiveResult[] = [];

    for (const source of pendingSources) {
      const result = await this.archiveSource(source.source_id, options);
      results.push(result);
    }

    return results;
  }

  /**
   * Re-archive an existing source (create new version)
   */
  async rearchiveSource(
    sourceId: string,
    options: ArchiveOptions = {}
  ): Promise<ArchiveResult> {
    // Reset to pending first
    await this.repository.resetToPending(sourceId);
    return this.archiveSource(sourceId, options);
  }

  /**
   * Cancel current archiving operation
   */
  async cancel(): Promise<void> {
    if (this.currentSourceId) {
      await this.repository.markFailed(this.currentSourceId, 'Cancelled by user');
    }
    await closeBrowser();
    this.isProcessing = false;
    this.currentSourceId = null;
  }

  /**
   * Get current processing status
   */
  getStatus(): { isProcessing: boolean; currentSourceId: string | null } {
    return {
      isProcessing: this.isProcessing,
      currentSourceId: this.currentSourceId,
    };
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Get archive path for a source
   * OPT-110: CORRECTED per CLAUDE.md requirement
   * Path: [archive]/locations/[STATE]-[TYPE]/[SLOCNAM]-[LOC12]/org-doc-[LOC12]/_websources/[domain]-[source_id]/
   */
  private async getArchivePath(source: WebSource): Promise<string> {
    if (!this.archiveBasePath) {
      const result = await this.db
        .selectFrom('settings')
        .select('value')
        .where('key', '=', 'archive_folder')
        .executeTakeFirst();
      this.archiveBasePath = result?.value || null;
    }

    if (!this.archiveBasePath) {
      throw new Error('Archive location not set');
    }

    let archivePath: string;

    if (source.locid) {
      // ADR-046: Look up location data for folder naming
      const location = await this.db
        .selectFrom('locs')
        .select(['locid', 'locnam', 'category', 'address_state'])
        .where('locid', '=', source.locid)
        .executeTakeFirst();

      if (!location) {
        throw new Error(`Location not found: ${source.locid}`);
      }

      // ADR-046: New folder path format
      // [base]/locations/[STATE]/[LOCID]/data/org-doc/_websources/[domain]-[source_id]/
      const state = (location.address_state || 'XX').toUpperCase();
      const locid = source.locid;

      // Extract domain for human-readable folder naming
      const domain = this.extractDomain(source.url);

      archivePath = path.join(
        this.archiveBasePath,
        'locations',
        state,
        locid,
        'data',
        'org-doc',
        '_websources',
        `${domain}-${source.source_id}`
      );
    } else {
      // Unlinked sources go to a shared folder
      archivePath = path.join(this.archiveBasePath, '_websources', source.source_id);
    }

    return archivePath;
  }

  /**
   * Extract domain from URL for folder naming
   * OPT-110: Human-readable folder names
   */
  private extractDomain(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, '');
    } catch {
      return 'unknown';
    }
  }

  /**
   * Sanitize string for folder name
   * OPT-110: Matches BagItService pattern for consistency
   */
  private sanitizeFolderName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);
  }

  /**
   * Generate short name from location name
   * OPT-110: Matches BagItService pattern for consistency
   */
  private generateShortName(locnam: string): string {
    const words = locnam.split(/\s+/).slice(0, 3);
    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('-');
  }

  /**
   * Link extracted media to location in database
   */
  private async linkExtractedMedia(
    locid: string,
    subid: string | null,
    sourceId: string,
    images: ExtractedImage[],
    _videos: ExtractedVideo[]
  ): Promise<void> {
    // Insert extracted images into imgs table with source tracking
    for (const image of images) {
      try {
        const imgnam = path.basename(image.localPath);
        await this.db
          .insertInto('imgs')
          .values({
            // Required fields
            imghash: image.hash,
            imgnam,
            imgnamo: imgnam,
            imgloc: image.localPath,
            imgloco: image.url,
            // Location linkage
            locid,
            subid,
            // OPT-109 web source tracking
            source_id: sourceId,
            source_url: image.url,
            extracted_from_web: 1,
            // Metadata
            meta_width: image.width,
            meta_height: image.height,
            file_size_bytes: image.size,
            // Defaults for required fields
            hidden: 0,
            is_live_photo: 0,
            preview_extracted: 0,
            xmp_synced: 0,
            is_contributed: 0,
            // Nullable fields
            auth_imp: null,
            imgadd: null,
            meta_exiftool: null,
            meta_date_taken: null,
            meta_camera_make: null,
            meta_camera_model: null,
            meta_gps_lat: null,
            meta_gps_lng: null,
            thumb_path: null,
            preview_path: null,
            thumb_path_sm: null,
            thumb_path_lg: null,
            xmp_modified_at: null,
            hidden_reason: null,
            imported_by_id: null,
            imported_by: null,
            media_source: 'Web Archive',
            contribution_source: null,
            preview_quality: null,
          })
          .onConflict((oc) => oc.column('imghash').doNothing())
          .execute();
      } catch (err) {
        console.error(`Failed to link image ${image.hash}:`, err);
      }
    }

    // Videos are typically not imported directly but stored in web source archive
    // They can be imported via the regular import flow if user chooses
  }

  /**
   * Calculate provenance hash from component hashes
   */
  private calculateProvenanceHash(hashes: {
    screenshotHash: string | null;
    pdfHash: string | null;
    htmlHash: string | null;
    warcHash: string | null;
    contentHash: string | null;
  }): string {
    // Concatenate all hashes that exist
    const combined = [
      hashes.screenshotHash,
      hashes.pdfHash,
      hashes.htmlHash,
      hashes.warcHash,
      hashes.contentHash,
    ]
      .filter(Boolean)
      .join('|');

    return calculateHashBuffer(Buffer.from(combined, 'utf-8'));
  }

  /**
   * Emit progress event
   */
  private emitProgress(
    sourceId: string,
    url: string,
    phase: ArchiveProgress['phase'],
    component: string | undefined,
    progress: number,
    message: string
  ): void {
    this.emit('progress', {
      sourceId,
      url,
      phase,
      component,
      progress,
      message,
    } as ArchiveProgress);
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let orchestratorInstance: WebSourceOrchestrator | null = null;

/**
 * Get or create the orchestrator instance
 */
export function getOrchestrator(db: Kysely<Database>): WebSourceOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new WebSourceOrchestrator(db);
  }
  return orchestratorInstance;
}

/**
 * Shutdown the orchestrator
 */
export async function shutdownOrchestrator(): Promise<void> {
  if (orchestratorInstance) {
    await orchestratorInstance.cancel();
    orchestratorInstance = null;
  }
  await closeBrowser();
}
