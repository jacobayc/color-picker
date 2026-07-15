const CACHE_NAME = 'el-clip-canvas-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './logo.png',
  './manifest.json'
];

// Install Event - Pre-cache assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Cache First, Fallback to Network
self.addEventListener('fetch', (e) => {
  // Only handle GET requests for caching
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request).then((networkResponse) => {
        // Cache new dynamically requested assets if needed
        return networkResponse;
      }).catch(() => {
        // Fallback or offline page
      });
    })
  );
});
