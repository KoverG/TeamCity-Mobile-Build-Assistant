import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  publicDir: false,
  build: {
    outDir: mode === 'production' ? 'dist-production' : 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: fileURLToPath(new URL('./src/background/main.ts', import.meta.url)),
      output: {
        entryFileNames: 'background.js',
        format: 'iife',
      },
    },
  },
}))
