// Progress and ETA for the build page (BUILD_PROMPT 1d).
// The API returns per-stage timing; the page animates the bar between polls with the same formula.
import { STAGES } from '../pipeline/runner.ts'
import { parseContract } from '../pipeline/contract.ts'
import type { Manifest, Progress } from '../pipeline/types.ts'
import type { Env } from './env.ts'
import { FILES } from './generated/workspace.ts'

// Seed expectations (ms) until there are real runs to take medians from.
const SEED: Record<string, number> = { '01_intake': 2000, '02_collect': 15000, '03_brief': 25000, '04_config': 20000, '05_verify': 8000, '06_publish': 3000 }

export const LABELS: Record<string, string> = Object.fromEntries(
  STAGES.map(s => [s, parseContract(FILES[`stages/${s}/CONTEXT.md`], s).label]),
)

let cached: { at: number; medians: Record<string, number> } | null = null

// Rolling median of the last 50 successful runs per stage, cached per isolate for a minute.
export async function expectedDurations(env: Env): Promise<Record<string, number>> {
  if (cached && Date.now() - cached.at < 60_000) return cached.medians
  const medians = { ...SEED }
  const rows = await env.DB.prepare(
    `SELECT stage, ms FROM (SELECT stage, ms, ROW_NUMBER() OVER (PARTITION BY stage ORDER BY created_at DESC) AS n FROM stage_timings) WHERE n <= 50`,
  ).all<{ stage: string; ms: number }>()
  const by: Record<string, number[]> = {}
  for (const r of rows.results ?? []) (by[r.stage] ??= []).push(r.ms)
  for (const [stage, list] of Object.entries(by)) {
    if (list.length >= 3) { list.sort((a, b) => a - b); medians[stage] = list[Math.floor(list.length / 2)] }
  }
  cached = { at: Date.now(), medians }
  return medians
}

export interface RunProgress {
  id: string
  site: string
  status: Manifest['status']
  message: string | null
  serverNow: number
  stages: { id: string; label: string; status: string; expectedMs: number; startedAt: number | null; ms: number | null }[]
  details: Progress & { objections?: string[] }
  slug: string | null
  url: string | null
}

export async function runProgress(env: Env, m: Manifest, readJson: (k: string) => Promise<any>, slug: string | null): Promise<RunProgress> {
  const expected = await expectedDurations(env)
  // Merge the progress.json files of finished and running stages, newest last.
  const details: RunProgress['details'] = { label: '', details: [], swatches: [], products: [], objections: [] }
  for (const s of STAGES) {
    const st = m.stages[s]?.status
    if (st !== 'done' && st !== 'running' && st !== 'review') continue
    const p = await readJson(`runs/${m.id}/stages/${s}/output/progress.json`)
    if (!p) continue
    details.label = p.label || details.label
    details.details = [...details.details, ...(p.details ?? [])].slice(-6)
    if (p.swatches?.length) details.swatches = p.swatches
    if (p.products?.length) details.products = p.products
    if (p.objections?.length) details.objections = p.objections
    if (p.logo) details.logo = p.logo
  }
  return {
    id: m.id,
    site: m.url,
    status: m.status,
    message: m.message ?? null,
    serverNow: Date.now(),
    stages: STAGES.map(s => {
      const st = m.stages[s] ?? { status: 'pending' }
      return {
        id: s, label: LABELS[s], status: st.status, expectedMs: expected[s] ?? 5000,
        startedAt: st.startedAt ? Date.parse(st.startedAt) : null, ms: st.ms ?? null,
      }
    }),
    details,
    slug,
    url: slug ? `/d/${slug}` : null,
  }
}
