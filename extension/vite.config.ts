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
        onboarding: resolve(__dirname, 'onboarding.html'),
        'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
        // The content script is built separately (vite.content.config.ts):
        // it must be one self-contained classic script, and sharing a chunk
        // with the side panel would make it start with an `import`.
      },
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
})
