// Local stand-in for the Worker's demo routes, shared by `vite dev` and `npm run serve`.
// Reads published demos from ../demos/<slug>/ (written by the pipeline's 06_publish stage)
// and the L3 examples as example-<name>.
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const DEMOS = join(ROOT, 'demos')
const EXAMPLES = join(ROOT, 'workspace/shared/examples')
const TYPES = { '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.avif': 'image/avif', '.gif': 'image/gif' }

export function readDemo(slug) {
  if (!/^[a-z0-9-]+$/.test(slug)) return null
  if (slug.startsWith('example-')) {
    const f = join(EXAMPLES, `${slug.slice(8)}.config.json`)
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null
  }
  const dir = join(DEMOS, slug)
  if (!existsSync(join(dir, 'config.json'))) return null
  const meta = existsSync(join(dir, 'meta.json')) ? JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) : {}
  if (meta.status && meta.status !== 'ready') return null
  if (meta.expiresAt && !meta.preset && Date.parse(meta.expiresAt) < Date.now()) return null
  return JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'))
}

// Same transform the Worker does: inline the config so the page needs no second request.
export function inlineConfig(html, slug) {
  const cfg = readDemo(slug)
  if (!cfg) return html
  const json = JSON.stringify(cfg).replace(/</g, '\\u003c')
  return html.replace('<!--DEMO_CONFIG-->', `<script id="demo-config" type="application/json">${json}</script>`)
}

export function slugFromPath(url) {
  return url.match(/^\/d\/([a-z0-9-]+)\/?(\?|$)/)?.[1] ?? null
}

const send = (res, status, body, type = 'application/json') => {
  res.statusCode = status
  res.setHeader('content-type', type)
  res.setHeader('x-robots-tag', 'noindex')
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body))
}

// Connect-style middleware: (req, res, next)
export function api(req, res, next) {
  const url = new URL(req.url, 'http://x')
  let m
  if (req.method === 'GET' && (m = url.pathname.match(/^\/api\/demos\/([a-z0-9-]+)$/))) {
    const cfg = readDemo(m[1])
    return cfg ? send(res, 200, cfg) : send(res, 404, { error: 'not found' })
  }
  if (req.method === 'GET' && (m = url.pathname.match(/^\/api\/assets\/demos\/([a-z0-9-]+)\/(assets\/[\w.-]+)$/))) {
    const file = normalize(join(DEMOS, m[1], m[2]))
    if (!file.startsWith(DEMOS) || !existsSync(file)) return send(res, 404, 'not found', 'text/plain')
    res.setHeader('cache-control', 'public, max-age=86400')
    return send(res, 200, readFileSync(file), TYPES[extname(file)] ?? 'application/octet-stream')
  }
  if (req.method === 'POST' && url.pathname === '/api/events') {
    let body = ''
    req.on('data', c => { body += c; if (body.length > 64_000) req.destroy() })
    req.on('end', () => {
      try {
        const { slug, session, events } = JSON.parse(body)
        if (/^[a-z0-9-]+$/.test(slug) && existsSync(join(DEMOS, slug))) {
          const lines = events.slice(0, 50).map(e => JSON.stringify({ slug, session, name: e.name, props: e.props, ts: e.t })).join('\n')
          appendFileSync(join(DEMOS, slug, 'events.ndjson'), lines + '\n')
        }
      } catch { /* ignore bad batches */ }
      send(res, 204, '')
    })
    return
  }
  if (req.method === 'POST' && (m = url.pathname.match(/^\/api\/report\/([a-z0-9-]+)$/))) {
    console.log(`[report] demo ${m[1]} was reported (the Worker unpublishes it pending review)`)
    return send(res, 204, '')
  }
  next()
}
