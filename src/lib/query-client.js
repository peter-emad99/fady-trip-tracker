import { QueryClient, onlineManager } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

const WEEK = 7 * 24 * 60 * 60 * 1000;

// React Query assumes it starts online. Opening the app offline would then try (and fail) every
// load instead of pausing and showing the saved copy.
onlineManager.setOnline(navigator.onLine);

export const queryClientInstance = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            refetchOnWindowFocus: false,
            // Kept this long so the saved copy (below) can show trips and expenses offline
            gcTime: WEEK,
        },
    },
});

// The last loaded data is saved on this device, so the app opens with it even without a connection
export const PERSIST_KEY = 'trippy.queryCache';
export const persistOptions = {
    persister: createSyncStoragePersister({ storage: window.localStorage, key: PERSIST_KEY }),
    maxAge: WEEK,
    buster: 'v1',
    // Keep anything that has data, even if its latest refresh failed (e.g. offline), so the saved
    // copy isn't wiped by a failed reload
    dehydrateOptions: { shouldDehydrateQuery: (query) => query.state.data !== undefined },
};

// Signing out removes the saved copy, so the next person on this device can't read it
export function clearSavedData() {
    queryClientInstance.clear();
    try {
        localStorage.removeItem(PERSIST_KEY);
    } catch {
        // nothing saved
    }
}
