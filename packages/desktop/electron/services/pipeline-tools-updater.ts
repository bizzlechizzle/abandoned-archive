/**
 * Pipeline Tools Updater Service
 *
 * Automatically updates all pipeline tools from GitHub on app startup.
 * Clone if not present, pull if exists, then install.
 *
 * Tools:
 * - visual-buffet: ML tagging (Python)
 * - shoemaker: Photo post-processing (Python)
 * - wake-n-blake: BLAKE3 hashing + metadata extraction (Python)
 * - mapsh-pit: Map processing utilities (Python)
 * - father-time: Date/time extraction (Python)
 * - repo-depot: Repository management (Node/CLI)
 * - national-treasure: Web capture (Node/CLI)
 */

import { execSync, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { getLogger } from './logger-service';

const logger = getLogger();

// Tool definitions
export interface ToolDefinition {
  name: string;
  repo: string;
  type: 'python' | 'node';
  installCommand?: string; // Custom install command
}

const PIPELINE_TOOLS: ToolDefinition[] = [
  {
    name: 'visual-buffet',
    repo: 'https://github.com/bizzlechizzle/visual-buffet.git',
    type: 'python',
  },
  {
    name: 'shoemaker',
    repo: 'https://github.com/bizzlechizzle/shoemaker.git',
    type: 'python',
  },
  {
    name: 'wake-n-blake',
    repo: 'https://github.com/bizzlechizzle/wake-n-blake.git',
    type: 'python',
  },
  {
    name: 'mapsh-pit',
    repo: 'https://github.com/bizzlechizzle/mapsh-pit.git',
    type: 'python',
  },
  {
    name: 'father-time',
    repo: 'https://github.com/bizzlechizzle/father-time.git',
    type: 'python',
  },
  {
    name: 'repo-depot',
    repo: 'https://github.com/bizzlechizzle/repo-depot.git',
    type: 'node',
  },
  {
    name: 'national-treasure',
    repo: 'https://github.com/bizzlechizzle/national-treasure.git',
    type: 'node',
  },
];

// Default install location: ~/.abandoned-archive/tools/
const DEFAULT_TOOLS_DIR = path.join(os.homedir(), '.abandoned-archive', 'tools');

// Common paths
const PYTHON_PATHS = [
  '/opt/homebrew/bin/python3',
  '/usr/local/bin/python3',
  '/usr/bin/python3',
  'python3',
];

const UV_PATHS = [
  '/opt/homebrew/bin/uv',
  '/usr/local/bin/uv',
  path.join(os.homedir(), '.cargo/bin/uv'),
  path.join(os.homedir(), '.local/bin/uv'),
  'uv',
];

const PNPM_PATHS = [
  '/opt/homebrew/bin/pnpm',
  '/usr/local/bin/pnpm',
  path.join(os.homedir(), '.local/share/pnpm/pnpm'),
  'pnpm',
];

const NPM_PATHS = [
  '/opt/homebrew/bin/npm',
  '/usr/local/bin/npm',
  '/usr/bin/npm',
  'npm',
];

export interface ToolUpdateResult {
  name: string;
  success: boolean;
  action: 'cloned' | 'pulled' | 'already-up-to-date' | 'installed' | 'skipped';
  version?: string;
  error?: string;
  durationMs: number;
}

export interface AllToolsUpdateResult {
  success: boolean;
  results: ToolUpdateResult[];
  totalDurationMs: number;
}

/**
 * Find the first available executable from a list of paths
 */
function findExecutable(paths: string[]): string | null {
  for (const execPath of paths) {
    try {
      execSync(`${execPath} --version`, { encoding: 'utf-8', stdio: 'pipe' });
      return execPath;
    } catch {
      // Try next path
    }
  }
  return null;
}

/**
 * Check if git is available
 */
function isGitAvailable(): boolean {
  try {
    execSync('git --version', { encoding: 'utf-8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Clone a repository
 */
async function cloneRepo(repo: string, targetDir: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const parentDir = path.dirname(targetDir);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const proc = spawn('git', ['clone', '--depth', '1', repo, targetDir], {
      timeout: 120000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: `git clone failed: ${stderr.slice(0, 500)}` });
      }
    });

    proc.on('error', (err) => {
      resolve({ success: false, error: `Failed to spawn git: ${err.message}` });
    });
  });
}

/**
 * Pull latest changes
 */
async function pullRepo(repoDir: string): Promise<{ success: boolean; updated: boolean; error?: string }> {
  return new Promise((resolve) => {
    const proc = spawn('git', ['pull', '--ff-only'], {
      cwd: repoDir,
      timeout: 60000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        const updated = !stdout.includes('Already up to date');
        resolve({ success: true, updated });
      } else {
        resolve({ success: false, updated: false, error: `git pull failed: ${stderr.slice(0, 500)}` });
      }
    });

    proc.on('error', (err) => {
      resolve({ success: false, updated: false, error: `Failed to spawn git: ${err.message}` });
    });
  });
}

/**
 * Install Python package with pip or uv
 */
async function installPythonPackage(
  repoDir: string,
  pythonPath: string,
  uvPath: string | null
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    let command: string;
    let args: string[];

    if (uvPath) {
      command = uvPath;
      args = ['pip', 'install', '--upgrade', '-e', repoDir];
    } else {
      command = pythonPath;
      args = ['-m', 'pip', 'install', '--upgrade', '-e', repoDir];
    }

    const proc = spawn(command, args, {
      timeout: 300000, // 5 minutes
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: `pip install failed: ${stderr.slice(0, 500)}` });
      }
    });

    proc.on('error', (err) => {
      resolve({ success: false, error: `Failed to spawn installer: ${err.message}` });
    });
  });
}

/**
 * Install Node package with pnpm or npm
 */
async function installNodePackage(
  repoDir: string,
  pnpmPath: string | null,
  npmPath: string | null
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const command = pnpmPath || npmPath;
    if (!command) {
      resolve({ success: false, error: 'No Node package manager found' });
      return;
    }

    // First run install
    const proc = spawn(command, ['install'], {
      cwd: repoDir,
      timeout: 300000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        // Try to run build if it exists
        try {
          execSync(`${command} run build`, {
            cwd: repoDir,
            encoding: 'utf-8',
            stdio: 'pipe',
            timeout: 120000,
          });
        } catch {
          // Build script may not exist, that's OK
        }
        resolve({ success: true });
      } else {
        resolve({ success: false, error: `npm install failed: ${stderr.slice(0, 500)}` });
      }
    });

    proc.on('error', (err) => {
      resolve({ success: false, error: `Failed to spawn npm: ${err.message}` });
    });
  });
}

/**
 * Update a single tool
 */
async function updateTool(
  tool: ToolDefinition,
  toolsDir: string,
  pythonPath: string | null,
  uvPath: string | null,
  pnpmPath: string | null,
  npmPath: string | null
): Promise<ToolUpdateResult> {
  const startTime = Date.now();
  const toolDir = path.join(toolsDir, tool.name);

  logger.info('PipelineToolsUpdater', `Updating ${tool.name}`, { type: tool.type });

  // Check prerequisites based on type
  if (tool.type === 'python' && !pythonPath) {
    return {
      name: tool.name,
      success: false,
      action: 'skipped',
      error: 'Python not available',
      durationMs: Date.now() - startTime,
    };
  }

  if (tool.type === 'node' && !pnpmPath && !npmPath) {
    return {
      name: tool.name,
      success: false,
      action: 'skipped',
      error: 'npm/pnpm not available',
      durationMs: Date.now() - startTime,
    };
  }

  // Check if repo exists
  const repoExists = fs.existsSync(path.join(toolDir, '.git'));

  if (!repoExists) {
    // Clone
    logger.info('PipelineToolsUpdater', `Cloning ${tool.name}`);
    const cloneResult = await cloneRepo(tool.repo, toolDir);

    if (!cloneResult.success) {
      return {
        name: tool.name,
        success: false,
        action: 'cloned',
        error: cloneResult.error,
        durationMs: Date.now() - startTime,
      };
    }
  } else {
    // Pull
    const pullResult = await pullRepo(toolDir);

    if (!pullResult.success) {
      return {
        name: tool.name,
        success: false,
        action: 'pulled',
        error: pullResult.error,
        durationMs: Date.now() - startTime,
      };
    }

    if (!pullResult.updated) {
      logger.info('PipelineToolsUpdater', `${tool.name} already up to date`);
      return {
        name: tool.name,
        success: true,
        action: 'already-up-to-date',
        durationMs: Date.now() - startTime,
      };
    }
  }

  // Install based on type
  let installResult: { success: boolean; error?: string };

  if (tool.type === 'python') {
    installResult = await installPythonPackage(toolDir, pythonPath!, uvPath);
  } else {
    installResult = await installNodePackage(toolDir, pnpmPath, npmPath);
  }

  if (!installResult.success) {
    return {
      name: tool.name,
      success: false,
      action: 'installed',
      error: installResult.error,
      durationMs: Date.now() - startTime,
    };
  }

  logger.info('PipelineToolsUpdater', `${tool.name} updated successfully`);

  return {
    name: tool.name,
    success: true,
    action: repoExists ? 'pulled' : 'cloned',
    durationMs: Date.now() - startTime,
  };
}

/**
 * Update all pipeline tools
 *
 * Runs in parallel for efficiency
 */
export async function updateAllPipelineTools(customToolsDir?: string): Promise<AllToolsUpdateResult> {
  const startTime = Date.now();
  const toolsDir = customToolsDir || DEFAULT_TOOLS_DIR;

  logger.info('PipelineToolsUpdater', 'Starting pipeline tools update', {
    toolsDir,
    toolCount: PIPELINE_TOOLS.length,
  });

  // Check prerequisites
  if (!isGitAvailable()) {
    logger.warn('PipelineToolsUpdater', 'Git not available - skipping all updates');
    return {
      success: false,
      results: PIPELINE_TOOLS.map((t) => ({
        name: t.name,
        success: false,
        action: 'skipped' as const,
        error: 'Git not available',
        durationMs: 0,
      })),
      totalDurationMs: Date.now() - startTime,
    };
  }

  // Find executables
  const pythonPath = findExecutable(PYTHON_PATHS);
  const uvPath = findExecutable(UV_PATHS);
  const pnpmPath = findExecutable(PNPM_PATHS);
  const npmPath = findExecutable(NPM_PATHS);

  logger.info('PipelineToolsUpdater', 'Found executables', {
    python: pythonPath || 'not found',
    uv: uvPath || 'not found',
    pnpm: pnpmPath || 'not found',
    npm: npmPath || 'not found',
  });

  // Update all tools in parallel
  const results = await Promise.all(
    PIPELINE_TOOLS.map((tool) =>
      updateTool(tool, toolsDir, pythonPath, uvPath, pnpmPath, npmPath)
    )
  );

  const allSuccess = results.every((r) => r.success);
  const successCount = results.filter((r) => r.success).length;

  logger.info('PipelineToolsUpdater', 'Update complete', {
    success: allSuccess,
    successCount,
    totalCount: results.length,
    totalDurationMs: Date.now() - startTime,
  });

  return {
    success: allSuccess,
    results,
    totalDurationMs: Date.now() - startTime,
  };
}

/**
 * Update a specific tool by name
 */
export async function updatePipelineTool(
  toolName: string,
  customToolsDir?: string
): Promise<ToolUpdateResult> {
  const tool = PIPELINE_TOOLS.find((t) => t.name === toolName);

  if (!tool) {
    return {
      name: toolName,
      success: false,
      action: 'skipped',
      error: `Unknown tool: ${toolName}`,
      durationMs: 0,
    };
  }

  const toolsDir = customToolsDir || DEFAULT_TOOLS_DIR;

  if (!isGitAvailable()) {
    return {
      name: toolName,
      success: false,
      action: 'skipped',
      error: 'Git not available',
      durationMs: 0,
    };
  }

  const pythonPath = findExecutable(PYTHON_PATHS);
  const uvPath = findExecutable(UV_PATHS);
  const pnpmPath = findExecutable(PNPM_PATHS);
  const npmPath = findExecutable(NPM_PATHS);

  return updateTool(tool, toolsDir, pythonPath, uvPath, pnpmPath, npmPath);
}

/**
 * Get default tools directory
 */
export function getToolsDirectory(): string {
  return DEFAULT_TOOLS_DIR;
}

/**
 * Get list of available tools
 */
export function getAvailableTools(): ToolDefinition[] {
  return [...PIPELINE_TOOLS];
}

/**
 * Check if a specific tool is installed
 */
export function isToolInstalled(toolName: string, customToolsDir?: string): boolean {
  const toolsDir = customToolsDir || DEFAULT_TOOLS_DIR;
  const toolDir = path.join(toolsDir, toolName);
  return fs.existsSync(path.join(toolDir, '.git'));
}
