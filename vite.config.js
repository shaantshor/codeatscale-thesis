import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/codeatscale-thesis/',
  plugins: [react()],
  optimizeDeps: {
    exclude: ['pyodide'],
  },
  server: {
    port: process.env.PORT ? parseInt(process.env.PORT) : 5173,
  },
  build: {
    // emptyOutDir: false is required when running npm run build inside the
    // Cowork/Claude sandbox — the VM mounts the workspace read-only for the
    // process that owns the files, so Vite cannot unlink old dist/ artefacts.
    // On a normal dev machine or CI this flag can be removed.
    emptyOutDir: false,
  },
})
