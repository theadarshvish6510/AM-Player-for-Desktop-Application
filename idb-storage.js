/**
 * Adarsh's Media Player - Persistent IndexedDB Storage Engine (v2)
 * Database: AMPlayerDB (v2)
 * Features: Collision-proof primary keys, 6-Hour Auto-Purge TTL for media/history/notes/thumbnails,
 * safe quota management, and permanent user settings preservation.
 */

'use strict';

(function(window) {
const DB_NAME = 'AMPlayerDB';
const DB_VERSION = 2;
const MAX_BLOB_STORAGE_BYTES = 60 * 1024 * 1024; // 60MB threshold to prevent QuotaExceededError
const SIX_HOURS_MS = 6 * 60 * 60 * 1000; // 6 hours auto-purge TTL (21,600,000 ms)

class PlayerStorageEngine {
  constructor() {
    this.db = null;
    this.SIX_HOURS_MS = SIX_HOURS_MS;
    this._initPromise = null;
    if (typeof indexedDB !== 'undefined') {
      this._initPromise = this.initDB().catch(err => {
        console.warn('[IDB] Initial DB open notice:', err);
        return null;
      });
    }
  }

  async initDB() {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('IndexedDB not supported'));
    }
    return new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = event.target.result;

          // 1. Stored Media Files Metadata & Safe Blobs
          if (!db.objectStoreNames.contains('mediaFiles')) {
            const mediaStore = db.createObjectStore('mediaFiles', { keyPath: 'id' });
            mediaStore.createIndex('name', 'name', { unique: false });
            mediaStore.createIndex('timestamp', 'timestamp', { unique: false });
            mediaStore.createIndex('fileKey', 'fileKey', { unique: true });
          }

          // 2. Recent Playback History (Collision-proof by unique fileKey)
          if (!db.objectStoreNames.contains('recentHistory')) {
            const recentsStore = db.createObjectStore('recentHistory', { keyPath: 'id' });
            recentsStore.createIndex('title', 'title', { unique: false });
            recentsStore.createIndex('timestamp', 'timestamp', { unique: false });
            recentsStore.createIndex('fileKey', 'fileKey', { unique: false });
          }

          // 3. Lecture Notes & Timestamps
          if (!db.objectStoreNames.contains('lectureNotes')) {
            const notesStore = db.createObjectStore('lectureNotes', { keyPath: 'id' });
            notesStore.createIndex('fileKey', 'fileKey', { unique: false });
            notesStore.createIndex('mediaTitle', 'mediaTitle', { unique: false });
            notesStore.createIndex('time', 'time', { unique: false });
          }

          // 4. Video Thumbnail Previews (Keyed by fileKey)
          if (!db.objectStoreNames.contains('thumbnails')) {
            const thumbStore = db.createObjectStore('thumbnails', { keyPath: 'id' });
            thumbStore.createIndex('timestamp', 'timestamp', { unique: false });
          }

          // 5. User Preferences & Settings (PERMANENT - Never purged by 6-hr TTL)
          if (!db.objectStoreNames.contains('appSettings')) {
            db.createObjectStore('appSettings', { keyPath: 'key' });
          }
        };

        request.onsuccess = (event) => {
          this.db = event.target.result;
          
          // Handle unexpected disconnects or database version migrations
          this.db.onversionchange = () => {
            if (this.db) this.db.close();
            this.db = null;
            this._initPromise = null;
          };

          this.db.onclose = () => {
            this.db = null;
            this._initPromise = null;
          };

          // Purge any media/history/thumbnails/notes older than 6 hours
          this.purgeExpiredData().catch(() => {});
          if (!this._purgeInterval) {
            this._purgeInterval = setInterval(() => {
              this.purgeExpiredData().catch(() => {});
            }, 15 * 60 * 1000);
          }

          resolve(this.db);
        };

        request.onerror = (event) => {
          this.db = null;
          this._initPromise = null;
          reject(event.target.error || new Error('IndexedDB open error'));
        };
      } catch (err) {
        this.db = null;
        this._initPromise = null;
        reject(err);
      }
    });
  }

  async _ensureDB() {
    if (this.db) return this.db;
    if (!this._initPromise) {
      this._initPromise = this.initDB().catch(err => {
        console.warn('[IDB] _ensureDB notice:', err);
        return null;
      });
    }
    return this._initPromise;
  }

  async _getStore(storeName, mode = 'readonly') {
    const db = await this._ensureDB();
    if (!db) return null;
    try {
      const tx = db.transaction(storeName, mode);
      return tx.objectStore(storeName);
    } catch(err) {
      console.warn('[IDB] _getStore notice:', err);
      return null;
    }
  }

  // Generates collision-proof identifier based on filename, size, and modified date
  generateFileKey(name, size = 0, lastModified = 0) {
    const cleanName = (name || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${cleanName}_${size}_${lastModified}`;
  }

  /* --- 6-HOUR AUTO-PURGE ENGINE --- */
  async purgeExpiredData(maxAgeMs = SIX_HOURS_MS) {
    if (!this.db) {
      await this.initDB();
    }
    const now = Date.now();
    const threshold = now - maxAgeMs;
    const storesToPurge = ['mediaFiles', 'recentHistory', 'lectureNotes', 'thumbnails'];

    for (const storeName of storesToPurge) {
      try {
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.openCursor();

        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            const item = cursor.value;
            const itemTime = item.timestamp || item.lastModified || 0;
            if (!itemTime || itemTime < threshold) {
              cursor.delete();
            }
            cursor.continue();
          }
        };
      } catch (err) {
        console.warn(`[IDB] Auto-purge failed for ${storeName}:`, err);
      }
    }
  }

  /* --- MEDIA FILE OPERATIONS --- */
  async saveMediaFile(file, extraMeta = {}) {
    try {
      const store = await this._getStore('mediaFiles', 'readwrite');
      if (!store) return null;
      const fileKey = this.generateFileKey(file.name, file.size, file.lastModified);
      
      // Prevent browser crashing by avoiding raw blob persistence for giant files
      const canStoreBlob = file.size <= MAX_BLOB_STORAGE_BYTES;

      const record = {
        id: fileKey,
        fileKey: fileKey,
        name: file.name,
        type: file.type || 'video/mp4',
        size: file.size,
        blob: canStoreBlob ? file : null,
        hasBlob: canStoreBlob,
        lastModified: file.lastModified || Date.now(),
        duration: extraMeta.duration || 0,
        width: extraMeta.width || 0,
        height: extraMeta.height || 0,
        path: file.webkitRelativePath || file.name,
        mode: extraMeta.mode || extraMeta.playedMode || (file.isAudio ? 'music' : 'lecture'),
        playedMode: extraMeta.playedMode || extraMeta.mode || (file.isAudio ? 'music' : 'lecture'),
        timestamp: Date.now()
      };

      return new Promise((resolve) => {
        const request = store.put(record);
        request.onsuccess = () => resolve(record);
        request.onerror = () => resolve(null);
      });
    } catch (err) {
      console.warn('[IDB] saveMediaFile fallback:', err);
      return null;
    }
  }

  async getAllMediaFiles() {
    try {
      const store = await this._getStore('mediaFiles', 'readonly');
      if (!store) return [];
      const now = Date.now();
      const threshold = now - SIX_HOURS_MS;

      return new Promise((resolve) => {
        const request = store.getAll();
        request.onsuccess = () => {
          const all = request.result || [];
          const valid = all.filter(item => {
            const t = item.timestamp || item.lastModified || 0;
            return t >= threshold;
          });
          resolve(valid);
        };
        request.onerror = () => resolve([]);
      });
    } catch (err) {
      return [];
    }
  }

  async deleteMediaFile(fileKey) {
    try {
      const store = await this._getStore('mediaFiles', 'readwrite');
      if (!store) return false;
      return new Promise((resolve) => {
        const request = store.delete(fileKey);
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      });
    } catch (err) {
      return false;
    }
  }

  async clearMediaFiles() {
    try {
      const store = await this._getStore('mediaFiles', 'readwrite');
      if (!store) return false;
      return new Promise((resolve) => {
        const request = store.clear();
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      });
    } catch (err) {
      return false;
    }
  }

  /* --- RECENTS OPERATIONS --- */
  async saveRecent(item) {
    try {
      const store = await this._getStore('recentHistory', 'readwrite');
      if (!store) return false;
      const fileKey = item.fileKey || this.generateFileKey(item.title, item.size || 0, item.lastModified || 0);

      const record = {
        id: fileKey,
        fileKey: fileKey,
        title: item.title,
        src: (item.src && !item.src.startsWith('blob:')) ? item.src : '',
        duration: item.duration || 0,
        lastPosition: item.lastPosition || 0,
        thumbUrl: item.thumbUrl || null,
        size: item.size || 0,
        lastModified: item.lastModified || 0,
        mode: item.mode || item.playedMode || (item.isAudio ? 'music' : 'lecture'),
        playedMode: item.playedMode || item.mode || (item.isAudio ? 'music' : 'lecture'),
        timestamp: Date.now()
      };

      return new Promise((resolve) => {
        const request = store.put(record);
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      });
    } catch (err) {
      console.warn('[IDB] saveRecent error:', err);
      return false;
    }
  }

  async getRecents() {
    try {
      const store = await this._getStore('recentHistory', 'readonly');
      if (!store) return [];
      const now = Date.now();
      const threshold = now - SIX_HOURS_MS;

      return new Promise((resolve) => {
        const request = store.getAll();
        request.onsuccess = () => {
          const records = (request.result || []).filter(item => (item.timestamp || 0) >= threshold);
          records.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          resolve(records.slice(0, 30));
        };
        request.onerror = () => resolve([]);
      });
    } catch (err) {
      return [];
    }
  }

  async deleteRecent(idOrFileKey) {
    try {
      const store = await this._getStore('recentHistory', 'readwrite');
      if (!store) return false;
      return new Promise((resolve) => {
        const request = store.delete(idOrFileKey);
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      });
    } catch (err) {
      return false;
    }
  }

  async clearRecents() {
    try {
      const store = await this._getStore('recentHistory', 'readwrite');
      if (!store) return false;
      return new Promise((resolve) => {
        const request = store.clear();
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      });
    } catch (err) {
      return false;
    }
  }

  /* --- LECTURE NOTES OPERATIONS --- */
  async saveNote(note) {
    try {
      const store = await this._getStore('lectureNotes', 'readwrite');
      if (!store) return null;
      const record = {
        id: note.id || Date.now(),
        fileKey: note.fileKey || this.generateFileKey(note.mediaTitle || 'generic', 0, 0),
        mediaTitle: note.mediaTitle || 'Unknown Media',
        time: typeof note.time === 'number' ? note.time : 0,
        text: note.text || '',
        pdfPage: note.pdfPage || null,
        pdfFile: note.pdfFile || null,
        timestamp: Date.now()
      };
      return new Promise((resolve) => {
        const request = store.put(record);
        request.onsuccess = () => resolve(record);
        request.onerror = () => resolve(null);
      });
    } catch (err) {
      return null;
    }
  }

  async getNotes(mediaIdentifier) {
    try {
      const store = await this._getStore('lectureNotes', 'readonly');
      if (!store) return [];
      const now = Date.now();
      const threshold = now - SIX_HOURS_MS;

      return new Promise((resolve) => {
        const request = store.getAll();
        request.onsuccess = () => {
          let records = (request.result || []).filter(item => (item.timestamp || 0) >= threshold);
          if (mediaIdentifier) {
            records = records.filter(r => r.fileKey === mediaIdentifier || r.mediaTitle === mediaIdentifier);
          }
          records.sort((a, b) => a.time - b.time);
          resolve(records);
        };
        request.onerror = () => resolve([]);
      });
    } catch (err) {
      return [];
    }
  }

  async deleteNote(id) {
    try {
      const store = await this._getStore('lectureNotes', 'readwrite');
      if (!store) return false;
      return new Promise((resolve) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      });
    } catch (err) {
      return false;
    }
  }

  /* --- THUMBNAIL CACHE OPERATIONS --- */
  async saveThumbnail(fileKey, dataUrl) {
    try {
      if (!dataUrl) return false;
      // Also persist to physical disk cache if Electron environment is present
      if (typeof window !== 'undefined' && window.electronVLC && typeof window.electronVLC.saveThumbnailDisk === 'function') {
        window.electronVLC.saveThumbnailDisk(fileKey, dataUrl).catch(() => {});
      }
      const store = await this._getStore('thumbnails', 'readwrite');
      if (!store) return false;
      return new Promise((resolve) => {
        const request = store.put({ id: fileKey, dataUrl, timestamp: Date.now() });
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      });
    } catch (err) {
      return false;
    }
  }

  async getThumbnail(fileKey) {
    try {
      const store = await this._getStore('thumbnails', 'readonly');
      let idbResult = null;
      if (store) {
        const now = Date.now();
        const threshold = now - SIX_HOURS_MS;

        idbResult = await new Promise((resolve) => {
          const request = store.get(fileKey);
          request.onsuccess = () => {
            if (!request.result) return resolve(null);
            if ((request.result.timestamp || 0) < threshold) {
              // Expired thumbnail in IDB
              return resolve(null);
            }
            resolve(request.result.dataUrl);
          };
          request.onerror = () => resolve(null);
        });
      }

      if (idbResult) return idbResult;

      // Check physical disk cache if not found or expired in IDB
      if (typeof window !== 'undefined' && window.electronVLC && typeof window.electronVLC.getThumbnailDisk === 'function') {
        const diskRes = await window.electronVLC.getThumbnailDisk(fileKey).catch(() => null);
        if (diskRes && diskRes.dataUrl) {
          // Re-populate in IDB for fast in-memory access
          this._getStore('thumbnails', 'readwrite').then(wStore => {
            if (wStore) wStore.put({ id: fileKey, dataUrl: diskRes.dataUrl, timestamp: Date.now() });
          }).catch(() => {});
          return diskRes.dataUrl;
        }
      }

      return null;
    } catch (err) {
      return null;
    }
  }

  async clearThumbnails() {
    try {
      const store = await this._getStore('thumbnails', 'readwrite');
      if (!store) return false;
      return new Promise((resolve) => {
        const request = store.clear();
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      });
    } catch (err) {
      return false;
    }
  }

  /* --- APP SETTINGS OPERATIONS (PERMANENT - Never auto-purged) --- */
  async setSetting(key, value) {
    try {
      const store = await this._getStore('appSettings', 'readwrite');
      if (!store) return false;
      return new Promise((resolve) => {
        const request = store.put({ key, value, timestamp: Date.now() });
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      });
    } catch (err) {
      return false;
    }
  }

  async getSetting(key, defaultValue = null) {
    try {
      const store = await this._getStore('appSettings', 'readonly');
      if (!store) return defaultValue;
      return new Promise((resolve) => {
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result !== undefined ? request.result.value : defaultValue);
        request.onerror = () => resolve(defaultValue);
      });
    } catch (err) {
      return defaultValue;
    }
  }

  /* --- PURGE ALL DATA ASSOCIATED WITH A MEDIA FILE --- */
  async purgeAllDataForMedia(fileKey, mediaTitle) {
    try {
      const db = await this._ensureDB();
      if (!db) return false;

      // 1. Delete from mediaFiles
      if (fileKey) {
        await this.deleteMediaFile(fileKey);
      }

      // 2. Delete from recentHistory
      const recentStore = await this._getStore('recentHistory', 'readwrite');
      if (recentStore) {
        if (fileKey) {
          recentStore.delete(fileKey);
        }
        const req = recentStore.openCursor();
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            if (cursor.value.fileKey === fileKey || cursor.value.title === mediaTitle || cursor.value.id === fileKey) {
              cursor.delete();
            }
            cursor.continue();
          }
        };
      }

      // 3. Delete from thumbnails
      if (fileKey) {
        const thumbStore = await this._getStore('thumbnails', 'readwrite');
        if (thumbStore) thumbStore.delete(fileKey);
      }

      // 4. Delete notes associated with this media
      const notesStore = await this._getStore('lectureNotes', 'readwrite');
      if (notesStore) {
        const req = notesStore.openCursor();
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            if (cursor.value.fileKey === fileKey || cursor.value.mediaTitle === mediaTitle) {
              cursor.delete();
            }
            cursor.continue();
          }
        };
      }

      return true;
    } catch (err) {
      console.warn('[IDB] purgeAllDataForMedia notice:', err);
      return false;
    }
  }
}

window.IDBStorage = new PlayerStorageEngine();
})(typeof window !== 'undefined' ? window : this);

