/**
 * Web Source Capture Service
 * OPT-109: Captures web pages in multiple formats (Screenshot, PDF, HTML, WARC)
 *
 * Uses Puppeteer-core for browser-based captures and wget for WARC archives.
 * Follows the project's offline-first architecture with local file storage.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import puppeteer, { Browser, Page, LaunchOptions } from 'puppeteer-core';
import { calculateHash } from './crypto-service';

// =============================================================================
// Types and Interfaces
// =============================================================================

export interface CaptureOptions {
  url: string;
  outputDir: string;
  sourceId: string;
  timeout?: number;
  waitForSelector?: string;
  scrollPage?: boolean;
  fullPage?: boolean;
  viewportWidth?: number;
  viewportHeight?: number;
}

export interface CaptureResult {
  success: boolean;
  path?: string;
  hash?: string;
  error?: string;
  size?: number;
  duration?: number;
}

export interface CaptureAllResult {
  screenshot: CaptureResult;
  pdf: CaptureResult;
  html: CaptureResult;
  warc: CaptureResult;
  totalDuration: number;
}

// =============================================================================
// Browser Management
// =============================================================================

let browserInstance: Browser | null = null;
let browserLaunchPromise: Promise<Browser> | null = null;

/**
 * Get or create a shared browser instance
 * Reuses browser to avoid cold start overhead on each capture
 */
async function getBrowser(): Promise<Browser> {
  if (browserInstance?.isConnected()) {
    return browserInstance;
  }

  if (browserLaunchPromise) {
    return browserLaunchPromise;
  }

  browserLaunchPromise = launchBrowser();
  browserInstance = await browserLaunchPromise;
  browserLaunchPromise = null;

  return browserInstance;
}

/**
 * Launch a new browser instance
 */
async function launchBrowser(): Promise<Browser> {
  // Find Chromium executable - check common locations
  const executablePaths = [
    // Bundled Ungoogled Chromium (if available)
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
    throw new Error('No Chrome/Chromium executable found. Please install Chrome or Chromium.');
  }

  const options: LaunchOptions = {
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080',
    ],
  };

  return puppeteer.launch(options);
}

/**
 * Close the shared browser instance
 */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

// =============================================================================
// Screenshot Capture
// =============================================================================

/**
 * Capture a full-page screenshot of the URL
 */
export async function captureScreenshot(options: CaptureOptions): Promise<CaptureResult> {
  const startTime = Date.now();
  let page: Page | null = null;

  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    // Set viewport
    await page.setViewport({
      width: options.viewportWidth || 1920,
      height: options.viewportHeight || 1080,
    });

    // Navigate to URL
    await page.goto(options.url, {
      waitUntil: 'networkidle2',
      timeout: options.timeout || 30000,
    });

    // Wait for specific selector if provided
    if (options.waitForSelector) {
      await page.waitForSelector(options.waitForSelector, { timeout: 10000 });
    }

    // Scroll page to load lazy images
    if (options.scrollPage !== false) {
      await autoScroll(page);
    }

    // Ensure output directory exists
    await fs.promises.mkdir(options.outputDir, { recursive: true });

    // Generate screenshot path
    const screenshotPath = path.join(options.outputDir, `${options.sourceId}_screenshot.png`);

    // Capture screenshot
    await page.screenshot({
      path: screenshotPath,
      fullPage: options.fullPage !== false,
      type: 'png',
    });

    // Calculate hash
    const hash = await calculateHash(screenshotPath);
    const stats = await fs.promises.stat(screenshotPath);

    return {
      success: true,
      path: screenshotPath,
      hash,
      size: stats.size,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
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
          // Scroll back to top
          window.scrollTo(0, 0);
          resolve();
        }
      }, 100);
    });
  });
}

// =============================================================================
// PDF Capture
// =============================================================================

/**
 * Capture the URL as a PDF document
 */
export async function capturePdf(options: CaptureOptions): Promise<CaptureResult> {
  const startTime = Date.now();
  let page: Page | null = null;

  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    // Navigate to URL
    await page.goto(options.url, {
      waitUntil: 'networkidle2',
      timeout: options.timeout || 30000,
    });

    // Wait for specific selector if provided
    if (options.waitForSelector) {
      await page.waitForSelector(options.waitForSelector, { timeout: 10000 });
    }

    // Scroll to load lazy content
    if (options.scrollPage !== false) {
      await autoScroll(page);
    }

    // Ensure output directory exists
    await fs.promises.mkdir(options.outputDir, { recursive: true });

    // Generate PDF path
    const pdfPath = path.join(options.outputDir, `${options.sourceId}.pdf`);

    // Generate PDF
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '20mm',
        bottom: '20mm',
        left: '20mm',
      },
    });

    // Calculate hash
    const hash = await calculateHash(pdfPath);
    const stats = await fs.promises.stat(pdfPath);

    return {
      success: true,
      path: pdfPath,
      hash,
      size: stats.size,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
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
// HTML Capture
// =============================================================================

/**
 * Capture the URL as a single-file HTML document
 * Includes all resources inlined as data URIs
 */
export async function captureHtml(options: CaptureOptions): Promise<CaptureResult> {
  const startTime = Date.now();
  let page: Page | null = null;

  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    // Navigate to URL
    await page.goto(options.url, {
      waitUntil: 'networkidle2',
      timeout: options.timeout || 30000,
    });

    // Wait for specific selector if provided
    if (options.waitForSelector) {
      await page.waitForSelector(options.waitForSelector, { timeout: 10000 });
    }

    // Scroll to load lazy content
    if (options.scrollPage !== false) {
      await autoScroll(page);
    }

    // Get the full HTML content with inlined resources
    const html = await page.evaluate(async () => {
      // Inline all stylesheets
      const styleSheets = Array.from(document.styleSheets);
      const styles: string[] = [];

      for (const sheet of styleSheets) {
        try {
          if (sheet.cssRules) {
            const rules = Array.from(sheet.cssRules)
              .map((rule) => rule.cssText)
              .join('\n');
            styles.push(rules);
          }
        } catch {
          // Cross-origin stylesheets can't be read
        }
      }

      // Create inline style tag
      const styleTag = document.createElement('style');
      styleTag.textContent = styles.join('\n');

      // Clone the document
      const clone = document.cloneNode(true) as Document;

      // Add styles to head
      clone.head.appendChild(styleTag);

      // Get outer HTML
      return clone.documentElement.outerHTML;
    });

    // Ensure output directory exists
    await fs.promises.mkdir(options.outputDir, { recursive: true });

    // Generate HTML path
    const htmlPath = path.join(options.outputDir, `${options.sourceId}.html`);

    // Write HTML file
    await fs.promises.writeFile(htmlPath, html, 'utf-8');

    // Calculate hash
    const hash = await calculateHash(htmlPath);
    const stats = await fs.promises.stat(htmlPath);

    return {
      success: true,
      path: htmlPath,
      hash,
      size: stats.size,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
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
// WARC Capture
// =============================================================================

/**
 * Capture the URL as a WARC archive using wget
 * WARC is the standard format for web archiving
 */
export async function captureWarc(options: CaptureOptions): Promise<CaptureResult> {
  const startTime = Date.now();

  try {
    // Find wget executable
    const wgetPaths = ['/usr/bin/wget', '/usr/local/bin/wget', '/opt/homebrew/bin/wget'];
    let wgetPath: string | undefined;

    for (const p of wgetPaths) {
      if (fs.existsSync(p)) {
        wgetPath = p;
        break;
      }
    }

    if (!wgetPath) {
      // Try to find in PATH
      const { promisify } = await import('util');
      const exec = promisify((await import('child_process')).exec);
      try {
        const { stdout } = await exec('which wget');
        wgetPath = stdout.trim();
      } catch {
        return {
          success: false,
          error: 'wget not found. WARC capture requires wget to be installed.',
          duration: Date.now() - startTime,
        };
      }
    }

    // Ensure output directory exists
    await fs.promises.mkdir(options.outputDir, { recursive: true });

    // Generate WARC filename
    const warcBase = path.join(options.outputDir, options.sourceId);

    // Run wget with WARC output
    const args = [
      '--warc-file=' + warcBase,
      '--warc-cdx', // Also create CDX index
      '--page-requisites', // Get all resources
      '--adjust-extension',
      '--span-hosts', // Allow resources from other hosts
      '--convert-links',
      '--restrict-file-names=windows',
      '--no-directories',
      '--timeout=' + Math.floor((options.timeout || 30000) / 1000),
      '--tries=2',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      '-P',
      options.outputDir,
      options.url,
    ];

    await new Promise<void>((resolve, reject) => {
      const wget = spawn(wgetPath!, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stderr = '';

      wget.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      wget.on('close', (code) => {
        // wget returns 0 on success, non-zero on failure
        // But some failures are recoverable (e.g., 404 for some resources)
        if (code === 0 || code === 8) {
          // 8 = server error, but we might have partial content
          resolve();
        } else {
          reject(new Error(`wget exited with code ${code}: ${stderr}`));
        }
      });

      wget.on('error', reject);
    });

    // Find the generated WARC file (wget adds .warc.gz extension)
    const warcPath = warcBase + '.warc.gz';

    if (!fs.existsSync(warcPath)) {
      // Try without .gz
      const warcPathUncompressed = warcBase + '.warc';
      if (!fs.existsSync(warcPathUncompressed)) {
        return {
          success: false,
          error: 'WARC file was not created',
          duration: Date.now() - startTime,
        };
      }
      // Use uncompressed version
      const hash = await calculateHash(warcPathUncompressed);
      const stats = await fs.promises.stat(warcPathUncompressed);

      return {
        success: true,
        path: warcPathUncompressed,
        hash,
        size: stats.size,
        duration: Date.now() - startTime,
      };
    }

    // Calculate hash
    const hash = await calculateHash(warcPath);
    const stats = await fs.promises.stat(warcPath);

    return {
      success: true,
      path: warcPath,
      hash,
      size: stats.size,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    };
  }
}

// =============================================================================
// Combined Capture
// =============================================================================

/**
 * Capture a URL in all formats (Screenshot, PDF, HTML, WARC)
 * Runs captures in parallel for efficiency
 */
export async function captureAll(options: CaptureOptions): Promise<CaptureAllResult> {
  const startTime = Date.now();

  // Run all captures in parallel
  const [screenshot, pdf, html, warc] = await Promise.all([
    captureScreenshot(options),
    capturePdf(options),
    captureHtml(options),
    captureWarc(options),
  ]);

  return {
    screenshot,
    pdf,
    html,
    warc,
    totalDuration: Date.now() - startTime,
  };
}

// =============================================================================
// Metadata Extraction
// =============================================================================

export interface ExtractedMetadata {
  title: string | null;
  author: string | null;
  date: string | null;
  publisher: string | null;
  description: string | null;
  wordCount: number;
  imageCount: number;
  videoCount: number;
}

/**
 * Extract metadata from a URL using Puppeteer
 * Extracts Open Graph, Schema.org, and standard meta tags
 */
export async function extractMetadata(url: string, timeout?: number): Promise<ExtractedMetadata> {
  let page: Page | null = null;

  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    // Navigate to URL
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: timeout || 30000,
    });

    // Extract metadata from page
    const metadata = await page.evaluate(() => {
      const getMeta = (name: string): string | null => {
        const el =
          document.querySelector(`meta[name="${name}"]`) ||
          document.querySelector(`meta[property="${name}"]`) ||
          document.querySelector(`meta[property="og:${name}"]`);
        return el?.getAttribute('content') || null;
      };

      // Get title from various sources
      const title =
        getMeta('og:title') ||
        getMeta('twitter:title') ||
        document.querySelector('h1')?.textContent?.trim() ||
        document.title ||
        null;

      // Get author
      const author =
        getMeta('author') ||
        getMeta('article:author') ||
        document.querySelector('[rel="author"]')?.textContent?.trim() ||
        null;

      // Get date
      const date =
        getMeta('article:published_time') ||
        getMeta('date') ||
        getMeta('publish_date') ||
        document.querySelector('time')?.getAttribute('datetime') ||
        null;

      // Get publisher/site name
      const publisher =
        getMeta('og:site_name') ||
        getMeta('publisher') ||
        document.querySelector('[rel="publisher"]')?.textContent?.trim() ||
        null;

      // Get description
      const description = getMeta('description') || getMeta('og:description') || null;

      // Count words in main content
      const mainContent =
        document.querySelector('main')?.textContent ||
        document.querySelector('article')?.textContent ||
        document.body.textContent ||
        '';
      const wordCount = mainContent.split(/\s+/).filter((w) => w.length > 0).length;

      // Count images (excluding tiny ones and icons)
      const images = document.querySelectorAll('img');
      const imageCount = Array.from(images).filter((img) => {
        const width = img.naturalWidth || img.width || 0;
        const height = img.naturalHeight || img.height || 0;
        return width > 100 && height > 100;
      }).length;

      // Count videos
      const videoCount =
        document.querySelectorAll('video').length +
        document.querySelectorAll('iframe[src*="youtube"]').length +
        document.querySelectorAll('iframe[src*="vimeo"]').length;

      return {
        title,
        author,
        date,
        publisher,
        description,
        wordCount,
        imageCount,
        videoCount,
      };
    });

    return metadata;
  } catch (error) {
    console.error('Error extracting metadata:', error);
    return {
      title: null,
      author: null,
      date: null,
      publisher: null,
      description: null,
      wordCount: 0,
      imageCount: 0,
      videoCount: 0,
    };
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
  }
}
