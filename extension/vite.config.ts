import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  server: {
    // The extension imports ../shared (styles + prompts shared with the backend).
    fs: { allow: ['..'] },
  },
  build: {
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
        content: resolve(__dirname, 'src/content/selection.ts'),
      },
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
})
