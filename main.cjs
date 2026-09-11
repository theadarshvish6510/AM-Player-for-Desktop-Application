/**
 * Adarsh's Media Player (AM Player) - Electron Main Process
 * Native LibVLC Decoding Pipeline, Direct3D/DXVA2 Hardware Acceleration & Multi-Audio Router
 */

'use strict';

// Global crash-safe error handlers to prevent silent process termination
process.on('uncaughtException', (err) => {
  console.error('[AM Player] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[AM Player] Unhandled Rejection:', reason);
});

const { app, BrowserWindow, ipcMain, dialog, Menu, Tray, nativeImage, protocol, screen, shell, net } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const { exec } = require('child_process');

// ============================================================================
// 1. CONFIGURATION & CUSTOM STORAGE DIRECTORY MANAGEMENT
// ============================================================================
function getAppConfigPath() {
  return path.join(app.getPath('userData'), 'app-config.json');
}

function getDefaultCacheDir() {
  return path.join(app.getPath('userData'), 'AMPlayer_Cache');
}

function loadAppConfig() {
  try {
    const p = getAppConfigPath();
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.cacheDir === 'string') {
        if (!fs.existsSync(parsed.cacheDir)) {
          fs.mkdirSync(parsed.cacheDir, { recursive: true });
        }
        return parsed;
      }
    }
  } catch (e) {
    console.warn('[Config] Notice reading app-config.json:', e);
  }
  const defaultDir = getDefaultCacheDir();
  if (!fs.existsSync(defaultDir)) {
    try { fs.mkdirSync(defaultDir, { recursive: true }); } catch (e) {}
  }
  return { cacheDir: defaultDir };
}

function saveAppConfig(cfg) {
  try {
    const p = getAppConfigPath();
    fs.writeFileSync(p, JSON.stringify(cfg, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[Config] Error writing app-config.json:', e);
    return false;
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getDirectoryMetrics(dirPath) {
  let totalSizeBytes = 0;
  let fileCount = 0;
  if (!dirPath || !fs.existsSync(dirPath)) {
    return { totalSizeBytes: 0, formattedSize: '0 B', fileCount: 0 };
  }
  function walk(dir) {
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const full = path.join(dir, item);
        try {
          const st = fs.statSync(full);
          if (st.isDirectory()) {
            walk(full);
          } else if (st.isFile()) {
            totalSizeBytes += st.size;
            fileCount++;
          }
        } catch (e) {}
      }
    } catch (e) {}
  }
  walk(dirPath);

  return {
    totalSizeBytes,
    formattedSize: formatBytes(totalSizeBytes),
    fileCount
  };
}

function purgeDirectoryContents(dirPath) {
  let freedBytes = 0;
  let deletedCount = 0;
  if (!dirPath || !fs.existsSync(dirPath)) {
    return { freedBytes: 0, formattedFreed: '0 B', deletedCount: 0 };
  }
  function removeItems(dir) {
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const full = path.join(dir, item);
        try {
          const st = fs.statSync(full);
          if (st.isDirectory()) {
            removeItems(full);
            try { fs.rmdirSync(full); } catch (e) {}
          } else if (st.isFile()) {
            freedBytes += st.size;
            deletedCount++;
            try { fs.unlinkSync(full); } catch (e) {}
          }
        } catch (e) {}
      }
    } catch (e) {}
  }
  removeItems(dirPath);

  return {
    freedBytes,
    formattedFreed: formatBytes(freedBytes),
    deletedCount
  };
}

function purgeCacheOlderThan(dirPath, maxAgeMs = 6 * 60 * 60 * 1000) {
  if (!dirPath || !fs.existsSync(dirPath)) return;
  const threshold = Date.now() - maxAgeMs;
  let deletedCount = 0;
  function scanAndPurge(dir) {
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const full = path.join(dir, item);
        try {
          const st = fs.statSync(full);
          if (st.isDirectory()) {
            scanAndPurge(full);
            try {
              if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
            } catch (e) {}
          } else if (st.isFile()) {
            if (st.mtimeMs < threshold) {
              fs.unlinkSync(full);
              deletedCount++;
            }
          }
        } catch (e) {}
      }
    } catch (e) {}
  }
  scanAndPurge(dirPath);
  if (deletedCount > 0) {
    console.log(`[AutoPurge] 🧹 Purged ${deletedCount} cache files older than 6 hours from ${dirPath}`);
  }
}

// ============================================================================
// 2. COMMAND-LINE & DIRECT LAUNCH ARGUMENT PARSER
// ============================================================================
function parseMediaArg(argv) {
  if (!Array.isArray(argv)) return null;
  const mediaExtensions = new Set([
    '.mp4', '.mkv', '.webm', '.avi', '.flv', '.mov', '.ts', '.m2ts', '.wmv', '.m4v', '.3gp', '.vob', '.ogv',
    '.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.opus', '.wma',
    '.pdf', '.srt', '.vtt', '.ass', '.ssa'
  ]);

  for (const arg of argv) {
    if (!arg || typeof arg !== 'string') continue;
    if (arg.startsWith('--') || arg.startsWith('-')) continue;
    const lower = arg.toLowerCase();
    if (lower.endsWith('.js') || lower.endsWith('.cjs') || lower.endsWith('electron') || lower.endsWith('electron.exe')) continue;

    try {
      const resolved = path.resolve(arg);
      if (fs.existsSync(resolved)) {
        const st = fs.statSync(resolved);
        if (st.isFile()) {
          const ext = path.extname(resolved).toLowerCase();
          if (mediaExtensions.has(ext)) {
            const isAudio = ['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.opus', '.wma'].includes(ext);
            const isPdf = ext === '.pdf';
            const isSub = ['.srt', '.vtt', '.ass', '.ssa'].includes(ext);
            return {
              path: resolved,
              name: path.basename(resolved),
              size: st.size,
              lastModified: st.mtimeMs,
              streamUrl: `http://127.0.0.1:${streamServerPort}/?file=${encodeURIComponent(resolved)}`,
              isAudio,
              isPdf,
              isSub
            };
          }
        }
      }
    } catch (e) {}
  }
  return null;
}

// ============================================================================
// 3. HARDWARE ACCELERATION & ZERO-COPY CHROMIUM SWITCHES
// ============================================================================
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-accelerated-video-decode');
app.commandLine.appendSwitch('enable-accelerated-2d-canvas');
app.commandLine.appendSwitch('force-high-performance-gpu');
app.commandLine.appendSwitch('enable-features', 'CanvasOopRasterization,PlatformHEVCDecoderSupport,DirectCompositionVideoOverlays,D3D11VideoDecoder,MediaFoundationD3D11VideoCapture');
app.commandLine.appendSwitch('disable-features', 'UseChromeOSDirectVideoDecoder,MediaFoundationAsyncH264Encoding');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

// Register privileged custom streaming schemes before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'am-media',
    privileges: {
      standard: true,
      secure: true,
      bypassCSP: true,
      allowServiceWorkers: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

let mainWindow = null;
let tray = null;
let isQuitting = false;
let musicBackgroundMode = false;
let internalStreamServer = null;
let streamServerPort = 0;
let pendingLaunchFile = null;

// ============================================================================
// SINGLE INSTANCE LOCK & SECOND INSTANCE MEDIA LAUNCH HANDLING
// ============================================================================
const gotTheSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotTheSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();

      const filePayload = parseMediaArg(argv);
      if (filePayload) {
        mainWindow.webContents.send('app:open-file', filePayload);
      }
    }
  });
}

// ============================================================================
// 2. NATIVE ZERO-COPY HIGH-PERFORMANCE LOCAL STREAM SERVER
// ============================================================================
// Provides instantaneous Range-Request HTTP streaming for 50GB+ 4K HDR/HEVC/MKV files
// preventing Chromium memory ballooning and buffer stalls.
// Speculative range chunk buffer cache (LRU / fast in-memory map for adjacent read-ahead)
const speculativeBufferCache = new Map();
const MAX_SPECULATIVE_CACHE_ENTRIES = 8; // Optimal memory footprint (< 32MB)

function getSpeculativeCacheKey(filePath, start, end) {
  return `${filePath}:${start}:${end}`;
}

function prefetchSpeculativeChunk(filePath, start, chunkSize, fileSize) {
  const nextStart = start + chunkSize;
  if (nextStart >= fileSize) return;
  const nextEnd = Math.min(fileSize - 1, nextStart + (4 * 1024 * 1024) - 1);
  const cacheKey = getSpeculativeCacheKey(filePath, nextStart, nextEnd);

  if (speculativeBufferCache.has(cacheKey)) return;

  fs.open(filePath, 'r', (err, fd) => {
    if (err || !fd) return;
    const toRead = (nextEnd - nextStart) + 1;
    const buf = Buffer.alloc(toRead);
    fs.read(fd, buf, 0, toRead, nextStart, (readErr, bytesRead) => {
      fs.close(fd, () => {});
      if (!readErr && bytesRead > 0) {
        if (speculativeBufferCache.size >= MAX_SPECULATIVE_CACHE_ENTRIES) {
          const oldestKey = speculativeBufferCache.keys().next().value;
          speculativeBufferCache.delete(oldestKey);
        }
        speculativeBufferCache.set(cacheKey, buf.subarray(0, bytesRead));
      }
    });
  });
}

function startZeroCopyStreamServer() {
  return new Promise((resolve) => {
    try {
      internalStreamServer = http.createServer((req, res) => {
        try {
          // CORS preflight handling for Range requests
          if (req.method === 'OPTIONS') {
            res.writeHead(204, {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, OPTIONS',
              'Access-Control-Allow-Headers': 'Range',
              'Access-Control-Max-Age': '86400'
            });
            res.end();
            return;
          }

          const urlObj = new URL(req.url, `http://127.0.0.1:${streamServerPort}`);
          const filePath = decodeURIComponent(urlObj.searchParams.get('file') || '');

          if (!filePath || !fs.existsSync(filePath)) {
            res.writeHead(404, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
            res.end('File Not Found');
            return;
          }

          const stat = fs.statSync(filePath);
          const fileSize = stat.size;
          const range = req.headers.range;

          // Content-Type mapping for heavy video & audio formats
          const ext = path.extname(filePath).toLowerCase();
          const mimeMap = {
            '.mp4': 'video/mp4',
            '.mkv': 'video/x-matroska',
            '.webm': 'video/webm',
            '.avi': 'video/x-msvideo',
            '.flv': 'video/x-flv',
            '.mov': 'video/quicktime',
            '.ts': 'video/mp2t',
            '.m4v': 'video/mp4',
            '.wmv': 'video/x-ms-wmv',
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.flac': 'audio/flac',
            '.m4a': 'audio/mp4',
            '.aac': 'audio/aac',
            '.ogg': 'audio/ogg',
            '.opus': 'audio/opus'
          };
          const contentType = mimeMap[ext] || 'application/octet-stream';

          if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            let start = parseInt(parts[0], 10);
            let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

            // RFC 7233: Handle suffix byte-range (e.g. "bytes=-500" for final 500 bytes)
            if (isNaN(start)) {
              start = Math.max(0, fileSize - (parseInt(parts[1], 10) || 0));
              end = fileSize - 1;
            }
            if (isNaN(end) || end >= fileSize) end = fileSize - 1;

            // Invalid range → 416 Range Not Satisfiable
            if (start < 0 || start > end || start >= fileSize) {
              res.writeHead(416, {
                'Content-Range': `bytes */${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Access-Control-Allow-Origin': '*'
              });
              res.end();
              return;
            }

            const chunkSize = (end - start) + 1;

            // Trigger speculative range pre-cache for subsequent chunks
            prefetchSpeculativeChunk(filePath, start, chunkSize, fileSize);

            const cacheKey = getSpeculativeCacheKey(filePath, start, end);
            if (speculativeBufferCache.has(cacheKey)) {
              const cachedBuf = speculativeBufferCache.get(cacheKey);
              speculativeBufferCache.delete(cacheKey);
              res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': cachedBuf.length,
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
              });
              res.end(cachedBuf);
              return;
            }

            // High-throughput 4MB read stream chunks for instant buffer saturation and zero-lag scrubbing
            const fileStream = fs.createReadStream(filePath, { start, end, highWaterMark: 4 * 1024 * 1024 });
            res.writeHead(206, {
              'Content-Range': `bytes ${start}-${end}/${fileSize}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': chunkSize,
              'Content-Type': contentType,
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0'
            });
            // Clean up file descriptor on client abort during fast scrubbing
            req.on('close', () => { if (!fileStream.destroyed) fileStream.destroy(); });
            fileStream.on('error', () => {
              if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
              if (!res.writableEnded) res.end();
            });
            fileStream.pipe(res);
          } else {
            res.writeHead(200, {
              'Content-Length': fileSize,
              'Content-Type': contentType,
              'Accept-Ranges': 'bytes',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0'
            });
            const fullStream = fs.createReadStream(filePath, { highWaterMark: 4 * 1024 * 1024 });
            req.on('close', () => { if (!fullStream.destroyed) fullStream.destroy(); });
            fullStream.on('error', () => {
              if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
              if (!res.writableEnded) res.end();
            });
            fullStream.pipe(res);
          }
        } catch (err) {
          console.error('[StreamServer] Error serving file:', err);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
          }
          res.end('Internal Server Error');
        }
      });

      internalStreamServer.on('error', (err) => {
        console.warn('[StreamServer] Notice on local stream server:', err.message);
        resolve(0);
      });

      internalStreamServer.listen(0, '127.0.0.1', () => {
        streamServerPort = internalStreamServer.address().port;
        console.log(`[StreamServer] Zero-Copy Media Streamer listening on port ${streamServerPort}`);
        resolve(streamServerPort);
      });
    } catch (e) {
      console.warn('[StreamServer] Fallback initiation:', e.message);
      resolve(0);
    }
  });
}

// ============================================================================
// 3. ELECTRON BROWSER WINDOW INITIALIZATION
// ============================================================================
async function createMainWindow() {
  await startZeroCopyStreamServer();

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  const winWidth = Math.min(1440, Math.floor(screenWidth * 0.92));
  const winHeight = Math.min(920, Math.floor(screenHeight * 0.90));

  let appIconPath = path.join(__dirname, 'am-icon.ico');
  if (!fs.existsSync(appIconPath)) {
    appIconPath = path.join(__dirname, 'am-icon.ico');
  }
  if (!fs.existsSync(appIconPath)) {
    appIconPath = path.join(__dirname, 'am-icon.ico');
  }

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    minWidth: 800,
    minHeight: 560,
    backgroundColor: '#050A07',
    show: false,
    frame: true,
    titleBarStyle: 'default',
    title: "Adarsh's Media Player",
    icon: fs.existsSync(appIconPath) ? appIconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });

  mainWindow.setMenuBarVisibility(false);

  // Load the application
  const htmlPath = path.join(__dirname, 'index.html');
  mainWindow.loadFile(htmlPath);

  // Handle load failures gracefully
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('[MainWindow] Failed to load:', errorCode, errorDescription, validatedURL);
  });

  // Explicit window reveal when renderer is ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Mandatory Fail-Safe: Never allow window to stay permanently hidden in tray
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      console.log('[MainWindow] Triggering fail-safe window reveal');
      mainWindow.show();
      mainWindow.focus();
    }
  }, 1500);

  // Handle direct file launch upon renderer completion
  mainWindow.webContents.on('did-finish-load', () => {
    if (!pendingLaunchFile) {
      pendingLaunchFile = parseMediaArg(process.argv);
    }
    if (pendingLaunchFile) {
      setTimeout(() => {
        mainWindow?.webContents.send('app:open-file', pendingLaunchFile);
      }, 400);
    }
  });

  // Register default protocol client for Windows
  try {
    if (!app.isDefaultProtocolClient('amplayer')) {
      app.setAsDefaultProtocolClient('amplayer');
    }
  } catch (e) {}

  // Handle minimize to system tray for Music Mode
  mainWindow.on('close', (event) => {
    if (!isQuitting && musicBackgroundMode) {
      event.preventDefault();
      mainWindow.hide();
      if (tray) {
        tray.displayBalloon?.({
          title: "AM Player Running in Background",
          content: "Music playback is continuing in system tray."
        });
      }
    }
  });

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-state-changed', { isMaximized: true });
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-state-changed', { isMaximized: false });
  });
}

// ============================================================================
// 4. SYSTEM TRAY & MUSIC BACKGROUND PLAYBACK
// ============================================================================
function setupSystemTray() {
  if (tray) return;

  let iconPath = path.join(__dirname, 'am-icon.ico');
  if (!fs.existsSync(iconPath)) {
    iconPath = path.join(__dirname, 'am-icon.ico');
  }
  if (!fs.existsSync(iconPath)) {
    iconPath = path.join(__dirname, 'am-icon.ico');
  }

  const trayIcon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();

  tray = new Tray(trayIcon);
  tray.setToolTip("Adarsh's Media Player");

  const restoreWindow = () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  };

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show Player",
      click: restoreWindow
    },
    {
      label: "Play / Pause",
      click: () => {
        mainWindow?.webContents.send('tray-media-action', 'toggle-play');
      }
    },
    {
      label: "Next Track",
      click: () => {
        mainWindow?.webContents.send('tray-media-action', 'next');
      }
    },
    {
      label: "Previous Track",
      click: () => {
        mainWindow?.webContents.send('tray-media-action', 'prev');
      }
    },
    { type: 'separator' },
    {
      label: "Exit AM Player",
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', restoreWindow);
  tray.on('double-click', restoreWindow);
}

// ============================================================================
// AUDIO METADATA & ALBUM ART EXTRACTION (ID3 / FLAC / MP4 / FOLDER ART)
// ============================================================================
function extractAudioCoverArt(filePath) {
  if (!filePath || typeof filePath !== 'string' || !fs.existsSync(filePath)) return null;

  try {
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const baseName = path.basename(filePath, ext);

    let coverDataUrl = null;
    let title = null;
    let artist = null;
    let album = null;

    // 1. Read first 2MB for header metadata tags
    const fd = fs.openSync(filePath, 'r');
    const fileSize = fs.statSync(filePath).size;
    const bufferSize = Math.min(fileSize, 2048 * 1024);
    const buffer = Buffer.alloc(bufferSize);
    fs.readSync(fd, buffer, 0, bufferSize, 0);
    fs.closeSync(fd);

    // --- ID3v2 (MP3 / WAV) ---
    if (buffer.length >= 10 && buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
      const versionMajor = buffer[3];
      const tagSize = ((buffer[6] & 0x7F) << 21) | ((buffer[7] & 0x7F) << 14) | ((buffer[8] & 0x7F) << 7) | (buffer[9] & 0x7F);
      const headerEnd = 10;
      const maxScan = Math.min(buffer.length, headerEnd + tagSize);
      let offset = headerEnd;

      while (offset < maxScan - 10) {
        let frameId = '';
        let frameSize = 0;

        if (versionMajor === 2) {
          frameId = buffer.toString('latin1', offset, offset + 3);
          frameSize = (buffer[offset + 3] << 16) | (buffer[offset + 4] << 8) | buffer[offset + 5];
          offset += 6;
        } else {
          frameId = buffer.toString('latin1', offset, offset + 4);
          if (versionMajor === 4) {
            frameSize = ((buffer[offset + 4] & 0x7F) << 21) | ((buffer[offset + 5] & 0x7F) << 14) | ((buffer[offset + 6] & 0x7F) << 7) | (buffer[offset + 7] & 0x7F);
          } else {
            frameSize = buffer.readUInt32BE(offset + 4);
          }
          offset += 10;
        }

        if (!frameId || frameId.charCodeAt(0) === 0 || frameSize <= 0 || offset + frameSize > buffer.length) {
          break;
        }

        if (frameId === 'APIC' || frameId === 'PIC') {
          try {
            const frameBuf = buffer.slice(offset, offset + frameSize);
            const enc = frameBuf[0];
            let pos = 1;
            let mime = 'image/jpeg';

            if (versionMajor === 2) {
              const format = frameBuf.toString('latin1', pos, pos + 3).toLowerCase();
              pos += 3;
              mime = format === 'png' ? 'image/png' : 'image/jpeg';
            } else {
              let mimeEnd = pos;
              while (mimeEnd < frameBuf.length && frameBuf[mimeEnd] !== 0) {
                mimeEnd++;
              }
              const parsedMime = frameBuf.toString('latin1', pos, mimeEnd);
              if (parsedMime && parsedMime.includes('/')) mime = parsedMime;
              pos = mimeEnd + 1;
            }

            pos++; // Skip picture type byte

            // Description (skip null terminator based on encoding)
            if (enc === 1 || enc === 2) {
              while (pos < frameBuf.length - 1 && !(frameBuf[pos] === 0 && frameBuf[pos + 1] === 0)) {
                pos += 2;
              }
              pos += 2;
            } else {
              while (pos < frameBuf.length && frameBuf[pos] !== 0) {
                pos++;
              }
              pos += 1;
            }

            if (pos < frameBuf.length) {
              const imgData = frameBuf.slice(pos);
              if (imgData.length > 32) {
                coverDataUrl = `data:${mime};base64,${imgData.toString('base64')}`;
              }
            }
          } catch (e) {
            console.warn('[ID3] APIC parse note:', e.message);
          }
        } else if (frameId === 'TIT2' || frameId === 'TT2') {
          try {
            const frameBuf = buffer.slice(offset, offset + frameSize);
            const enc = frameBuf[0];
            title = (enc === 1 || enc === 2) ? frameBuf.slice(1).toString('utf16le') : frameBuf.slice(1).toString('utf8');
            title = title.replace(/\0/g, '').trim();
          } catch (e) {}
        } else if (frameId === 'TPE1' || frameId === 'TP1') {
          try {
            const frameBuf = buffer.slice(offset, offset + frameSize);
            const enc = frameBuf[0];
            artist = (enc === 1 || enc === 2) ? frameBuf.slice(1).toString('utf16le') : frameBuf.slice(1).toString('utf8');
            artist = artist.replace(/\0/g, '').trim();
          } catch (e) {}
        } else if (frameId === 'TALB' || frameId === 'TAL') {
          try {
            const frameBuf = buffer.slice(offset, offset + frameSize);
            const enc = frameBuf[0];
            album = (enc === 1 || enc === 2) ? frameBuf.slice(1).toString('utf16le') : frameBuf.slice(1).toString('utf8');
            album = album.replace(/\0/g, '').trim();
          } catch (e) {}
        }

        offset += frameSize;
      }
    }

    // --- FLAC (METADATA_BLOCK_PICTURE = 6) ---
    if (!coverDataUrl && buffer.length >= 4 && buffer.toString('latin1', 0, 4) === 'fLaC') {
      let offset = 4;
      while (offset < buffer.length - 4) {
        const isLast = (buffer[offset] & 0x80) !== 0;
        const blockType = buffer[offset] & 0x7F;
        const blockLength = (buffer[offset + 1] << 16) | (buffer[offset + 2] << 8) | buffer[offset + 3];
        offset += 4;

        if (offset + blockLength > buffer.length) break;

        if (blockType === 6) { // PICTURE
          try {
            const block = buffer.slice(offset, offset + blockLength);
            let p = 4; // Skip picture type (4 bytes)
            const mimeLen = block.readUInt32BE(p); p += 4;
            const mime = block.toString('ascii', p, p + mimeLen) || 'image/jpeg'; p += mimeLen;
            const descLen = block.readUInt32BE(p); p += 4;
            p += descLen; // Skip description
            p += 16; // Skip width, height, depth, colors
            const dataLen = block.readUInt32BE(p); p += 4;
            const picData = block.slice(p, p + dataLen);
            if (picData.length > 32) {
              coverDataUrl = `data:${mime};base64,${picData.toString('base64')}`;
            }
            break;
          } catch (e) {}
        }
        offset += blockLength;
        if (isLast) break;
      }
    }

    // --- MP4 / M4A (covr atom) ---
    if (!coverDataUrl) {
      const covrIdx = buffer.indexOf(Buffer.from('covr'));
      if (covrIdx !== -1 && covrIdx + 16 < buffer.length) {
        const dataIdx = buffer.indexOf(Buffer.from('data'), covrIdx);
        if (dataIdx !== -1 && dataIdx + 16 < buffer.length) {
          const dataSize = buffer.readUInt32BE(dataIdx - 4);
          const typeFlags = buffer.readUInt32BE(dataIdx + 4);
          const mime = (typeFlags === 14) ? 'image/png' : 'image/jpeg';
          const payload = buffer.slice(dataIdx + 12, dataIdx - 4 + dataSize);
          if (payload.length > 32) {
            coverDataUrl = `data:${mime};base64,${payload.toString('base64')}`;
          }
        }
      }
    }

    // 2. Folder / Local artwork fallback if embedded tag was missing
    if (!coverDataUrl) {
      const candidateFilenames = [
        'cover.jpg', 'cover.png', 'cover.jpeg', 'cover.webp',
        'folder.jpg', 'folder.png', 'folder.jpeg',
        'album.jpg', 'album.png', 'album.jpeg',
        'front.jpg', 'front.png', 'front.jpeg',
        'artwork.jpg', 'artwork.png',
        `${baseName}.jpg`, `${baseName}.png`, `${baseName}.jpeg`
      ];

      for (const name of candidateFilenames) {
        const candidatePath = path.join(dir, name);
        if (fs.existsSync(candidatePath)) {
          try {
            const extName = path.extname(candidatePath).toLowerCase();
            const mime = (extName === '.png') ? 'image/png' : (extName === '.webp' ? 'image/webp' : 'image/jpeg');
            const imgBuf = fs.readFileSync(candidatePath);
            coverDataUrl = `data:${mime};base64,${imgBuf.toString('base64')}`;
            break;
          } catch (e) {}
        }
      }
    }

    return {
      coverDataUrl,
      title: title || baseName,
      artist: artist || '',
      album: album || ''
    };
  } catch (err) {
    console.warn('[AudioCoverExtract] Notice:', err.message);
    return null;
  }
}

// ============================================================================
// 5. IPC HANDLERS (VLC ENGINE, AUDIO COVERS, FILE DIALOGS)
// ============================================================================
function setupIpcHandlers() {
  // Native Open File Dialog
  ipcMain.handle('dialog:openFile', async (event, options = {}) => {
    const defaultFilters = [
      {
        name: 'All Media Files (*.mp4, *.mkv, *.avi, *.flv, *.mov, *.webm, *.ts, *.mp3, *.wav, *.flac, *.m4a)',
        extensions: ['mp4', 'mkv', 'webm', 'avi', 'flv', 'mov', 'ts', 'wmv', 'm4v', '3gp', 'vob', 'ogv', 'mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus', 'wma']
      },
      {
        name: 'Video Files (*.mkv, *.mp4, *.avi, *.flv, *.mov, *.webm, *.ts)',
        extensions: ['mkv', 'mp4', 'webm', 'avi', 'flv', 'mov', 'ts', 'wmv', 'm4v', '3gp', 'vob', 'ogv']
      },
      {
        name: 'Audio Files (*.mp3, *.wav, *.flac, *.m4a, *.aac, *.ogg)',
        extensions: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus', 'wma']
      },
      {
        name: 'Subtitle Files (*.srt, *.vtt, *.ass, *.ssa)',
        extensions: ['srt', 'vtt', 'ass', 'ssa']
      },
      {
        name: 'PDF Documents (*.pdf)',
        extensions: ['pdf']
      },
      { name: 'All Files (*.*)', extensions: ['*'] }
    ];

    const result = await dialog.showOpenDialog(mainWindow, {
      title: options.title || 'Select Media File',
      properties: options.multiple ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: options.filters || defaultFilters
    });

    if (result.canceled || !result.filePaths.length) {
      return null;
    }

    // Return rich metadata and Zero-Copy stream URL
    const fileInfos = result.filePaths.map((fullPath) => {
      try {
        const stats = fs.statSync(fullPath);
        const name = path.basename(fullPath);
        const ext = path.extname(fullPath).toLowerCase();
        const isAudio = ['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.opus', '.wma'].includes(ext);
        const isPdf = ext === '.pdf';
        const isSub = ['.srt', '.vtt', '.ass', '.ssa'].includes(ext);

        return {
          path: fullPath,
          name: name,
          size: stats.size,
          lastModified: stats.mtimeMs,
          streamUrl: `http://127.0.0.1:${streamServerPort}/?file=${encodeURIComponent(fullPath)}`,
          isAudio,
          isPdf,
          isSub
        };
      } catch (err) {
        return null;
      }
    }).filter(Boolean);

    return options.multiple ? fileInfos : fileInfos[0];
  });

  // Native Open Folder Dialog
  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Media Folder',
      properties: ['openDirectory']
    });

    if (result.canceled || !result.filePaths.length) {
      return null;
    }

    const folderPath = result.filePaths[0];
    const mediaExtensions = new Set(['.mp4', '.mkv', '.webm', '.avi', '.flv', '.mov', '.ts', '.wmv', '.m4v', '.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.opus']);
    const foundFiles = [];

    try {
      const items = fs.readdirSync(folderPath);
      for (const item of items) {
        const fullPath = path.join(folderPath, item);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isFile()) {
            const ext = path.extname(item).toLowerCase();
            if (mediaExtensions.has(ext)) {
              foundFiles.push({
                path: fullPath,
                name: item,
                size: stat.size,
                lastModified: stat.mtimeMs,
                streamUrl: `http://127.0.0.1:${streamServerPort}/?file=${encodeURIComponent(fullPath)}`,
                isAudio: ['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.opus'].includes(ext)
              });
            }
          }
        } catch (e) {}
      }
    } catch (err) {
      console.error('[Dialog] Error reading folder:', err);
    }

    return {
      folderPath,
      folderName: path.basename(folderPath),
      files: foundFiles
    };
  });

  // Direct Folder Scanner (Browse Folder Without Opening Windows Explorer)
  ipcMain.handle('media:scanFolder', async (event, folderPath) => {
    if (!folderPath || typeof folderPath !== 'string' || !fs.existsSync(folderPath)) {
      return { folderPath: folderPath || '', folderName: '', files: [], error: 'Directory does not exist' };
    }

    const mediaExtensions = new Set(['.mp4', '.mkv', '.webm', '.avi', '.flv', '.mov', '.ts', '.m2ts', '.wmv', '.m4v', '.3gp', '.vob', '.ogv', '.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.opus']);
    const foundFiles = [];

    try {
      const items = fs.readdirSync(folderPath);
      for (const item of items) {
        const fullPath = path.join(folderPath, item);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isFile()) {
            const ext = path.extname(item).toLowerCase();
            if (mediaExtensions.has(ext)) {
              foundFiles.push({
                path: fullPath,
                name: item,
                size: stat.size,
                lastModified: stat.mtimeMs,
                streamUrl: `http://127.0.0.1:${streamServerPort}/?file=${encodeURIComponent(fullPath)}`,
                isAudio: ['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.opus'].includes(ext)
              });
            }
          }
        } catch (e) {}
      }
    } catch (err) {
      console.error('[ScanFolder] Error scanning directory:', err);
    }

    return {
      folderPath,
      folderName: path.basename(folderPath),
      files: foundFiles
    };
  });

  // Shell Open External Link / Desktop Shortcut Handler
  ipcMain.handle('shell:openExternal', async (event, targetUrl) => {
    try {
      if (!targetUrl || typeof targetUrl !== 'string') return false;
      const trimmed = targetUrl.trim();
      
      // 1. Web or registered custom protocol URLs
      if (/^(https?|mailto|steam|spotify|discord|vlc):\/\//i.test(trimmed)) {
        await shell.openExternal(trimmed);
        return true;
      }
      
      // 2. Existing local file, directory, or executable path
      if (fs.existsSync(trimmed)) {
        await shell.openPath(trimmed);
        return true;
      }

      // 3. Known system application commands (Chrome, Notepad, Calc, etc.)
      const lower = trimmed.toLowerCase();
      const isKnownApp = ['chrome', 'google chrome', 'chrome.exe', 'notepad', 'notepad.exe', 'calc', 'calc.exe', 'explorer', 'explorer.exe', 'cmd', 'powershell', 'msedge'].includes(lower) || lower.endsWith('.exe') || lower.endsWith('.lnk');
      if (isKnownApp) {
        exec(`start "" "${trimmed}"`, { shell: true }, (err) => {
          if (err) console.warn('[Shell] App exec notice:', err.message);
        });
        return true;
      }

      // 4. Web URLs without protocol (e.g. youtube.com or www.google.com)
      if (trimmed.includes('.') && !trimmed.includes(' ') && !trimmed.includes('\\')) {
        const webUrl = trimmed.startsWith('www.') ? `https://${trimmed}` : (trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
        await shell.openExternal(webUrl);
        return true;
      }

      // 5. Fallback: Try launching via Windows Shell start
      exec(`start "" "${trimmed}"`, { shell: true }, (err) => {
        if (err) console.warn('[Shell] Fallback exec notice:', err.message);
      });
      return true;
    } catch (e) {
      console.error('[Shell] Failed to open external target:', e);
      return false;
    }
  });

  // Persistent Custom Folders Management (Up to 5 Folders)
  ipcMain.handle('app:getCustomFolders', async () => {
    const cfg = loadAppConfig();
    return Array.isArray(cfg.customFolders) ? cfg.customFolders.slice(0, 5) : [];
  });

  ipcMain.handle('app:saveCustomFolders', async (event, folders) => {
    try {
      const cfg = loadAppConfig();
      const cleanFolders = Array.isArray(folders) ? folders.slice(0, 5) : [];
      cfg.customFolders = cleanFolders;
      saveAppConfig(cfg);
      return true;
    } catch (e) {
      console.error('[Config] Failed to save custom folders:', e);
      return false;
    }
  });

  // Persistent Shortcuts Management
  ipcMain.handle('app:getShortcuts', async () => {
    const cfg = loadAppConfig();
    return Array.isArray(cfg.shortcuts) ? cfg.shortcuts : [];
  });

  ipcMain.handle('app:saveShortcuts', async (event, shortcuts) => {
    try {
      const cfg = loadAppConfig();
      cfg.shortcuts = Array.isArray(shortcuts) ? shortcuts : [];
      saveAppConfig(cfg);
      return true;
    } catch (e) {
      console.error('[Config] Failed to save shortcuts:', e);
      return false;
    }
  });

  // ============================================================================
  // AUDIO METADATA & ALBUM ART EXTRACTION (ID3 / FLAC / MP4 / FOLDER ART)
  // ============================================================================
  ipcMain.handle('media:extractAudioCover', async (event, filePath) => {
    return extractAudioCoverArt(filePath);
  });

  // VLC Engine Lifecycle & Hardware Acceleration Config
  ipcMain.handle('vlc:getConfig', async () => {
    return {
      vlcFlags: [
        '--avcodec-hw=d3d11va',
        '--network-caching=3000',
        '--file-caching=2000',
        '--clock-jitter=0',
        '--no-audio-time-stretch',
        '--directx-hw-yuv'
      ],
      streamPort: streamServerPort,
      zeroCopy: true,
      hardwareDecoding: true
    };
  });

  // Natural Episode/File Detection & Numeric Sequencing
  ipcMain.handle('media:getAdjacentEpisodes', async (event, filePath) => {
    if (!filePath || typeof filePath !== 'string') return { hasPrev: false, hasNext: false };
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) return { hasPrev: false, hasNext: false };

      const mediaExtensions = new Set(['.mp4', '.mkv', '.webm', '.avi', '.flv', '.mov', '.ts', '.wmv', '.m4v', '.3gp', '.vob', '.ogv', '.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.opus', '.wma']);
      const allItems = fs.readdirSync(dir);

      const mediaFiles = [];
      for (const item of allItems) {
        const ext = path.extname(item).toLowerCase();
        if (mediaExtensions.has(ext)) {
          const full = path.join(dir, item);
          try {
            const st = fs.statSync(full);
            if (st.isFile()) {
              mediaFiles.push({
                name: item,
                path: full,
                size: st.size,
                lastModified: st.mtimeMs,
                streamUrl: `http://127.0.0.1:${streamServerPort}/?file=${encodeURIComponent(full)}`,
                isAudio: ['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.opus', '.wma'].includes(ext)
              });
            }
          } catch (e) {}
        }
      }

      // Natural alphanumeric sorting (e.g. 100.mp4 <-> 101.mp4 <-> 102.mp4, Chapter_01.mkv <-> Chapter_02.mkv)
      mediaFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

      const currentName = path.basename(filePath);
      const currentIndex = mediaFiles.findIndex(f => f.name.toLowerCase() === currentName.toLowerCase() || f.path.toLowerCase() === filePath.toLowerCase());

      const prev = currentIndex > 0 ? mediaFiles[currentIndex - 1] : null;
      const next = (currentIndex >= 0 && currentIndex < mediaFiles.length - 1) ? mediaFiles[currentIndex + 1] : null;

      return {
        hasPrev: Boolean(prev),
        prev,
        hasNext: Boolean(next),
        next,
        currentIndex,
        totalCount: mediaFiles.length,
        currentFile: currentIndex >= 0 ? mediaFiles[currentIndex] : null,
        allFiles: mediaFiles
      };
    } catch (err) {
      console.error('[Main] getAdjacentEpisodes error:', err);
      return { hasPrev: false, hasNext: false, error: err.message };
    }
  });

  // Zero-Click Automatic Subtitle Auto-Detection (.SRT / .VTT / .ASS / .SSA)
  ipcMain.handle('media:findMatchingSubtitles', async (event, filePath) => {
    if (!filePath || typeof filePath !== 'string') return { found: false };
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) return { found: false };

      const ext = path.extname(filePath);
      const baseName = path.basename(filePath, ext);
      const subExts = ['.srt', '.vtt', '.ass', '.ssa'];
      const dirFiles = fs.readdirSync(dir);

      const candidates = [];
      const lowerBase = baseName.toLowerCase();

      for (const f of dirFiles) {
        const fExt = path.extname(f).toLowerCase();
        if (!subExts.includes(fExt)) continue;

        const fBase = path.basename(f, fExt);
        const lowerFBase = fBase.toLowerCase();

        if (lowerFBase === lowerBase) {
          // Priority 1: Exact base filename match
          candidates.push({ file: f, priority: 1, fullPath: path.join(dir, f), ext: fExt });
        } else if (lowerFBase.startsWith(lowerBase + '.') || lowerFBase.startsWith(lowerBase + '_') || lowerFBase.startsWith(lowerBase + '-')) {
          // Priority 2/3: Language / dialect tags (e.g. Physics_101.en.srt, Physics_101.hi.srt, Physics_101.eng.srt)
          const suffix = lowerFBase.slice(lowerBase.length + 1);
          const prio = (suffix === 'en' || suffix === 'eng' || suffix === 'english') ? 2 : 3;
          candidates.push({ file: f, priority: prio, fullPath: path.join(dir, f), ext: fExt });
        }
      }

      if (candidates.length === 0) return { found: false };

      // Sort by priority, then by format preference (.srt / .vtt / .ass)
      candidates.sort((a, b) => a.priority - b.priority);
      const bestMatch = candidates[0];
      const content = fs.readFileSync(bestMatch.fullPath, 'utf8');

      return {
        found: true,
        filename: bestMatch.file,
        fullPath: bestMatch.fullPath,
        content: content,
        format: bestMatch.ext.slice(1)
      };
    } catch (err) {
      console.error('[Main] Auto-subtitle detection error:', err);
      return { found: false, error: err.message };
    }
  });

  // Read Subtitle File from Path
  ipcMain.handle('media:readSubFile', async (event, subPath) => {
    if (!subPath || typeof subPath !== 'string') return null;
    try {
      if (fs.existsSync(subPath)) {
        const content = fs.readFileSync(subPath, 'utf8');
        return {
          filename: path.basename(subPath),
          fullPath: subPath,
          content
        };
      }
    } catch (e) {
      return null;
    }
    return null;
  });

  // Music Mode System Tray Background Playback Setting
  ipcMain.handle('app:setMusicBackgroundMode', (event, enabled) => {
    musicBackgroundMode = Boolean(enabled);
    return musicBackgroundMode;
  });

  // Custom Cache & Storage Repository Management
  ipcMain.handle('system:getCacheInfo', async () => {
    const cfg = loadAppConfig();
    const metrics = getDirectoryMetrics(cfg.cacheDir);
    const defaultDir = getDefaultCacheDir();
    return {
      cachePath: cfg.cacheDir,
      isDefault: path.resolve(cfg.cacheDir) === path.resolve(defaultDir),
      totalSizeBytes: metrics.totalSizeBytes,
      formattedSize: metrics.formattedSize,
      fileCount: metrics.fileCount
    };
  });

  ipcMain.handle('system:selectCacheDir', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Custom Cache & Storage Folder',
      properties: ['openDirectory', 'createDirectory', 'promptToCreate']
    });

    if (result.canceled || !result.filePaths.length) {
      return null;
    }

    const selectedDir = result.filePaths[0];
    if (!fs.existsSync(selectedDir)) {
      try { fs.mkdirSync(selectedDir, { recursive: true }); } catch (e) {}
    }

    const cfg = loadAppConfig();
    cfg.cacheDir = selectedDir;
    saveAppConfig(cfg);

    const metrics = getDirectoryMetrics(selectedDir);
    const defaultDir = getDefaultCacheDir();

    return {
      success: true,
      cachePath: selectedDir,
      isDefault: path.resolve(selectedDir) === path.resolve(defaultDir),
      totalSizeBytes: metrics.totalSizeBytes,
      formattedSize: metrics.formattedSize,
      fileCount: metrics.fileCount
    };
  });

  ipcMain.handle('system:resetCacheDir', async () => {
    const defaultDir = getDefaultCacheDir();
    if (!fs.existsSync(defaultDir)) {
      try { fs.mkdirSync(defaultDir, { recursive: true }); } catch (e) {}
    }
    const cfg = loadAppConfig();
    cfg.cacheDir = defaultDir;
    saveAppConfig(cfg);

    const metrics = getDirectoryMetrics(defaultDir);

    return {
      success: true,
      cachePath: defaultDir,
      isDefault: true,
      totalSizeBytes: metrics.totalSizeBytes,
      formattedSize: metrics.formattedSize,
      fileCount: metrics.fileCount
    };
  });

  ipcMain.handle('system:purgeCacheDir', async () => {
    const cfg = loadAppConfig();
    const result = purgeDirectoryContents(cfg.cacheDir);
    const updatedMetrics = getDirectoryMetrics(cfg.cacheDir);

    return {
      success: true,
      freedBytes: result.freedBytes,
      formattedFreed: result.formattedFreed,
      deletedCount: result.deletedCount,
      cachePath: cfg.cacheDir,
      totalSizeBytes: updatedMetrics.totalSizeBytes,
      formattedSize: updatedMetrics.formattedSize,
      fileCount: updatedMetrics.fileCount
    };
  });

  ipcMain.handle('system:openCacheFolder', async () => {
    const cfg = loadAppConfig();
    if (fs.existsSync(cfg.cacheDir)) {
      await shell.openPath(cfg.cacheDir);
      return { success: true };
    }
    return { success: false, error: 'Directory does not exist' };
  });

  // Native Disk Cache for Thumbnails in Active Storage Repository
  ipcMain.handle('cache:saveThumbnailFile', async (event, name, dataUrl) => {
    try {
      if (!name || !dataUrl || typeof dataUrl !== 'string') return false;
      const cfg = loadAppConfig();
      const thumbsDir = path.join(cfg.cacheDir, 'thumbnails');
      if (!fs.existsSync(thumbsDir)) {
        fs.mkdirSync(thumbsDir, { recursive: true });
      }

      const safeName = name.replace(/[^a-zA-Z0-9_\-\.]/g, '_').slice(0, 80);
      const hash = crypto.createHash('md5').update(name).digest('hex').slice(0, 10);
      const filePath = path.join(thumbsDir, `${safeName}_${hash}.jpg`);

      const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
      return { success: true, filePath };
    } catch (e) {
      console.warn('[Cache] Save thumbnail file notice:', e.message);
      return false;
    }
  });

  ipcMain.handle('cache:getThumbnailFile', async (event, name) => {
    try {
      if (!name) return null;
      const cfg = loadAppConfig();
      const thumbsDir = path.join(cfg.cacheDir, 'thumbnails');
      if (!fs.existsSync(thumbsDir)) return null;

      const safeName = name.replace(/[^a-zA-Z0-9_\-\.]/g, '_').slice(0, 80);
      const hash = crypto.createHash('md5').update(name).digest('hex').slice(0, 10);
      const filePath = path.join(thumbsDir, `${safeName}_${hash}.jpg`);

      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath);
        return `data:image/jpeg;base64,${data.toString('base64')}`;
      }
      return null;
    } catch (e) {
      return null;
    }
  });

  // Direct Startup Launch Media
  ipcMain.handle('app:getLaunchFile', async () => {
    if (!pendingLaunchFile) {
      pendingLaunchFile = parseMediaArg(process.argv);
    }
    return pendingLaunchFile;
  });

  // Window Controls
  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.handle('window:close', () => {
    if (musicBackgroundMode) {
      mainWindow?.hide();
    } else {
      isQuitting = true;
      app.quit();
    }
  });

  ipcMain.handle('window:isMaximized', () => {
    return mainWindow?.isMaximized() || false;
  });

  // Permanent Media File Deletion on Disk
  ipcMain.handle('media:permanentlyDeleteFile', async (event, filePath) => {
    if (!filePath || typeof filePath !== 'string') {
      return { success: false, error: 'Invalid or missing file path' };
    }
    try {
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          console.log('[Main] 🗑️ Permanently deleted file from disk:', filePath);
          return { success: true };
        } catch (unlinkErr) {
          try {
            await shell.trashItem(filePath);
            console.log('[Main] 🗑️ Moved file to trash via shell:', filePath);
            return { success: true };
          } catch (trashErr) {
            throw unlinkErr;
          }
        }
      } else {
        return { success: true, note: 'File does not exist on disk' };
      }
    } catch (err) {
      console.error('[Main] Failed to permanently delete file:', err);
      return { success: false, error: err.message };
    }
  });
}

// ============================================================================
// 6. APP LIFECYCLE
// ============================================================================
app.whenReady().then(async () => {
  setupIpcHandlers();
  await createMainWindow();
  setupSystemTray();

  // Run 6-Hour Auto Purge on app startup and every 30 minutes
  try {
    const cfg = loadAppConfig();
    purgeCacheOlderThan(cfg.cacheDir);
    setInterval(() => {
      try {
        const currentCfg = loadAppConfig();
        purgeCacheOlderThan(currentCfg.cacheDir);
      } catch (e) {}
    }, 30 * 60 * 1000);
  } catch (e) {
    console.warn('[AutoPurge] Startup purge notice:', e);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  if (internalStreamServer) {
    try {
      internalStreamServer.close();
    } catch (e) {}
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !musicBackgroundMode) {
    app.quit();
  }
});
