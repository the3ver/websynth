/**
 * RETROVOX SUB-1 • Service Worker (App Shell & Offline Precache)
 * Version: 1.6.1
 * Pure Native Standards (Zero Bundlers / Zero Build Steps)
 */

const CACHE_VERSION = 'v1.6.1';
const SHELL_CACHE = `retrovox-shell-${CACHE_VERSION}`;
const FONT_CACHE = 'retrovox-fonts-v1';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './privacy.html',
  './css/style.css',
  './js/app.js',
  './js/pwa-manager.js',
  './js/audio-engine.js',
  './js/drum-engine.js',
  './js/drum-ui.js',
  './js/synth-ui.js',
  './js/arp-engine.js',
  './js/presets.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.png',
  './screenshots/screenshot-desktop.png',
  './screenshots/screenshot-mobile.png'
];

// Install: Pre-cache App Shell & Icons
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(async (cache) => {
      try {
        await cache.addAll(PRECACHE_ASSETS);
      } catch (err) {
        console.warn('[SW] Pre-caching partial failure, continuing:', err);
      }
      return self.skipWaiting();
    })
  );
});

// Activate: Purge obsolete caches and claim clients immediately
self.addEventListener('activate', (event) => {
  const currentCaches = [SHELL_CACHE, FONT_CACHE];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!currentCaches.includes(cacheName)) {
            console.log('[SW] Deleting obsolete cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Smart caching for local App Shell & Google WebFonts
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Ignore non-GET requests (e.g. POST)
  if (request.method !== 'GET') return;

  // 1. Google Fonts Stylesheets & Webfont WOFF2 files (fonts.googleapis.com / fonts.gstatic.com)
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
          // Stale-While-Revalidate: fetch in background to keep fonts fresh
          fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
            }
          }).catch(() => {});
          return cachedResponse;
        }

        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch (err) {
          return cachedResponse || new Response('', { status: 408, statusText: 'Font unavailable offline' });
        }
      })
    );
    return;
  }

  // 2. Local Same-Origin App Shell Assets
  if (url.origin === self.location.origin) {
    // Navigation requests (HTML document)
    if (request.mode === 'navigate') {
      event.respondWith(
        (async () => {
          try {
            // Attempt fast network fetch with a 1.5s timeout
            const fetchPromise = fetch(request);
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Network timeout')), 1500)
            );
            const networkResponse = await Promise.race([fetchPromise, timeoutPromise]);
            if (networkResponse && networkResponse.status === 200) {
              const cache = await caches.open(SHELL_CACHE);
              cache.put(request, networkResponse.clone());
              return networkResponse;
            }
          } catch (e) {
            // Network failure or timeout -> fallback to cached index.html
          }
          const cached = await caches.match(request) || await caches.match('./index.html') || await caches.match('index.html');
          return cached || new Response('Offline Studio ready', { status: 200, headers: { 'Content-Type': 'text/html' } });
        })()
      );
      return;
    }

    // Static Assets (CSS, JS, Icons, Images) -> Cache-First with Stale-While-Revalidate
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(request, { ignoreSearch: true });
        
        const fetchPromise = fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => null);

        return cachedResponse || (await fetchPromise) || new Response('Asset not found', { status: 404 });
      })
    );
  }
});

// Communication: Listen for client instructions (e.g. skip waiting on update)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
