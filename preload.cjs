/**
 * Adarsh's Media Player (AM Player) - Electron Preload Script
 * Exposes secure `window.electronVLC` APIs to renderer process via contextBridge.
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronVLC', {
  isElectron: true,

  // File Picker Dialogs & Folder Scanner
  openNativeFileDialog: (options) => ipcRenderer.invoke('dialog:openFile', options),
  openNativeFolderDialog: () => ipcRenderer.invoke('dialog:openFolder'),
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  scanFolder: (folderPath) => ipcRenderer.invoke('media:scanFolder', folderPath),

  // Shell & External URL/App Launcher
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // Persistent Custom 5-Folder Directory Watcher & Shortcuts
  getCustomFolders: () => ipcRenderer.invoke('app:getCustomFolders'),
  saveCustomFolders: (folders) => ipcRenderer.invoke('app:saveCustomFolders', folders),
  getShortcuts: () => ipcRenderer.invoke('app:getShortcuts'),
  saveShortcuts: (shortcuts) => ipcRenderer.invoke('app:saveShortcuts', shortcuts),

  // Hardware-Accelerated LibVLC Configuration
  getVlcConfig: () => ipcRenderer.invoke('vlc:getConfig'),

  // Natural Episode/File Detection & Subtitle Auto-Detection
  getAdjacentEpisodes: (filePath) => ipcRenderer.invoke('media:getAdjacentEpisodes', filePath),
  findMatchingSubtitles: (filePath) => ipcRenderer.invoke('media:findMatchingSubtitles', filePath),
  readSubtitleFile: (subPath) => ipcRenderer.invoke('media:readSubFile', subPath),

  // Native Audio Metadata & Cover Art Extraction
  extractAudioCover: (filePath) => ipcRenderer.invoke('media:extractAudioCover', filePath),

  // Music Background Playback Mode in System Tray
  setMusicBackgroundMode: (enabled) => ipcRenderer.invoke('app:setMusicBackgroundMode', enabled),

  // Custom Cache & Storage Repository Management
  getCacheInfo: () => ipcRenderer.invoke('system:getCacheInfo'),
  selectCacheDirectory: () => ipcRenderer.invoke('system:selectCacheDir'),
  resetCacheDirectory: () => ipcRenderer.invoke('system:resetCacheDir'),
  purgeCacheDirectory: () => ipcRenderer.invoke('system:purgeCacheDir'),
  openCacheFolder: () => ipcRenderer.invoke('system:openCacheFolder'),
  saveThumbnailDisk: (name, dataUrl) => ipcRenderer.invoke('cache:saveThumbnailFile', name, dataUrl),
  getThumbnailDisk: (name) => ipcRenderer.invoke('cache:getThumbnailFile', name),

  // Direct File Launch & Startup Parameter
  getLaunchFile: () => ipcRenderer.invoke('app:getLaunchFile'),
  onOpenFile: (callback) => {
    ipcRenderer.on('app:open-file', (_event, file) => callback(file));
  },

  // Permanent File Deletion on Disk
  permanentlyDeleteFile: (filePath) => ipcRenderer.invoke('media:permanentlyDeleteFile', filePath),

  // Window Controls
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  // Event Listeners from Main Process
  onTrayMediaAction: (callback) => {
    ipcRenderer.on('tray-media-action', (_event, action) => callback(action));
  },
  onWindowStateChange: (callback) => {
    ipcRenderer.on('window-state-changed', (_event, state) => callback(state));
  }
});
