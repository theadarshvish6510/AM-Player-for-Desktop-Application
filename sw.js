/**
 * Adarsh's Media Player - Service Worker (v2.1.1)
 * Architecture: 3-Tier Cache Isolation, Chunked Blob-Streaming 206 Synthesizer (Zero-OOM),
 * Direct CDN Precache Resolution & Web Share Target POST Interceptor.
 */

'use strict';

const CACHE_APP_SHELL = 'media-app-shell-v2.1.1';
const CACHE_THUMBNAILS = 'media-thumbnails-v2.1.1';
const CACHE_OFFLINE_SUBS = 'media-offline-subs-v2.1.1';

const ALL_CACHES = [CACHE_APP_SHELL, CACHE_THUMBNAILS, CACHE_OFFLINE_SUBS];

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './idb-storage.js',
  './vlc-engine.js',
  './am-icon.ico',
  './am-icon.png',
  './am-icon-192.png',
  './am-icon-512.png',
  './am-icon-180.png',
  './favicon.ico',
  './am-loading-video.webm',
  'https://cdn.jsdelivr.net/npm/hls.js@1.5.8/dist/hls.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jsmediatags/3.9.5/jsmediatags.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js',
  'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js',
  'https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Cinzel:wght@600&family=Comic+Neue:wght@700&family=Fira+Code:wght@500&family=Fredoka:wght@500;600&family=Inter:wght@400;500;700&family=Kalam:wght@400;700&family=Montserrat:wght@500;700&family=Outfit:wght@400;600;700&family=Playfair+Display:ital,wght@0,600;1,600&family=Plus+Jakarta+Sans:wght@400;600;700&family=Poppins:wght@400;600&family=Roboto+Flex:wght@400;600;800&family=Space+Grotesk:wght@500;700&family=Syne:wght@600;800&family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,1,0&display=swap'
];

/* --------------------------------------------------------------------------
   1. INSTALL & ACTIVATE LIFECYCLE
   -------------------------------------------------------------------------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_APP_SHELL)
      .then(async (cache) => {
        for (const url of PRECACHE_ASSETS) {
          try {
            const fetchOptions = {
              mode: url.startsWith('http') && !url.includes(self.location.hostname) ? 'cors' : 'same-origin',
              redirect: 'follow'
            };
            const response = await fetch(url, fetchOptions);
            if (response && (response.ok || response.type === 'opaque')) {
              await cache.put(url, response);
            }
          } catch (err) {
            console.warn(`[SW] Precache skipped for asset: ${url}`, err);
          }
        }
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((name) => {
            if (!ALL_CACHES.includes(name)) {
              return caches.delete(name);
            }
            return Promise.resolve();
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

/* --------------------------------------------------------------------------
   2. STREAMING HTTP 206 RANGE REQUEST SYNTHESIZER (ZERO ARRAYBUFFER ALLOCATION)
   -------------------------------------------------------------------------- */
function parseRangeHeader(rangeHeader, totalLength) {
  if (!rangeHeader || !rangeHeader.startsWith('bytes=')) return null;
  const parts = rangeHeader.replace(/bytes=/, '').split('-');
  let start = parseInt(parts[0], 10);
  let end = parts[1] ? parseInt(parts[1], 10) : totalLength - 1;

  if (isNaN(start)) {
    start = totalLength - parseInt(parts[1], 10);
    end = totalLength - 1;
  }
  if (isNaN(end) || end >= totalLength) {
    end = totalLength - 1;
  }

  if (start > end || start < 0) return null;
  return { start, end };
}

async function handleRangeRequest(request, cachedResponse) {
  try {
    const rangeHeader = request.headers.get('Range');
    // Using blob.slice instead of arrayBuffer() prevents V8 heap memory exhaustion (OOM crashes)
    const fullBlob = await cachedResponse.blob();
    const total = fullBlob.size;
    const range = parseRangeHeader(rangeHeader, total);

    if (!range) {
      return new Response(null, {
        status: 416,
        statusText: 'Range Not Satisfiable',
        headers: {
          'Content-Range': `bytes */${total}`,
          'Accept-Ranges': 'bytes'
        }
      });
    }

    const slicedChunk = fullBlob.slice(range.start, range.end + 1, cachedResponse.headers.get('Content-Type') || 'video/mp4');
    const headers = new Headers(cachedResponse.headers);
    headers.set('Content-Range', `bytes ${range.start}-${range.end}/${total}`);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Content-Length', String(slicedChunk.size));

    return new Response(slicedChunk, {
      status: 206,
      statusText: 'Partial Content',
      headers: headers
    });
  } catch (err) {
    return cachedResponse;
  }
}

/* --------------------------------------------------------------------------
   3. STRATEGY ROUTERS & QUOTA MANAGEMENT
   -------------------------------------------------------------------------- */
async function purgeThumbnailsCache() {
  try {
    await caches.delete(CACHE_THUMBNAILS);
    await caches.open(CACHE_THUMBNAILS);
  } catch (e) {
    console.error('[SW] Failed to purge thumbnails cache:', e);
  }
}

async function safeCachePut(cacheName, request, response) {
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response);
  } catch (err) {
    if (err.name === 'QuotaExceededError') {
      await purgeThumbnailsCache();
      try {
        const cache = await caches.open(cacheName);
        await cache.put(request, response);
      } catch (retryErr) {
        console.warn('[SW] Cache write omitted after eviction:', retryErr);
      }
    }
  }
}

// Stale-While-Revalidate Strategy
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  const networkFetch = fetch(request)
    .then(async (networkResponse) => {
      if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
        await safeCachePut(cacheName, request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => null);

  if (cachedResponse) {
    if (request.headers.has('Range')) {
      return handleRangeRequest(request, cachedResponse);
    }
    return cachedResponse;
  }

  const freshResponse = await networkFetch;
  if (freshResponse) {
    return freshResponse;
  }

  if (request.mode === 'navigate') {
    const appShell = (await cache.match('./index.html')) ||
                     (await cache.match('/index.html')) ||
                     (await cache.match('./')) ||
                     (await cache.match('/'));
    if (appShell) return appShell;
  }

  // Graceful fallback for non-critical assets
  return new Response('', {
    status: 200,
    statusText: 'Offline Fallback',
    headers: { 'Content-Type': 'text/plain' }
  });
}

// Cache-First Strategy
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    if (request.headers.has('Range')) {
      return handleRangeRequest(request, cachedResponse);
    }
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
      await safeCachePut(cacheName, request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    return new Response('Asset not found in offline cache.', {
      status: 404,
      statusText: 'Not Found',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

/* --------------------------------------------------------------------------
   4. FETCH EVENT DISPATCHER WITH SHARE TARGET POST INTERCEPTOR
   -------------------------------------------------------------------------- */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Intercept Web Share Target POST requests to prevent 405 Method Not Allowed
  if (request.method === 'POST') {
    event.respondWith(
      (async () => {
        try {
          const formData = await request.formData();
          const mediaFiles = formData.getAll('media_files');

          // Notify open clients of shared files
          const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
          if (clientList.length > 0 && mediaFiles.length > 0) {
            clientList[0].postMessage({
              type: 'SHARE_TARGET_FILES',
              filesCount: mediaFiles.length
            });
          }
        } catch (e) {
          console.warn('[SW] Share target formData parsing skipped:', e);
        }
        return Response.redirect('./index.html', 303);
      })()
    );
    return;
  }

  // Bypass non-GET, extension protocols, and blob schemes
  if (request.method !== 'GET' || url.protocol.startsWith('chrome-extension') || url.protocol === 'blob:') {
    return;
  }

  // Live stream bypass (no offline caching for chunk queues)
  if (
    url.pathname.endsWith('.m3u8') ||
    url.pathname.endsWith('.ts') ||
    url.pathname.endsWith('.m4s') ||
    url.pathname.endsWith('.mpd') ||
    url.searchParams.has('live')
  ) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response('Live stream not reachable offline.', {
          status: 504,
          statusText: 'Gateway Timeout',
          headers: { 'Content-Type': 'text/plain' }
        });
      })
    );
    return;
  }

  // Subtitles & Notes
  if (
    url.pathname.match(/\.(srt|vtt|ass|ssa)$/i) ||
    (url.pathname.endsWith('.json') && !url.pathname.endsWith('manifest.json'))
  ) {
    event.respondWith(cacheFirst(request, CACHE_OFFLINE_SUBS));
    return;
  }

  // Thumbnails & Cover Images
  if (
    request.destination === 'image' &&
    !url.pathname.includes('icon-') &&
    !url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(cacheFirst(request, CACHE_THUMBNAILS));
    return;
  }

  // Shell & Core CDN Libraries
  event.respondWith(staleWhileRevalidate(request, CACHE_APP_SHELL));
});

/* --------------------------------------------------------------------------
   5. IPC POSTMESSAGE HANDLER
   -------------------------------------------------------------------------- */
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'PURGE_THUMBNAILS') {
    event.waitUntil(purgeThumbnailsCache());
  }
});
