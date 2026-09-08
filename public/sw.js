const CACHE = 'haveguide-shell-v3';
self.addEventListener('install', (event) => { event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['/']))); self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).pathname.startsWith('/api/')) return;
  // Only a navigation may fall back to the app shell. Serving index.html in place of a missing
  // script or asset (e.g. the panorama engine) would hand the page HTML where it expects code.
  event.respondWith(
    fetch(request).catch(() => caches.match(request).then((hit) => (
      hit ?? (request.mode === 'navigate' ? caches.match('/') : Response.error())
    ))),
  );
});
