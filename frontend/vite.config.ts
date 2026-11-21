import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  build: {
    rolldownOptions: {
      output: {
        // Long-lived vendor chunks: app deploys don't invalidate them.
        codeSplitting: {
          groups: [
            { name: "react", test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
            { name: "motion", test: /node_modules[\\/](gsap|@gsap)[\\/]/ },
            { name: "ui", test: /node_modules[\\/](@radix-ui|cmdk|sonner|@floating-ui)[\\/]/ },
            { name: "charts", test: /node_modules[\\/](recharts|d3-|victory-vendor|decimal\.js)/ },
          ],
        },
      },
    },
  },
  server: {
    // Dev: same-origin /api, no CORS needed (backend also ships CORS for
    // separate deploys — see backend/app/main.py).
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL ?? 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
})
