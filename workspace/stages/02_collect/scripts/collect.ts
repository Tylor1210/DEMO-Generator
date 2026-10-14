import type { StageCtx } from '../../../../pipeline/runner.ts'
import { StageBlocked } from '../../../../pipeline/types.ts'
import { checkRobots, registrableDomain, safeFetch } from '../../../../pipeline/lib/net.ts'
import { extractPage, ldNodes, stripTags, type PageData } from '../../../../pipeline/lib/html.ts'
import { sniffImage } from '../../../../pipeline/lib/images.ts'
import { parseColor, saturation, luminance } from '../../../../pipeline/lib/color.ts'
import { dec, slugify, truncateText } from '../../../../pipeline/lib/text.ts'

const MAX_PAGES = 8
const MAX_IMAGES = 8
const SITE_MD_BUDGET = 15_000
const OUT = '02_collect/output'

const PAGE_HINTS: [RegExp, number][] = [
  [/\/(pages\/)?(about|our-story|story|mission|who-we-are)/, 9],
  [/\/(pages\/)?(ingredients|science|nutrition|whats-inside|what-s-inside|formula)/, 9],
  [/\/(pages\/)?(faq|faqs|help)/, 7],
  [/\/(pages\/)?(store-locator|stockists|where-to-buy|find-us|find-a-store|locations|retailers)/, 8],
  [/\/collections\/(all|shop|[\w-]+)$/, 6],
  [/\/(shop|products?)$/, 6],
  [/\/products\/[\w-]+$/, 5],
  [/\/pages\/[\w-]+$/, 2],
]
const SKIP_LINK = /\/(account|cart|checkout|login|search|policies|blogs?|news|careers|wholesale|cdn|tools|contact|accessibility|privacy|terms|faire|ambassador|affiliate|data-sharing|opt-out|refund|shipping-policy)|\.(pdf|jpg|png|zip)$|#/

interface Input { url: string; domain: string; images: { path: string; kind: string }[]; pasted: string | null; robotsBlocked: boolean }

interface CondensedProduct {
  name: string; handle: string | null; url: string | null; type: string; price: string | null; compareAt: string | null
  options: string[]; tags: string[]; image: string | null; imagePath?: string; description: string
}

const blockedMessage = (host: string, why: string) =>
  `We couldn't read ${host} (${why}). That's usually a bot shield, and we respect it. ` +
  `Upload up to 4 product images and paste a short description of your products (names, prices, what's in them, where to buy) and we'll build from that.`

export async function run(ctx: StageCtx) {
  const input = (await ctx.inputJson<Input>('01_intake/output/input.json'))!
  const host = new URL(input.url).hostname
  const hasOwnerInfo = !!input.pasted || input.images.length > 0
  const pages: PageData[] = []
  let blockedWhy = ''

  if (input.robotsBlocked) blockedWhy = 'robots.txt asks bots not to crawl it'
  else {
    try {
      const home = await safeFetch(input.url, { truncate: true })
      const html = dec.decode(home.body)
      if (home.status === 401 || home.status === 403 || home.status === 429) blockedWhy = `the site answered ${home.status}`
      else if (home.status >= 400) blockedWhy = `the site answered ${home.status}`
      else if (/cf-chl|captcha|just a moment\.\.\.|access denied/i.test(html) && html.length < 30_000) blockedWhy = 'it asked for a captcha'
      else pages.push(extractPage(html, home.url))
    } catch (e: any) {
      blockedWhy = /timeout|abort/i.test(e.message) ? 'it took too long to answer' : e.message
    }
  }

  if (blockedWhy && !hasOwnerInfo) throw new StageBlocked(blockedMessage(host, blockedWhy), ['uploads', 'pasted'])
  if (blockedWhy) ctx.log(`  site not readable (${blockedWhy}); building from owner info only`)

  // Shopify's public catalog is the cleanest product source when present.
  let products: CondensedProduct[] = []
  let source = 'none'
  const origin = new URL(input.url).origin
  if (!blockedWhy && (await checkRobots(`${origin}/products.json`))) {
    try {
      const r = await safeFetch(`${origin}/products.json?limit=60`, { accept: 'application/json' })
      if (r.status === 200 && r.contentType.includes('json')) {
        const j = JSON.parse(dec.decode(r.body))
        if (Array.isArray(j.products)) { products = condenseShopify(j.products, origin); source = 'shopify' }
      }
    } catch { /* not Shopify, or blocked */ }
  }

  // Pick the most useful same-domain pages.
  if (pages.length) {
    const seen = new Set([normPath(pages[0].url)])
    const scored = new Map<string, number>()
    for (const l of pages[0].links) {
      let u: URL
      try { u = new URL(l.href) } catch { continue }
      if (registrableDomain(u.hostname) !== input.domain || SKIP_LINK.test(u.pathname + u.hash)) continue
      const key = u.origin + u.pathname.replace(/\/$/, '')
      if (seen.has(normPath(key))) continue
      const path = u.pathname.toLowerCase().replace(/\/$/, '')
      let score = 0
      for (const [re, s] of PAGE_HINTS) if (re.test(path)) score = Math.max(score, s)
      if (/about|story|ingredient|faq|find|store|where/i.test(l.text)) score += 2
      if (score > 0) scored.set(key, Math.max(scored.get(key) ?? 0, score))
    }
    // Product pages: at most 2, and none when the Shopify catalog already gave us descriptions.
    let productPages = products.some(p => p.description) ? 2 : 0
    const ranked = [...scored.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u)
    const picked: string[] = []
    for (const u of ranked) {
      if (picked.length >= MAX_PAGES - 1) break
      if (/\/products\//.test(u)) { if (productPages >= 2) continue; productPages++ }
      picked.push(u)
    }
    for (const u of picked) {
      if (!(await checkRobots(u))) { ctx.log(`  robots.txt disallows ${u}`); continue }
      try {
        const r = await safeFetch(u, { truncate: true })
        if (r.status !== 200 || !/html/.test(r.contentType)) continue
        pages.push(extractPage(dec.decode(r.body), r.url))
        ctx.log(`  read ${r.url}`)
      } catch (e: any) { ctx.log(`  skipped ${u}: ${e.message}`) }
    }
  }

  // JSON-LD products when there is no Shopify feed.
  if (!products.length) {
    for (const pg of pages) {
      for (const n of ldNodes(pg.jsonLd, ['Product'])) {
        const offer = [].concat(n.offers ?? [])[0] as any
        products.push({
          name: String(n.name ?? ''), handle: null, url: n.url ?? pg.url, type: String(n.category ?? ''),
          price: offer?.price != null ? String(offer.price) : null, compareAt: null, options: [], tags: [],
          image: [].concat(n.image ?? [])[0] ?? null, description: String(n.description ?? '').slice(0, 300),
        })
      }
    }
    if (products.length) source = 'jsonld'
  }

  const home = pages[0]
  const currency = home ? findCurrency(pages) : 'USD'
  const needsRender = !!home && home.lines.join(' ').length < 500

  // ---------- signals ----------
  const css: string[] = pages.map(p => p.inlineCss)
  if (home) {
    for (const href of home.stylesheets.filter(h => registrableDomain(new URL(h).hostname) === input.domain || /cdn\.shopify\.com/.test(h)).slice(0, 2)) {
      try {
        const r = await safeFetch(href, { maxBytes: 1024 * 1024, truncate: true, accept: 'text/css' })
        if (r.status === 200) css.push(dec.decode(r.body))
      } catch { /* optional */ }
    }
  }
  const colors = rankColors(css.join('\n'), home?.meta['theme-color'])
  const fonts = rankFonts(css.join('\n'), home?.stylesheets ?? [])

  // ---------- images ----------
  const imgs: { path: string; sourceUrl: string; role: string; product?: string; alt: string }[] = []
  const saveImage = async (src: string, name: string, role: string, alt: string, product?: string) => {
    if (imgs.length >= MAX_IMAGES || imgs.some(i => i.sourceUrl === src)) return null
    try {
      const u = new URL(src)
      if (/cdn\.shopify\.com|\/cdn\/shop\//.test(u.href)) u.searchParams.set('width', '900')
      const r = await safeFetch(u.toString(), { accept: 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.5' })
      const kind = r.status === 200 ? sniffImage(r.body) : null
      if (!kind) return null
      const path = `${OUT}/images/${name}.${kind.ext}`
      await ctx.output(path, r.body, kind.type)
      imgs.push({ path, sourceUrl: src, role, product, alt })
      return path
    } catch { return null }
  }
  if (home) {
    const org = ldNodes(home.jsonLd, ['Organization', 'Brand'])[0]
    const logoCand = home.images.find(i => /logo/.test(i.hint) || /logo/i.test(i.alt) || /logo/i.test(i.src))?.src ??
      (typeof org?.logo === 'string' ? org.logo : org?.logo?.url)
    if (logoCand) await saveImage(logoCand, 'logo', 'logo', 'logo')
  }
  const core = coreProducts(products)
  for (const p of core) {
    if (imgs.length >= MAX_IMAGES - 1) break
    if (p.image) {
      const path = await saveImage(p.image, `p-${slugify(p.handle ?? p.name, 30)}`, 'product', p.name, p.name)
      if (path) p.imagePath = path
    }
  }
  if (home?.meta['og:image']) await saveImage(home.meta['og:image'], 'og', 'og', 'share image')

  // ---------- site.md ----------
  const siteMd = buildSiteMd(pages, products, input, currency)
  await ctx.output(`${OUT}/site.md`, siteMd, 'text/markdown')

  await ctx.output(`${OUT}/products.raw.json`, JSON.stringify({
    source, currency, dominantType: dominantType(products),
    // site.md already carries descriptions and URLs; keep this file to the structured bits.
    products: core.map(p => ({ name: p.name, type: p.type, price: p.price, compareAt: p.compareAt, options: p.options, imagePath: p.imagePath ?? null })),
    otherProducts: products.filter(p => !core.includes(p)).map(p => p.name).slice(0, 25),
  }, null, 2), 'application/json')

  const signals = {
    siteName: home?.meta['og:site_name'] ?? home?.title ?? input.domain,
    themeColor: home?.meta['theme-color'] ?? null,
    colors: colors.brand.map(c => c.hex),
    neutrals: colors.neutrals.map(c => c.hex),
    fonts,
    logo: imgs.find(i => i.role === 'logo')?.path ?? null,
    images: imgs.map(({ sourceUrl, ...i }) => i),
    uploads: input.images,

    platform: source === 'shopify' ? 'shopify' : 'unknown',
    needsRender,
    blocked: blockedWhy || null,
  }
  await ctx.output(`${OUT}/signals.json`, JSON.stringify(signals, null, 2), 'application/json')

  await ctx.progress({
    label: 'Reading your site',
    details: [
      blockedWhy ? 'Using the info you gave us' : `Found ${pages.length} page${pages.length === 1 ? '' : 's'}, ${products.length} product${products.length === 1 ? '' : 's'}`,
      ...(fonts.length ? [`Spotted fonts: ${fonts.slice(0, 2).join(' + ')}`] : []),
    ],
    swatches: colors.brand.slice(0, 6).map(c => c.hex),
    products: core.slice(0, 6).map(p => p.name),
    logo: signals.logo,
  })
}

// ---------- helpers ----------

const normPath = (u: string) => u.replace(/\/$/, '').toLowerCase()

function condenseShopify(list: any[], origin: string): CondensedProduct[] {
  return list
    .filter(p => !/gift ?card/i.test(`${p.title} ${p.product_type}`))
    .map(p => {
      const v = (p.variants ?? [])[0] ?? {}
      const opts = (p.variants ?? []).map((x: any) => x.title).filter((t: string) => t && t !== 'Default Title')
      return {
        name: String(p.title ?? '').trim(),
        handle: p.handle ?? null,
        url: p.handle ? `${origin}/products/${p.handle}` : null,
        type: String(p.product_type ?? ''),
        price: v.price ?? null,
        compareAt: v.compare_at_price && v.compare_at_price !== v.price ? v.compare_at_price : null,
        options: [...new Set<string>(opts)].slice(0, 6),
        tags: (p.tags ?? []).slice(0, 8),
        image: p.images?.[0]?.src ?? null,
        description: stripTags(p.body_html ?? '').replace(/\n+/g, ' ').slice(0, 320),
      }
    })
}

function dominantType(products: CondensedProduct[]): string | null {
  const counts = new Map<string, number>()
  for (const p of products) if (p.type) counts.set(p.type, (counts.get(p.type) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

// Core line first: the most common product type, then products that look like the main line (not merch).
function coreProducts(products: CondensedProduct[]): CondensedProduct[] {
  const dom = dominantType(products)
  const merch = /shirt|tee|hoodie|hat|cap|sticker|tote|earring|mug|sock|pin|gift|merch|apparel|bottle opener/i
  const score = (p: CondensedProduct) =>
    (dom && p.type === dom ? 4 : 0) + (merch.test(`${p.name} ${p.type}`) ? -6 : 0) +
    (p.description ? 1 : 0) + (/variety|bundle|sampler|pack/i.test(p.name) ? -1 : 0)
  return [...products].sort((a, b) => score(b) - score(a)).slice(0, 12)
}

function findCurrency(pages: PageData[]): string {
  for (const p of pages) {
    if (p.meta['og:price:currency']) return p.meta['og:price:currency']
    for (const n of ldNodes(p.jsonLd, ['Offer', 'Product'])) {
      const c = n.priceCurrency ?? [].concat(n.offers ?? []).map((o: any) => o?.priceCurrency).find(Boolean)
      if (c) return c
    }
  }
  return 'USD'
}

function rankColors(css: string, themeColor?: string) {
  const counts = new Map<string, { n: number; vars: Set<string> }>()
  const add = (hex: string | null, w: number, v?: string) => {
    if (!hex) return
    const e = counts.get(hex) ?? { n: 0, vars: new Set() }
    e.n += w
    if (v) e.vars.add(v)
    counts.set(hex, e)
  }
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3})\s*[;}]/g)) {
    const raw = /^\d/.test(m[2]) ? `rgb(${m[2]})` : m[2]
    add(parseColor(raw), 3, m[1])
  }
  for (const m of css.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) add(parseColor(m[0]), 1)
  if (themeColor) add(parseColor(themeColor), 20, 'theme-color')
  const all = [...counts.entries()].map(([hex, e]) => ({ hex, weight: e.n, vars: [...e.vars].slice(0, 3) }))
    .sort((a, b) => b.weight - a.weight)
  return {
    brand: all.filter(c => saturation(c.hex) > 0.25 && luminance(c.hex) > 0.02 && luminance(c.hex) < 0.92).slice(0, 10),
    neutrals: all.filter(c => !(saturation(c.hex) > 0.25 && luminance(c.hex) > 0.02 && luminance(c.hex) < 0.92)).slice(0, 4),
  }
}

function rankFonts(css: string, stylesheets: string[]): string[] {
  const generic = /^(serif|sans-serif|monospace|cursive|system-ui|inherit|initial|unset|-apple-system|blinkmacsystemfont|segoe ui|helvetica|helvetica neue|arial|roboto|ui-sans-serif|ui-serif|var\(.*|apple color emoji|segoe ui emoji|times new roman|noto color emoji)$/i
  const counts = new Map<string, number>()
  for (const m of css.matchAll(/font-family\s*:\s*([^;}{]+)/g)) {
    const first = m[1].split(',')[0].trim().replace(/^['"]|['"]$/g, '')
    if (first && !generic.test(first) && first.length < 40) counts.set(first, (counts.get(first) ?? 0) + 1)
  }
  for (const s of stylesheets) {
    const m = s.match(/fonts\.googleapis\.com\/css2?\?family=([^&:]+)/)
    if (m) counts.set(decodeURIComponent(m[1]).replace(/\+/g, ' '), 99)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f).slice(0, 5)
}

function buildSiteMd(pages: PageData[], products: CondensedProduct[], input: Input, currency: string): string {
  const seen = new Set<string>()
  const parts: string[] = [`# Evidence for ${input.domain}`, '']
  if (input.pasted) parts.push('## owner:pasted', truncateText(input.pasted, 6000), '')
  // High-value pages (FAQ, about, ingredients) get room; filler pages go after the catalog so truncation hits them first.
  const valuable = (u: string) => /faq|about|story|ingredient|science|nutrition|inside|mission|formula/i.test(new URL(u).pathname)
  const pageSection = (p: PageData, budget: number) => {
    const lines: string[] = []
    const desc = p.meta['description'] ?? p.meta['og:description']
    if (p.title) lines.push(`Title: ${p.title}`)
    if (desc) lines.push(`Description: ${desc}`)
    for (const l of p.lines) {
      const k = l.toLowerCase()
      if (seen.has(k) || l.length < 3) continue
      seen.add(k)
      lines.push(l)
    }
    for (const n of ldNodes(p.jsonLd, ['Organization']).slice(0, 1)) {
      const sameAs = [].concat(n.sameAs ?? []).join(', ')
      if (sameAs) lines.push(`Profiles: ${sameAs}`)
    }
    return [`## ${p.url}`, truncateText(lines.join('\n'), budget), '']
  }
  const [home, ...rest] = pages
  if (home) parts.push(...pageSection(home, 5000))
  for (const p of rest.filter(p => valuable(p.url))) parts.push(...pageSection(p, 4500))
  for (const p of coreProducts(products)) {
    parts.push(`## ${p.url ?? `product: ${p.name}`}`)
    parts.push(`Product: ${p.name}`)
    if (p.type) parts.push(`Type: ${p.type}`)
    if (p.price) parts.push(`Price: ${p.price} ${currency}${p.compareAt ? ` (was ${p.compareAt})` : ''}`)
    if (p.options.length) parts.push(`Options: ${p.options.join(', ')}`)
    if (p.description) parts.push(p.description)
    parts.push('')
  }
  for (const p of rest.filter(p => !valuable(p.url))) parts.push(...pageSection(p, 1500))
  return truncateText(parts.join('\n'), SITE_MD_BUDGET) + '\n'
}
