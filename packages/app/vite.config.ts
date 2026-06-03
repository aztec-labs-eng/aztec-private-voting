import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// Cross-origin isolation lets bb.js use SharedArrayBuffer for multi-threaded
// proving. Required in dev + preview; in production your host must send these too.
const crossOriginIsolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

// Vite 8's Rolldown bundler already handles aztec.js's web workers and .wasm
// assets, so the only thing we add is a `Buffer` polyfill (aztec.js expects the
// Node global in the browser).
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    vanillaExtractPlugin(),
    nodePolyfills({ include: ["buffer"] }),
  ],
  server: { port: 5173, strictPort: true, headers: crossOriginIsolation },
  preview: { headers: crossOriginIsolation },
});
