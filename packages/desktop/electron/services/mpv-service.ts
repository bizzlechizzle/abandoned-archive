/**
 * MPV Service - Professional video playback via MPV player
 *
 * MPV is the gold-standard open-source video player that handles:
 * - All codecs (HEVC, Dolby Vision, ProRes, etc.)
 * - Automatic rotation from displaymatrix metadata
 * - Hardware acceleration for 4K+ content
 * - Full scrubbing/seeking support
 *
 * License: LGPL/GPL (open source, CLAUDE.md compliant)
 *
 * @see docs/plans/mpv-integration-plan.md
 */

import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import { shell } from 'electron';
import * as path from 'path';

const execFileAsync = promisify(execFile);

export interface MpvPlayResult {
  success: boolean;
  method: 'mpv' | 'system' | 'failed';
  message?: string;
}

export interface MpvStatus {
  installed: boolean;
  path: string | null;
  version: string | null;
}

/**
 * Service for launching videos in MPV player
 * Falls back to system default player if MPV is not installed
 */
export class MpvService {
  private mpvPath: string | null = null;
  private mpvChecked = false;

  /**
   * Common MPV installation paths by platform
   */
  private readonly mpvPaths: Record<string, string[]> = {
    darwin: [
      '/opt/homebrew/bin/mpv',      // Homebrew Apple Silicon
      '/usr/local/bin/mpv',          // Homebrew Intel
      '/Applications/mpv.app/Contents/MacOS/mpv',  // App bundle
    ],
    win32: [
      'C:\\Program Files\\mpv\\mpv.exe',
      'C:\\Program Files (x86)\\mpv\\mpv.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'mpv', 'mpv.exe'),
    ],
    linux: [
      '/usr/bin/mpv',
      '/usr/local/bin/mpv',
      '/snap/bin/mpv',
    ],
  };

  /**
   * Check if MPV is installed and get its path
   */
  async checkMpvInstalled(): Promise<MpvStatus> {
    if (this.mpvChecked && this.mpvPath) {
      return { installed: true, path: this.mpvPath, version: null };
    }

    // First try 'which' / 'where' to find mpv in PATH
    try {
      const cmd = process.platform === 'win32' ? 'where' : 'which';
      const { stdout } = await execFileAsync(cmd, ['mpv']);
      const foundPath = stdout.trim().split('\n')[0];
      if (foundPath) {
        this.mpvPath = foundPath;
        this.mpvChecked = true;
        console.log('[MpvService] Found MPV in PATH:', foundPath);
        return { installed: true, path: foundPath, version: await this.getMpvVersion(foundPath) };
      }
    } catch {
      // Not in PATH, check known locations
    }

    // Check platform-specific paths
    const platformPaths = this.mpvPaths[process.platform] || [];
    for (const mpvPath of platformPaths) {
      try {
        await execFileAsync(mpvPath, ['--version']);
        this.mpvPath = mpvPath;
        this.mpvChecked = true;
        console.log('[MpvService] Found MPV at:', mpvPath);
        return { installed: true, path: mpvPath, version: await this.getMpvVersion(mpvPath) };
      } catch {
        // Not at this path
      }
    }

    this.mpvChecked = true;
    console.log('[MpvService] MPV not found on system');
    return { installed: false, path: null, version: null };
  }

  /**
   * Get MPV version string
   */
  private async getMpvVersion(mpvPath: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync(mpvPath, ['--version']);
      const match = stdout.match(/mpv\s+([\d.]+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  /**
   * Play a video file in MPV
   * Falls back to system player if MPV is not installed
   *
   * @param videoPath - Absolute path to video file
   * @param title - Optional window title
   */
  async playVideo(videoPath: string, title?: string): Promise<MpvPlayResult> {
    const status = await this.checkMpvInstalled();

    if (status.installed && status.path) {
      return this.launchMpv(status.path, videoPath, title);
    }

    // Fallback to system default player
    console.log('[MpvService] Falling back to system player');
    return this.launchSystemPlayer(videoPath);
  }

  /**
   * Launch MPV with the video file
   */
  private async launchMpv(mpvPath: string, videoPath: string, title?: string): Promise<MpvPlayResult> {
    try {
      const windowTitle = title || `AU Archive - ${path.basename(videoPath)}`;

      const args = [
        '--no-terminal',           // Don't use terminal for output
        '--force-window=yes',      // Always create window
        '--autofit=80%',           // Window size (80% of screen)
        '--autofit-larger=90%',    // Max size for large videos
        `--title=${windowTitle}`,  // Window title
        '--osd-level=1',           // Show minimal OSD
        '--osd-duration=1000',     // OSD message duration
        '--keep-open=yes',         // Keep window open after video ends
        '--cursor-autohide=1000',  // Hide cursor after 1 second
        '--screenshot-directory=~', // Screenshots go to home dir
        '--hr-seek=yes',           // Precise seeking
        videoPath,
      ];

      console.log('[MpvService] Launching MPV:', mpvPath, args.slice(-1));

      // Spawn MPV as detached process so it doesn't block
      const mpvProcess = spawn(mpvPath, args, {
        detached: true,
        stdio: 'ignore',
      });

      // Unref so Node doesn't wait for MPV to exit
      mpvProcess.unref();

      return {
        success: true,
        method: 'mpv',
        message: 'Video opened in MPV player',
      };
    } catch (error) {
      console.error('[MpvService] Failed to launch MPV:', error);
      // Fall back to system player
      return this.launchSystemPlayer(videoPath);
    }
  }

  /**
   * Launch video in system default player (fallback)
   */
  private async launchSystemPlayer(videoPath: string): Promise<MpvPlayResult> {
    try {
      await shell.openPath(videoPath);
      return {
        success: true,
        method: 'system',
        message: 'Video opened in system player (install MPV for best experience)',
      };
    } catch (error) {
      console.error('[MpvService] Failed to open in system player:', error);
      return {
        success: false,
        method: 'failed',
        message: `Failed to play video: ${error}`,
      };
    }
  }

  /**
   * Get installation instructions for the current platform
   */
  getInstallInstructions(): string {
    switch (process.platform) {
      case 'darwin':
        return 'Install MPV with Homebrew: brew install mpv';
      case 'win32':
        return 'Download MPV from https://mpv.io/installation/ or use: winget install mpv';
      case 'linux':
        return 'Install MPV with your package manager: sudo apt install mpv (Debian/Ubuntu) or sudo dnf install mpv (Fedora)';
      default:
        return 'Visit https://mpv.io/installation/ for installation instructions';
    }
  }
}

// Singleton instance
export const mpvService = new MpvService();
