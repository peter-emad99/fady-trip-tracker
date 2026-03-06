const STATIC_URLS = ['/manifest.json', '/pwa-icon.svg', '/apple-touch-icon.svg'];

function collectCacheableUrls() {
  const urls = new Set([
    window.location.origin + '/',
    window.location.href,
    ...STATIC_URLS.map((path) => new URL(path, window.location.origin).href),
  ]);

  for (const entry of performance.getEntriesByType('resource')) {
    if (typeof entry.name !== 'string') {
      continue;
    }

    try {
      const url = new URL(entry.name, window.location.origin);
      if (url.origin === window.location.origin) {
        urls.add(url.href);
      }
    } catch {
    }
  }

  for (const element of document.querySelectorAll('script[src], link[href]')) {
    const value = element.getAttribute('src') || element.getAttribute('href');
    if (!value) {
      continue;
    }

    try {
      const url = new URL(value, window.location.origin);
      if (url.origin === window.location.origin) {
        urls.add(url.href);
      }
    } catch {
    }
  }

  return [...urls];
}

export function registerPWA() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) {
    return;
  }

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      const sendCacheRequest = () => {
        registration.active?.postMessage({
          type: 'CACHE_URLS',
          payload: collectCacheableUrls(),
        });
      };

      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      navigator.serviceWorker.ready.then(() => {
        sendCacheRequest();
      });

      if (registration.active) {
        sendCacheRequest();
      }
    } catch (error) {
      console.error('PWA registration failed', error);
    }
  });
}
