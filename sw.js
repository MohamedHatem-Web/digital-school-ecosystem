// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM — SERVICE WORKER (PWA)
// Full Offline & Cross-Page Install Engine
// ==========================================================================

const CACHE_NAME = 'dse-pwa-v6.0-prod';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/css/tokens.css',
  '/css/base.css',
  '/css/components.css',
  '/css/public-site.css',
  '/css/dashboard.css',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS).catch((err) => {
        console.warn('PWA Pre-cache notice:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('Purging old service worker cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip non-GET requests and external APIs (Firebase, Google APIs, Cloudinary, etc.)
  if (req.method !== 'GET' || !url.origin.includes(self.location.origin)) {
    return;
  }

  const isHtml = req.headers.get('accept')?.includes('text/html') || url.pathname.endsWith('.html');
  const isDynamicScript = url.pathname.startsWith('/js/services/') || url.pathname.includes('auth.js') || url.pathname.includes('student-service.js');

  // Network-only for HTML and dynamic scripts to guarantee zero stale cache during development
  if (isHtml || isDynamicScript) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('/index.html')))
    );
    return;
  }

  // Network-first with cache fallback for static assets (CSS, images)
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});

