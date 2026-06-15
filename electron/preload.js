'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Secure bridge between the React renderer and the Node.js/Electron main process.
 * The renderer never touches Node APIs directly — it only calls these methods.
 */
contextBridge.exposeInMainWorld('api', {
  // System / health
  getSystemStatus: () => ipcRenderer.invoke('system:getStatus'),

  // Quick modes
  listModes: () => ipcRenderer.invoke('mode:list'),
  runMode: (modeName) => ipcRenderer.invoke('mode:run', modeName),

  // File organizer
  scanDownloads: () => ipcRenderer.invoke('files:scan'),
  organizeFiles: (items) => ipcRenderer.invoke('files:organize', items),

  // Git
  checkGit: () => ipcRenderer.invoke('git:check'),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  openSettingsFile: () => ipcRenderer.invoke('settings:openFile'),

  // Misc
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  minimizeToTray: () => ipcRenderer.invoke('app:minimizeToTray'),

  // Main -> renderer events
  onNavigate: (callback) => {
    const handler = (_event, page) => callback(page);
    ipcRenderer.on('app:navigate', handler);
    return () => ipcRenderer.removeListener('app:navigate', handler);
  },
  onModeResult: (callback) => {
    const handler = (_event, result) => callback(result);
    ipcRenderer.on('app:mode-result', handler);
    return () => ipcRenderer.removeListener('app:mode-result', handler);
  },
});
