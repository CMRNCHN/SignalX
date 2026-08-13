import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/ — tuned for Tauri v2 desktop development.
export default defineConfig({
  plugins: [react()],
  // Prevent Vite from obscuring Rust errors printed to the terminal.
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    // All interfaces so Cursor's 127.174.* browser proxy can reach Vite
    // (host: false binds ::1-only and times out). Tauri still uses localhost:5173.
    host: true,
  },
  // Expose both VITE_ and TAURI_ env vars to the frontend.
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "esnext",
  },
});
