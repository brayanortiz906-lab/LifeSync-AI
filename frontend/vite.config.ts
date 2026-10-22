import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // GitHub Pages sirve la app en /<repo>/ -> rutas relativas (VITE_BASE=./).
  base: process.env.VITE_BASE ?? '/',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // La app completa (agenda + chat + paneles + responsabilidad + permisos)
    // ronda los 500 kB: es normal y no es un problema. Sin esto, vite avisa
    // por stderr y algunos scripts de PowerShell lo toman por un fallo.
    chunkSizeWarningLimit: 900,
  },
})
