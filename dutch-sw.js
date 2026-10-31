/* Service worker for the /dutch page only (scope "/dutch").
   - The page itself: network first, falls back to the saved copy when offline.
   - Libraries and fonts from CDNs (Tesseract reader, translator runtime, Google Fonts):
     saved the first time they load, then served from the device.
   - Google Apps Script (your sheet), the free translation fallback and the Hugging Face
     model files are never touched here: the sheet needs the network, and the translator
     model keeps its own copy in the browser's cache. */
const CACHE = 'dutch-v1';
const PAGE = '/dutch';

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(c => fetch(PAGE, { cache: 'reload' }).then(r => { if (r.ok) return c.put(PAGE, r); }).catch(() => {}))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('dutch-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const SKIP_HOSTS = /(^|\.)(script\.google\.com|script\.googleusercontent\.com|googleusercontent\.com|mymemory\.translated\.net|huggingface\.co|hf\.co)$/;

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (SKIP_HOSTS.test(url.hostname)) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(PAGE, copy)); } return res; })
        .catch(() => caches.match(PAGE).then(r => r || caches.match(req)))
    );
    return;
  }

  if (url.origin === self.location.origin) return; // other files on the site: leave alone

  // Cross-origin libraries/fonts: cache first.
  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});
