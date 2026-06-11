import { defineConfig } from 'vite'

const multiplayerBuildId =
  process.env.GITHUB_SHA?.slice(0, 7) ??
  `dev-${new Date().toISOString().slice(0, 10)}`

export default defineConfig({
  define: {
    __MULTIPLAYER_BUILD_ID__: JSON.stringify(multiplayerBuildId),
  },
  // Use relative asset paths so GitHub Pages project URLs work.
  base: './',
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: 'index.html',
        board: 'board.html',
      },
    },
  },
  server: {
    open: true,
  },
})
