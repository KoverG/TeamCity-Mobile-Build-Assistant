import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => {
  const diagnosticsEntry = mode === 'production'
    ? './src/diagnostics/DisabledDiagnostics.ts'
    : './src/diagnostics/index.ts'
  return {
    plugins: [react()],
    publicDir: 'public',
    resolve: {
      alias: {
        '@tcba/diagnostics': fileURLToPath(new URL(diagnosticsEntry, import.meta.url)),
      },
    },
    build: {
      outDir: mode === 'production' ? 'dist-production' : 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: fileURLToPath(new URL('./src/content/main.tsx', import.meta.url)),
        output: {
          entryFileNames: 'content.js',
          assetFileNames: 'assets/[name]-[hash][extname]',
          format: 'iife',
        },
      },
    },
  }
})
