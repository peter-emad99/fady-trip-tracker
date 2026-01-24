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
});
