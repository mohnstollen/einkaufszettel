/* Bei jeder Änderung an den Dateien die Version erhöhen – die App zeigt dann „Neue Version verfügbar“. */
const CACHE = 'einkaufszettel-v7';
const ASSETS = ['./','./index.html','./styles.css','./icons.js','./app.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-512-maskable.png'];

self.addEventListener('install', e => {
  // cache: 'reload' umgeht den HTTP-Cache, damit wirklich die neuen Dateien gespeichert werden
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
    return res;
  }).catch(() => req.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
});
