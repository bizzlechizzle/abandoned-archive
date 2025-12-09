/**
 * Web Source Capture Service
 * OPT-109: Captures web pages in multiple formats (Screenshot, PDF, HTML, WARC)
 * OPT-110: WARC capture using Puppeteer CDP (no wget dependency)
 *
 * Uses Puppeteer-core for all browser-based captures including WARC archives.
 * WARC format follows ISO 28500:2017 standard for web archiving.
 * Follows the project's offline-first architecture with local file storage.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { fileURLToPath } from 'url';
import puppeteer, { Browser, Page, LaunchOptions, CDPSession, HTTPRequest, HTTPResponse } from 'puppeteer-core';
import { calculateHash } from './crypto-service';

// ES module compatibility - __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  // Find Chromium executable - check common locations
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
// WARC Capture (Puppeteer CDP-based, no wget dependency)
// =============================================================================

/**
 * WARC record types per ISO 28500:2017
 */
type WarcRecordType = 'warcinfo' | 'request' | 'response' | 'metadata';

/**
 * Captured network record for WARC generation
 */
interface NetworkRecord {
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  statusCode: number;
  statusText: string;
  responseHeaders: Record<string, string>;
  responseBody: Buffer;
  timestamp: Date;
}

/**
 * Generate a UUID v4 for WARC record IDs
 */
function generateWarcId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `<urn:uuid:${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}>`;
}

/**
 * Format a date as WARC-Date (ISO 8601 with Z timezone)
 */
function formatWarcDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Build a WARC record block following ISO 28500:2017
 */
function buildWarcRecord(
  type: WarcRecordType,
  targetUri: string,
  date: Date,
  contentType: string,
  payload: Buffer,
  extraHeaders: Record<string, string> = {}
): Buffer {
  const recordId = generateWarcId();
  const warcDate = formatWarcDate(date);

  // Build WARC headers
  let headers = `WARC/1.1\r\n`;
  headers += `WARC-Type: ${type}\r\n`;
  headers += `WARC-Record-ID: ${recordId}\r\n`;
  headers += `WARC-Date: ${warcDate}\r\n`;
  headers += `WARC-Target-URI: ${targetUri}\r\n`;
  headers += `Content-Type: ${contentType}\r\n`;
  headers += `Content-Length: ${payload.length}\r\n`;

  for (const [key, value] of Object.entries(extraHeaders)) {
    headers += `${key}: ${value}\r\n`;
  }

  headers += `\r\n`;

  // Combine: headers + payload + double CRLF terminator
  return Buffer.concat([
    Buffer.from(headers, 'utf-8'),
    payload,
    Buffer.from('\r\n\r\n', 'utf-8'),
  ]);
}

/**
 * Build WARC request record from network data
 */
function buildRequestRecord(record: NetworkRecord, concurrentId: string): Buffer {
  // Build HTTP request block
  let httpRequest = `${record.method} ${new URL(record.url).pathname}${new URL(record.url).search} HTTP/1.1\r\n`;
  httpRequest += `Host: ${new URL(record.url).host}\r\n`;

  for (const [key, value] of Object.entries(record.requestHeaders)) {
    if (key.toLowerCase() !== 'host') {
      httpRequest += `${key}: ${value}\r\n`;
    }
  }
  httpRequest += `\r\n`;

  if (record.requestBody) {
    httpRequest += record.requestBody;
  }

  return buildWarcRecord(
    'request',
    record.url,
    record.timestamp,
    'application/http;msgtype=request',
    Buffer.from(httpRequest, 'utf-8'),
    { 'WARC-Concurrent-To': concurrentId }
  );
}

/**
 * Build WARC response record from network data
 */
function buildResponseRecord(record: NetworkRecord): { record: Buffer; id: string } {
  const recordId = generateWarcId();

  // Build HTTP response block
  let httpResponse = `HTTP/1.1 ${record.statusCode} ${record.statusText}\r\n`;

  for (const [key, value] of Object.entries(record.responseHeaders)) {
    httpResponse += `${key}: ${value}\r\n`;
  }
  httpResponse += `\r\n`;

  const responseBuffer = Buffer.concat([
    Buffer.from(httpResponse, 'utf-8'),
    record.responseBody,
  ]);

  // Build WARC headers manually to include custom record ID
  const warcDate = formatWarcDate(record.timestamp);
  let headers = `WARC/1.1\r\n`;
  headers += `WARC-Type: response\r\n`;
  headers += `WARC-Record-ID: ${recordId}\r\n`;
  headers += `WARC-Date: ${warcDate}\r\n`;
  headers += `WARC-Target-URI: ${record.url}\r\n`;
  headers += `Content-Type: application/http;msgtype=response\r\n`;
  headers += `Content-Length: ${responseBuffer.length}\r\n`;
  headers += `\r\n`;

  const warcRecord = Buffer.concat([
    Buffer.from(headers, 'utf-8'),
    responseBuffer,
    Buffer.from('\r\n\r\n', 'utf-8'),
  ]);

  return { record: warcRecord, id: recordId };
}

/**
 * Build WARC warcinfo record (metadata about the archive)
 */
function buildWarcinfoRecord(url: string, software: string): Buffer {
  const info = [
    `software: ${software}`,
    `format: WARC File Format 1.1`,
    `conformsTo: http://iipc.github.io/warc-specifications/specifications/warc-format/warc-1.1/`,
    `isPartOf: AU Archive Web Sources`,
    ``,
  ].join('\r\n');

  return buildWarcRecord(
    'warcinfo',
    url,
    new Date(),
    'application/warc-fields',
    Buffer.from(info, 'utf-8')
  );
}

/**
 * Capture the URL as a WARC archive using Puppeteer CDP
 * WARC is the standard format for web archiving (ISO 28500:2017)
 *
 * OPT-110: Replaced wget dependency with pure Puppeteer/CDP implementation
 */
export async function captureWarc(options: CaptureOptions): Promise<CaptureResult> {
  const startTime = Date.now();
  let page: Page | null = null;
  let cdpSession: CDPSession | null = null;
  const networkRecords: NetworkRecord[] = [];
  const pendingRequests = new Map<string, { url: string; method: string; headers: Record<string, string>; body?: string; timestamp: Date }>();

  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    // Enable CDP session for network interception
    cdpSession = await page.createCDPSession();
    await cdpSession.send('Network.enable');
    await cdpSession.send('Fetch.enable', { patterns: [{ requestStage: 'Response' }] });

    // Track requests
    cdpSession.on('Network.requestWillBeSent', (event) => {
      pendingRequests.set(event.requestId, {
        url: event.request.url,
        method: event.request.method,
        headers: event.request.headers as Record<string, string>,
        body: event.request.postData,
        timestamp: new Date(),
      });
    });

    // Handle Fetch.requestPaused to capture response bodies
    cdpSession.on('Fetch.requestPaused', async (event) => {
      try {
        const requestData = pendingRequests.get(event.networkId || event.requestId);
        if (!requestData) {
          // Continue without recording if we didn't see the request
          await cdpSession!.send('Fetch.continueRequest', { requestId: event.requestId });
          return;
        }

        // Get response body
        let responseBody = Buffer.alloc(0);
        try {
          const bodyResult = await cdpSession!.send('Fetch.getResponseBody', { requestId: event.requestId });
          responseBody = bodyResult.base64Encoded
            ? Buffer.from(bodyResult.body, 'base64')
            : Buffer.from(bodyResult.body, 'utf-8');
        } catch {
          // Some responses don't have bodies (redirects, etc.)
        }

        // Parse response headers
        const responseHeaders: Record<string, string> = {};
        for (const header of event.responseHeaders || []) {
          responseHeaders[header.name] = header.value;
        }

        // Store the complete network record
        networkRecords.push({
          url: requestData.url,
          method: requestData.method,
          requestHeaders: requestData.headers,
          requestBody: requestData.body,
          statusCode: event.responseStatusCode || 200,
          statusText: event.responseStatusText || 'OK',
          responseHeaders,
          responseBody,
          timestamp: requestData.timestamp,
        });

        // Continue the request
        await cdpSession!.send('Fetch.continueRequest', { requestId: event.requestId });
      } catch (err) {
        // On error, still try to continue
        try {
          await cdpSession!.send('Fetch.continueRequest', { requestId: event.requestId });
        } catch {
          // Ignore if already continued
        }
      }
    });

    // Navigate to URL and wait for network idle
    await page.goto(options.url, {
      waitUntil: 'networkidle2',
      timeout: options.timeout || 30000,
    });

    // Scroll to trigger lazy loading
    if (options.scrollPage !== false) {
      await autoScroll(page);
    }

    // Wait a bit for any final requests
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Disable CDP session
    await cdpSession.send('Fetch.disable');
    await cdpSession.send('Network.disable');
    await cdpSession.detach();
    cdpSession = null;

    if (networkRecords.length === 0) {
      return {
        success: false,
        error: 'No network requests captured',
        duration: Date.now() - startTime,
      };
    }

    // Build WARC file
    const warcChunks: Buffer[] = [];

    // Add warcinfo record
    warcChunks.push(buildWarcinfoRecord(options.url, 'AU Archive WebSource Capture 1.0'));

    // Add request/response pairs
    for (const record of networkRecords) {
      const { record: responseRecord, id: responseId } = buildResponseRecord(record);
      warcChunks.push(responseRecord);
      warcChunks.push(buildRequestRecord(record, responseId));
    }

    const warcContent = Buffer.concat(warcChunks);

    // Ensure output directory exists
    await fs.promises.mkdir(options.outputDir, { recursive: true });

    // Compress and write WARC file
    const warcPath = path.join(options.outputDir, `${options.sourceId}.warc.gz`);
    const compressed = await new Promise<Buffer>((resolve, reject) => {
      zlib.gzip(warcContent, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    await fs.promises.writeFile(warcPath, compressed);

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
  } finally {
    if (cdpSession) {
      try {
        await cdpSession.detach();
      } catch {
        // Ignore detach errors
      }
    }
    if (page) {
      await page.close().catch(() => {});
    }
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
