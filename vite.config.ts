import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Honor the PORT env var (set by tooling/preview harnesses) so the dev
  // server can be assigned a free port; falls back to Vite's default.
  server: process.env.PORT ? { port: Number(process.env.PORT) } : undefined,
})
