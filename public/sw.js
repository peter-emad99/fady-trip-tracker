const CACHE_VERSION = 'trippy-v1';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const OFFLINE_URLS = ['/', '/index.html', '/manifest.json', '/pwa-icon.svg', '/apple-touch-icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(OFFLINE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(CACHE_VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (event.data?.type === 'CACHE_URLS' && Array.isArray(event.data.payload)) {
    event.waitUntil(cacheUrls(event.data.payload));
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(handleNavigation(event.request));
    return;
  }

  if (isStaticAssetRequest(event.request, url)) {
    event.respondWith(cacheFirst(event.request));
  }
});

function isStaticAssetRequest(request, url) {
  return ['script', 'style', 'image', 'font', 'manifest'].includes(request.destination) || url.pathname.startsWith('/assets/');
}

async function cacheUrls(urls) {
  const cache = await caches.open(RUNTIME_CACHE);
  const uniqueUrls = [...new Set(urls)]
    .map((value) => {
      try {
        return new URL(value, self.location.origin).toString();
      } catch {
        return null;
      }
    })
    .filter((value) => value && value.startsWith(self.location.origin));

  await Promise.allSettled(
    uniqueUrls.map(async (url) => {
      const response = await fetch(url, { credentials: 'same-origin' });
      if (response.ok) {
        await cache.put(url, response.clone());
      }
    })
  );
}

async function handleNavigation(request) {
  const cache = await caches.open(RUNTIME_CACHE);

  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await cache.match(request)) || (await caches.match('/index.html')) || (await caches.match('/'));
  }
}

async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}
