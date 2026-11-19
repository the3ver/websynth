/**
 * RETROVOX SUB-1 & RETROBEAT D-909 • Progressive Web App Service Worker
 * Version: 1.8.17
 * Provides 100% offline capability, app shell caching, and font asset caching.
 *
 * One release = one cache (SHELL_CACHE, named after CACHE_VERSION). HTML and assets of a page load
 * always come from the same cache, so a new index.html never runs with old scripts or the other
 * way round. A release reaches the page like this: the browser finds a changed sw.js, the new
 * worker precaches its shell from the network (past the HTTP cache), takes over, and
 * pwa-manager.js reloads the page on controllerchange.
 */

const CACHE_VERSION = 'v1.8.17';
const SHELL_CACHE = `retrovox-shell-${CACHE_VERSION}`;
const FONT_CACHE = 'retrovox-fonts-v1';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './privacy.html',
  './css/style.css',
  './js/app.js',
  './js/lib/curves.js',
  './js/lib/envelope.js',
  './js/lib/filter.js',
  './js/lib/gain-stages.js',
  './js/lib/vco.js',
  './js/lib/voice-pool.js',
  './js/lib/lfo.js',
  './js/lib/master-bus.js',
  './js/lib/param-table.js',
  './js/lib/effects.js',
  './js/dom-utils.js',
  './js/pwa-manager.js',
  './js/synth-params.js',
  './js/voice.js',
  './js/fx-chain.js',
  './js/poly-synth-engine.js',
  './js/audio-engine.js',
  './js/fm-algorithms.js',
  './js/fm-params.js',
  './js/fm-presets.js',
  './js/fm-voice.js',
  './js/fm-engine.js',
  './js/worklets/fm-voice-processor.js',
  './js/fm-algorithm-display.js',
  './js/patch-randomizer.js',
  './js/drum-kits.js',
  './js/drum-engine.js',
  './js/drum-ui.js',
  './js/knob-scale.js',
  './js/controls.js',
  './js/virtual-keyboard.js',
  './js/visualizer.js',
  './js/preset-store.js',
  './js/preset-panel.js',
  './js/synth-ui.js',
  './js/synth-registry.js',
  './js/arp-engine.js',
  './js/note-router.js',
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
        // cache: 'reload' skips the browser HTTP cache, which may still hold the previous release
        await cache.addAll(PRECACHE_ASSETS.map((url) => new Request(url, { cache: 'reload' })));
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

  // 2. Local Same-Origin App Shell: cache of the running release first, network only for misses.
  //    Nothing from the network is written into this release's cache (that would mix releases).
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const cached = await cache.match(request, { ignoreSearch: true }) ||
          (request.mode === 'navigate' ? await cache.match('./index.html') : undefined);
        if (cached) return cached;
        try {
          return await fetch(request);
        } catch (e) {
          if (request.mode === 'navigate') {
            return new Response('Offline Studio ready', { status: 200, headers: { 'Content-Type': 'text/html' } });
          }
          return new Response('Asset not found', { status: 404 });
        }
      })()
    );
  }
});

// Communication: Listen for client instructions (e.g. skip waiting on update)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
