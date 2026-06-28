import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/codeatscale/',
  plugins: [react()],
  optimizeDeps: {
    exclude: ['pyodide'],
  },
  server: {
    port: process.env.PORT ? parseInt(process.env.PORT) : 5173,
  },
})
