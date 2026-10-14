// Text helpers: normalizing, fuzzy evidence matching, house style fixes.

export const enc = new TextEncoder()
export const dec = new TextDecoder()

export function slugify(s: string, max = 40): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '')
}

export function randomId(n: number, alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'): string {
  const bytes = crypto.getRandomValues(new Uint8Array(n))
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join('')
}

const STOP = new Set('a an and are as at be by for from has have in is it its of on or our that the this to with we you your all no not'.split(' '))

export function normalize(s: string): string {
  return s.toLowerCase()
    .replace(/[‘’‚‛′]/g, "'").replace(/[“”„″]/g, '"')
    .replace(/[–—]/g, '-').replace(/&amp;/g, '&')
    .replace(/[^a-z0-9$%.'&+ ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export const tokens = (s: string) => normalize(s).split(' ').map(t => t.replace(/^[.']+|[.']+$/g, '')).filter(Boolean)
const contentTokens = (s: string) => tokens(s).filter(t => !STOP.has(t))

export function containsQuote(haystackNorm: string, quote: string): boolean {
  const q = normalize(quote).replace(/[."']+$/g, '')
  return q.length > 0 && haystackNorm.includes(q)
}

// Fraction of the claim's content words that appear close together somewhere in the text.
// 1.0 means every word appears inside one window; good for "No refined sugar" vs "no refined sugars".
export function supportScore(claim: string, text: string): number {
  const want = contentTokens(claim)
  if (want.length === 0) return 1
  const hay = tokens(text)
  const stem = (t: string) => t.replace(/(ies|es|s)$/, '')
  const wantStems = want.map(stem)
  const window = Math.max(want.length * 4, 12)
  const positions = new Map<string, number[]>()
  hay.forEach((t, i) => {
    const s = stem(t)
    if (wantStems.includes(s)) positions.set(s, [...(positions.get(s) ?? []), i])
  })
  let best = 0
  for (const [, ps] of positions) {
    for (const start of ps) {
      let hit = 0
      for (const w of new Set(wantStems)) {
        if ((positions.get(w) ?? []).some(p => p >= start - window && p <= start + window)) hit++
      }
      best = Math.max(best, hit / new Set(wantStems).size)
    }
  }
  return best
}

// House style: no em or en dashes in generated copy.
export function fixDashes(s: string): string {
  return s
    .replace(/(\d)\s*[–—]\s*(\d)/g, '$1-$2')
    .replace(/\s*[—]\s*/g, ', ')
    .replace(/\s+[–]\s+/g, ', ')
    .replace(/[–]/g, '-')
    .replace(/,\s*,/g, ',')
}
export const hasDash = (s: string) => /[–—]/.test(s)

// Measured on real stage prompts: about 2.4 characters per token for Claude's current tokenizer.
export const estTokens = (s: string) => Math.ceil(s.length / 2.4)

export function truncateText(s: string, max: number): string {
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  return cut.slice(0, Math.max(cut.lastIndexOf('\n'), max - 200)) + '\n[...]'
}
