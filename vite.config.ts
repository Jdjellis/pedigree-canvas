import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Honor the PORT env var when set (e.g. by preview/hosting tooling),
    // falling back to Vite's default dev port.
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
})
