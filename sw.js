/* ============================================
   DrivePulse – Service Worker
   Enables PWA install, offline caching,
   and background keep-alive.
   ============================================ */

const CACHE_NAME = 'drivepulse-v4.0';
const ASSETS = [
    '/',
    '/index.html',
    '/about-content.html',
    '/css/styles.css',
    '/js/db.js',
    '/js/sensors.js',
    '/js/tripEngine.js',
    '/js/cityPulse.js',
    '/js/demoData.js',
    '/js/data.js',
    '/js/tileManager.js',
    '/js/mapLayers.js',
    '/js/mapControls.js',
    '/js/mapEngine.js',
    '/js/app.js',
    '/manifest.json',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Outfit:wght@400;500;600;700;800&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
];

// Install: cache app shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS).catch((err) => {
                console.warn('SW: Some assets failed to cache:', err);
            });
        })
    );
    self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
            );
        })
    );
    self.clients.claim();
});

// Fetch: serve from cache, fall back to network
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // For map tiles and CDN resources, use stale-while-revalidate to ensure offline readiness
    const url = new URL(event.request.url);
    if (url.hostname.includes('tile.openstreetmap') ||
        url.hostname.includes('basemaps.cartocdn') ||
        url.hostname.includes('tile.opentopomap') ||
        url.hostname.includes('arcgisonline.com') ||
        url.hostname.includes('unpkg.com') ||
        url.hostname.includes('cdn.jsdelivr.net') ||
        url.hostname.includes('cdnjs.cloudflare.com')) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                const fetchPromise = fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
                        const clone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    }
                    return networkResponse;
                }).catch((err) => {
                    if (cachedResponse) return cachedResponse;
                    // Gracefully return 404 to avoid network errors breaking MapLibre when a tile is missing
                    return new Response('', { status: 404, statusText: 'Not Found' });
                });
                
                return cachedResponse || fetchPromise;
            })
        );
        return;
    }

    // For app resources: cache-first
    event.respondWith(
        caches.match(event.request).then((cached) => {
            return cached || fetch(event.request).then((response) => {
                // Cache new successful responses
                if (response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            });
        })
    );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window' }).then((clients) => {
            if (clients.length > 0) {
                clients[0].focus();
            } else {
                self.clients.openWindow('/');
            }
        })
    );
});
