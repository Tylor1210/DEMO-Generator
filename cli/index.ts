// Local runner: npm run pipeline -- --url https://brand.com
import { existsSync, readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { parseArgs, parseEnv } from 'node:util'
import { FsStore, FsWorkspace } from './fs.ts'
import { anthropicAdapter } from '../pipeline/model/anthropic.ts'
import { createRun, readManifest, runPipeline, writeManifest, STAGES, type Deps } from '../pipeline/runner.ts'
import { registrableDomain } from '../pipeline/lib/net.ts'
import { randomId, slugify, dec } from '../pipeline/lib/text.ts'
import { StageBlocked, CapReached, type Manifest } from '../pipeline/types.ts'

const ROOT = resolve(import.meta.dirname, '..')
// .env fills anything unset or empty (some shells export ANTHROPIC_API_KEY as an empty string).
if (existsSync(`${ROOT}/.env`)) {
  for (const [k, v] of Object.entries(parseEnv(readFileSync(`${ROOT}/.env`, 'utf8')))) if (!process.env[k]) process.env[k] = v
}

const HELP = `
tycodes demo pipeline (local)

New run:
  npm run pipeline -- --url https://brand.com [--ig URL] [--email you@x.com] [--owner]
                      [--image path:label|photo]... [--paste notes.txt] [--force] [--to 03_brief]
Re-run from a stage (reads current earlier outputs, including your edits):
  npm run pipeline -- --run <id> --from 04_config      (or --from 4)
Approve a run waiting for review (continues with the next stage):
  npm run pipeline -- --approve <id>
Inspect:
  npm run pipeline -- --run <id> --status
  npm run pipeline -- --list
`

const { values: a } = parseArgs({
  options: {
    url: { type: 'string' }, ig: { type: 'string' }, email: { type: 'string' }, owner: { type: 'boolean' },
    image: { type: 'string', multiple: true }, paste: { type: 'string' }, force: { type: 'boolean' },
    run: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, approve: { type: 'string' },
    status: { type: 'boolean' }, list: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  },
})

const store = new FsStore(ROOT)
const workspace = new FsWorkspace(`${ROOT}/workspace`)
const env = process.env as Record<string, string | undefined>

const deps: Deps = {
  store, workspace, env,
  model: () => {
    if ((env.MODEL_PROVIDER ?? 'anthropic') !== 'anthropic') throw new Error(`MODEL_PROVIDER=${env.MODEL_PROVIDER} is not available locally`)
    if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set. Add it to .env (see .env.example).')
    return anthropicAdapter(env)
  },
  log: m => console.log(m),
  services: {
    async findRecentDemo(domain, sinceMs) {
      for (const id of await runIds()) {
        const m = await readManifest(store, id)
        if (!m || m.status !== 'done' || Date.parse(m.createdAt) < sinceMs) continue
        if (registrableDomain(m.domain || 'x.x') !== domain) continue
        const pub = await store.read(`runs/${id}/stages/06_publish/output/publish.json`)
        if (pub) { const p = JSON.parse(dec.decode(pub)); return { slug: p.slug, url: p.url, runId: id } }
      }
      return null
    },
  },
}

async function runIds(): Promise<string[]> {
  const files = await store.list('runs/')
  return [...new Set(files.filter(f => f.endsWith('/manifest.json')).map(f => f.split('/')[1]))]
}

const stageArg = (s?: string) => {
  if (!s) return undefined
  const hit = STAGES.find(x => x === s || x.startsWith(s.padStart(2, '0')) || x.endsWith(`_${s}`))
  if (!hit) throw new Error(`Unknown stage "${s}". Use one of: ${STAGES.join(', ')}`)
  return hit
}

function printStatus(m: Manifest) {
  console.log(`\nrun ${m.id}  ${m.url}  [${m.status}]${m.message ? `\n  ${m.message}` : ''}`)
  for (const s of STAGES) {
    const st = m.stages[s]
    const bits = [st.status.padEnd(8)]
    if (st.ms != null) bits.push(`${(st.ms / 1000).toFixed(1)}s`)
    if (st.model) bits.push(`${st.model} ${st.tokensIn}/${st.tokensOut} tok $${(st.costUsd ?? 0).toFixed(4)}`)
    if (st.contextTokensEst) bits.push(`ctx~${st.contextTokensEst}`)
    console.log(`  ${s.padEnd(11)} ${bits.join('  ')}${st.error ? `\n              ${st.error.split('\n')[0]}` : ''}`)
  }
  console.log(`  files: runs/${m.id}/stages/<stage>/output/`)
}

async function execute(id: string, opts: { from?: string; to?: string }) {
  try {
    const m = await runPipeline(deps, id, opts)
    printStatus(m)
    if (m.status === 'done') {
      const pub = JSON.parse(dec.decode((await store.read(`runs/${id}/stages/06_publish/output/publish.json`))!))
      console.log(`\npublished: ${pub.url}  (local copy: demos/${pub.slug}/)`)
    }
    if (m.status === 'review') console.log(`\nWaiting for review. Edit any output, then: npm run pipeline -- --approve ${id}`)
  } catch (e: any) {
    const m = await readManifest(store, id)
    if (m) printStatus(m)
    if (e instanceof StageBlocked) console.log(`\nStopped: ${e.message}`)
    else if (e instanceof CapReached) console.log(`\nQueued: ${e.message}`)
    else { console.error(`\nFailed: ${e.message}`); process.exitCode = 1 }
  }
}

async function main() {
  if (a.help) return console.log(HELP)
  if (a.list) {
    for (const id of await runIds()) {
      const m = await readManifest(store, id)
      if (m) console.log(`${id.padEnd(34)} ${m.status.padEnd(8)} ${m.url}`)
    }
    return
  }
  if (a.approve) {
    const m = await readManifest(store, a.approve)
    if (!m) throw new Error(`No run ${a.approve}`)
    const waiting = STAGES.find(s => m.stages[s].status === 'review')
    if (!waiting) throw new Error(`Run ${a.approve} is not waiting for review (status ${m.status})`)
    m.stages[waiting].status = 'done'
    await writeManifest(store, m)
    const next = STAGES[STAGES.indexOf(waiting) + 1]
    console.log(`approved ${waiting}; continuing from ${next}`)
    return execute(a.approve, { from: next, to: stageArg(a.to) })
  }
  if (a.run) {
    const m = await readManifest(store, a.run)
    if (!m) throw new Error(`No run ${a.run}. Try --list.`)
    if (a.status || !a.from) return printStatus(m)
    return execute(a.run, { from: stageArg(a.from), to: stageArg(a.to) })
  }
  if (!a.url) return console.log(HELP)

  let host = a.url
  try { host = new URL(/^https?:/.test(a.url) ? a.url : `https://${a.url}`).hostname } catch { /* intake reports */ }
  const id = `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${slugify(host.replace(/^www\./, '').split('.')[0], 20)}-${randomId(4)}`

  const images = (a.image ?? []).map(spec => {
    const i = spec.lastIndexOf(':')
    const [path, kind] = i > 0 ? [spec.slice(0, i), spec.slice(i + 1)] : [spec, 'photo']
    if (kind !== 'label' && kind !== 'photo') throw new Error(`--image ${spec}: kind must be label or photo`)
    return { path: resolve(path), kind: kind as 'label' | 'photo' }
  })
  const payload = {
    url: a.url, igUrl: a.ig, email: a.email, ownerClaim: !!a.owner, force: !!a.force,
    pasted: a.paste ? readFileSync(resolve(a.paste), 'utf8') : undefined,
    images: images.map(i => ({ file: basename(i.path), kind: i.kind })),
  }
  await createRun(store, payload, id)
  for (const i of images) await store.write(`runs/${id}/stages/01_intake/input/uploads/${basename(i.path)}`, readFileSync(i.path))
  console.log(`run ${id}`)
  await execute(id, { to: stageArg(a.to) })
}

main().catch(e => { console.error(e.message); process.exitCode = 1 })
