import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
  },
  // maplibre-gl loads its worker via a native `new Worker(new URL(...))`
  // call; Vite's dep pre-bundler mangles that path unless the package is
  // excluded from pre-bundling.
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
})
