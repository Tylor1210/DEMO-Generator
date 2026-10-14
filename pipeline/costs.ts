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
  const price = table[model]
  // An unknown price would make the cap blind to this model, so refuse instead of guessing $0.
  if (!price) throw new Error(`No price known for model "${model}". Add it to MODEL_PRICES before using it.`)
  return price
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

// Hard cap. Before each call we reserve its worst case (all input tokens plus max_tokens of output).
// If the reservation would cross the cap, the call never happens. After the call we settle to the real cost.
// Calls that fail after the API may have billed keep the worst-case charge, so the ledger can only over-count.
// The Worker (Phase 3) must do the same reserve/settle as one atomic D1 statement.
const HARD_DEFAULT_CAP = 5

export function dailyCap(env: Env): number {
  const n = Number(env.DAILY_SPEND_CAP_USD)
  return Number.isFinite(n) && n > 0 ? n : HARD_DEFAULT_CAP
}

export async function reserveSpend(store: Store, env: Env, worstUsd: number): Promise<void> {
  const cap = dailyCap(env)
  const l = await readLedger(store)
  if (l.spentUsd + worstUsd > cap) {
    throw new CapReached(
      `Daily model spend cap: $${l.spentUsd.toFixed(2)} spent of $${cap.toFixed(2)}, and the next call could cost up to $${worstUsd.toFixed(2)}. The run is queued for tomorrow.`,
    )
  }
  l.spentUsd = Math.round((l.spentUsd + worstUsd) * 1e6) / 1e6
  l.calls += 1
  await store.write(ledgerPath(), JSON.stringify(l, null, 2), 'application/json')
}

/** Replace a reservation with the real cost (pass 0 when the API refused the request and billed nothing). */
export async function settleSpend(store: Store, reservedUsd: number, actualUsd: number): Promise<void> {
  const l = await readLedger(store)
  l.spentUsd = Math.max(0, Math.round((l.spentUsd - reservedUsd + actualUsd) * 1e6) / 1e6)
  await store.write(ledgerPath(), JSON.stringify(l, null, 2), 'application/json')
}

export async function spentToday(store: Store): Promise<number> {
  return (await readLedger(store)).spentUsd
}
