/*
 * Who's the Better Roman? - offline support.
 * Serves the game from the cache so it works without internet once it has
 * been opened, and refreshes the cache in the background for next time.
 */
var CACHE = 'better-roman-v1';
var FILES = [
  './',
  './index.html',
  './css/style.css',
  './js/rules.js',
  './js/ai.js',
  './js/art.js',
  './js/sound.js',
  './js/app.js',
  './fonts/pixelify-sans-500.woff2',
  './fonts/pixelify-sans-700.woff2',
  './fonts/press-start-2p.woff2',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(FILES); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req, { ignoreSearch: true }).then(function (hit) {
        var fresh = fetch(req).then(function (res) {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(function () { return hit; });
        return hit || fresh;
      });
    })
  );
});
