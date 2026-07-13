import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// COOP/COEP-Header: Voraussetzung für SharedArrayBuffer, den der spätere
// libslic3r-WASM-Build (pthreads) und WebLLM brauchen.
const crossOriginIsolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  plugins: [react()],
  server: { headers: crossOriginIsolation },
  preview: { headers: crossOriginIsolation },
});
