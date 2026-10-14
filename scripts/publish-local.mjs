// Copies a demo built locally (demos/<slug>/ from the CLI) to Cloudflare: files to R2, a row in D1.
// Usage: node scripts/publish-local.mjs <slug> [--preset]
// Presets never expire and show up as example tiles on the home page.
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const [slug, flag] = process.argv.slice(2)
if (!/^[a-z0-9-]+$/.test(slug ?? '')) throw new Error('usage: node scripts/publish-local.mjs <slug> [--preset]')
const preset = flag === '--preset'
const root = new URL('..', import.meta.url).pathname
const dir = join(root, 'demos', slug)
const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'))
const cfg = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'))
const TYPES = { json: 'application/json', webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', avif: 'image/avif', gif: 'image/gif' }
const wrangler = (...args) => execFileSync('npx', ['wrangler', ...args], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] })

const files = ['config.json', 'meta.json', ...readdirSync(join(dir, 'assets')).map(f => `assets/${f}`)]
for (const f of files) {
  wrangler('r2', 'object', 'put', `tycodes-demos/demos/${slug}/${f}`, '--file', join(dir, f), '--content-type', TYPES[f.split('.').pop()] ?? 'application/octet-stream', '--remote')
  console.log('uploaded', f)
}
const q = s => `'${String(s).replace(/'/g, "''")}'`
const expires = preset ? 'NULL' : Date.parse(meta.expiresAt)
const sql = `INSERT OR REPLACE INTO runs (id, domain, url, status, stage, slug, preset, created_at, expires_at) VALUES (${q(meta.runId)}, ${q(cfg.domain)}, ${q(cfg.siteUrl)}, 'done', '06_publish', ${q(slug)}, ${preset ? 1 : 0}, ${Date.now()}, ${expires})`
wrangler('d1', 'execute', 'tycodes-demo-db', '--remote', '--command', sql)
console.log(`live: /d/${slug}${preset ? ' (preset)' : ''}`)
