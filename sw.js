// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM — SERVICE WORKER (PWA)
// Full Offline & Cross-Page Install Engine with Offline Fallback
// ==========================================================================

const CACHE_NAME = 'dse-pwa-v11.0-prod';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
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

  // Network-First with cache & offline.html fallback for HTML navigations
  if (isHtml) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res && res.status === 200) {
            const clone = res.clone();
            const cache = await caches.open(CACHE_NAME);
            cache.put(req, clone);
          }
          return res;
        } catch {
          const cached = await caches.match(req);
          if (cached) return cached;
          const offline = await caches.match('/offline.html');
          if (offline) return offline;
          const index = await caches.match('/index.html');
          if (index) return index;
          return new Response(
            '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>غير متصل</title></head><body style="font-family:sans-serif;text-align:center;padding:50px;"><h2>تعذر الاتصال بالخادم</h2><p>يرجى التحقق من اتصالك بالإنترنت وإعادة المحاولة.</p><button onclick="location.reload()">إعادة المحاولة</button></body></html>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        }
      })()
    );
    return;
  }

  // Dynamic scripts: Network first with cache fallback
  if (isDynamicScript) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req, { cache: 'no-store' });
          if (res && res.status === 200) {
            const clone = res.clone();
            const cache = await caches.open(CACHE_NAME);
            cache.put(req, clone);
          }
          return res;
        } catch {
          const cached = await caches.match(req);
          if (cached) return cached;
          return new Response('/* network error */', {
            status: 503,
            headers: { 'Content-Type': 'application/javascript' }
          });
        }
      })()
    );
    return;
  }

  // Stale-While-Revalidate for static assets (CSS, icons, font files)
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      const networkPromise = (async () => {
        try {
          const res = await fetch(req);
          if (res && res.status === 200) {
            const clone = res.clone();
            const cache = await caches.open(CACHE_NAME);
            cache.put(req, clone);
          }
          return res;
        } catch {
          return null;
        }
      })();

      if (cached) {
        networkPromise; // Update cache in background
        return cached;
      }

      const res = await networkPromise;
      if (res) return res;

      // Safe fallback
      return new Response('', { status: 404 });
    })()
  );
});

// Push Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
