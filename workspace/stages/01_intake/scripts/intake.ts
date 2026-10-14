import type { StageCtx } from '../../../../pipeline/runner.ts'
import { StageBlocked } from '../../../../pipeline/types.ts'
import { assertSafeUrl, checkRobots, registrableDomain, safeFetch, UnsafeUrl } from '../../../../pipeline/lib/net.ts'
import { sniffImage } from '../../../../pipeline/lib/images.ts'

const TRACKING = /^(utm_|fbclid|gclid|mc_|ref$|_ga)/
const MAX_UPLOAD = 5 * 1024 * 1024
const DEDUPE_DAYS = 7

interface Payload {
  url: string
  igUrl?: string
  email?: string
  ownerClaim?: boolean
  images?: { file: string; kind: 'label' | 'photo' }[]
  pasted?: string
  force?: boolean
}

export function normalizeUrl(raw: string): URL {
  const s = raw.trim()
  const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`)
  u.hostname = u.hostname.toLowerCase()
  u.hash = ''
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k)
  if (u.pathname === '') u.pathname = '/'
  return u
}

export async function run(ctx: StageCtx) {
  const p = await ctx.inputJson<Payload>('01_intake/input/payload.json')
  if (!p?.url) throw new StageBlocked('Please enter your website address.', ['url'])

  let url: URL
  try {
    url = normalizeUrl(p.url)
    await assertSafeUrl(url)
  } catch (e: any) {
    throw new StageBlocked(e instanceof UnsafeUrl ? e.message : `That doesn't look like a website address: ${p.url}`, ['url'])
  }
  const domain = registrableDomain(url.hostname)

  const list = ((await ctx.reference('_config/blocklist.txt')) ?? '').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  if (list.includes(domain)) throw new StageBlocked('We can’t build a demo for this site.', [])
  const watched = list.includes(`watch:${domain}`)

  // Follow redirects to catch parked domains and moved sites before we read anything.
  let finalUrl = url.toString()
  try {
    const head = await safeFetch(url.toString(), { maxBytes: 64 * 1024, truncate: true })
    finalUrl = head.url
  } catch (e: any) {
    if (e instanceof UnsafeUrl) throw new StageBlocked(e.message, ['url'])
    ctx.log(`  homepage fetch failed: ${e.message} (collect will report it)`)
  }
  const finalDomain = registrableDomain(new URL(finalUrl).hostname)
  if (finalDomain !== domain) {
    throw new StageBlocked(
      `${url.hostname} sends visitors to ${new URL(finalUrl).hostname}, so it may be parked or moved. Please enter the address of your live store.`,
      ['url'],
    )
  }

  const robotsOk = await checkRobots(finalUrl)
  if (!robotsOk) ctx.log('  robots.txt disallows the homepage for our bot')

  if (!p.force) {
    const prior = await ctx.services.findRecentDemo(domain, Date.now() - DEDUPE_DAYS * 864e5)
    if (prior) throw new StageBlocked(`A demo for ${domain} was built in the last ${DEDUPE_DAYS} days: ${prior.url}`, ['dedupe'])
  }

  const images: { path: string; kind: 'label' | 'photo' }[] = []
  for (const img of (p.images ?? []).slice(0, 4)) {
    const rel = `01_intake/input/uploads/${img.file.split('/').pop()}`
    const bytes = await ctx.input(rel)
    if (!bytes) { ctx.log(`  upload missing: ${rel}`); continue }
    const kind = sniffImage(bytes)
    if (!kind || bytes.byteLength > MAX_UPLOAD) { ctx.log(`  skipped ${rel}: not an image or over 5 MB`); continue }
    const out = `01_intake/output/uploads/${images.length + 1}-${img.kind}.${kind.ext}`
    await ctx.output(out, bytes, kind.type)
    images.push({ path: out, kind: img.kind === 'label' ? 'label' : 'photo' })
  }

  const input = {
    url: finalUrl,
    domain,
    igUrl: p.igUrl?.trim() || null,
    images,
    email: p.email?.trim().toLowerCase() || null,
    ownerClaim: !!p.ownerClaim,
    pasted: p.pasted?.trim().slice(0, 8000) || null,
    robotsBlocked: !robotsOk,
    watchList: watched,
    dedupeOf: null,
  }
  await ctx.output('01_intake/output/input.json', JSON.stringify(input, null, 2), 'application/json')
  await ctx.progress({ label: 'Checking your link', details: [`Reading ${new URL(finalUrl).hostname}`] })
}
