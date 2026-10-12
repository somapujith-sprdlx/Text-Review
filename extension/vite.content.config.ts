import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// Second build step, run after the main one (see the "build" script in
// package.json). MV3 content scripts are classic scripts, so — unlike the
// side panel and service worker — they cannot `import` a shared chunk. As a
// library build in IIFE format this bundles everything the content script
// pulls in (e.g. the typing store and filters) into a single content.js.
export default defineConfig({
  publicDir: false,
  build: {
    // The main build already wrote the rest of dist/ — only add content.js.
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/content/selection.ts'),
      formats: ['iife'],
      name: 'LipiContent',
      fileName: () => 'content.js',
    },
  },
})
