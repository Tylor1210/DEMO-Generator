// Stage runner: loads a contract, gives the stage only its declared inputs, runs it, records the manifest.
import { parseContract, globToRegExp, isGlob, type Contract } from './contract.ts'
import type { Env, Manifest, ModelAdapter, ModelResult, Progress, Store, Tier, Workspace } from './types.ts'
import { CapReached, StageBlocked } from './types.ts'
import { costOf, reserveSpend, settleSpend } from './costs.ts'
import { dec, enc, estTokens } from './lib/text.ts'
import { STAGE_IMPLS } from './registry.ts'

export const STAGES = ['01_intake', '02_collect', '03_brief', '04_config', '05_verify', '06_publish'] as const
export type StageName = (typeof STAGES)[number]

export const runRoot = (runId: string) => `runs/${runId}`
export const stagePath = (runId: string, rel: string) => `runs/${runId}/stages/${rel}`
export const manifestPath = (runId: string) => `runs/${runId}/manifest.json`

const CONTEXT_BUDGET = 10_000
const MAX_OUTPUT_TOKENS = 16_000

export interface Deps {
  store: Store
  workspace: Workspace
  env: Env
  model: () => ModelAdapter
  log?: (msg: string) => void
  /** Cross-run lookups the store can answer (dedupe). */
  services?: Services
}

export interface Services {
  findRecentDemo(domain: string, sinceMs: number): Promise<{ slug: string; url: string; runId: string } | null>
}

export interface StageCtx {
  runId: string
  contract: Contract
  env: Env
  store: Store
  log: (msg: string) => void
  /** Read a declared L4 input (path relative to runs/<id>/stages/). Throws if the contract doesn't list it. */
  input(rel: string): Promise<Uint8Array | null>
  inputText(rel: string): Promise<string | null>
  inputJson<T = any>(rel: string): Promise<T | null>
  /** List files under a declared L4 directory input. */
  listInput(relDir: string): Promise<string[]>
  /** Read a declared L3 file from the workspace. */
  reference(path: string): Promise<string | null>
  /** Write an output. Must be listed in Outputs, or sit under a listed directory output. */
  output(rel: string, data: Uint8Array | string, contentType?: string): Promise<void>
  progress(p: Progress): Promise<void>
  /** Send the run to human review after this stage (verify uses this when it drops too much). */
  flagReview(reason: string): void
  /** Build the labeled L0 to L4 prompt from the contract. */
  assemblePrompt(extraUser?: string): Promise<{ system: string; user: string; tokens: number }>
  callModel(tier: Tier, system: string, user: string, jsonSchema?: object): Promise<ModelResult>
  manifest(): Promise<Manifest>
  services: Services
  /** Write under demos/ (06_publish only). */
  publicWrite(path: string, data: Uint8Array | string, contentType?: string): Promise<void>
  publicList(prefix: string): Promise<string[]>
  publicDelete(path: string): Promise<void>
}

export interface StageImpl {
  run?: (ctx: StageCtx) => Promise<void>
}

// ---------- manifest ----------

export async function readManifest(store: Store, runId: string): Promise<Manifest | null> {
  const raw = await store.read(manifestPath(runId))
  return raw ? JSON.parse(dec.decode(raw)) : null
}
export async function writeManifest(store: Store, m: Manifest) {
  m.updatedAt = new Date().toISOString()
  await store.write(manifestPath(m.id), JSON.stringify(m, null, 2), 'application/json')
}

export async function loadContract(ws: Workspace, stage: string): Promise<Contract> {
  const md = await ws.read(`stages/${stage}/CONTEXT.md`)
  if (!md) throw new Error(`No contract at workspace/stages/${stage}/CONTEXT.md`)
  return parseContract(md, stage)
}

// ---------- context ----------

interface Usage { tin: number; tout: number; cost: number; model?: string; ctxTokens?: number; review?: string }

function makeCtx(deps: Deps, runId: string, contract: Contract, usage: Usage): StageCtx {
  const { store, workspace, env } = deps
  const log = deps.log ?? (() => {})
  const l4 = contract.inputs.filter(i => i.layer === 4)
  const l3 = contract.inputs.filter(i => i.layer === 3)

  const declared = (rel: string) => l4.some(i =>
    isGlob(i.path) ? globToRegExp(i.path).test(rel) : i.path === rel || (i.path.endsWith('/') && rel.startsWith(i.path)))
  const assertDeclared = (rel: string) => {
    if (!declared(rel)) throw new Error(`${contract.stage} tried to read ${rel}, which is not in its Inputs table`)
  }
  const outputAllowed = (rel: string) => rel.endsWith('progress.json') && rel.startsWith(`${contract.stage}/output/`) ||
    contract.outputs.some(o => o.path === rel || (o.path.endsWith('/') && rel.startsWith(o.path)))

  const ctx: StageCtx = {
    runId, contract, env, store, log,
    async input(rel) { assertDeclared(rel); return store.read(stagePath(runId, rel)) },
    async inputText(rel) { const b = await ctx.input(rel); return b ? dec.decode(b) : null },
    async inputJson(rel) { const t = await ctx.inputText(rel); return t ? JSON.parse(t) : null },
    async listInput(relDir) {
      assertDeclared(relDir)
      const prefix = stagePath(runId, relDir)
      return (await store.list(prefix)).map(p => p.slice(stagePath(runId, '').length))
    },
    async reference(path) {
      if (!l3.some(i => (isGlob(i.path) ? globToRegExp(i.path).test(path) : i.path === path))) {
        throw new Error(`${contract.stage} tried to read reference ${path}, which is not in its Inputs table`)
      }
      return workspace.read(path)
    },
    async output(rel, data, ct) {
      if (!outputAllowed(rel)) throw new Error(`${contract.stage} tried to write ${rel}, which is not in its Outputs table`)
      await store.write(stagePath(runId, rel), data, ct)
    },
    async progress(p) {
      await store.write(stagePath(runId, `${contract.stage}/output/progress.json`), JSON.stringify(p, null, 2), 'application/json')
    },
    async assemblePrompt(extraUser = '') {
      const block = (title: string, body: string) => `=== ${title} ===\n${body.trim()}\n`
      const l0 = (await workspace.read('CLAUDE.md')) ?? ''
      const l1 = (await workspace.read('CONTEXT.md')) ?? ''
      const l2 = (await workspace.read(`stages/${contract.stage}/CONTEXT.md`)) ?? ''
      const refs: string[] = []
      for (const i of l3) {
        const paths = isGlob(i.path)
          ? (await workspace.list(i.path.slice(0, i.path.lastIndexOf('/') + 1))).filter(p => globToRegExp(i.path).test(p)).sort()
          : [i.path]
        for (const p of paths) {
          const t = await workspace.read(p)
          if (t == null) throw new Error(`Reference ${p} is missing from the workspace`)
          refs.push(`--- ${p} ---\n${p.endsWith('.json') ? JSON.stringify(JSON.parse(t)) : t.trim()}`)
        }
      }
      const work: string[] = []
      for (const i of l4) {
        if (i.path.endsWith('/') || isGlob(i.path)) continue // directories (images, uploads) are not text inputs
        const t = await store.read(stagePath(runId, i.path))
        if (t == null) throw new Error(`Input ${i.path} is missing. Run the earlier stage first.`)
        const s = dec.decode(t)
        work.push(`--- ${i.path} ---\n${i.path.endsWith('.json') ? JSON.stringify(JSON.parse(s)) : s.trim()}`)
      }
      const system = [
        block('L0: workspace/CLAUDE.md', l0),
        block('L1: workspace/CONTEXT.md', l1),
        block(`L2: stages/${contract.stage}/CONTEXT.md`, l2),
        block('REFERENCE (internalize as constraints)', refs.join('\n\n')),
      ].join('\n')
      const user = block('WORKING INPUT (process this)', work.join('\n\n')) + (extraUser ? `\n${extraUser}` : '')
      const tokens = estTokens(system + user)
      usage.ctxTokens = tokens
      // Exactly what the model sees, kept next to the outputs for inspection (not an output itself).
      await store.write(stagePath(runId, `${contract.stage}/prompt.md`), `<!-- ~${tokens} tokens -->\n# SYSTEM\n\n${system}\n\n# USER\n\n${user}\n`, 'text/markdown')
      if (tokens > CONTEXT_BUDGET) log(`  warning: ${contract.stage} context is about ${tokens} tokens (budget ${CONTEXT_BUDGET})`)
      return { system, user, tokens }
    },
    async callModel(tier, system, user, jsonSchema) {
      const adapter = deps.model()
      const model = adapter.modelFor(tier)
      // Worst case: estimated input plus a 25% margin, and every allowed output token.
      const worst = adapter.name === 'workers-ai' ? 0
        : costOf(model, Math.ceil(estTokens(system + user + JSON.stringify(jsonSchema ?? '')) * 1.25), MAX_OUTPUT_TOKENS, env)
      await reserveSpend(store, env, worst)
      let r: ModelResult
      try {
        r = await adapter.generate({ tier, system, user, jsonSchema, maxTokens: MAX_OUTPUT_TOKENS })
      } catch (e: any) {
        // A 4xx means the API rejected the request and billed nothing. Anything else keeps the worst-case charge.
        if (typeof e?.status === 'number' && e.status >= 400 && e.status < 500) await settleSpend(store, worst, 0)
        throw e
      }
      await settleSpend(store, worst, r.costUsd)
      usage.tin += r.tokensIn; usage.tout += r.tokensOut; usage.cost += r.costUsd; usage.model = r.model
      log(`  ${r.model}: ${r.tokensIn} in / ${r.tokensOut} out, $${r.costUsd.toFixed(4)}`)
      if (r.failure) throw new Error(r.failure)
      return r
    },
    flagReview(reason) { usage.review = reason },
    services: deps.services ?? { findRecentDemo: async () => null },
    async publicWrite(path, data, ct) {
      if (contract.stage !== '06_publish' || !path.startsWith('demos/')) throw new Error(`${contract.stage} cannot write ${path}`)
      await store.write(path, data, ct)
    },
    async publicList(prefix) {
      if (!prefix.startsWith('demos/')) throw new Error(`${contract.stage} cannot list ${prefix}`)
      return store.list(prefix)
    },
    async publicDelete(path) {
      if (contract.stage !== '06_publish' || !path.startsWith('demos/')) throw new Error(`${contract.stage} cannot delete ${path}`)
      await store.delete?.(path)
    },
    async manifest() { return (await readManifest(store, runId))! },
  }
  return ctx
}

// Default agent behaviour: ask for every output inside <file path="..."> tags and write them.
export async function runAgentDefault(ctx: StageCtx) {
  const paths = ctx.contract.outputs.map(o => o.path)
  const instructions = `Return each output file inside its own tag, exactly like this:\n` +
    paths.map(p => `<file path="${p}">\n...\n</file>`).join('\n') + `\nWrite nothing outside the tags.`
  const { system, user } = await ctx.assemblePrompt(instructions)
  const r = await ctx.callModel(ctx.contract.model as Tier, system, user)
  const files = parseFileBlocks(r.text)
  for (const p of paths) {
    if (files[p] == null) throw new Error(`Model did not return ${p}`)
    await ctx.output(p, files[p].trim() + '\n')
  }
}

export function parseFileBlocks(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /<file path="([^"]+)">\r?\n?([\s\S]*?)<\/file>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) out[m[1]] = m[2]
  return out
}

// ---------- run ----------

export async function runStage(deps: Deps, runId: string, stage: string): Promise<void> {
  const log = deps.log ?? (() => {})
  const contract = await loadContract(deps.workspace, stage)
  const m = (await readManifest(deps.store, runId))!
  const usage: Usage = { tin: 0, tout: 0, cost: 0 }
  const started = Date.now()
  m.stages[stage] = { status: 'running', startedAt: new Date().toISOString() }
  m.status = 'running'
  await writeManifest(deps.store, m)
  log(`> ${stage} (${contract.type}${contract.model ? `, ${contract.model}` : ''})`)

  const ctx = makeCtx(deps, runId, contract, usage)
  const impl = STAGE_IMPLS[stage]
  const finish = async (patch: Partial<Manifest['stages'][string]>) => {
    const cur = (await readManifest(deps.store, runId))!
    cur.stages[stage] = {
      ...cur.stages[stage], ...patch, ms: Date.now() - started,
      model: usage.model, tokensIn: usage.tin, tokensOut: usage.tout, costUsd: Math.round(usage.cost * 1e6) / 1e6,
      contextTokensEst: usage.ctxTokens,
    }
    cur.message = usage.review ? `review: ${usage.review}` : undefined
    return cur
  }
  try {
    if (impl?.run) await impl.run(ctx)
    else if (contract.type === 'agent') await runAgentDefault(ctx)
    else throw new Error(`${stage} is a script stage but has no script registered`)
    for (const o of contract.outputs) {
      if (o.path.endsWith('/')) continue
      if (!(await deps.store.read(stagePath(runId, o.path)))) throw new Error(`${stage} finished without writing ${o.path}`)
    }
    const cur = await finish({ status: 'done' })
    await writeManifest(deps.store, cur)
    log(`  done in ${((Date.now() - started) / 1000).toFixed(1)}s`)
  } catch (e: any) {
    const blocked = e instanceof StageBlocked
    const capped = e instanceof CapReached
    const cur = await finish({ status: blocked ? 'blocked' : 'failed', error: e.message })
    cur.status = blocked ? 'blocked' : capped ? 'queued' : 'failed'
    cur.message = e.message
    await writeManifest(deps.store, cur)
    throw e
  }
}

export interface RunOptions { from?: string; to?: string; reviewMode?: 'auto' | 'manual' }

export async function runPipeline(deps: Deps, runId: string, opts: RunOptions = {}): Promise<Manifest> {
  const fromIdx = opts.from ? STAGES.findIndex(s => s === opts.from) : 0
  const toIdx = opts.to ? STAGES.findIndex(s => s === opts.to) : STAGES.length - 1
  if (fromIdx < 0 || toIdx < 0) throw new Error(`Unknown stage. Use one of: ${STAGES.join(', ')}`)
  // Re-running from N invalidates N and everything after it.
  const m = (await readManifest(deps.store, runId))!
  for (const s of STAGES.slice(fromIdx)) m.stages[s] = { status: 'pending' }
  await writeManifest(deps.store, m)

  for (const stage of STAGES.slice(fromIdx, toIdx + 1)) {
    await runStage(deps, runId, stage)
    const contract = await loadContract(deps.workspace, stage)
    const cur = (await readManifest(deps.store, runId))!
    const needsReview = (contract.gate === 'review' && (opts.reviewMode ?? deps.env.REVIEW_MODE) === 'manual') ||
      (stage === '05_verify' && cur.message?.startsWith('review:'))
    if (needsReview && stage !== STAGES[toIdx]) {
      cur.stages[stage].status = 'review'
      cur.status = 'review'
      cur.message = cur.message?.startsWith('review:') ? cur.message : `review: check ${stage}/output and approve to continue`
      await writeManifest(deps.store, cur)
      return cur
    }
  }
  const done = (await readManifest(deps.store, runId))!
  done.status = toIdx === STAGES.length - 1 ? 'done' : 'running'
  if (done.status === 'done') done.message = undefined
  await writeManifest(deps.store, done)
  return done
}

export async function createRun(store: Store, payload: object & { url: string }, runId: string): Promise<Manifest> {
  const now = new Date().toISOString()
  let domain = ''
  try { domain = new URL(/^https?:/.test(payload.url) ? payload.url : `https://${payload.url}`).hostname } catch { /* intake reports it */ }
  const m: Manifest = {
    id: runId, url: payload.url, domain, createdAt: now, updatedAt: now, status: 'running',
    stages: Object.fromEntries(STAGES.map(s => [s, { status: 'pending' as const }])),
  }
  await store.write(stagePath(runId, '01_intake/input/payload.json'), enc.encode(JSON.stringify(payload, null, 2)), 'application/json')
  await writeManifest(store, m)
  return m
}
