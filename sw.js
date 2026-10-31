/* Bei jeder Änderung an den Dateien die Version erhöhen – die App zeigt dann „Neue Version verfügbar“. */
const CACHE = 'einkaufszettel-v16';
const INBOX = 'share-inbox'; // über „Teilen“ empfangene Rezepte (Bild/Text), von der App abgeholt
const ASSETS = ['./','./index.html','./styles.css','./icons.js','./app.js','./recipe-parse.js','./config.js','./sync.js','./firebase-config.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-512-maskable.png'];

self.addEventListener('install', e => {
  // cache: 'reload' umgeht den HTTP-Cache, damit wirklich die neuen Dateien gespeichert werden
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== INBOX).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  // Teilen-Ziel (manifest: share_target): Inhalt ablegen und zur App weiterleiten
  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      const form = await req.formData();
      const inbox = await caches.open(INBOX);
      const meta = { title: form.get('title') || '', text: form.get('text') || '', url: form.get('url') || '' };
      await inbox.put('meta', new Response(JSON.stringify(meta)));
      const file = form.get('image');
      if (file && file.size) await inbox.put('image', new Response(file)); else await inbox.delete('image');
      return Response.redirect(new URL('./index.html#/rezept-import', self.registration.scope).href, 303);
    })());
    return;
  }
  // Firebase-SDK (versionierte URLs) ebenfalls cachen, damit geteilte Listen offline starten
  // ebenso die Texterkennung (Tesseract.js, versionierte URLs)
  const sdk = (url.origin === 'https://www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) ||
    (url.origin === 'https://cdn.jsdelivr.net' && /^\/npm\/(tesseract\.js|tesseract\.js-core|@tesseract\.js-data)@/.test(url.pathname));
  if (req.method !== 'GET' || (url.origin !== location.origin && !sdk)) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
    return res;
  }).catch(() => req.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
});
