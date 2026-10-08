import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import path from "node:path";
// https://vite.dev/config/
export default defineConfig({
  // logLevel: "error", // Suppress warnings, only show errors
  plugins: [react()],
  resolve: {
    alias: [{ find: "@", replacement: path.resolve(__dirname, "src") }],
  },
  server: {
    // Honor an assigned port (e.g. from the preview runner); Vite defaults to 5173 otherwise
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    // `npm run dev` doesn't run the /api functions. Either use `npx vercel dev`,
    // or point this at a deployment: API_PROXY_TARGET=https://your-app.vercel.app npm run dev
    proxy: process.env.API_PROXY_TARGET
      ? { "/api": { target: process.env.API_PROXY_TARGET, changeOrigin: true } }
      : undefined,
  },
});
