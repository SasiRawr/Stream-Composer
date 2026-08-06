import { defineConfig } from "vite";

// Keeps the existing src/ layout (index.html, main.js, styles.css) that
// Tauri's own vanilla template uses, rather than moving files to the
// project root just to satisfy Vite's defaults.
export default defineConfig({
  root: "src",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  // Tauri needs a fixed, predictable dev server port/host — see
  // https://tauri.app/start/frontend/vite/
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "127.0.0.1",
  },
});
