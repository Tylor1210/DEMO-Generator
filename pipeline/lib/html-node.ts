// Node implementation of page extraction (htmlparser2). The Worker uses html-rewriter.ts.
import { Parser } from 'htmlparser2'
import { BLOCK, SKIP, VOID, mergeShortLines, type PageData } from './html.ts'

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

