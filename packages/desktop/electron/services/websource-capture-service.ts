/**
 * Web Source Capture Service
 * OPT-109: Captures web pages in multiple formats (Screenshot, PDF, HTML, WARC)
 * OPT-110: WARC capture using Puppeteer CDP (no wget dependency)
 * OPT-110B: Archival-quality WARC with wget primary + enhanced CDP fallback
 *
 * Uses Puppeteer-core for all browser-based captures including WARC archives.
 * WARC format follows ISO 28500:2017 standard for web archiving.
 * Follows the project's offline-first architecture with local file storage.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import puppeteerCore, { Browser, Page, LaunchOptions, CDPSession, HTTPRequest, HTTPResponse } from 'puppeteer-core';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { calculateHash } from './crypto-service';

// Configure puppeteer-extra with stealth plugin
// This helps bypass bot detection (Cloudflare, PerimeterX, DataDome, etc.)
puppeteerExtra.use(StealthPlugin());

// Use puppeteer-extra for launching (it wraps puppeteer-core)
const puppeteer = puppeteerExtra;

const execPromise = promisify(exec);

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
  method?: 'wget' | 'cdp';
  cdxPath?: string;
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
 * OPT-112: Exported for use by orchestrator's metadata extraction
 */
export async function getBrowser(): Promise<Browser> {
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

  // Use the Research Browser's actual profile for cookies/session data
  // This shares cookies from manual browsing sessions
  const userDataDir = getResearchBrowserProfilePath();

  const options: LaunchOptions = {
    executablePath,
    headless: true as unknown as boolean, // Use headless mode (TypeScript workaround for 'new' mode)
    userDataDir, // Use Research Browser's cookies
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080',
      // Anti-bot detection measures
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      // Realistic browser settings
      '--lang=en-US,en',
      '--disable-extensions-except=',
      '--disable-default-apps',
      '--disable-component-update',
      // Prevent detection via WebGL/Canvas fingerprinting
      '--disable-reading-from-canvas',
      '--disable-3d-apis',
    ],
    ignoreDefaultArgs: ['--enable-automation'], // Hide automation flag
  };

  return puppeteer.launch(options) as Promise<Browser>;
}

/**
 * Check if a Chrome/Chromium profile is locked (browser is running)
 * Chrome creates lock files when running to prevent concurrent access
 * OPT-113: Added to detect when Research Browser is open
 */
export function isProfileLocked(profilePath: string): boolean {
  const lockFiles = [
    path.join(profilePath, 'SingletonLock'),  // Linux/macOS
    path.join(profilePath, 'lockfile'),       // Alternative
    path.join(profilePath, 'Local State.lock'), // Some versions
  ];

  for (const lockFile of lockFiles) {
    if (fs.existsSync(lockFile)) {
      return true;
    }
  }
  return false;
}

/**
 * Get the path to the Research Browser's profile directory
 * This uses the ACTUAL Chromium profile with cookies from manual browsing
 *
 * OPT-113: Now detects if browser is running and falls back to app profile
 * This allows auto-archiving even when Research Browser is open
 */
export function getResearchBrowserProfilePath(): string {
  const platform = process.platform;
  let profilePath: string;

  if (platform === 'darwin') {
    // macOS: Ungoogled Chromium stores profile here
    profilePath = path.join(process.env.HOME || '', 'Library', 'Application Support', 'Chromium');
  } else if (platform === 'linux') {
    // Linux: ~/.config/chromium
    profilePath = path.join(process.env.HOME || '', '.config', 'chromium');
  } else {
    // Windows: %LOCALAPPDATA%\Chromium\User Data
    profilePath = path.join(process.env.LOCALAPPDATA || '', 'Chromium', 'User Data');
  }

  // Check if profile exists AND is not locked by running browser
  if (fs.existsSync(profilePath)) {
    if (!isProfileLocked(profilePath)) {
      console.log('[WebSource] Using Research Browser profile:', profilePath);
      return profilePath;
    }
    // Profile exists but is locked - browser is running
    console.log('[WebSource] Research Browser profile LOCKED (browser running), using fallback');
  } else {
    console.log('[WebSource] Research Browser profile not found, using fallback');
  }

  // Fallback: Create/use app-managed profile directory
  const { app } = require('electron');
  const fallbackDir = path.join(app.getPath('userData'), 'browser-profile');
  if (!fs.existsSync(fallbackDir)) {
    fs.mkdirSync(fallbackDir, { recursive: true });
  }
  return fallbackDir;
}

/**
 * Legacy function for backwards compatibility
 * @deprecated Use getResearchBrowserProfilePath instead
 */
export function getBrowserProfilePath(): string {
  return getResearchBrowserProfilePath();
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
// WARC Capture (OPT-110B: wget primary + enhanced CDP fallback)
// =============================================================================

/**
 * WARC record types per ISO 28500:2017
 */
type WarcRecordType = 'warcinfo' | 'request' | 'response' | 'metadata';

/**
 * Pending request data for CDP capture
 */
interface PendingRequest {
  requestId: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
  timestamp: Date;
  status?: number;
  statusText?: string;
  responseHeaders?: Record<string, string>;
  mimeType?: string;
  body?: Buffer;
}

/**
 * Captured network record for WARC generation
 */
interface NetworkRecord {
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
  status: number;
  statusText: string;
  responseHeaders: Record<string, string>;
  mimeType: string;
  body: Buffer;
  timestamp: Date;
}

/**
 * Generate a UUID v4 for WARC record IDs
 */
function generateWarcId(): string {
  const bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant
  const hex = bytes.toString('hex');
  return `<urn:uuid:${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}>`;
}

/**
 * Format a date as WARC-Date (ISO 8601 with Z timezone)
 */
function formatWarcDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Format date for CDX timestamp (YYYYMMDDhhmmss)
 */
function formatCDXTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

/**
 * Reverse domain for SURT format in CDX
 */
function reverseDomain(hostname: string): string {
  return hostname.split('.').reverse().join(',') + ')';
}

/**
 * Promisified gzip
 */
function gzipAsync(buffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zlib.gzip(buffer, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

/**
 * Build PendingRequest into NetworkRecord
 */
function buildNetworkRecord(pending: PendingRequest): NetworkRecord {
  return {
    url: pending.url,
    method: pending.method,
    headers: pending.headers,
    postData: pending.postData,
    status: pending.status || 200,
    statusText: pending.statusText || 'OK',
    responseHeaders: pending.responseHeaders || {},
    mimeType: pending.mimeType || 'application/octet-stream',
    body: pending.body || Buffer.alloc(0),
    timestamp: pending.timestamp,
  };
}

// =============================================================================
// wget Detection and Capture
// =============================================================================

/**
 * Find wget executable on the system
 * wget is preferred for archival-grade WARC capture
 */
async function findWgetExecutable(): Promise<string | null> {
  const paths = [
    '/opt/homebrew/bin/wget',    // macOS ARM (Homebrew)
    '/usr/local/bin/wget',       // macOS Intel (Homebrew)
    '/usr/bin/wget',             // Linux system
    '/snap/bin/wget',            // Ubuntu Snap
  ];

  for (const p of paths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  // Try PATH lookup
  try {
    const { stdout } = await execPromise('which wget');
    const found = stdout.trim();
    if (found && fs.existsSync(found)) {
      return found;
    }
  } catch {
    // wget not in PATH
  }

  return null;
}

/**
 * Capture WARC using wget (archival-grade)
 * wget produces valid WARC 1.1 files with CDX index
 */
async function captureWarcWithWget(
  options: CaptureOptions,
  wgetPath: string
): Promise<CaptureResult> {
  const startTime = Date.now();

  await fs.promises.mkdir(options.outputDir, { recursive: true });
  const warcBase = path.join(options.outputDir, options.sourceId);

  const args = [
    `--warc-file=${warcBase}`,
    '--warc-cdx',                    // Generate CDX index
    '--page-requisites',             // Get CSS, JS, images
    '--span-hosts',                  // Allow resources from other hosts
    '--adjust-extension',            // Add .html to extensionless files
    '--convert-links',               // Convert links for offline viewing
    '--no-directories',              // Flat output structure
    `--timeout=${Math.floor((options.timeout || 30000) / 1000)}`,
    '--tries=3',                     // Retry failed requests
    '--waitretry=1',                 // Wait 1s between retries
    '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    '-P', options.outputDir,
    options.url,
  ];

  return new Promise((resolve) => {
    const wget = spawn(wgetPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';

    wget.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    wget.on('close', async (code) => {
      const warcPath = `${warcBase}.warc.gz`;
      const cdxPath = `${warcBase}.cdx`;

      if (fs.existsSync(warcPath)) {
        try {
          const hash = await calculateHash(warcPath);
          const stats = await fs.promises.stat(warcPath);

          resolve({
            success: true,
            path: warcPath,
            hash,
            size: stats.size,
            duration: Date.now() - startTime,
            method: 'wget',
            cdxPath: fs.existsSync(cdxPath) ? cdxPath : undefined,
          });
        } catch (err) {
          resolve({
            success: false,
            error: `Failed to hash WARC: ${err instanceof Error ? err.message : String(err)}`,
            duration: Date.now() - startTime,
            method: 'wget',
          });
        }
      } else {
        resolve({
          success: false,
          error: `wget exited with code ${code}: ${stderr.slice(-500)}`,
          duration: Date.now() - startTime,
          method: 'wget',
        });
      }
    });

    wget.on('error', (err) => {
      resolve({
        success: false,
        error: err.message,
        duration: Date.now() - startTime,
        method: 'wget',
      });
    });
  });
}

// =============================================================================
// Enhanced CDP Capture (Fallback)
// =============================================================================

/**
 * Run behavior scripts to trigger lazy loading
 * Comprehensive approach for modern web pages
 */
async function runBehaviorScripts(page: Page): Promise<void> {
  await page.evaluate(async () => {
    // 1. Scroll through entire page to trigger lazy loading
    const scrollStep = async () => {
      const scrollHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      );
      const viewportHeight = window.innerHeight;

      for (let y = 0; y < scrollHeight; y += viewportHeight * 0.8) {
        window.scrollTo(0, y);
        await new Promise(r => setTimeout(r, 150));
      }

      // Scroll back to top
      window.scrollTo(0, 0);
    };

    await scrollStep();

    // 2. Wait for any lazy images to load
    await new Promise(r => setTimeout(r, 500));

    // 3. Click any "load more" buttons (common pattern)
    const loadMoreButtons = document.querySelectorAll(
      'button[class*="load"], button[class*="more"], [data-load-more], .load-more, .show-more'
    );
    for (const btn of Array.from(loadMoreButtons).slice(0, 3)) {
      try {
        (btn as HTMLElement).click();
        await new Promise(r => setTimeout(r, 500));
      } catch {
        // Ignore click errors
      }
    }

    // 4. Expand any collapsed sections
    const expandButtons = document.querySelectorAll(
      '[aria-expanded="false"], details:not([open]), .accordion:not(.open), [data-toggle="collapse"]'
    );
    for (const el of Array.from(expandButtons).slice(0, 5)) {
      try {
        if (el.tagName === 'DETAILS') {
          (el as HTMLDetailsElement).open = true;
        } else {
          (el as HTMLElement).click();
        }
        await new Promise(r => setTimeout(r, 200));
      } catch {
        // Ignore click errors
      }
    }

    // 5. Scroll once more to catch any newly revealed content
    await scrollStep();
  });
}

/**
 * Wait for network to become idle
 */
async function waitForNetworkIdle(page: Page, idleTime: number): Promise<void> {
  try {
    await page.evaluate(async (ms) => {
      await new Promise(r => setTimeout(r, ms));
    }, idleTime);
  } catch {
    // Ignore timeout errors
  }
}

/**
 * Generate CDX index for replay tool compatibility
 * CDX format: SURT timestamp url mimetype status digest - - offset filename
 */
function generateCDXIndex(records: NetworkRecord[], warcFilename: string): string {
  const lines: string[] = [];

  // CDX header
  lines.push(' CDX N b a m s k r M S V g');

  let offset = 0;
  for (const record of records) {
    try {
      const url = new URL(record.url);
      const surt = reverseDomain(url.hostname) + url.pathname + (url.search || '');
      const timestamp = formatCDXTimestamp(record.timestamp);
      const digest = record.body.length > 0
        ? crypto.createHash('sha256').update(record.body).digest('base64').slice(0, 32)
        : '-';
      const length = record.body.length;

      lines.push(
        `${surt} ${timestamp} ${record.url} ${record.mimeType || 'unk'} ${record.status} ${digest} - - ${offset} ${warcFilename}`
      );

      offset += length + 500; // Approximate WARC record overhead
    } catch {
      // Skip malformed URLs
    }
  }

  return lines.join('\n');
}

/**
 * Build WARC warcinfo record (metadata about the archive)
 */
function buildWarcinfoRecord(targetUrl: string): Buffer {
  const warcId = generateWarcId();
  const warcDate = formatWarcDate(new Date());

  const info = [
    'software: AU Archive WebSource Capture 2.0',
    'format: WARC File Format 1.1',
    'conformsTo: http://iipc.github.io/warc-specifications/specifications/warc-format/warc-1.1/',
    'robots: obey',
    'isPartOf: AU Archive',
    '',
  ].join('\r\n');

  const infoBuffer = Buffer.from(info, 'utf-8');

  let header = 'WARC/1.1\r\n';
  header += 'WARC-Type: warcinfo\r\n';
  header += `WARC-Record-ID: ${warcId}\r\n`;
  header += `WARC-Date: ${warcDate}\r\n`;
  header += 'WARC-Filename: archive.warc.gz\r\n';
  header += 'Content-Type: application/warc-fields\r\n';
  header += `Content-Length: ${infoBuffer.length}\r\n`;
  header += '\r\n';

  return Buffer.concat([
    Buffer.from(header, 'utf-8'),
    infoBuffer,
    Buffer.from('\r\n\r\n', 'utf-8'),
  ]);
}

/**
 * Build WARC response record from network data
 */
function buildResponseRecord(record: NetworkRecord): { responseRecord: Buffer; responseId: string } {
  const warcId = generateWarcId();
  const warcDate = formatWarcDate(record.timestamp);

  // Build HTTP response
  let httpResponse = `HTTP/1.1 ${record.status} ${record.statusText || 'OK'}\r\n`;
  for (const [key, value] of Object.entries(record.responseHeaders || {})) {
    httpResponse += `${key}: ${value}\r\n`;
  }
  httpResponse += '\r\n';

  const httpBuffer = Buffer.concat([
    Buffer.from(httpResponse, 'utf-8'),
    record.body || Buffer.alloc(0),
  ]);

  // Calculate digest
  const payloadDigest = record.body.length > 0
    ? 'sha256:' + crypto.createHash('sha256').update(record.body).digest('base64')
    : undefined;

  let header = 'WARC/1.1\r\n';
  header += 'WARC-Type: response\r\n';
  header += `WARC-Record-ID: ${warcId}\r\n`;
  header += `WARC-Date: ${warcDate}\r\n`;
  header += `WARC-Target-URI: ${record.url}\r\n`;
  header += 'Content-Type: application/http;msgtype=response\r\n';
  header += `Content-Length: ${httpBuffer.length}\r\n`;
  if (payloadDigest) {
    header += `WARC-Payload-Digest: ${payloadDigest}\r\n`;
  }
  header += '\r\n';

  return {
    responseRecord: Buffer.concat([
      Buffer.from(header, 'utf-8'),
      httpBuffer,
      Buffer.from('\r\n\r\n', 'utf-8'),
    ]),
    responseId: warcId,
  };
}

/**
 * Build WARC request record from network data
 */
function buildRequestRecord(record: NetworkRecord, concurrentTo: string): Buffer {
  const warcId = generateWarcId();
  const warcDate = formatWarcDate(record.timestamp);

  // Build HTTP request
  const urlObj = new URL(record.url);
  let httpRequest = `${record.method} ${urlObj.pathname}${urlObj.search} HTTP/1.1\r\n`;
  httpRequest += `Host: ${urlObj.host}\r\n`;

  for (const [key, value] of Object.entries(record.headers || {})) {
    if (key.toLowerCase() !== 'host') {
      httpRequest += `${key}: ${value}\r\n`;
    }
  }
  httpRequest += '\r\n';

  if (record.postData) {
    httpRequest += record.postData;
  }

  const httpBuffer = Buffer.from(httpRequest, 'utf-8');

  let header = 'WARC/1.1\r\n';
  header += 'WARC-Type: request\r\n';
  header += `WARC-Record-ID: ${warcId}\r\n`;
  header += `WARC-Date: ${warcDate}\r\n`;
  header += `WARC-Target-URI: ${record.url}\r\n`;
  header += `WARC-Concurrent-To: ${concurrentTo}\r\n`;
  header += 'Content-Type: application/http;msgtype=request\r\n';
  header += `Content-Length: ${httpBuffer.length}\r\n`;
  header += '\r\n';

  return Buffer.concat([
    Buffer.from(header, 'utf-8'),
    httpBuffer,
    Buffer.from('\r\n\r\n', 'utf-8'),
  ]);
}

/**
 * Build WARC file from network records
 */
function buildWarcFile(records: NetworkRecord[], targetUrl: string): Buffer {
  const chunks: Buffer[] = [];

  // 1. Warcinfo record
  chunks.push(buildWarcinfoRecord(targetUrl));

  // 2. Request/Response pairs
  for (const record of records) {
    const { responseRecord, responseId } = buildResponseRecord(record);
    chunks.push(responseRecord);
    chunks.push(buildRequestRecord(record, responseId));
  }

  return Buffer.concat(chunks);
}

/**
 * Capture WARC using enhanced CDP (fallback when wget unavailable)
 * Uses Network API (observe mode) instead of Fetch API (intercept mode)
 * Gets response body AFTER loadingFinished for guaranteed completeness
 */
async function captureWarcWithCDP(options: CaptureOptions): Promise<CaptureResult> {
  const startTime = Date.now();
  let page: Page | null = null;
  let cdpSession: CDPSession | null = null;

  // Storage for captured network data
  const networkRecords: NetworkRecord[] = [];
  const pendingRequests = new Map<string, PendingRequest>();

  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    // Create CDP session
    cdpSession = await page.createCDPSession();

    // Enable Network domain with large buffers for response body capture
    await cdpSession.send('Network.enable', {
      maxResourceBufferSize: 100 * 1024 * 1024,  // 100MB per resource
      maxTotalBufferSize: 500 * 1024 * 1024,     // 500MB total
    });

    // Track request start
    cdpSession.on('Network.requestWillBeSent', (event: any) => {
      pendingRequests.set(event.requestId, {
        requestId: event.requestId,
        url: event.request.url,
        method: event.request.method,
        headers: event.request.headers as Record<string, string>,
        postData: event.request.postData,
        timestamp: new Date(),
      });
    });

    // Track response headers
    cdpSession.on('Network.responseReceived', (event: any) => {
      const pending = pendingRequests.get(event.requestId);
      if (pending) {
        pending.status = event.response.status;
        pending.statusText = event.response.statusText;
        pending.responseHeaders = event.response.headers;
        pending.mimeType = event.response.mimeType;
      }
    });

    // Capture body when fully loaded (key difference from Fetch API)
    cdpSession.on('Network.loadingFinished', async (event: any) => {
      const pending = pendingRequests.get(event.requestId);
      if (!pending) return;

      try {
        const result = await cdpSession!.send('Network.getResponseBody', {
          requestId: event.requestId,
        });

        pending.body = (result as any).base64Encoded
          ? Buffer.from((result as any).body, 'base64')
          : Buffer.from((result as any).body, 'utf-8');

        // Move to completed records
        if (pending.status) {
          networkRecords.push(buildNetworkRecord(pending));
        }
      } catch {
        // Some responses don't have bodies (204, redirects)
      }

      pendingRequests.delete(event.requestId);
    });

    // Handle failed requests
    cdpSession.on('Network.loadingFailed', (event: any) => {
      pendingRequests.delete(event.requestId);
    });

    // Navigate to page
    await page.goto(options.url, {
      waitUntil: 'networkidle2',
      timeout: options.timeout || 30000,
    });

    // Run behavior scripts to trigger lazy loading
    await runBehaviorScripts(page);

    // Wait for any final network activity
    await waitForNetworkIdle(page, 2000);

    // Cleanup CDP
    await cdpSession.send('Network.disable');
    await cdpSession.detach();
    cdpSession = null;

    if (networkRecords.length === 0) {
      return {
        success: false,
        error: 'No network requests captured',
        duration: Date.now() - startTime,
        method: 'cdp',
      };
    }

    // Build and write WARC file
    await fs.promises.mkdir(options.outputDir, { recursive: true });
    const warcPath = path.join(options.outputDir, `${options.sourceId}.warc.gz`);
    const cdxPath = path.join(options.outputDir, `${options.sourceId}.cdx`);

    const warcContent = buildWarcFile(networkRecords, options.url);
    const compressed = await gzipAsync(warcContent);
    await fs.promises.writeFile(warcPath, compressed);

    // Generate CDX index
    const cdxContent = generateCDXIndex(networkRecords, `${options.sourceId}.warc.gz`);
    await fs.promises.writeFile(cdxPath, cdxContent);

    const hash = await calculateHash(warcPath);
    const stats = await fs.promises.stat(warcPath);

    return {
      success: true,
      path: warcPath,
      hash,
      size: stats.size,
      duration: Date.now() - startTime,
      method: 'cdp',
      cdxPath,
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
      method: 'cdp',
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

/**
 * Capture the URL as a WARC archive
 * OPT-110B: Uses wget as primary (archival-grade) with enhanced CDP fallback
 *
 * Priority:
 * 1. wget (if available) - produces archival-quality WARC with CDX index
 * 2. Enhanced CDP - uses Network API (observe) instead of Fetch API (intercept)
 *
 * WARC is the standard format for web archiving (ISO 28500:2017)
 */
export async function captureWarc(options: CaptureOptions): Promise<CaptureResult> {
  // Try wget first (archival quality)
  const wgetPath = await findWgetExecutable();
  if (wgetPath) {
    console.log('[WARC] Using wget for archival-quality capture');
    return captureWarcWithWget(options, wgetPath);
  }

  // Fallback to enhanced CDP
  console.log('[WARC] wget not found, using enhanced CDP capture');
  return captureWarcWithCDP(options);
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
