import { useEffect, useState } from 'react';

// Receipt photos taken while offline wait here (IndexedDB) until they can be uploaded.
// Expenses refer to them as "local:<id>" until the sync swaps in the Google Drive URL.
const DB_NAME = 'trippy-offline';
const STORE = 'receipts';
const PREFIX = 'local:';

export const isLocalReceipt = (url) => typeof url === 'string' && url.startsWith(PREFIX);

let dbPromise;
function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

async function run(mode, action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function saveLocalReceipt(blob, name) {
  const id = crypto.randomUUID();
  await run('readwrite', (store) => store.put({ blob, name }, id));
  return PREFIX + id;
}

export function getLocalReceipt(url) {
  return run('readonly', (store) => store.get(url.slice(PREFIX.length)));
}

export function deleteLocalReceipt(url) {
  return run('readwrite', (store) => store.delete(url.slice(PREFIX.length)));
}

// A URL an <img> can show: the URL itself, or an object URL for a photo still on this device
export function useReceiptSrc(url) {
  const [src, setSrc] = useState(isLocalReceipt(url) ? null : url);
  useEffect(() => {
    if (!isLocalReceipt(url)) {
      setSrc(url);
      return undefined;
    }
    let objectUrl;
    let cancelled = false;
    getLocalReceipt(url)
      .then((item) => {
        if (cancelled || !item) return;
        objectUrl = URL.createObjectURL(item.blob);
        setSrc(objectUrl);
      })
      .catch((err) => console.error('Failed to read offline receipt', err));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);
  return src;
}
