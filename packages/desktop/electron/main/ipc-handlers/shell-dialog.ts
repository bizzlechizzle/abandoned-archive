/**
 * Shell and Dialog IPC Handlers
 * Handles shell:* and dialog:* IPC channels
 */
import { ipcMain, shell, dialog, BrowserWindow } from 'electron';
import { z } from 'zod';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

export function registerShellHandlers() {
  ipcMain.handle('shell:openExternal', async (_event, url: unknown) => {
    try {
      const validatedUrl = z.string().url().parse(url);
      // Security: Parse URL and validate protocol to prevent javascript: and other schemes
      const parsedUrl = new URL(validatedUrl);
      if (!ALLOWED_PROTOCOLS.has(parsedUrl.protocol)) {
        throw new Error('Only http, https, and mailto URLs are allowed');
      }
      await shell.openExternal(validatedUrl);
    } catch (error) {
      console.error('Error opening external URL:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });
}

export function registerDialogHandlers() {
  ipcMain.handle('dialog:selectFolder', async () => {
    try {
      // Get the focused window to use as parent (prevents dialog appearing behind app)
      const parentWindow = BrowserWindow.getFocusedWindow();

      const dialogOptions = {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select Archive Folder',
        buttonLabel: 'Select Folder',
      };

      const result = parentWindow
        ? await dialog.showOpenDialog(parentWindow, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions);

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return result.filePaths[0];
    } catch (error) {
      console.error('Error selecting folder:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });
}
