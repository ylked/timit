import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// In dev, Vite serves the UI on :5173 and proxies the API to Flask on :5252.
export default defineConfig({
  plugins: [svelte()],
  server: {
    proxy: { "/api": "http://localhost:5252" },
  },
  build: { target: "es2022" },
});
