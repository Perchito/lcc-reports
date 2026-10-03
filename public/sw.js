// LCC Property Reports service worker: app files network-first with the last copy
// as an offline fallback (so the installed app always opens); photos cache-first
// (their URLs change when replaced). API data is never cached — it must be live.
const SHELL = 'lcc-shell', PHOTOS = 'lcc-photos';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/files/')) {
    e.respondWith(caches.open(PHOTOS).then(async (c) => (await c.match(req)) || fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; })));
  } else if (!url.pathname.startsWith('/api/')) {
    e.respondWith(caches.open(SHELL).then(async (c) => {
      try {
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      } catch {
        return (await c.match(req)) || (req.mode === 'navigate' && (await c.match('/'))) || Response.error();
      }
    }));
  }
});
