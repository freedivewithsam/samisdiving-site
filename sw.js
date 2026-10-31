/* Site-wide service worker for samisdiving.com
   Makes every page open without internet.
   - Pages and site files: network first (so edits show up right away), saved copy when offline.
   - Libraries & fonts from CDNs: saved the first time they load, then served from the device.
   - Never touched: Google Apps Script (your sheets), translation/API calls, YouTube, maps, WhatsApp.
   Visit any page once while online and every page is saved for offline use. */
const CACHE = 'sds-v1';
const PAGES = ['/', '/index.html', '/nav.html', '/samsamsam.html', '/freestep.html', '/dnf.html', '/dnfonline.html',
  '/dutch.html', '/strap.html', '/calculator.html', '/comp.html', '/pb.html', '/split.html'];
const CDN = /^(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|esm\.run|unpkg\.com|cdn\.tailwindcss\.com|code\.jquery\.com)$/;

async function put(cache, url, req) {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
    let res; try { res = await fetch(req || url, { signal: ctl.signal }); } finally { clearTimeout(t); }
    if (res && (res.ok || res.type === 'opaque')) await cache.put(url, res.clone());
    return res;
  } catch (e) { return null; }
}

// Save a page, then the CDN files it uses (and the font files inside Google Fonts CSS).
async function warm(cache, path, withCdn) {
  const res = withCdn ? await cache.match(path) : await put(cache, path, new Request(path, { cache: 'reload' }));
  if (!res || !res.ok || !withCdn) return;
  let html = ''; try { html = await res.clone().text(); } catch (e) { return; }
  const urls = new Set();
  (html.match(/(?:src|href)=["']https:\/\/[^"']+["']/g) || []).forEach(m => {
    const u = m.replace(/^[a-z]+=["']|["']$/g, '');
    try { if (CDN.test(new URL(u).hostname)) urls.add(u.replace(/&amp;/g, '&')); } catch (e) {}
  });
  (html.match(/https:\/\/(?:cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|esm\.run)\/[^"'`\s)]+/g) || []).forEach(u => urls.add(u));
  for (const u of urls) {
    if (await cache.match(u)) continue;
    const r = await put(cache, u);
    if (r && /fonts\.googleapis\.com/.test(u) && r.ok) {
      try {
        const css = await r.clone().text();
        for (const f of (css.match(/https:\/\/fonts\.gstatic\.com\/[^)'"\s]+/g) || [])) if (!(await cache.match(f))) await put(cache, f);
      } catch (e) {}
    }
  }
}

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(async c => { for (const p of PAGES) await warm(c, p, false); }));
});

// The page asks for the CDN files once it has loaded, so installing never waits on them.
self.addEventListener('message', event => {
  if (event.data !== 'warm') return;
  event.waitUntil(caches.open(CACHE).then(async c => { for (const p of PAGES) await warm(c, p, true); }));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('sds-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function fromCache(req) {
  const url = new URL(req.url);
  const c = await caches.open(CACHE);
  let hit = await c.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const p = url.pathname;
  const alt = p === '/' ? ['/index.html'] : p.endsWith('/') ? [p + 'index.html'] : p.endsWith('.html') ? [] : [p + '.html'];
  for (const a of alt) { hit = await c.match(a); if (hit) return hit; }
  return null;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (/\.(txt)$/.test(url.pathname)) return;
    event.respondWith(
      fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(async () => (await fromCache(req)) || Response.error())
    );
    return;
  }

  if (!CDN.test(url.hostname)) return;
  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});
