import { defineConfig } from 'vite'

export default defineConfig({
  // Use relative asset paths so GitHub Pages project URLs work.
  base: './',
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    open: true,
  },
})
