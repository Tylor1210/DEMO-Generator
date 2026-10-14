// Worker implementation of page extraction, on Cloudflare's native HTMLRewriter (streaming, very low CPU).
// Produces the same PageData as html-node.ts.
import { BLOCK, SKIP, mergeShortLines, type PageData } from './html.ts'

declare const HTMLRewriter: any

export async function extractWithRewriter(html: string, url: string): Promise<PageData> {
  const d: PageData = { url, title: '', meta: {}, jsonLd: [], links: [], images: [], stylesheets: [], inlineCss: '', icons: [], lines: [] }
  const abs = (h: string) => { try { return new URL(h, url).toString() } catch { return '' } }
  let skip = 0, hidden = 0, buf = '', ld = '', titleDone = false
  const openLinks: { href: string; text: string }[] = []
  const flush = () => { const t = buf.replace(/\s+/g, ' ').trim(); if (t) d.lines.push(t); buf = '' }
  const onEnd = (el: any, fn: () => void) => { if (!el.selfClosing && el.canHaveContent !== false) { try { el.onEndTag(fn) } catch { /* void element */ } } }

  await new HTMLRewriter()
    .on('*', {
      element(el: any) {
        const tag = el.tagName
        if (tag === 'meta') {
          const k = (el.getAttribute('property') || el.getAttribute('name') || el.getAttribute('itemprop') || '').toLowerCase()
          const c = el.getAttribute('content')
          if (k && c) d.meta[k] = c
          return
        }
        if (tag === 'link') {
          const rel = (el.getAttribute('rel') || '').toLowerCase(), href = el.getAttribute('href')
          if (href && rel.includes('stylesheet')) d.stylesheets.push(abs(href))
          if (href && rel.includes('icon')) d.icons.push(abs(href))
          return
        }
        if (skip > 0) return
        if (tag === 'img') {
          const srcset = (el.getAttribute('srcset') || '').split(',')[0]?.trim().split(' ')[0] || ''
          const src = el.getAttribute('src') || el.getAttribute('data-src') || srcset
          if (src && !src.startsWith('data:')) {
            d.images.push({ src: abs(src.startsWith('//') ? 'https:' + src : src), alt: el.getAttribute('alt') || '', hint: `${el.getAttribute('class') || ''} ${el.getAttribute('id') || ''}`.toLowerCase() })
          }
          return
        }
        if (BLOCK.has(tag)) flush()
        else if (buf && !/\s$/.test(buf)) buf += ' '
        onEnd(el, () => { if (BLOCK.has(tag)) flush(); else if (buf && !/\s$/.test(buf)) buf += ' ' })
      },
    })
    .on(['script', ...SKIP].join(','), { element(el: any) { skip++; onEnd(el, () => { skip = Math.max(0, skip - 1) }) } })
    .on('[hidden],[aria-hidden="true"]', { element(el: any) { hidden++; onEnd(el, () => { hidden = Math.max(0, hidden - 1) }) } })
    .on('title', { text(t: any) { if (!titleDone && skip === 0) d.title += t.text; if (t.lastInTextNode && d.title) titleDone = true } })
    .on('style', { text(t: any) { d.inlineCss += t.text } })
    .on('script[type*="ld+json"]', {
      element(el: any) { ld = ''; onEnd(el, () => { try { d.jsonLd.push(JSON.parse(ld)) } catch { /* broken JSON-LD is common */ } }) },
      text(t: any) { ld += t.text },
    })
    .on('a[href]', {
      element(el: any) {
        if (skip > 0) return
        const link = { href: abs(el.getAttribute('href')), text: '' }
        openLinks.push(link)
        onEnd(el, () => { const l = openLinks.pop(); if (l) d.links.push({ href: l.href, text: l.text.replace(/\s+/g, ' ').trim() }) })
      },
    })
    .onDocument({
      text(t: any) {
        if (skip > 0 || hidden > 0) return
        const s = decode(t.text)
        buf += s
        if (openLinks.length) openLinks[openLinks.length - 1].text += s
      },
    })
    .transform(new Response(html, { headers: { 'content-type': 'text/html' } }))
    .arrayBuffer()

  flush()
  d.title = decode(d.title).replace(/\s+/g, ' ').trim()
  for (const k of Object.keys(d.meta)) d.meta[k] = decode(d.meta[k])
  d.lines = mergeShortLines(d.lines)
  return d
}

// HTMLRewriter hands over raw text; decode the common entities.
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', mdash: '—', ndash: '–', hellip: '…', reg: '®', trade: '™', copy: '©' }
function decode(s: string): string {
  if (!s.includes('&')) return s
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') { const n = /^#x/i.test(e) ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m }
    return NAMED[e.toLowerCase()] ?? m
  })
}
