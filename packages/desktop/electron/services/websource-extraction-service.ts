/**
 * Web Source Extraction Service
 * OPT-109: Extracts images, videos, and text from web pages
 * OPT-112: Enhanced with comprehensive metadata extraction
 *
 * Features:
 * - Image extraction with hi-res upgrade logic and DOM context metadata
 * - Video extraction via yt-dlp with full platform metadata
 * - Text extraction via Python (Trafilatura + BeautifulSoup)
 * - EXIF extraction from downloaded images
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import puppeteer, { Browser, Page } from 'puppeteer-core';
import { calculateHash } from './crypto-service';
import { ImageDomContext } from './websource-metadata-service';
import https from 'https';
import http from 'http';
import { URL } from 'url';

const execAsync = promisify(exec);

// ES module compatibility - __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================================================================
// Types and Interfaces
// =============================================================================

/**
 * OPT-112: Enhanced image metadata for web_source_images table
 */
export interface ExtractedImage {
  url: string;
  localPath: string;
  hash: string;
  width: number;
  height: number;
  size: number;
  alt: string | null;
  isHiRes: boolean;
  // OPT-112: Enhanced metadata
  originalFilename: string | null;
  caption: string | null;
  credit: string | null;
  attribution: string | null;
  srcsetVariants: string[];
  contextHtml: string | null;
  linkUrl: string | null;
  isHero: boolean;
  exifData: Record<string, unknown> | null;
}

/**
 * OPT-112: Enhanced video metadata for web_source_videos table
 */
export interface ExtractedVideo {
  url: string;
  localPath: string;
  hash: string;
  title: string | null;
  duration: number | null;
  size: number;
  platform: string;
  // OPT-112: Enhanced metadata from yt-dlp
  description: string | null;
  uploader: string | null;
  uploaderUrl: string | null;
  uploadDate: string | null;
  viewCount: number | null;
  likeCount: number | null;
  tags: string[];
  categories: string[];
  thumbnailUrl: string | null;
  thumbnailPath: string | null;
  metadataJson: string | null;
}

export interface ExtractedText {
  title: string | null;
  author: string | null;
  date: string | null;
  content: string;
  html: string;
  wordCount: number;
  hash: string;
}

export interface ImageExtractionResult {
  success: boolean;
  images: ExtractedImage[];
  error?: string;
  duration: number;
}

export interface VideoExtractionResult {
  success: boolean;
  videos: ExtractedVideo[];
  error?: string;
  duration: number;
}

export interface TextExtractionResult {
  success: boolean;
  text: ExtractedText | null;
  error?: string;
  duration: number;
}

export interface ExtractionOptions {
  url: string;
  outputDir: string;
  sourceId: string;
  locid?: string;
  timeout?: number;
  maxImages?: number;
  maxVideos?: number;
  minImageWidth?: number;
  minImageHeight?: number;
  // OPT-112: Pre-extracted DOM context for images
  imageDomContext?: ImageDomContext[];
}

// =============================================================================
// EXIF Extraction (OPT-112)
// =============================================================================

/**
 * Extract EXIF/IPTC/XMP metadata from an image file
 * Uses exiftool-vendored which is already a project dependency
 */
async function extractExifData(imagePath: string): Promise<Record<string, unknown> | null> {
  try {
    // Use exiftool-vendored for EXIF extraction
    const { exiftool } = await import('exiftool-vendored');
    const tags = await exiftool.read(imagePath);

    // Return relevant fields
    return {
      make: tags.Make || null,
      model: tags.Model || null,
      dateTime: tags.DateTimeOriginal || tags.CreateDate || null,
      gpsLatitude: tags.GPSLatitude || null,
      gpsLongitude: tags.GPSLongitude || null,
      gpsAltitude: tags.GPSAltitude || null,
      focalLength: tags.FocalLength || null,
      aperture: tags.Aperture || tags.FNumber || null,
      shutterSpeed: tags.ShutterSpeed || tags.ExposureTime || null,
      iso: tags.ISO || null,
      software: tags.Software || null,
      artist: tags.Artist || null,
      copyright: tags.Copyright || null,
      description: tags.ImageDescription || tags.Description || null,
      keywords: tags.Keywords || tags.Subject || null,
      rating: tags.Rating || null,
      orientation: tags.Orientation || null,
      width: tags.ImageWidth || null,
      height: tags.ImageHeight || null,
      colorSpace: tags.ColorSpace || null,
      lens: tags.LensModel || tags.Lens || null,
    };
  } catch {
    // EXIF extraction failed (not an image or no EXIF data)
    return null;
  }
}

/**
 * Parse srcset into array of available resolutions
 */
function parseSrcsetVariants(srcset: string | null): string[] {
  if (!srcset) return [];

  return srcset.split(',').map((part) => {
    const trimmed = part.trim();
    const [url, descriptor] = trimmed.split(/\s+/);
    return descriptor ? `${descriptor}` : url;
  }).filter(Boolean);
}

/**
 * Extract filename from URL
 */
function extractFilenameFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const filename = pathname.split('/').pop();
    return filename || null;
  } catch {
    return null;
  }
}

// =============================================================================
// Browser Management (shared with capture service)
// =============================================================================

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserInstance?.isConnected()) {
    return browserInstance;
  }

  // Determine platform-specific browser subfolder
  const platform = process.platform;
  const arch = process.arch;
  let platformFolder = 'mac-arm64';
  if (platform === 'darwin') {
    platformFolder = arch === 'arm64' ? 'mac-arm64' : 'mac-x64';
  } else if (platform === 'linux') {
    platformFolder = 'linux-x64';
  } else if (platform === 'win32') {
    platformFolder = 'win-x64';
  }

  const executablePaths = [
    // Development: Bundled Archive Browser (relative to service file)
    path.join(__dirname, '..', '..', '..', '..', 'resources', 'browsers', 'ungoogled-chromium', platformFolder, 'Archive Browser.app', 'Contents', 'MacOS', 'Chromium'),
    // Production: Bundled Archive Browser (resources path)
    path.join(process.resourcesPath || '', 'browsers', 'ungoogled-chromium', platformFolder, 'Archive Browser.app', 'Contents', 'MacOS', 'Chromium'),
    // Legacy path for backwards compatibility
    path.join(process.resourcesPath || '', 'browser', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
    // System Chrome (macOS)
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    // System Chrome (Linux)
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    // Snap Chrome (Linux)
    '/snap/bin/chromium',
  ];

  let executablePath: string | undefined;
  for (const p of executablePaths) {
    if (fs.existsSync(p)) {
      executablePath = p;
      break;
    }
  }

  if (!executablePath) {
    throw new Error('No Chrome/Chromium executable found');
  }

  browserInstance = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  return browserInstance;
}

// =============================================================================
// Image Extraction
// =============================================================================

/**
 * Extract images from a web page
 * OPT-112: Enhanced with DOM context metadata and EXIF extraction
 * Implements hi-res upgrade logic: tries srcset, data-src, and original-size variants
 */
export async function extractImages(options: ExtractionOptions): Promise<ImageExtractionResult> {
  const startTime = Date.now();
  let page: Page | null = null;
  const extractedImages: ExtractedImage[] = [];

  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    // Set user agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Navigate to page
    await page.goto(options.url, {
      waitUntil: 'networkidle2',
      timeout: options.timeout || 30000,
    });

    // Dismiss cookie banners that block content
    await dismissCookieBanners(page);

    // Scroll to load lazy images
    await autoScroll(page);

    // OPT-112: Use pre-extracted DOM context if available, otherwise extract basic data
    let imageData: Array<{
      src: string;
      srcset: string | null;
      dataSrc: string | null;
      width: number;
      height: number;
      alt: string | null;
      caption: string | null;
      credit: string | null;
      attribution: string | null;
      contextHtml: string | null;
      linkUrl: string | null;
      isHero: boolean;
    }>;

    if (options.imageDomContext && options.imageDomContext.length > 0) {
      // Use pre-extracted DOM context from metadata service
      imageData = options.imageDomContext
        .filter((ctx) => ctx.width >= (options.minImageWidth || 100) && ctx.height >= (options.minImageHeight || 100))
        .map((ctx) => ({
          src: ctx.src,
          srcset: ctx.srcset,
          dataSrc: ctx.dataSrc,
          width: ctx.width,
          height: ctx.height,
          alt: ctx.alt,
          caption: ctx.caption,
          credit: ctx.credit,
          attribution: ctx.attribution,
          contextHtml: ctx.contextHtml,
          linkUrl: ctx.linkUrl,
          isHero: ctx.isHero,
        }));
    } else {
      // Fallback: Extract basic image data (original behavior + enhanced context)
      imageData = await page.evaluate(
        (minWidth: number, minHeight: number) => {
          const images: Array<{
            src: string;
            srcset: string | null;
            dataSrc: string | null;
            width: number;
            height: number;
            alt: string | null;
            caption: string | null;
            credit: string | null;
            attribution: string | null;
            contextHtml: string | null;
            linkUrl: string | null;
            isHero: boolean;
          }> = [];

          document.querySelectorAll('img').forEach((img, index) => {
            // Get dimensions - use dataset values as fallback for lazy-loaded images
            let width = img.naturalWidth || img.width || 0;
            let height = img.naturalHeight || img.height || 0;

            // For lazy-loaded images, try to get dimensions from attributes
            if (width === 0 || height === 0) {
              width = parseInt(img.getAttribute('width') || img.getAttribute('data-width') || '0', 10);
              height = parseInt(img.getAttribute('height') || img.getAttribute('data-height') || '0', 10);
            }

            // Get the actual source URL - check data attributes for lazy loading
            const actualSrc = img.src || img.getAttribute('data-src') || img.getAttribute('data-original') ||
                              img.getAttribute('data-lazy-src') || img.getAttribute('data-srcset')?.split(' ')[0] || '';

            // Skip images without any source
            if (!actualSrc || actualSrc.startsWith('data:')) return;

            // Skip only VERY small images (icons) - be more permissive for lazy-loaded
            // Allow all images if dimensions unknown (will filter during download)
            if (width > 0 && height > 0 && (width < 50 || height < 50)) return;

            // Find caption
            let caption: string | null = null;
            const figure = img.closest('figure');
            if (figure) {
              const figcaption = figure.querySelector('figcaption');
              if (figcaption) caption = figcaption.textContent?.trim() || null;
            }
            if (!caption) {
              const parent = img.parentElement?.parentElement;
              const captionEl = parent?.querySelector('[class*="caption"], [class*="Caption"]');
              if (captionEl) caption = captionEl.textContent?.trim() || null;
            }

            // Find credit
            let credit: string | null = null;
            const creditEl = figure?.querySelector('[class*="credit"], [class*="Credit"], [class*="byline"]') ||
                             img.parentElement?.querySelector('[class*="credit"]');
            if (creditEl) credit = creditEl.textContent?.trim() || null;

            // Find attribution
            const attribution = img.getAttribute('data-credit') || img.getAttribute('data-attribution') ||
                               img.getAttribute('data-source') || null;

            // Get context HTML
            let contextHtml: string | null = null;
            const contextEl = img.closest('figure, picture');
            if (contextEl) contextHtml = contextEl.outerHTML.substring(0, 2000);

            // Check if wrapped in link
            const linkWrapper = img.closest('a');
            const linkUrl = linkWrapper?.getAttribute('href') || null;

            // Determine if hero image
            const isHero = index === 0 ||
                           img.classList.toString().toLowerCase().includes('hero') ||
                           img.closest('[class*="hero"], [class*="Hero"]') !== null;

            images.push({
              src: actualSrc, // Use the actual source we found (may be from data-src)
              srcset: img.srcset || img.getAttribute('data-srcset') || null,
              dataSrc: img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-lazy-src') || null,
              width,
              height,
              alt: img.alt || null,
              caption,
              credit,
              attribution,
              contextHtml,
              linkUrl,
              isHero,
            });
          });

          // Also check for background images in galleries
          document
            .querySelectorAll('[style*="background-image"], [data-background]')
            .forEach((el) => {
              const style = window.getComputedStyle(el);
              const bgImage = style.backgroundImage;
              const match = bgImage.match(/url\(['"]?(.+?)['"]?\)/);
              if (match) {
                images.push({
                  src: match[1],
                  srcset: null,
                  dataSrc: el.getAttribute('data-background') || null,
                  width: 0,
                  height: 0,
                  alt: null,
                  caption: null,
                  credit: null,
                  attribution: null,
                  contextHtml: null,
                  linkUrl: null,
                  isHero: false,
                });
              }
            });

          return images;
        },
        options.minImageWidth || 100,
        options.minImageHeight || 100
      );
    }

    // Create images directory
    const imagesDir = path.join(options.outputDir, 'images');
    await fs.promises.mkdir(imagesDir, { recursive: true });

    // Download images with hi-res upgrade
    const maxImages = options.maxImages || 50;
    let downloadedCount = 0;

    for (const imgData of imageData) {
      if (downloadedCount >= maxImages) break;

      try {
        // Try to get hi-res version
        let imageUrl = imgData.src;
        const originalSrc = imgData.src;

        // Check srcset for larger version
        if (imgData.srcset) {
          const hiResUrl = parseHiResSrcset(imgData.srcset);
          if (hiResUrl) imageUrl = hiResUrl;
        }

        // Check data-src for lazy-loaded original
        if (imgData.dataSrc && isLargerUrl(imgData.dataSrc, imgData.src)) {
          imageUrl = imgData.dataSrc;
        }

        // Resolve relative URLs
        imageUrl = new URL(imageUrl, options.url).href;

        // Determine file extension from URL
        const urlFilename = extractFilenameFromUrl(imageUrl);
        const ext = urlFilename?.split('.').pop()?.toLowerCase() || 'jpg';
        const safeExt = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'].includes(ext) ? ext : 'jpg';

        // Download the image
        const imagePath = path.join(imagesDir, `${options.sourceId}_img_${downloadedCount}.${safeExt}`);
        const downloadResult = await downloadFile(imageUrl, imagePath);

        if (downloadResult.success) {
          const hash = await calculateHash(imagePath);
          const stats = await fs.promises.stat(imagePath);

          // OPT-112: Extract EXIF data from downloaded image
          const exifData = await extractExifData(imagePath);

          extractedImages.push({
            url: imageUrl,
            localPath: imagePath,
            hash,
            width: imgData.width,
            height: imgData.height,
            size: stats.size,
            alt: imgData.alt,
            isHiRes: imageUrl !== originalSrc,
            // OPT-112: Enhanced metadata
            originalFilename: urlFilename,
            caption: imgData.caption,
            credit: imgData.credit,
            attribution: imgData.attribution,
            srcsetVariants: parseSrcsetVariants(imgData.srcset),
            contextHtml: imgData.contextHtml,
            linkUrl: imgData.linkUrl,
            isHero: imgData.isHero,
            exifData,
          });

          downloadedCount++;
        }
      } catch (err) {
        console.error(`Failed to download image:`, err);
      }
    }

    return {
      success: true,
      images: extractedImages,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      images: extractedImages,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    };
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
  }
}

/**
 * Parse srcset attribute to find highest resolution URL
 */
function parseHiResSrcset(srcset: string): string | null {
  const parts = srcset.split(',').map((s) => s.trim());
  let maxWidth = 0;
  let maxUrl: string | null = null;

  for (const part of parts) {
    const [url, descriptor] = part.split(/\s+/);
    if (descriptor) {
      const width = parseInt(descriptor.replace('w', ''), 10);
      if (width > maxWidth) {
        maxWidth = width;
        maxUrl = url;
      }
    }
  }

  return maxUrl;
}

/**
 * Check if a URL might be a larger/original version
 */
function isLargerUrl(url1: string, url2: string): boolean {
  // Common patterns for full-size images
  const patterns = [
    /[-_]orig[.]/i,
    /[-_]full[.]/i,
    /[-_]large[.]/i,
    /[-_]original[.]/i,
    /[-_]hires[.]/i,
  ];

  return patterns.some((p) => p.test(url1) && !p.test(url2));
}

// =============================================================================
// Video Extraction
// =============================================================================

/**
 * Extract videos from a web page using yt-dlp
 * Supports YouTube, Vimeo, and many other platforms
 */
export async function extractVideos(options: ExtractionOptions): Promise<VideoExtractionResult> {
  const startTime = Date.now();
  const extractedVideos: ExtractedVideo[] = [];

  try {
    // Find yt-dlp executable
    let ytdlpPath: string | undefined;
    const ytdlpPaths = [
      '/usr/local/bin/yt-dlp',
      '/usr/bin/yt-dlp',
      '/opt/homebrew/bin/yt-dlp',
      path.join(process.resourcesPath || '', 'bin', 'yt-dlp'),
    ];

    for (const p of ytdlpPaths) {
      if (fs.existsSync(p)) {
        ytdlpPath = p;
        break;
      }
    }

    if (!ytdlpPath) {
      // Try to find in PATH
      try {
        const { stdout } = await execAsync('which yt-dlp');
        ytdlpPath = stdout.trim();
      } catch {
        return {
          success: false,
          videos: [],
          error: 'yt-dlp not found. Video extraction requires yt-dlp to be installed.',
          duration: Date.now() - startTime,
        };
      }
    }

    // Create videos directory
    const videosDir = path.join(options.outputDir, 'videos');
    await fs.promises.mkdir(videosDir, { recursive: true });

    // First, extract video URLs from the page
    const browser = await getBrowser();
    const page = await browser.newPage();

    await page.goto(options.url, {
      waitUntil: 'networkidle2',
      timeout: options.timeout || 30000,
    });

    const videoUrls = await page.evaluate(() => {
      const urls: string[] = [];

      // YouTube embeds
      document.querySelectorAll('iframe[src*="youtube.com"], iframe[src*="youtu.be"]').forEach((iframe) => {
        const src = (iframe as HTMLIFrameElement).src;
        const match = src.match(/(?:embed\/|v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (match) {
          urls.push(`https://www.youtube.com/watch?v=${match[1]}`);
        }
      });

      // Vimeo embeds
      document.querySelectorAll('iframe[src*="vimeo.com"]').forEach((iframe) => {
        const src = (iframe as HTMLIFrameElement).src;
        const match = src.match(/vimeo\.com\/(?:video\/)?(\d+)/);
        if (match) {
          urls.push(`https://vimeo.com/${match[1]}`);
        }
      });

      // Video elements
      document.querySelectorAll('video source, video[src]').forEach((el) => {
        const src = el.getAttribute('src') || (el as HTMLVideoElement).src;
        if (src) urls.push(src);
      });

      return [...new Set(urls)]; // Deduplicate
    });

    await page.close();

    // Download each video with yt-dlp
    const maxVideos = options.maxVideos || 5;
    let downloadedCount = 0;

    for (const videoUrl of videoUrls) {
      if (downloadedCount >= maxVideos) break;

      try {
        const outputTemplate = path.join(
          videosDir,
          `${options.sourceId}_vid_${downloadedCount}.%(ext)s`
        );

        // Run yt-dlp to download the video
        const args = [
          '--no-warnings',
          '--no-progress',
          '-f',
          'best[height<=1080]', // Limit to 1080p to save space
          '-o',
          outputTemplate,
          '--write-info-json',
          videoUrl,
        ];

        await new Promise<void>((resolve, reject) => {
          const ytdlp = spawn(ytdlpPath!, args, { stdio: ['ignore', 'pipe', 'pipe'] });
          let stderr = '';

          ytdlp.stderr.on('data', (data) => {
            stderr += data.toString();
          });

          ytdlp.on('close', (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`yt-dlp exited with code ${code}: ${stderr}`));
            }
          });

          ytdlp.on('error', reject);
        });

        // Find the downloaded file
        const files = await fs.promises.readdir(videosDir);
        const videoFile = files.find(
          (f) => f.startsWith(`${options.sourceId}_vid_${downloadedCount}`) && !f.endsWith('.json')
        );

        if (videoFile) {
          const videoPath = path.join(videosDir, videoFile);
          const hash = await calculateHash(videoPath);
          const stats = await fs.promises.stat(videoPath);

          // OPT-112: Parse full yt-dlp metadata
          let title: string | null = null;
          let duration: number | null = null;
          let platform = 'unknown';
          let description: string | null = null;
          let uploader: string | null = null;
          let uploaderUrl: string | null = null;
          let uploadDate: string | null = null;
          let viewCount: number | null = null;
          let likeCount: number | null = null;
          let tags: string[] = [];
          let categories: string[] = [];
          let thumbnailUrl: string | null = null;
          let thumbnailPath: string | null = null;
          let metadataJson: string | null = null;

          const infoFile = files.find(
            (f) =>
              f.startsWith(`${options.sourceId}_vid_${downloadedCount}`) &&
              f.endsWith('.info.json')
          );

          if (infoFile) {
            try {
              const infoPath = path.join(videosDir, infoFile);
              const infoRaw = await fs.promises.readFile(infoPath, 'utf-8');
              const info = JSON.parse(infoRaw);

              // OPT-112: Extract comprehensive metadata
              title = info.title || null;
              duration = info.duration || null;
              platform = info.extractor || info.extractor_key || 'unknown';
              description = info.description || null;
              uploader = info.uploader || info.channel || null;
              uploaderUrl = info.uploader_url || info.channel_url || null;
              uploadDate = info.upload_date || null;
              viewCount = info.view_count || null;
              likeCount = info.like_count || null;
              tags = Array.isArray(info.tags) ? info.tags : [];
              categories = Array.isArray(info.categories) ? info.categories : [];
              thumbnailUrl = info.thumbnail || null;

              // Store the full JSON for future-proofing
              metadataJson = infoRaw;

              // Download thumbnail if available
              if (thumbnailUrl) {
                try {
                  const thumbExt = thumbnailUrl.split('.').pop()?.split('?')[0] || 'jpg';
                  const thumbPath = path.join(videosDir, `${options.sourceId}_vid_${downloadedCount}_thumb.${thumbExt}`);
                  const thumbResult = await downloadFile(thumbnailUrl, thumbPath);
                  if (thumbResult.success) {
                    thumbnailPath = thumbPath;
                  }
                } catch {
                  // Thumbnail download failed, not critical
                }
              }
            } catch {
              // Info JSON parsing failed, continue with basic metadata
            }
          }

          extractedVideos.push({
            url: videoUrl,
            localPath: videoPath,
            hash,
            title,
            duration,
            size: stats.size,
            platform,
            // OPT-112: Enhanced metadata
            description,
            uploader,
            uploaderUrl,
            uploadDate,
            viewCount,
            likeCount,
            tags,
            categories,
            thumbnailUrl,
            thumbnailPath,
            metadataJson,
          });

          downloadedCount++;
        }
      } catch (err) {
        console.error(`Failed to download video from ${videoUrl}:`, err);
      }
    }

    return {
      success: true,
      videos: extractedVideos,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      videos: extractedVideos,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    };
  }
}

// =============================================================================
// Text Extraction
// =============================================================================

/**
 * Extract clean text content from a web page
 * Uses Python script with Trafilatura and BeautifulSoup for best results
 */
export async function extractText(options: ExtractionOptions): Promise<TextExtractionResult> {
  const startTime = Date.now();

  try {
    // Find Python and our extraction script
    const pythonPaths = ['/usr/bin/python3', '/usr/local/bin/python3', '/opt/homebrew/bin/python3'];
    let pythonPath: string | undefined;

    for (const p of pythonPaths) {
      if (fs.existsSync(p)) {
        pythonPath = p;
        break;
      }
    }

    if (!pythonPath) {
      try {
        const { stdout } = await execAsync('which python3');
        pythonPath = stdout.trim();
      } catch {
        // Fallback to browser-based extraction
        return await extractTextWithBrowser(options, startTime);
      }
    }

    // Path to our extraction script
    const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'extract-text.py');

    // Check if script exists
    if (!fs.existsSync(scriptPath)) {
      // Fallback to browser-based extraction
      return await extractTextWithBrowser(options, startTime);
    }

    // Run the Python extraction script
    const result = await new Promise<TextExtractionResult>((resolve) => {
      const python = spawn(pythonPath!, [scriptPath, options.url], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', async (code) => {
        if (code !== 0) {
          // Fall back to browser extraction
          resolve(await extractTextWithBrowser(options, startTime));
          return;
        }

        try {
          const extracted = JSON.parse(stdout);

          // Save text content
          const textDir = path.join(options.outputDir, 'text');
          await fs.promises.mkdir(textDir, { recursive: true });

          const textPath = path.join(textDir, `${options.sourceId}_content.txt`);
          await fs.promises.writeFile(textPath, extracted.content, 'utf-8');

          const hash = await calculateHash(textPath);

          resolve({
            success: true,
            text: {
              title: extracted.title || null,
              author: extracted.author || null,
              date: extracted.date || null,
              content: extracted.content,
              html: extracted.html || '',
              wordCount: extracted.content.split(/\s+/).filter((w: string) => w.length > 0).length,
              hash,
            },
            duration: Date.now() - startTime,
          });
        } catch (err) {
          resolve(await extractTextWithBrowser(options, startTime));
        }
      });

      python.on('error', async () => {
        resolve(await extractTextWithBrowser(options, startTime));
      });
    });

    return result;
  } catch (error) {
    return await extractTextWithBrowser(options, startTime);
  }
}

/**
 * Fallback text extraction using browser
 * Used when Python/Trafilatura is not available
 * OPT-112: Enhanced to handle modern SPA sites like Zillow
 */
async function extractTextWithBrowser(
  options: ExtractionOptions,
  startTime: number
): Promise<TextExtractionResult> {
  let page: Page | null = null;

  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    // Set user agent to avoid bot detection
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.goto(options.url, {
      waitUntil: 'networkidle2',
      timeout: options.timeout || 30000,
    });

    // Wait for content to render on JS-heavy sites
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Extract text content - DON'T remove elements from live DOM
    const extracted = await page.evaluate(() => {
      // Clone the body to work with, preserving original
      const bodyClone = document.body.cloneNode(true) as HTMLElement;

      // Remove scripts, styles, and obvious noise from the CLONE
      const elementsToRemove = bodyClone.querySelectorAll(
        'script, style, noscript, iframe, svg, [hidden], [aria-hidden="true"]'
      );
      elementsToRemove.forEach((el) => el.remove());

      // Try to find main content - expanded selectors for modern sites
      const contentSelectors = [
        'main',
        'article',
        '[role="main"]',
        '#main-content',
        '#content',
        '.main-content',
        '.content',
        '.article',
        '.post',
        '.listing-content', // Zillow
        '.hdp-content', // Zillow home details page
        '.ds-home-details', // Zillow
        '[data-testid="home-details"]', // Zillow
        '.property-info', // Real estate sites
        '.listing-details', // Real estate sites
      ];

      let main: HTMLElement | null = null;
      for (const selector of contentSelectors) {
        main = bodyClone.querySelector(selector);
        if (main && main.textContent && main.textContent.trim().length > 100) break;
      }

      // If no good selector found, use body but exclude obvious navigation
      if (!main || main.textContent!.trim().length < 100) {
        main = bodyClone;
        // Remove navigation/footer only from cloned body
        main.querySelectorAll('nav, header, footer, aside, .sidebar, .modal').forEach(el => el.remove());
      }

      // Get text content - preserve some structure
      let content = '';
      const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, null);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const text = node.textContent?.trim();
        if (text && text.length > 0) {
          content += text + ' ';
        }
      }
      content = content.replace(/\s+/g, ' ').trim();

      // Get title from multiple sources
      const title =
        document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
        document.querySelector('h1')?.textContent?.trim() ||
        document.querySelector('title')?.textContent?.trim() ||
        null;

      // Get author from multiple sources
      const author =
        document.querySelector('meta[name="author"]')?.getAttribute('content') ||
        document.querySelector('meta[property="article:author"]')?.getAttribute('content') ||
        document.querySelector('[rel="author"], .author, .byline, [data-testid="attribution"]')?.textContent?.trim() ||
        null;

      // Get date from multiple sources
      const dateEl = document.querySelector('time, .date, .published, [data-testid="date"]');
      const date =
        document.querySelector('meta[property="article:published_time"]')?.getAttribute('content') ||
        dateEl?.getAttribute('datetime') ||
        dateEl?.textContent?.trim() ||
        null;

      // Get outer HTML for archive
      const html = main.outerHTML;

      return { title, author, date, content, html };
    });

    // Save text content
    const textDir = path.join(options.outputDir, 'text');
    await fs.promises.mkdir(textDir, { recursive: true });

    const textPath = path.join(textDir, `${options.sourceId}_content.txt`);
    await fs.promises.writeFile(textPath, extracted.content, 'utf-8');

    const hash = await calculateHash(textPath);

    return {
      success: true,
      text: {
        title: extracted.title,
        author: extracted.author,
        date: extracted.date,
        content: extracted.content,
        html: extracted.html,
        wordCount: extracted.content.split(/\s+/).filter((w) => w.length > 0).length,
        hash,
      },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      text: null,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    };
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Dismiss cookie consent banners that block content extraction
 * Tries multiple common selectors used by cookie consent libraries
 */
async function dismissCookieBanners(page: Page): Promise<void> {
  const cookieSelectors = [
    // OneTrust (very common)
    '#onetrust-accept-btn-handler',
    '#onetrust-pc-btn-handler',
    '.onetrust-close-btn-handler',
    // Cookiebot
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
    '#CybotCookiebotDialogBodyButtonAccept',
    // Generic patterns
    '[data-testid="cookie-accept"]',
    '[data-testid="accept-cookies"]',
    'button[aria-label*="accept cookies" i]',
    'button[aria-label*="accept all" i]',
    '.cookie-consent-accept',
    '.cookie-accept',
    '.accept-cookies',
    '#accept-cookies',
    '#cookie-accept',
    // GDPR consent
    '.gdpr-consent-accept',
    '#gdpr-accept',
    // Common button text patterns (using :has for text matching)
    'button:has-text("Accept")',
    'button:has-text("Accept All")',
    'button:has-text("Accept Cookies")',
    'button:has-text("I Agree")',
    'button:has-text("Got it")',
    'button:has-text("OK")',
    // Zillow specific
    '[data-testid="gdpr-accept-btn"]',
    // Close buttons on modals
    '.modal-close',
    '[aria-label="Close"]',
  ];

  for (const selector of cookieSelectors) {
    try {
      // Use a short timeout - don't wait long for each selector
      const element = await page.$(selector);
      if (element) {
        await element.click();
        // Small delay after clicking to let modal close
        await new Promise(resolve => setTimeout(resolve, 300));
        break; // Stop after first successful click
      }
    } catch {
      // Ignore - selector not found or not clickable
    }
  }

  // Also try to remove any overlay divs that might block interaction
  await page.evaluate(() => {
    const overlaySelectors = [
      '.modal-backdrop',
      '.overlay',
      '[class*="cookie-banner"]',
      '[class*="consent-banner"]',
      '[id*="cookie-banner"]',
      '[id*="consent-banner"]',
    ];

    overlaySelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        (el as HTMLElement).style.display = 'none';
      });
    });
  });
}

/**
 * Auto-scroll the page to trigger lazy loading
 * Enhanced to handle modern JS frameworks and image lazy loading
 */
async function autoScroll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 400;
      let scrollAttempts = 0;
      const maxAttempts = 50; // Max 50 scroll steps to prevent infinite loops

      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        scrollAttempts++;

        // Trigger any IntersectionObserver-based lazy loaders
        const lazyImages = document.querySelectorAll('img[data-src], img[data-original], img[loading="lazy"], img[data-lazy-src]');
        lazyImages.forEach((img) => {
          // Force the image into viewport detection
          const rect = img.getBoundingClientRect();
          if (rect.top < window.innerHeight * 2) {
            // Try to trigger loading
            if ((img as HTMLImageElement).loading === 'lazy') {
              (img as HTMLImageElement).loading = 'eager';
            }
          }
        });

        if (totalHeight >= scrollHeight || scrollAttempts >= maxAttempts) {
          clearInterval(timer);
          // Wait a bit for images to load after scrolling
          setTimeout(() => {
            window.scrollTo(0, 0);
            resolve();
          }, 1000);
        }
      }, 200); // Slower scroll to let content load
    });
  });

  // Additional wait for dynamic content
  await new Promise(resolve => setTimeout(resolve, 2000));
}

/**
 * Download a file from URL to local path
 */
async function downloadFile(
  url: string,
  outputPath: string
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(url);
      const httpModule = parsedUrl.protocol === 'https:' ? https : http;

      const file = fs.createWriteStream(outputPath);

      const request = httpModule.get(url, { timeout: 30000 }, (response) => {
        // Follow redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            file.close();
            fs.unlinkSync(outputPath);
            downloadFile(redirectUrl, outputPath).then(resolve);
            return;
          }
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlink(outputPath, () => {});
          resolve({ success: false, error: `HTTP ${response.statusCode}` });
          return;
        }

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve({ success: true });
        });
      });

      request.on('error', (err) => {
        file.close();
        fs.unlink(outputPath, () => {});
        resolve({ success: false, error: err.message });
      });

      request.on('timeout', () => {
        request.destroy();
        file.close();
        fs.unlink(outputPath, () => {});
        resolve({ success: false, error: 'Request timeout' });
      });
    } catch (err) {
      resolve({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });
}

/**
 * Extract all content types from a URL
 */
export async function extractAll(options: ExtractionOptions): Promise<{
  images: ImageExtractionResult;
  videos: VideoExtractionResult;
  text: TextExtractionResult;
  totalDuration: number;
}> {
  const startTime = Date.now();

  // Run extractions in parallel
  const [images, videos, text] = await Promise.all([
    extractImages(options),
    extractVideos(options),
    extractText(options),
  ]);

  return {
    images,
    videos,
    text,
    totalDuration: Date.now() - startTime,
  };
}
