import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as { version: string };

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    // Honor the PORT env var when set (e.g. by preview/hosting tooling),
    // falling back to Vite's default dev port.
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
})
