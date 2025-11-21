import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDatabase, closeDatabase } from './database';
import { registerIpcHandlers } from './ipc-handlers';
import { getHealthMonitor } from '../services/health-monitor';
import { getRecoverySystem } from '../services/recovery-system';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'AU Archive',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // Initialize database
  try {
    getDatabase();
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
  }

  // Initialize health monitoring system
  try {
    const healthMonitor = getHealthMonitor();
    await healthMonitor.initialize();
    console.log('Health monitoring initialized successfully');

    // Check database health and attempt recovery if needed
    const recoverySystem = getRecoverySystem();
    const recoveryResult = await recoverySystem.checkAndRecover();

    if (recoveryResult) {
      console.log('Recovery performed:', recoveryResult.action);
      if (!recoveryResult.success) {
        await recoverySystem.showRecoveryDialog(recoveryResult);
      }
    }
  } catch (error) {
    console.error('Failed to initialize health monitoring:', error);
  }

  // Register IPC handlers
  registerIpcHandlers();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  // Shutdown health monitoring
  try {
    const healthMonitor = getHealthMonitor();
    await healthMonitor.shutdown();
    console.log('Health monitoring shut down successfully');
  } catch (error) {
    console.error('Failed to shutdown health monitoring:', error);
  }

  closeDatabase();
});
