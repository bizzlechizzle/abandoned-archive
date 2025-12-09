/**
 * Web Source Extraction Service
 * OPT-109: Extracts images, videos, and text from web pages
 *
 * Features:
 * - Image extraction with hi-res upgrade logic
 * - Video extraction via yt-dlp
 * - Text extraction via Python (Trafilatura + BeautifulSoup)
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import puppeteer, { Browser, Page } from 'puppeteer-core';
import { calculateHash } from './crypto-service';
import https from 'https';
import http from 'http';
import { URL } from 'url';

const execAsync = promisify(exec);

// =============================================================================
// Types and Interfaces
// =============================================================================

export interface ExtractedImage {
  url: string;
  localPath: string;
  hash: string;
  width: number;
  height: number;
  size: number;
  alt: string | null;
  isHiRes: boolean;
}

export interface ExtractedVideo {
  url: string;
  localPath: string;
  hash: string;
  title: string | null;
  duration: number | null;
  size: number;
  platform: string;
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

    // Scroll to load lazy images
    await autoScroll(page);

    // Extract image URLs with hi-res detection
    const imageData = await page.evaluate(
      (minWidth: number, minHeight: number) => {
        const images: Array<{
          src: string;
          srcset: string | null;
          dataSrc: string | null;
          width: number;
          height: number;
          alt: string | null;
        }> = [];

        document.querySelectorAll('img').forEach((img) => {
          const width = img.naturalWidth || img.width || 0;
          const height = img.naturalHeight || img.height || 0;

          // Skip small images (likely icons)
          if (width < minWidth || height < minHeight) return;

          images.push({
            src: img.src,
            srcset: img.srcset || null,
            dataSrc: img.getAttribute('data-src') || img.getAttribute('data-original') || null,
            width,
            height,
            alt: img.alt || null,
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
              });
            }
          });

        return images;
      },
      options.minImageWidth || 100,
      options.minImageHeight || 100
    );

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

        // Download the image
        const imagePath = path.join(imagesDir, `${options.sourceId}_img_${downloadedCount}.jpg`);
        const downloadResult = await downloadFile(imageUrl, imagePath);

        if (downloadResult.success) {
          const hash = await calculateHash(imagePath);
          const stats = await fs.promises.stat(imagePath);

          extractedImages.push({
            url: imageUrl,
            localPath: imagePath,
            hash,
            width: imgData.width,
            height: imgData.height,
            size: stats.size,
            alt: imgData.alt,
            isHiRes: imageUrl !== imgData.src,
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

          // Try to read info JSON for metadata
          let title: string | null = null;
          let duration: number | null = null;
          let platform = 'unknown';

          const infoFile = files.find(
            (f) =>
              f.startsWith(`${options.sourceId}_vid_${downloadedCount}`) &&
              f.endsWith('.info.json')
          );

          if (infoFile) {
            try {
              const info = JSON.parse(
                await fs.promises.readFile(path.join(videosDir, infoFile), 'utf-8')
              );
              title = info.title || null;
              duration = info.duration || null;
              platform = info.extractor || 'unknown';
            } catch {}
          }

          extractedVideos.push({
            url: videoUrl,
            localPath: videoPath,
            hash,
            title,
            duration,
            size: stats.size,
            platform,
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
 */
async function extractTextWithBrowser(
  options: ExtractionOptions,
  startTime: number
): Promise<TextExtractionResult> {
  let page: Page | null = null;

  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    await page.goto(options.url, {
      waitUntil: 'networkidle2',
      timeout: options.timeout || 30000,
    });

    // Extract text content
    const extracted = await page.evaluate(() => {
      // Remove scripts, styles, and navigation
      const elementsToRemove = document.querySelectorAll(
        'script, style, nav, header, footer, aside, .sidebar, .comments, .ads, .advertisement'
      );
      elementsToRemove.forEach((el) => el.remove());

      // Find main content area
      const main =
        document.querySelector('main, article, .content, #content, .post, .article') ||
        document.body;

      // Get text content
      const content = main.textContent?.replace(/\s+/g, ' ').trim() || '';

      // Get title
      const title =
        document.querySelector('h1')?.textContent?.trim() ||
        document.querySelector('title')?.textContent?.trim() ||
        null;

      // Get author
      const author =
        document.querySelector('[rel="author"], .author, .byline')?.textContent?.trim() || null;

      // Get date
      const dateEl = document.querySelector('time, .date, .published');
      const date = dateEl?.getAttribute('datetime') || dateEl?.textContent?.trim() || null;

      // Get HTML
      const html = main.innerHTML;

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
 * Auto-scroll the page to trigger lazy loading
 */
async function autoScroll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 500;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 100);
    });
  });
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
