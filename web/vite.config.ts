import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
  // maplibre-gl loads its worker via a native `new Worker(new URL(...))`
  // call; Vite's dep pre-bundler mangles that path unless the package is
  // excluded from pre-bundling (a well-known maplibre-gl + Vite gotcha).
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
})
