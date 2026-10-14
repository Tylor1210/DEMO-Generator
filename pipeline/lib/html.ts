// One streaming pass over a page: visible text plus the signals we need.
// Node uses htmlparser2. The Worker can swap in HTMLRewriter behind the same PageData shape.
import { Parser } from 'htmlparser2'

export interface PageData {
  url: string
  title: string
  meta: Record<string, string>
  jsonLd: unknown[]
  links: { href: string; text: string }[]
  images: { src: string; alt: string; hint: string }[]
  stylesheets: string[]
  inlineCss: string
  icons: string[]
  lines: string[]
}

const SKIP = new Set(['script', 'style', 'noscript', 'svg', 'template', 'iframe', 'select', 'canvas'])
const BLOCK = new Set(['p', 'div', 'section', 'article', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br',
  'tr', 'td', 'th', 'header', 'footer', 'main', 'aside', 'nav', 'blockquote', 'figcaption', 'dt', 'dd', 'details', 'summary', 'button'])
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])

export function extractPage(html: string, url: string): PageData {
  const d: PageData = { url, title: '', meta: {}, jsonLd: [], links: [], images: [], stylesheets: [], inlineCss: '', icons: [], lines: [] }
  const abs = (h: string) => { try { return new URL(h, url).toString() } catch { return '' } }
  let skipDepth = 0
  let inTitle = false, inLd = false, inStyle = false
  let ld = '', buf = ''
  let linkStack: { href: string; text: string }[] = []
  let hiddenDepth = 0
  const stack: string[] = []
  const flush = () => {
    const t = buf.replace(/\s+/g, ' ').trim()
    if (t) d.lines.push(t)
    buf = ''
  }

  const parser = new Parser({
    onopentag(name, a) {
      if (!VOID.has(name)) stack.push(name)
      const hidden = a.hidden !== undefined || a['aria-hidden'] === 'true' || /display:\s*none/.test(a.style ?? '')
      if (hiddenDepth > 0 || hidden) { if (!VOID.has(name)) hiddenDepth++ }
      if (name === 'title' && skipDepth === 0 && !d.title) inTitle = true
      if (name === 'meta') {
        const k = (a.property || a.name || a.itemprop || '').toLowerCase()
        if (k && a.content) d.meta[k] = a.content
      }
      if (name === 'link') {
        const rel = (a.rel || '').toLowerCase()
        if (rel.includes('stylesheet') && a.href) d.stylesheets.push(abs(a.href))
        if (rel.includes('icon') && a.href) d.icons.push(abs(a.href))
      }
      if (name === 'script' && (a.type || '').includes('ld+json')) { inLd = true; ld = '' }
      if (name === 'style') inStyle = true
      if (SKIP.has(name)) { skipDepth++; return }
      if (name === 'img') {
        const src = a.src || a['data-src'] || (a.srcset || '').split(',')[0]?.trim().split(' ')[0] || ''
        if (src && !src.startsWith('data:')) d.images.push({ src: abs(src.startsWith('//') ? 'https:' + src : src), alt: a.alt || '', hint: `${a.class || ''} ${a.id || ''}`.toLowerCase() })
      }
      if (name === 'a' && a.href) linkStack.push({ href: abs(a.href), text: '' })
      if (BLOCK.has(name)) flush()
      else if (buf && !/\s$/.test(buf)) buf += ' '
    },
    ontext(t) {
      if (inTitle) d.title += t
      if (inLd) ld += t
      if (inStyle) d.inlineCss += t
      if (skipDepth > 0 || hiddenDepth > 0) return
      buf += t
      if (linkStack.length) linkStack[linkStack.length - 1].text += t
    },
    onclosetag(name, implied) {
      if (!VOID.has(name)) {
        const i = stack.lastIndexOf(name)
        if (i >= 0) stack.length = i
        if (hiddenDepth > 0) hiddenDepth--
      }
      if (name === 'title') inTitle = false
      if (!BLOCK.has(name) && buf && !/\s$/.test(buf)) buf += ' '
      if (name === 'script' && inLd) {
        inLd = false
        try { d.jsonLd.push(JSON.parse(ld)) } catch { /* broken JSON-LD is common */ }
      }
      if (name === 'style') inStyle = false
      if (SKIP.has(name)) { skipDepth = Math.max(0, skipDepth - 1); return }
      if (name === 'a' && linkStack.length) {
        const l = linkStack.pop()!
        d.links.push({ href: l.href, text: l.text.replace(/\s+/g, ' ').trim() })
      }
      if (BLOCK.has(name) && !implied) flush()
    },
  }, { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true })
  parser.write(html)
  parser.end()
  flush()
  d.title = d.title.replace(/\s+/g, ' ').trim()
  d.lines = mergeShortLines(d.lines)
  return d
}

// Inline elements (spans, links) flush on their own; glue tiny fragments back into readable lines.
function mergeShortLines(lines: string[]): string[] {
  const out: string[] = []
  for (const l of lines) {
    const prev = out[out.length - 1]
    if (prev && prev.length < 60 && l.length < 60 && !/[.!?:]$/.test(prev) && /^[a-z0-9$%(]/.test(l)) out[out.length - 1] = `${prev} ${l}`
    else out.push(l)
  }
  return out
}

// Flatten JSON-LD (handles @graph and arrays) and keep nodes of the given types.
export function ldNodes(jsonLd: unknown[], types: string[]): any[] {
  const out: any[] = []
  const visit = (n: any) => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) return n.forEach(visit)
    const t = ([] as string[]).concat(n['@type'] ?? [])
    if (t.some(x => types.includes(x))) out.push(n)
    if (n['@graph']) visit(n['@graph'])
  }
  jsonLd.forEach(visit)
  return out
}

export function stripTags(html: string): string {
  const lines: string[] = []
  let buf = ''
  const p = new Parser({
    ontext: t => { buf += t },
    onopentag: n => { if (BLOCK.has(n)) { lines.push(buf); buf = '' } },
    onclosetag: n => { if (BLOCK.has(n)) { lines.push(buf); buf = '' } },
  }, { decodeEntities: true })
  p.write(html); p.end(); lines.push(buf)
  return lines.map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')
}
