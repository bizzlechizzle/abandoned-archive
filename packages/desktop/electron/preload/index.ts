import { contextBridge, ipcRenderer } from 'electron';

const api = {
  versions: {
    node: () => process.versions.node,
    chrome: () => process.versions.chrome,
    electron: () => process.versions.electron,
  },
  platform: process.platform,
};

contextBridge.exposeInMainWorld('electronAPI', api);

export type ElectronAPI = typeof api;
