/* Minimal service worker: Chrome needs one before it offers "Install app". It does not cache anything,
   so the site always loads fresh from the network exactly as it does now. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) {
  var r = e.request;
  if (r.method !== 'GET' || r.headers.has('range') || new URL(r.url).origin !== self.location.origin) return;   // leave these to the browser
  e.respondWith(fetch(r));
});
