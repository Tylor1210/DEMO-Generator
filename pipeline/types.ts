// Interfaces shared by the CLI (filesystem) and the Worker (R2/D1).

export interface Store {
  read(path: string): Promise<Uint8Array | null>
  write(path: string, data: Uint8Array | string, contentType?: string): Promise<void>
  list(prefix: string): Promise<string[]>
  delete?(path: string): Promise<void>
}

// Read-only access to the bundled workspace/ (L0 to L3 and contracts).
export interface Workspace {
  read(path: string): Promise<string | null>
  list(prefix: string): Promise<string[]>
}

export type Tier = 'strong' | 'cheap'

export interface ModelRequest {
  tier: Tier
  system: string
  user: string
  jsonSchema?: object
  maxTokens?: number
}
export interface ModelResult {
  text: string
  json?: unknown
  model: string
  tokensIn: number
  tokensOut: number
  costUsd: number
  /** Set when the call was billed but its output can't be used (refusal, cut off at max_tokens). */
  failure?: string
}
export interface ModelAdapter {
  name: string
  modelFor(tier: Tier): string
  generate(req: ModelRequest): Promise<ModelResult>
}

export interface Env {
  [key: string]: string | undefined
}

export interface StageStatus {
  status: 'pending' | 'running' | 'done' | 'failed' | 'blocked' | 'review'
  startedAt?: string
  ms?: number
  model?: string
  tokensIn?: number
  tokensOut?: number
  costUsd?: number
  contextTokensEst?: number
  error?: string
}

export interface Manifest {
  id: string
  url: string
  domain: string
  createdAt: string
  updatedAt: string
  status: 'running' | 'done' | 'failed' | 'blocked' | 'review' | 'queued'
  message?: string
  slug?: string
  stages: Record<string, StageStatus>
}

export interface Progress {
  label: string
  details: string[]
  swatches?: string[]
  products?: string[]
  objections?: string[]
  logo?: string | null
}

// Thrown when a stage needs the visitor or the owner to do something (blocked site, bad URL).
export class StageBlocked extends Error {
  constructor(message: string, public needs: string[] = []) { super(message) }
}
export class CapReached extends Error {}
