const CACHE = 'raices-shell-v1';
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/', '/index.html', '/icon.svg', '/manifest.webmanifest'])).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET' || event.request.url.includes('/api/'))
        return; event.respondWith(fetch(event.request).then(response => {
            if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)) } return response
        }).catch(() => caches.match(event.request).then(cached => cached || caches.match('/index.html'))))
});
