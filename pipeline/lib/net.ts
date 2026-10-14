// Polite, safe fetching: honest User-Agent, robots.txt, SSRF guard, timeouts and size caps.
// Uses only fetch(), so it runs in Node 20+ and in Workers.

export const USER_AGENT = 'tycodes-demo-bot/1.0 (+https://tycodes.app/bot)'
const BOT_TOKEN = 'tycodes-demo-bot'
export const MAX_BYTES = 2 * 1024 * 1024
export const TIMEOUT_MS = 10_000

export class UnsafeUrl extends Error {}

// ---------- SSRF guard ----------

function ipv4ToInt(ip: string): number | null {
  const p = ip.split('.')
  if (p.length !== 4 || p.some(x => !/^\d{1,3}$/.test(x) || Number(x) > 255)) return null
  return p.reduce((a, x) => a * 256 + Number(x), 0)
}

const V4_BLOCKS: [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]

export function isPrivateIp(ip: string): boolean {
  const v4 = ipv4ToInt(ip)
  if (v4 !== null) {
    return V4_BLOCKS.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
      return ((v4 & mask) >>> 0) === ((ipv4ToInt(base)! & mask) >>> 0)
    })
  }
  const v6 = ip.toLowerCase().replace(/^\[|\]$/g, '')
  if (!v6.includes(':')) return false
  if (v6 === '::' || v6 === '::1') return true
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateIp(mapped[1])
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v6) || v6.startsWith('64:ff9b:') || v6.startsWith('2001:db8')
}

const isIpLiteral = (h: string) => ipv4ToInt(h) !== null || h.includes(':')

async function resolve(host: string): Promise<string[]> {
  const ips: string[] = []
  for (const type of ['A', 'AAAA']) {
    try {
      const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, {
        headers: { accept: 'application/dns-json' },
        signal: AbortSignal.timeout(5000),
      })
      const j: any = await r.json()
      for (const a of j.Answer ?? []) if (a.type === 1 || a.type === 28) ips.push(a.data)
    } catch { /* treat as no answer */ }
  }
  return ips
}

const dnsCache = new Map<string, Promise<string[]>>()

export async function assertSafeUrl(raw: string | URL): Promise<URL> {
  let u: URL
  try { u = new URL(raw) } catch { throw new UnsafeUrl(`Not a valid URL: ${raw}`) }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new UnsafeUrl('Only http and https links are allowed')
  if (u.port && u.port !== '80' && u.port !== '443') throw new UnsafeUrl('Non-standard ports are not allowed')
  if (u.username || u.password) throw new UnsafeUrl('Links with credentials are not allowed')
  const host = u.hostname.toLowerCase().replace(/\.$/, '')
  if (!host.includes('.') || /(^|\.)(localhost|local|internal|lan|home|corp|intranet)$/.test(host)) {
    throw new UnsafeUrl('That address is not a public website')
  }
  if (isIpLiteral(host)) {
    if (isPrivateIp(host)) throw new UnsafeUrl('Private network addresses are not allowed')
    return u
  }
  if (!dnsCache.has(host)) dnsCache.set(host, resolve(host))
  const ips = await dnsCache.get(host)!
  if (ips.length === 0) throw new UnsafeUrl(`Could not find ${host}. Check the spelling.`)
  if (ips.some(isPrivateIp)) throw new UnsafeUrl('That address points to a private network')
  return u
}

// ---------- Fetch with caps ----------

export interface FetchResult {
  url: string
  status: number
  contentType: string
  body: Uint8Array
  truncated: boolean
  redirects: string[]
}

export async function safeFetch(
  raw: string,
  opts: { maxBytes?: number; timeoutMs?: number; accept?: string; truncate?: boolean } = {},
): Promise<FetchResult> {
  const maxBytes = opts.maxBytes ?? MAX_BYTES
  const redirects: string[] = []
  let url = (await assertSafeUrl(raw)).toString()
  let retried = false
  for (let hop = 0; hop < 6; hop++) {
    const res = await fetch(url, {
      redirect: 'manual',
      headers: { 'user-agent': USER_AGENT, accept: opts.accept ?? 'text/html,application/xhtml+xml,*/*;q=0.8' },
      signal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS),
    })
    // Rate limited (Shopify throttles bursts): wait as asked, up to 8 s, and try once more.
    if ((res.status === 429 || res.status === 503) && !retried) {
      retried = true
      await res.body?.cancel()
      const after = Number(res.headers.get('retry-after'))
      await new Promise(r => setTimeout(r, Math.min(8000, Number.isFinite(after) && after > 0 ? after * 1000 : 3000)))
      hop--
      continue
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      await res.body?.cancel()
      url = (await assertSafeUrl(new URL(res.headers.get('location')!, url))).toString()
      redirects.push(url)
      continue
    }
    const len = Number(res.headers.get('content-length') || 0)
    if (len > maxBytes && !opts.truncate) {
      await res.body?.cancel()
      throw new Error(`Response too large (${len} bytes) from ${url}`)
    }
    const { body, truncated } = await readCapped(res, maxBytes)
    if (truncated && !opts.truncate) throw new Error(`Response over ${maxBytes} bytes from ${url}`)
    return { url, status: res.status, contentType: res.headers.get('content-type') ?? '', body, truncated, redirects }
  }
  throw new Error(`Too many redirects from ${raw}`)
}

async function readCapped(res: Response, max: number): Promise<{ body: Uint8Array; truncated: boolean }> {
  if (!res.body) return { body: new Uint8Array(), truncated: false }
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  let truncated = false
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      chunks.push(value.subarray(0, value.byteLength - (size - max)))
      truncated = true
      await reader.cancel()
      break
    }
    chunks.push(value)
  }
  const out = new Uint8Array(Math.min(size, max))
  let off = 0
  for (const c of chunks) { out.set(c, off); off += c.byteLength }
  return { body: out, truncated }
}

// ---------- robots.txt ----------

interface RobotRule { allow: boolean; path: string }

export function parseRobots(txt: string, agent = BOT_TOKEN): RobotRule[] {
  const groups: { agents: string[]; rules: RobotRule[] }[] = []
  let cur: { agents: string[]; rules: RobotRule[] } | null = null
  let lastWasAgent = false
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim()
    const m = line.match(/^([\w-]+)\s*:\s*(.*)$/)
    if (!m) continue
    const key = m[1].toLowerCase(), val = m[2].trim()
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur) }
      cur.agents.push(val.toLowerCase())
      lastWasAgent = true
    } else {
      lastWasAgent = false
      if (!cur) continue
      if (key === 'allow' || key === 'disallow') {
        if (key === 'disallow' && val === '') continue
        cur.rules.push({ allow: key === 'allow', path: val })
      }
    }
  }
  const mine = groups.filter(g => g.agents.some(a => a !== '*' && agent.toLowerCase().includes(a)))
  const chosen = mine.length ? mine : groups.filter(g => g.agents.includes('*'))
  return chosen.flatMap(g => g.rules)
}

function ruleMatches(rulePath: string, path: string): boolean {
  const anchored = rulePath.endsWith('$')
  const body = anchored ? rulePath.slice(0, -1) : rulePath
  const re = new RegExp('^' + body.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (anchored ? '$' : ''))
  return re.test(path)
}

export function robotsAllows(rules: RobotRule[], path: string): boolean {
  let best: RobotRule | null = null
  for (const r of rules) {
    if (!ruleMatches(r.path, path)) continue
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r
  }
  return best ? best.allow : true
}

const robotsCache = new Map<string, Promise<RobotRule[]>>()

export async function checkRobots(url: string): Promise<boolean> {
  const u = new URL(url)
  if (!robotsCache.has(u.origin)) {
    robotsCache.set(u.origin, (async () => {
      try {
        const r = await safeFetch(`${u.origin}/robots.txt`, { maxBytes: 512 * 1024, truncate: true, accept: 'text/plain' })
        if (r.status >= 400) return []
        return parseRobots(new TextDecoder().decode(r.body))
      } catch { return [] }
    })())
  }
  return robotsAllows(await robotsCache.get(u.origin)!, u.pathname + u.search)
}

// ---------- Domains ----------

const TWO_PART_TLDS = new Set(['co.uk', 'org.uk', 'ac.uk', 'com.au', 'net.au', 'co.nz', 'com.br', 'co.jp', 'com.mx', 'co.za', 'com.sg', 'co.in'])

export function registrableDomain(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, '').split('.')
  const last2 = parts.slice(-2).join('.')
  return TWO_PART_TLDS.has(last2) ? parts.slice(-3).join('.') : last2
}
