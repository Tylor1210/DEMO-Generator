import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The site is served by the Worker at /. In dev, API and demo routes go to `wrangler dev` on :8787.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8787', '/d': 'http://localhost:8787', '/_demo': 'http://localhost:8787' } },
})
