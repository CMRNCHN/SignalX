import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Allow SIGNALX_* env vars to be exposed to the frontend via import.meta.env
  // (keeps override frontend-only; no Rust/backend changes required).
  envPrefix: ["VITE_", "SIGNALX_"],
  base: mode === "development" ? "/" : "./",
  resolve: {
    alias: {
      "@packages": path.resolve(__dirname, "packages"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2019"
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  }
}));
