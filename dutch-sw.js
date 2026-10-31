/* Retired: the whole site now uses /sw.js. This removes the old dutch-only worker. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('dutch-')).map(k => caches.delete(k))))
    .then(() => self.registration.unregister())
));
