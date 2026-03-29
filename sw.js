// ═══════════════════════════════════════════════════
//   AKTU STUDY PORTAL — Service Worker
//   Developer: HINDESH VERMA
//   Strategy: Cache-First for assets, Network-First for data
// ═══════════════════════════════════════════════════

const CACHE_NAME = 'aktu-portal-v1';
const OFFLINE_URL = './index.html';

// Static assets to cache on install (App Shell)
const PRECACHE_ASSETS = [
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&family=Caveat:wght@500;700&display=swap',
];

// ── INSTALL: Cache app shell ────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installing AKTU Portal Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Pre-caching app shell');
        // Cache what we can, ignore failures (e.g. fonts offline)
        return Promise.allSettled(
          PRECACHE_ASSETS.map(url => cache.add(url).catch(() => null))
        );
      })
      .then(() => self.skipWaiting()) // Activate immediately
  );
});

// ── ACTIVATE: Clean old caches ──────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating AKTU Portal Service Worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim()) // Take control of all pages
  );
});

// ── FETCH: Smart caching strategy ──────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip Anthropic API calls — always go to network
  if (url.hostname === 'api.anthropic.com') return;

  // Skip Firebase calls — always go to network
  if (url.hostname.includes('firebase') || url.hostname.includes('firestore')) return;

  // Skip chrome-extension requests
  if (url.protocol === 'chrome-extension:') return;

  // For HTML pages: Network-First (get fresh, fallback to cache)
  if (request.headers.get('Accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(request)
            .then(cached => cached || caches.match(OFFLINE_URL));
        })
    );
    return;
  }

  // For Google Fonts: Cache-First (fonts don't change)
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(request)
        .then(cached => {
          if (cached) return cached;
          return fetch(request).then(response => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
            }
            return response;
          });
        })
        .catch(() => new Response('', { status: 503 }))
    );
    return;
  }

  // For everything else: Stale-While-Revalidate
  // Return cached immediately, update cache in background
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response.ok && response.status < 400) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => null);

      return cached || networkFetch;
    })
  );
});

// ── BACKGROUND SYNC (future use) ───────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-notes') {
    console.log('[SW] Background sync: notes');
  }
});

// ── PUSH NOTIFICATIONS (future use) ────────────────
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const title = data.title || 'AKTU Study Portal';
  const options = {
    body: data.body || 'Naya update hai!',
    icon: './icons/icon-192.png',
    badge: './icons/icon-72.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || './' },
    actions: [
      { action: 'open', title: 'Open karo' },
      { action: 'close', title: 'Dismiss' }
    ]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'open' || !event.action) {
    const url = event.notification.data?.url || './';
    event.waitUntil(clients.openWindow(url));
  }
});

console.log('[SW] AKTU Study Portal Service Worker loaded ✅');
