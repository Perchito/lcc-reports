// LCC Property Reports service worker.
//   App shell (versioned ?v= files, fonts, icons): cache-first; a deploy changes the version, so it
//     installs a fresh cache and drops the old one.
//   Page (navigation): network-first, cached shell when offline, so the installed app always opens.
//     Only / is cached as the shell (not the public /sign/<code> page).
//   Photos (/api/jobs/:id/files/...): cache-first; their URLs change when a photo is replaced.
//   Everything else under /api: never cached here. Job data for offline use lives in IndexedDB,
//     per signed-in user, and is wiped on sign-out (see store.js).
const V = '__V__';
const SHELL = `lcc-shell-${V}`, PHOTOS = 'lcc-photos';
const MODULES = ['app.js', 'ui.js', 'store.js', 'push.js', 'home.js', 'lists.js', 'job.js', 'admin.js', 'quotes.js', 'jobs.mjs'];
const PRECACHE = ['/', `/style.css?v=${V}`, ...MODULES.map((m) => `/${m}?v=${V}`), '/fonts/material-icons-outlined.woff2', '/img/icon-192.png', '/img/logo.png', '/manifest.json'];

self.addEventListener('install', (e) => e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('lcc-shell-') && k !== SHELL) await caches.delete(k);
  await self.clients.claim();
})()));

const cacheFirst = async (cacheName, req) => {
  const c = await caches.open(cacheName);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) c.put(req, res.clone());
  return res;
};

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => { if (res.ok && url.pathname === '/') caches.open(SHELL).then((c) => c.put('/', res.clone())); return res; })
      .catch(async () => (await caches.match('/')) || Response.error()));
  } else if (/^\/api\/jobs\/[^/]+\/files\//.test(url.pathname)) {
    e.respondWith(cacheFirst(PHOTOS, req));
  } else if (url.pathname.startsWith('/api/')) {
    return; // live data only
  } else if (url.searchParams.has('v') || url.pathname.startsWith('/fonts/') || url.pathname.startsWith('/img/')) {
    e.respondWith(cacheFirst(SHELL, req));
  }
});

// ── push notifications ──
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data?.json() || {}; } catch { d = { title: 'LCC Informes', body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'LCC Informes', {
    body: d.body || '', tag: d.tag, renotify: !!d.tag, icon: '/img/icon-192.png', badge: '/img/icon-192.png', data: { url: d.url || '/#/home' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/#/home', self.location.origin).href;
  e.waitUntil((async () => {
    for (const c of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
      if (new URL(c.url).origin === self.location.origin) { await c.focus(); return c.navigate(url).catch(() => c.postMessage({ go: url })); }
    }
    return self.clients.openWindow(url);
  })());
});
