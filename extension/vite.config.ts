import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'public/sidepanel.html'),
        'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
        content: resolve(__dirname, 'src/content/selection.ts'),
      },
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
})
