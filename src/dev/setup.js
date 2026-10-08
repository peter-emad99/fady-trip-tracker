import { installMockBackend } from './mockBackend';

// Imported first in main.jsx, so the fake backend is in place before the app (and its Supabase
// client) loads. Only active in `npm run dev:mock`; production builds drop it entirely.
if (import.meta.env.DEV && import.meta.env.VITE_MOCK_BACKEND === 'true') {
  installMockBackend();
}
