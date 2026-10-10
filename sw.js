// Offline shell cache. Network-first so updates show up right away;
// falls back to cache when offline. API calls are never cached.
const CACHE = 'fitcheck-v3';
const SHELL = [
  './', 'index.html', 'css/styles.css', 'js/app.js', 'js/fit.js', 'js/profile.js', 'js/ai.js', 'js/prompts.js',
  'vendor/anthropic-sdk-0.127.0.mjs', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request)),
  );
});
