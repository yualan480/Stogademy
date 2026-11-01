// Orbit service worker: shows desktop/phone banners and brings Orbit to the front when one is clicked.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
// Chrome only offers "Install app" when a fetch handler exists. This one does nothing: every request still goes straight to the network.
self.addEventListener('fetch', () => {});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) if ('focus' in c) return c.focus();
    return self.clients.openWindow(self.registration.scope);
  })());
});
