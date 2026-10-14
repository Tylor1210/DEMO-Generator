// Serves the production build the way the Worker will: /_demo/* static files,
// /d/:slug -> index.html with the config inlined, /api/* from dev-api.mjs.
// Usage: npm run build && npm run serve   (then open http://localhost:5182/d/<slug>)
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { gzipSync } from 'node:zlib'
import { api, inlineConfig, slugFromPath } from './dev-api.mjs'

const DIST = new URL('./dist', import.meta.url).pathname
const PORT = Number(process.env.PORT || 5182)
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }

function sendFile(req, res, body, type, cache) {
  res.setHeader('content-type', type)
  res.setHeader('cache-control', cache)
  // Cloudflare compresses at the edge; do the same here so local Lighthouse numbers are comparable.
  if (/gzip/.test(req.headers['accept-encoding'] || '') && /text|javascript|json/.test(type)) {
    res.setHeader('content-encoding', 'gzip')
    body = gzipSync(body)
  }
  res.end(body)
}

createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname
  const slug = slugFromPath(path)
  if (slug) {
    const html = inlineConfig(readFileSync(join(DIST, 'index.html'), 'utf8'), slug)
    res.setHeader('x-robots-tag', 'noindex')
    return sendFile(req, res, Buffer.from(html), TYPES['.html'], 'no-cache')
  }
  if (path.startsWith('/_demo/')) {
    const file = normalize(join(DIST, path.slice('/_demo/'.length)))
    if (file.startsWith(DIST) && existsSync(file)) {
      return sendFile(req, res, readFileSync(file), TYPES[extname(file)] ?? 'application/octet-stream', 'public, max-age=31536000, immutable')
    }
  }
  api(req, res, () => { res.statusCode = 404; res.end('not found') })
}).listen(PORT, () => console.log(`demo server on http://localhost:${PORT}/d/<slug>`))
