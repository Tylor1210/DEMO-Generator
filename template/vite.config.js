import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { api, inlineConfig, slugFromPath } from './dev-api.mjs'
import fontPairs from './src/fontPairs.json' with { type: 'json' }

// One build renders every demo. The Worker serves dist/ under /_demo/ and returns index.html
// (with the config inlined) for every /d/:slug route.
// No manual chunks: the lazy import in App.jsx keeps three.js out of the first paint.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/_demo/' : '/',
  plugins: [
    react(),
    {
      name: 'demo-dev-api',
      configureServer(server) { server.middlewares.use(api) },
      transformIndexHtml: {
        order: 'pre',
        handler(html, ctx) {
          html = html.replace('/*FONT_PAIRS*/{}', JSON.stringify(fontPairs))
          const slug = ctx.originalUrl && slugFromPath(ctx.originalUrl)
          return slug ? inlineConfig(html, slug) : html
        },
      },
    },
  ],
  build: { chunkSizeWarningLimit: 1200 },
}))
