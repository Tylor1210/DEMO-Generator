// Token cost estimates and the daily spend cap.
// Prices are USD per 1M tokens (input, output), checked against Anthropic's model table on 2026-10-14.
// Override with MODEL_PRICES='{"model-id":[in,out]}' when prices change.
import type { Env, Store } from './types.ts'
import { CapReached } from './types.ts'

const DEFAULT_PRICES: Record<string, [number, number]> = {
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
}

export function priceFor(model: string, env: Env): [number, number] {
  let table = DEFAULT_PRICES
  if (env.MODEL_PRICES) {
    try { table = { ...table, ...JSON.parse(env.MODEL_PRICES) } } catch { /* keep defaults */ }
  }
  return table[model] ?? [0, 0]
}

export const costOf = (model: string, tin: number, tout: number, env: Env) => {
  const [pi, po] = priceFor(model, env)
  return (tin * pi + tout * po) / 1e6
}

const today = () => new Date().toISOString().slice(0, 10)
const ledgerPath = (day = today()) => `ledger/${day}.json`
const dec = new TextDecoder()

interface Ledger { spentUsd: number; calls: number }

async function readLedger(store: Store): Promise<Ledger> {
  const raw = await store.read(ledgerPath())
  return raw ? JSON.parse(dec.decode(raw)) : { spentUsd: 0, calls: 0 }
}

export async function assertUnderCap(store: Store, env: Env) {
  const cap = Number(env.DAILY_SPEND_CAP_USD ?? 5)
  const l = await readLedger(store)
  if (l.spentUsd >= cap) {
    throw new CapReached(`Daily model spend cap reached ($${l.spentUsd.toFixed(2)} of $${cap}). The run is queued for tomorrow.`)
  }
}

export async function recordSpend(store: Store, usd: number) {
  const l = await readLedger(store)
  l.spentUsd = Math.round((l.spentUsd + usd) * 1e6) / 1e6
  l.calls += 1
  await store.write(ledgerPath(), JSON.stringify(l, null, 2), 'application/json')
}
