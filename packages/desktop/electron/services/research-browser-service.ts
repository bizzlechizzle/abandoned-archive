/**
 * research-browser-service.ts
 *
 * Manages the Ungoogled Chromium browser for research workflows.
 * Uses puppeteer-core to launch and control the browser.
 */
import puppeteer, { Browser } from 'puppeteer-core';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { app } from 'electron';
import { getLogger } from './logger-service';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = getLogger();

let browser: Browser | null = null;
let isLaunching = false;

/**
 * Get the path to the Ungoogled Chromium executable
 * based on the current platform
 */
function getChromiumPath(): string {
  const platform = process.platform;
  const arch = process.arch;

  // In development, look in resources/browsers/
  // In production, look in app.getPath('exe')/../resources/browsers/
  const isDev = !app.isPackaged;

  let basePath: string;
  if (isDev) {
    basePath = path.join(__dirname, '../../../../resources/browsers/ungoogled-chromium');
  } else {
    basePath = path.join(process.resourcesPath, 'browsers/ungoogled-chromium');
  }

  switch (platform) {
    case 'darwin': {
      // macOS - both arm64 and x64 use .app bundle
      const macArch = arch === 'arm64' ? 'mac-arm64' : 'mac-x64';
      return path.join(basePath, macArch, 'Chromium.app/Contents/MacOS/Chromium');
    }

    case 'win32':
      return path.join(basePath, 'win-x64', 'chrome.exe');

    case 'linux':
      return path.join(basePath, 'linux-x64', 'chrome');

    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Get the path to store browser profile data
 * This persists logins, cookies, etc.
 */
function getProfilePath(): string {
  return path.join(app.getPath('userData'), 'research-browser');
}

/**
 * Get the path to our browser extension
 */
function getExtensionPath(): string {
  const isDev = !app.isPackaged;

  if (isDev) {
    return path.join(__dirname, '../../../../resources/extension');
  } else {
    return path.join(process.resourcesPath, 'extension');
  }
}

/**
 * Launch the Research Browser
 */
export async function launchResearchBrowser(): Promise<{ success: boolean; error?: string }> {
  // Prevent multiple simultaneous launches
  if (isLaunching) {
    return { success: false, error: 'Browser is already launching' };
  }

  // If already running, just focus it
  if (browser && browser.connected) {
    logger.info('ResearchBrowser', 'Browser already running');
    return { success: true };
  }

  isLaunching = true;

  try {
    const chromiumPath = getChromiumPath();
    const profilePath = getProfilePath();
    const extensionPath = getExtensionPath();

    logger.info('ResearchBrowser', `Launching browser from: ${chromiumPath}`);
    logger.info('ResearchBrowser', `Profile path: ${profilePath}`);
    logger.info('ResearchBrowser', `Extension path: ${extensionPath}`);

    browser = await puppeteer.launch({
      executablePath: chromiumPath,
      headless: false, // We want a visible browser window
      userDataDir: profilePath, // Persist profile data
      args: [
        `--load-extension=${extensionPath}`,
        '--disable-features=MediaRouter', // Remove Cast button
        '--no-first-run', // Skip first-run wizard
        '--no-default-browser-check', // Don't ask to be default browser
      ],
      ignoreDefaultArgs: [
        '--disable-extensions', // We need extensions enabled
        '--enable-automation', // Hide "Chrome is being controlled" banner
      ],
      defaultViewport: null, // Use full window size
    });

    // Handle browser close
    browser.on('disconnected', () => {
      logger.info('ResearchBrowser', 'Browser disconnected');
      browser = null;
    });

    // Open a default page
    const pages = await browser.pages();
    if (pages.length > 0) {
      await pages[0].goto('https://duckduckgo.com');

      // Auto-open side panel via OS-level keyboard shortcut (macOS only)
      // Chrome's sidePanel.open() requires user gesture - Puppeteer keyboard goes to page DOM, not browser
      // AppleScript sends real OS keystrokes that Chrome's browser process receives
      if (process.platform === 'darwin') {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        exec(
          `osascript -e 'tell application "System Events" to keystroke "a" using {option down, shift down}'`,
          (error) => {
            if (error) {
              logger.error('ResearchBrowser', `AppleScript keystroke failed: ${error.message}`);
            } else {
              logger.info('ResearchBrowser', 'Sent OS keystroke (Alt+Shift+A) to open side panel');
            }
          }
        );
      }
    }

    logger.info('ResearchBrowser', 'Browser launched successfully');
    return { success: true };
  } catch (error) {
    logger.error('ResearchBrowser', `Launch failed: ${error}`);
    return { success: false, error: String(error) };
  } finally {
    isLaunching = false;
  }
}

/**
 * Close the Research Browser
 */
export async function closeResearchBrowser(): Promise<void> {
  if (browser) {
    try {
      await browser.close();
    } catch (error) {
      logger.error('ResearchBrowser', `Close error: ${error}`);
    }
    browser = null;
  }
}

/**
 * Check if browser is currently running
 */
export function isResearchBrowserRunning(): boolean {
  return browser !== null && browser.connected;
}

/**
 * Get browser status
 */
export function getResearchBrowserStatus(): { running: boolean; pages?: number } {
  if (!browser || !browser.connected) {
    return { running: false };
  }

  return { running: true };
}
