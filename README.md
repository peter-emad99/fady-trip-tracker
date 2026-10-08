# Trippy

## Try it locally without any accounts (mock mode)

```bash
npm install
npm run dev:mock
```

Open the address it prints (on a phone on the same Wi-Fi, use `npm run dev:mock -- --host` and your computer's IP).
The app runs on fake trips and expenses inside the browser: no Supabase, Google Drive or login, and nothing real is touched.
The **Mock data** badge (bottom-left) switches the app offline/online, so you can test offline expenses and syncing, and
**Reset** puts the fake data back to the start. The fake backend lives in `src/dev/mockBackend.js` and is left out of
production builds.
