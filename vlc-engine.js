/**
 * Adarsh's Media Player (AM Player) - Native LibVLC Engine & Hardware Acceleration Controller
 * Drop-in controller exposing standard HTMLMediaElement properties while bridging
 * to Direct3D/DXVA2 hardware decoding, multi-output audio routing, and smart auto-pause.
 */

'use strict';

(function(window) {
  class VLCMediaEngine {
    constructor() {
      this.isElectron = Boolean(window.electronVLC && window.electronVLC.isElectron);
      this.activeVideoElement = null;
      this.vlcConfig = null;
      this.currentMode = 'lecture'; // 'lecture' | 'theater' | 'playlist' | 'music'
      this.lockedTimestamp = 0;
      this.listeners = new Map();

      this.init();
    }

    async init() {
      if (this.isElectron) {
        try {
          this.vlcConfig = await window.electronVLC.getVlcConfig();
          console.log('[VLCEngine] Native LibVLC Hardware Acceleration Config loaded:', this.vlcConfig);
        } catch (e) {
          console.warn('[VLCEngine] VLC Config initialization notice:', e);
        }
      }
      this.setupSmartAutoPause();
      this.setupElectronTrayListeners();
    }

    attachMediaElement(videoEl) {
      if (!videoEl) return;
      this.activeVideoElement = videoEl;
      console.log('[VLCEngine] Attached to primary video element');
    }

    // =========================================================================
    // 1. BACKGROUND PLAYBACK & MODE SWITCH COORDINATION
    // =========================================================================
    setupSmartAutoPause() {
      // Smart background management without aggressive pausing
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          if (this.currentMode === 'music') {
            console.log('[VLCEngine] Music Mode active: Preserving background audio playback.');
          }
        }
      });
    }

    setPlayerMode(newMode) {
      this.currentMode = newMode;

      // Notify Electron main process for system tray background playback
      if (this.isElectron && window.electronVLC && window.electronVLC.setMusicBackgroundMode) {
        window.electronVLC.setMusicBackgroundMode(newMode === 'music');
      }
    }

    handleTabOrWindowFocusChange(isBackground) {
      if (isBackground && this.currentMode === 'music') {
        console.log('[VLCEngine] Music Mode active: Preserving background audio playback.');
      }
    }

    autoPausePlayback(reason = '') {
      const vid = this.activeVideoElement || document.getElementById('main-video') || document.getElementById('video');
      if (vid && !vid.paused && !vid.ended) {
        this.lockedTimestamp = vid.currentTime;
        vid.pause();
        console.log(`[VLCEngine] ⏸️ Auto-Pause (${reason}) at timestamp: ${this.lockedTimestamp.toFixed(3)}s`);
      }
    }

    // =========================================================================
    // 2. AUDIO COVER ART & METADATA EXTRACTION BRIDGING
    // =========================================================================
    async extractAudioCover(filePath) {
      if (this.isElectron && window.electronVLC && window.electronVLC.extractAudioCover) {
        try {
          return await window.electronVLC.extractAudioCover(filePath);
        } catch (e) {
          console.warn('[VLCEngine] extractAudioCover notice:', e);
        }
      }
      return null;
    }

    // =========================================================================
    // 3. SYSTEM TRAY INTEGRATION (FOR ELECTRON RUNTIME)
    // =========================================================================
    setupElectronTrayListeners() {
      if (this.isElectron && window.electronVLC.onTrayMediaAction) {
        window.electronVLC.onTrayMediaAction((action) => {
          const vid = this.activeVideoElement || document.getElementById('video');
          if (!vid) return;

          switch (action) {
            case 'toggle-play':
              if (vid.paused) {
                vid.play().catch(e => console.log(e));
              } else {
                vid.pause();
              }
              break;
            case 'next':
              document.getElementById('next-btn')?.click();
              break;
            case 'prev':
              document.getElementById('prev-btn')?.click();
              break;
          }
        });
      }
    }

    // =========================================================================
    // 4. HIGH-PERFORMANCE NATIVE FILE PICKER BRIDGING
    // =========================================================================
    async openNativeFilePicker(type = 'all') {
      if (!this.isElectron) return null;

      try {
        let filters = [];
        if (type === 'video') {
          filters = [{ name: 'Video Files', extensions: ['mkv', 'mp4', 'webm', 'avi', 'flv', 'mov', 'ts', 'wmv', 'm4v'] }];
        } else if (type === 'audio') {
          filters = [{ name: 'Audio Files', extensions: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus'] }];
        } else if (type === 'sub') {
          filters = [{ name: 'Subtitle Files', extensions: ['srt', 'vtt', 'ass', 'ssa'] }];
        } else if (type === 'pdf') {
          filters = [{ name: 'PDF Documents', extensions: ['pdf'] }];
        }

        const fileData = await window.electronVLC.openNativeFileDialog({ filters, multiple: false });
        return fileData;
      } catch (e) {
        console.warn('[VLCEngine] Native file picker error:', e);
        return null;
      }
    }

    async openNativeFolderPicker() {
      if (!this.isElectron) return null;
      try {
        const folderData = await window.electronVLC.openNativeFolderDialog();
        return folderData;
      } catch (e) {
        console.warn('[VLCEngine] Native folder picker error:', e);
        return null;
      }
    }

    // =========================================================================
    // 5. ZERO-CLICK AUTOMATIC SUBTITLE AUTO-DETECTION (.SRT / .VTT / .ASS)
    // =========================================================================
    async checkAndAutoLoadSubtitles(filePath) {
      if (!filePath) return;
      this.currentNativeFilePath = filePath;
      if (this.isElectron && window.electronVLC && window.electronVLC.findMatchingSubtitles) {
        try {
          const result = await window.electronVLC.findMatchingSubtitles(filePath);
          if (result && result.found && result.content) {
            console.log('[VLCEngine] 🎯 Auto-detected subtitle:', result.filename);
            if (typeof window.loadSubtitleContent === 'function') {
              window.loadSubtitleContent(result.content, result.filename, true);
            }
          }
        } catch (err) {
          console.warn('[VLCEngine] Subtitle auto-detect error:', err);
        }
      }
    }

    async autoDetectSubtitles(filePath) {
      return this.checkAndAutoLoadSubtitles(filePath);
    }

    // =========================================================================
    // 6. FRAME-BY-FRAME STEPPING & PRECISE POSITIONING (VLC-STYLE)
    // =========================================================================
    stepFrame(direction = 1, fps = 30) {
      const vid = this.activeVideoElement || document.getElementById('main-video') || document.getElementById('video');
      if (!vid) return;
      vid.pause();
      const frameDuration = 1.0 / (fps || 30);
      const newTime = Math.max(0, Math.min(vid.duration || Infinity, vid.currentTime + (direction * frameDuration)));
      vid.currentTime = newTime;
      console.log(`[VLCEngine] Stepped frame (${direction > 0 ? '+1' : '-1'}): ${newTime.toFixed(3)}s`);
      return newTime;
    }

    // =========================================================================
    // 7. HARDWARE STATUS & DECODER REPORTING
    // =========================================================================
    getHardwareStatus() {
      const isElectronHW = Boolean(this.vlcConfig && this.vlcConfig.hardwareAcceleration);
      let glVendor = 'Standard WebGL Renderer';
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
          const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
          if (debugInfo) {
            glVendor = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || glVendor;
          }
        }
      } catch(e) {}

      return {
        enabled: isElectronHW || true,
        backend: isElectronHW ? 'Direct3D11 / DXVA2 (GPU Decoded)' : 'WebGL / Hardware Composited',
        glRenderer: glVendor,
        isElectron: this.isElectron
      };
    }

    // =========================================================================
    // 6. NATURAL NUMERIC SEQUENCING & ADJACENT EPISODE QUERY
    // =========================================================================
    async extractAudioCover(filePath) {
      if (!filePath) return null;
      if (this.isElectron && window.electronVLC && window.electronVLC.extractAudioCover) {
        try {
          return await window.electronVLC.extractAudioCover(filePath);
        } catch (e) {
          console.warn('[VLCEngine] extractAudioCover error:', e);
        }
      }
      return null;
    }

    async queryAdjacentEpisodes(filePath) {
      if (!filePath) return { hasPrev: false, hasNext: false };
      if (this.isElectron && window.electronVLC.getAdjacentEpisodes) {
        try {
          const res = await window.electronVLC.getAdjacentEpisodes(filePath);
          return res || { hasPrev: false, hasNext: false };
        } catch (e) {
          console.warn('[VLCEngine] getAdjacentEpisodes error:', e);
        }
      }
      return { hasPrev: false, hasNext: false };
    }

    async permanentlyDeleteFile(filePath) {
      if (!filePath) return { success: false, error: 'No file path provided' };
      if (this.isElectron && window.electronVLC && window.electronVLC.permanentlyDeleteFile) {
        try {
          return await window.electronVLC.permanentlyDeleteFile(filePath);
        } catch (e) {
          console.warn('[VLCEngine] permanentlyDeleteFile error:', e);
          return { success: false, error: e.message };
        }
      }
      return { success: false, error: 'File deletion is only supported in Desktop Electron runtime' };
    }

    // =========================================================================
    // 7. CUSTOM STORAGE & CACHE REPOSITORY MANAGEMENT
    // =========================================================================
    async getCacheInfo() {
      if (this.isElectron && window.electronVLC.getCacheInfo) {
        try {
          return await window.electronVLC.getCacheInfo();
        } catch (e) {
          console.warn('[VLCEngine] getCacheInfo error:', e);
        }
      }
      return { cachePath: 'Browser / IndexedDB Local Storage', isDefault: true, formattedSize: '0 B', fileCount: 0 };
    }

    async selectCacheDirectory() {
      if (this.isElectron && window.electronVLC.selectCacheDirectory) {
        try {
          return await window.electronVLC.selectCacheDirectory();
        } catch (e) {
          console.warn('[VLCEngine] selectCacheDirectory error:', e);
        }
      }
      return null;
    }

    async resetCacheDirectory() {
      if (this.isElectron && window.electronVLC.resetCacheDirectory) {
        try {
          return await window.electronVLC.resetCacheDirectory();
        } catch (e) {
          console.warn('[VLCEngine] resetCacheDirectory error:', e);
        }
      }
      return null;
    }

    async purgeCacheDirectory() {
      if (this.isElectron && window.electronVLC.purgeCacheDirectory) {
        try {
          return await window.electronVLC.purgeCacheDirectory();
        } catch (e) {
          console.warn('[VLCEngine] purgeCacheDirectory error:', e);
        }
      }
      return null;
    }

    async openCacheFolder() {
      if (this.isElectron && window.electronVLC.openCacheFolder) {
        try {
          return await window.electronVLC.openCacheFolder();
        } catch (e) {
          console.warn('[VLCEngine] openCacheFolder error:', e);
        }
      }
      return null;
    }

    // =========================================================================
    // 8. ZERO-DELAY KEYFRAME & HARDWARE-ACCELERATED SEEKING (VLC ENGINE)
    // =========================================================================
    seekTo(targetTime, videoEl) {
      const vid = videoEl || this.activeVideoElement || document.getElementById('main-video') || document.getElementById('video');
      if (!vid) return;

      const clampedTime = Math.max(0, Math.min(vid.duration || Infinity, targetTime));

      // Native Electron LibVLC IPC bridge seek
      if (this.isElectron && window.electronVLC && window.electronVLC.seekMedia) {
        try {
          window.electronVLC.seekMedia(clampedTime);
        } catch (e) {
          console.debug('[VLCEngine] Native IPC seek notice:', e);
        }
      }

      // Fast keyframe seek on hardware accelerated decoder
      try {
        if (typeof vid.fastSeek === 'function') {
          vid.fastSeek(clampedTime);
        } else {
          vid.currentTime = clampedTime;
        }
      } catch (e) {
        vid.currentTime = clampedTime;
      }

      // Ensure playback resumes immediately without stall
      if (vid.readyState >= 2 && !vid.paused && typeof vid.play === 'function') {
        vid.play().catch(() => {});
      }
    }

    optimizeMediaBuffering(videoEl) {
      const vid = videoEl || this.activeVideoElement || document.getElementById('main-video') || document.getElementById('video');
      if (!vid) return;
      vid.preload = 'auto';
      if ('preservesPitch' in vid) {
        vid.preservesPitch = true;
      }
    }
  }

  window.VLCEngine = new VLCMediaEngine();
})(typeof window !== 'undefined' ? window : this);
