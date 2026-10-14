// tycodes demo generator: API routes, demo pages and the pipeline Workflow.
import { createRun, readManifest } from '../pipeline/runner.ts'
import { normalizeUrl } from '../workspace/stages/01_intake/scripts/intake.ts'
import { registrableDomain } from '../pipeline/lib/net.ts'
import { randomId, slugify } from '../pipeline/lib/text.ts'
import { sniffImage } from '../pipeline/lib/images.ts'
import { R2Store, services, type Env } from './env.ts'
import { runProgress } from './progress.ts'

export { DemoPipeline } from './workflow.ts'

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
const err = (message: string, status = 400) => json({ error: message }, status)

const MAX_UPLOADS = 4
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const DEDUPE_DAYS = 7

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url)
    if (url.hostname === 'www.tycodes.app') {
      url.hostname = 'tycodes.app'
      return Response.redirect(url.toString(), 301)
    }
    const path = url.pathname
    let m: RegExpMatchArray | null
    try {
      if (req.method === 'POST' && path === '/api/runs') return await createRunRoute(req, env)
      if (req.method === 'GET' && (m = path.match(/^\/api\/runs\/([a-z0-9-]+)$/))) return await runStatus(req, env, ctx, m[1])
      if (req.method === 'GET' && (m = path.match(/^\/api\/demos\/([a-z0-9-]+)$/))) {
        const cfg = await liveDemoConfig(env, m[1])
        return cfg ? new Response(cfg, { headers: { 'content-type': 'application/json', 'x-robots-tag': 'noindex' } }) : err('not found', 404)
      }
      if (req.method === 'GET' && (m = path.match(/^\/api\/assets\/(demos\/[a-z0-9-]+\/assets\/[\w.-]+)$/))) {
        const o = await env.BUCKET.get(m[1])
        if (!o) return new Response('not found', { status: 404 })
        return new Response(o.body, { headers: { 'content-type': o.httpMetadata?.contentType ?? 'application/octet-stream', 'cache-control': 'public, max-age=86400', 'x-robots-tag': 'noindex' } })
      }
      if (req.method === 'GET' && path === '/api/site') {
        return json({ bookingUrl: env.BOOKING_URL || '' }, 200, { 'cache-control': 'public, max-age=300' })
      }
      if (req.method === 'GET' && path === '/api/presets') {
        // Example tiles for the home page: brand, featured product and its image, from each preset's config.
        const rows = await env.DB.prepare(`SELECT slug, domain FROM runs WHERE preset = 1 AND status = 'done' AND slug IS NOT NULL ORDER BY created_at`).all<{ slug: string; domain: string }>()
        const tiles = await Promise.all((rows.results ?? []).map(async r => {
          const o = await env.BUCKET.get(`demos/${r.slug}/config.json`)
          if (!o) return null
          const c: any = await o.json()
          const p = c.products?.[c.featuredIndex ?? 0] ?? c.products?.[0]
          const img = p?.image ?? p?.photo
          return { slug: r.slug, domain: r.domain, brand: c.brand, category: c.category, product: p?.name ?? '', color: p?.color ?? c.theme?.accent,
            image: img ? `/api/assets/demos/${r.slug}/${img}` : null }
        }))
        return json(tiles.filter(Boolean), 200, { 'cache-control': 'public, max-age=300' })
      }
      if (req.method === 'POST' && path === '/api/events') return await events(req, env)
      if (req.method === 'POST' && (m = path.match(/^\/api\/report\/([a-z0-9-]+)$/))) {
        await env.DB.batch([
          env.DB.prepare('INSERT INTO reports (slug, reason, created_at) VALUES (?, ?, ?)').bind(m[1], 'visitor report', Date.now()),
          // Unpublished until reviewed (BUILD_PROMPT: "Report this demo" unpublishes pending review). Presets stay up.
          env.DB.prepare(`UPDATE runs SET status = 'reported' WHERE slug = ? AND preset = 0`).bind(m[1]),
        ])
        return new Response(null, { status: 204 })
      }
      if ((req.method === 'GET' || req.method === 'HEAD') && (m = path.match(/^\/d\/([a-z0-9-]+)\/?$/))) return await demoPage(req, env, m[1])
      if (path.startsWith('/api/')) return err('not found', 404)
      return env.ASSETS.fetch(req)
    } catch (e: any) {
      console.error(e)
      return err('Something went wrong on our side. Please try again.', 500)
    }
  },
} satisfies ExportedHandler<Env>

// ---------- demos ----------

async function liveDemoConfig(env: Env, slug: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT status, preset, expires_at FROM runs WHERE slug = ? ORDER BY created_at DESC LIMIT 1')
    .bind(slug).first<{ status: string; preset: number; expires_at: number | null }>()
  if (!row || row.status !== 'done') return null
  if (!row.preset && row.expires_at && row.expires_at < Date.now()) return null
  const o = await env.BUCKET.get(`demos/${slug}/config.json`)
  return o ? o.text() : null
}

// Same template bundle for every demo; the config is inlined so the page needs no second request.
async function demoPage(req: Request, env: Env, slug: string): Promise<Response> {
  const shell = await env.ASSETS.fetch(new Request(new URL('/_demo/', req.url)))
  let html = await shell.text()
  const cfg = await liveDemoConfig(env, slug)
  const site = JSON.stringify({ bookingUrl: env.BOOKING_URL || '' }).replace(/</g, '\\u003c')
  if (cfg) html = html.replace('<!--DEMO_CONFIG-->', `<script id="demo-config" type="application/json">${cfg.replace(/</g, '\\u003c')}</script><script id="site-config" type="application/json">${site}</script>`)
  return new Response(html, {
    status: cfg ? 200 : 404,
    headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex, nofollow', 'cache-control': 'no-cache' },
  })
}

// ---------- runs ----------

async function createRunRoute(req: Request, env: Env): Promise<Response> {
  const form = await req.formData().catch(() => null)
  if (!form) return err('Please send the form again.')
  const rawUrl = String(form.get('url') ?? '').trim()
  const email = String(form.get('email') ?? '').trim().toLowerCase()
  if (!rawUrl) return err('Please enter your website address.')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err('Please enter a valid email so we can send you the link.')

  let domain: string, host: string
  try { const u = normalizeUrl(rawUrl); host = u.hostname; domain = registrableDomain(u.hostname) } catch { return err('That doesn’t look like a website address.') }

  // Same domain in the last week: hand back the existing demo instead of paying for a new one.
  const prior = await services(env).findRecentDemo(domain, Date.now() - DEDUPE_DAYS * 864e5)
  if (prior) return json({ existing: true, slug: prior.slug, url: `/d/${prior.slug}` })

  const since = new Date(); since.setUTCHours(0, 0, 0, 0)
  const today = await env.DB.prepare('SELECT COUNT(*) AS n FROM runs WHERE created_at >= ? AND preset = 0').bind(since.getTime()).first<{ n: number }>()
  if ((today?.n ?? 0) >= Number(env.DAILY_RUN_CAP ?? 40)) {
    return err('We’ve hit today’s limit for new demos. Please try again tomorrow, or book a call and we’ll build yours by hand.', 429)
  }

  const id = `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${slugify(host.replace(/^www\./, '').split('.')[0], 20)}-${randomId(4)}`
  const store = new R2Store(env.BUCKET)

  const images: { file: string; kind: 'label' | 'photo'; product?: string }[] = []
  const files = form.getAll('images').filter((f): f is File => typeof f !== 'string').slice(0, MAX_UPLOADS)
  const kinds = form.getAll('kinds').map(String)
  const names = form.getAll('products').map(String)
  for (const [i, f] of files.entries()) {
    if (f.size > MAX_UPLOAD_BYTES) return err(`${f.name} is over 5 MB.`)
    const bytes = new Uint8Array(await f.arrayBuffer())
    const kind = sniffImage(bytes)
    if (!kind) return err(`${f.name} isn’t a PNG, JPG, WebP, GIF or AVIF image.`)
    const file = `upload-${i + 1}.${kind.ext}`
    await store.write(`runs/${id}/stages/01_intake/input/uploads/${file}`, bytes, kind.type)
    images.push({ file, kind: kinds[i] === 'label' ? 'label' : 'photo', product: names[i]?.trim().slice(0, 80) || undefined })
  }

  const payload = {
    url: rawUrl,
    igUrl: String(form.get('igUrl') ?? '').trim() || undefined,
    email,
    ownerClaim: form.get('ownerClaim') === 'on' || form.get('ownerClaim') === 'true',
    pasted: String(form.get('pasted') ?? '').trim().slice(0, 8000) || undefined,
    images,
  }
  await createRun(store, payload, id)
  const now = Date.now()
  await env.DB.batch([
    env.DB.prepare('INSERT INTO runs (id, domain, url, status, stage, email, owner_claim, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, domain, rawUrl, 'running', '01_intake', email, payload.ownerClaim ? 1 : 0, now),
    env.DB.prepare('INSERT INTO leads (email, run_id, domain, owner_claim, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(email, id, domain, payload.ownerClaim ? 1 : 0, now),
  ])
  await env.PIPELINE.create({ id, params: { runId: id } })
  return json({ id, url: `/build/${id}` }, 201)
}

// Polled every second by the build page; cached at the edge for 1 s so many tabs don't multiply the work.
async function runStatus(req: Request, env: Env, ctx: ExecutionContext, id: string): Promise<Response> {
  const cache = caches.default
  const key = new Request(new URL(`/api/runs/${id}`, req.url).toString())
  const hit = await cache.match(key)
  if (hit) return hit

  const store = new R2Store(env.BUCKET)
  const m = await readManifest(store, id)
  if (!m) return err('We couldn’t find that build.', 404)
  const row = await env.DB.prepare('SELECT status, slug FROM runs WHERE id = ?').bind(id).first<{ status: string; slug: string | null }>()
  const readJson = async (k: string) => { const b = await store.read(k); return b ? JSON.parse(new TextDecoder().decode(b)) : null }
  const p = await runProgress(env, m, readJson, row?.status === 'done' ? row.slug : null)
  if (row?.status === 'queued' || row?.status === 'blocked' || row?.status === 'failed') p.status = row.status as any
  if (p.details.logo) p.details.logo = null // logos are run files, not public assets yet
  const res = json(p, 200, { 'cache-control': 'public, max-age=1' })
  ctx.waitUntil(cache.put(key, res.clone()))
  return res
}

// ---------- analytics ----------

async function events(req: Request, env: Env): Promise<Response> {
  const body = await req.json<any>().catch(() => null)
  if (!body || !/^[a-z0-9-]+$/.test(body.slug ?? '') || !Array.isArray(body.events)) return new Response(null, { status: 204 })
  const session = String(body.session ?? '').slice(0, 16)
  const stmts = body.events.slice(0, 50).filter((e: any) => typeof e?.name === 'string' && e.name.length < 40).map((e: any) =>
    env.DB.prepare('INSERT INTO events (slug, session, name, props_json, ts) VALUES (?, ?, ?, ?, ?)')
      .bind(body.slug, session, e.name, JSON.stringify(e.props ?? {}).slice(0, 500), Number(e.t) || Date.now()))
  if (stmts.length) await env.DB.batch(stmts)
  return new Response(null, { status: 204 })
}
