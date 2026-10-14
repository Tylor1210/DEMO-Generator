// Page extraction: visible text plus the signals we need, in one streaming pass.
// html-node.ts (htmlparser2) runs locally; html-rewriter.ts (HTMLRewriter) runs in the Worker. Same PageData shape.

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

export const SKIP = new Set(['script', 'style', 'noscript', 'svg', 'template', 'iframe', 'select', 'canvas'])
export const BLOCK = new Set(['p', 'div', 'section', 'article', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br',
  'tr', 'td', 'th', 'header', 'footer', 'main', 'aside', 'nav', 'blockquote', 'figcaption', 'dt', 'dd', 'details', 'summary', 'button'])
export const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])

// Inline elements (spans, links) flush on their own; glue tiny fragments back into readable lines.
export function mergeShortLines(lines: string[]): string[] {
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

// Product descriptions (Shopify body_html) are small and simple: a regex pass is enough and costs no CPU to speak of.
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '\u2019', lsquo: '\u2018', ldquo: '\u201c', rdquo: '\u201d', mdash: '\u2014', ndash: '\u2013', hellip: '\u2026' }
export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}
export function stripTags(html: string): string {
  return decodeEntities(html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(p|div|li|ul|ol|h[1-6]|br|tr|section|article)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ''))
    .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')
}

// Runtime pick: HTMLRewriter in the Worker (native, almost no CPU), htmlparser2 in Node.
export async function extract(html: string, url: string): Promise<PageData> {
  if (typeof (globalThis as any).HTMLRewriter === 'function') {
    const { extractWithRewriter } = await import('./html-rewriter.ts')
    return extractWithRewriter(html, url)
  }
  const { extractPage } = await import('./html-node.ts')
  return extractPage(html, url)
}
