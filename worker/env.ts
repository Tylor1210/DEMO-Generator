import type { Deps, Services } from '../pipeline/runner.ts'
import type { Env as PipelineEnv, Store, Workspace } from '../pipeline/types.ts'
import { anthropicAdapter } from '../pipeline/model/anthropic.ts'
import { workersAiAdapter } from '../pipeline/model/workers-ai.ts'
import { registrableDomain } from '../pipeline/lib/net.ts'
import { FILES } from './generated/workspace.ts'

export interface Env {
  ASSETS: Fetcher
  BUCKET: R2Bucket
  DB: D1Database
  PIPELINE: Workflow<{ runId: string; from?: string }>
  AI?: any
  ANTHROPIC_API_KEY?: string
  [key: string]: unknown
}

// R2 implementation of the pipeline's Store. Keys match the local layout: runs/<id>/stages/..., demos/<slug>/...
export class R2Store implements Store {
  constructor(private bucket: R2Bucket) {}
  async read(path: string) {
    const o = await this.bucket.get(path)
    return o ? new Uint8Array(await o.arrayBuffer()) : null
  }
  async write(path: string, data: Uint8Array | string, contentType?: string) {
    await this.bucket.put(path, data, contentType ? { httpMetadata: { contentType } } : undefined)
  }
  async list(prefix: string) {
    const keys: string[] = []
    let cursor: string | undefined
    do {
      const r = await this.bucket.list({ prefix, cursor })
      keys.push(...r.objects.map(o => o.key))
      cursor = r.truncated ? r.cursor : undefined
    } while (cursor)
    return keys.sort()
  }
  async delete(path: string) { await this.bucket.delete(path) }
}

// The bundled workspace/ (same files the CLI reads from disk).
export const bundledWorkspace: Workspace = {
  async read(path) { return FILES[path] ?? null },
  async list(prefix) { return Object.keys(FILES).filter(k => k.startsWith(prefix)).sort() },
}

// Plain string settings for the pipeline (vars + secrets), without the bindings.
export function settings(env: Env): PipelineEnv {
  const out: PipelineEnv = {}
  for (const [k, v] of Object.entries(env)) if (typeof v === 'string') out[k] = v
  return out
}

export function services(env: Env): Services {
  return {
    async findRecentDemo(domain, sinceMs) {
      const row = await env.DB.prepare(
        `SELECT id, slug FROM runs WHERE domain = ? AND status = 'done' AND slug IS NOT NULL AND created_at >= ? ORDER BY created_at DESC LIMIT 1`,
      ).bind(registrableDomain(domain), sinceMs).first<{ id: string; slug: string }>()
      return row ? { slug: row.slug, runId: row.id, url: `https://${env.PUBLIC_HOST}/d/${row.slug}` } : null
    },
  }
}

export function deps(env: Env, log = (m: string) => console.log(m)): Deps {
  const s = settings(env)
  return {
    store: new R2Store(env.BUCKET),
    workspace: bundledWorkspace,
    env: s,
    model: () => (s.MODEL_PROVIDER === 'workers-ai' && env.AI ? workersAiAdapter(s, env.AI) : anthropicAdapter(s)),
    log,
    services: services(env),
  }
}
