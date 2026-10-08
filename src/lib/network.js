import { useSyncExternalStore } from 'react';

// True for "couldn't reach the server" failures (offline, DNS, dropped connection), as opposed
// to the server answering with an error. Supabase reports these as FetchError/TypeError messages.
export function isNetworkError(error) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  const text = `${error?.name || ''} ${error?.message || error || ''}`;
  return /failed to fetch|fetch failed|networkerror|network request failed|load failed|err_internet|err_network/i.test(text);
}

function subscribe(callback) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

export function useOnline() {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}
