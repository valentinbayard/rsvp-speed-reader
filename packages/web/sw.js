// RSVP Speed Reader - Service Worker

const CACHE_NAME = 'rsvp-reader-v4';
const TESSERACT_CACHE = 'tesseract-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/styles.css',
  // Shared modules from @rsvp-reader/shared
  '/js/shared/rsvp-engine.browser.js',
  '/js/shared/text-utils.browser.js',
  // App-specific scripts
  '/js/app.js',
  '/js/storage.js',
  '/js/api.js',
  '/js/ocr.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  const validCaches = [CACHE_NAME, TESSERACT_CACHE];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => !validCaches.includes(name))
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch: serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle share target requests
  if (url.pathname === '/share') {
    event.respondWith(handleShareTarget(url));
    return;
  }

  // Cache Tesseract resources on demand (from CDNs)
  if (url.hostname === 'unpkg.com' || url.hostname === 'tessdata.projectnaptha.com') {
    event.respondWith(
      caches.open(TESSERACT_CACHE).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(request).then((response) => {
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          });
        });
      })
    );
    return;
  }

  // For API requests, always go to network
  if (url.pathname.startsWith('/api/') || url.hostname !== self.location.hostname) {
    event.respondWith(fetch(request));
    return;
  }

  // For static assets, try cache first
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((response) => {
        // Don't cache non-successful responses
        if (!response || response.status !== 200) {
          return response;
        }

        // Clone and cache the response
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache);
        });

        return response;
      });
    })
  );
});

/**
 * Handle Web Share Target requests
 * Redirects to the main app with shared data as query params
 */
async function handleShareTarget(url) {
  const sharedUrl = url.searchParams.get('url') || '';
  const sharedText = url.searchParams.get('text') || '';
  const sharedTitle = url.searchParams.get('title') || '';

  // Build redirect URL with shared data
  const redirectUrl = new URL('/', self.location.origin);

  if (sharedUrl) {
    redirectUrl.searchParams.set('url', sharedUrl);
  }
  if (sharedText) {
    redirectUrl.searchParams.set('text', sharedText);
  }
  if (sharedTitle) {
    redirectUrl.searchParams.set('title', sharedTitle);
  }

  // Redirect to main app
  return Response.redirect(redirectUrl.toString(), 303);
}

// Handle messages from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
