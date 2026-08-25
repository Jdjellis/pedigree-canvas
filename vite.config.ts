import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as { version: string };

const resolve = (p: string): string =>
  fileURLToPath(new URL(p, import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    // Two-page build: the marketing landing page is served at "/" and the
    // canvas editor SPA is served at "/app/". Vite mirrors each entry's path
    // relative to the project root into dist/, so `app/index.html` becomes
    // `dist/app/index.html`. Assets stay at `/assets/` (base "/"), which the
    // editor at `/app/` loads by absolute path — no `base` override needed.
    rollupOptions: {
      input: {
        landing: resolve('./index.html'),
        app: resolve('./app/index.html'),
      },
    },
  },
  server: {
    // Honor the PORT env var when set (e.g. by preview/hosting tooling),
    // falling back to Vite's default dev port.
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
})
