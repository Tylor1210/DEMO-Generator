import { describe, expect, it } from 'vitest'
import { dailyCap, priceFor, reserveSpend, settleSpend, spentToday } from '../pipeline/costs.ts'
import { CapReached, type Store } from '../pipeline/types.ts'

function memStore(): Store {
  const m = new Map<string, Uint8Array>()
  const enc = new TextEncoder()
  return {
    async read(p) { return m.get(p) ?? null },
    async write(p, d) { m.set(p, typeof d === 'string' ? enc.encode(d) : d) },
    async list(prefix) { return [...m.keys()].filter(k => k.startsWith(prefix)) },
  }
}

describe('hard spend cap', () => {
  it('refuses a call whose worst case would cross the cap, before it is made', async () => {
    const store = memStore(), env = { DAILY_SPEND_CAP_USD: '1' }
    await reserveSpend(store, env, 0.4); await settleSpend(store, 0.4, 0.3) // spent 0.30
    await reserveSpend(store, env, 0.4); await settleSpend(store, 0.4, 0.3) // spent 0.60
    await expect(reserveSpend(store, env, 0.41)).rejects.toBeInstanceOf(CapReached) // 0.60 + 0.41 > 1
    expect(await spentToday(store)).toBeCloseTo(0.6)
  })

  it('never lets real spend pass the cap, even when every call costs its full worst case', async () => {
    const store = memStore(), env = { DAILY_SPEND_CAP_USD: '5' }
    let calls = 0
    try { for (;;) { await reserveSpend(store, env, 0.4); await settleSpend(store, 0.4, 0.4); calls++ } } catch { /* cap */ }
    expect(calls).toBe(12)
    expect(await spentToday(store)).toBeLessThanOrEqual(5)
  })

  it('a failed call that may have billed keeps its worst-case charge', async () => {
    const store = memStore(), env = { DAILY_SPEND_CAP_USD: '5' }
    await reserveSpend(store, env, 0.4) // no settle: the call threw without a 4xx
    expect(await spentToday(store)).toBeCloseTo(0.4)
  })

  it('falls back to $5 when the setting is missing or broken, never to unlimited', () => {
    expect(dailyCap({})).toBe(5)
    expect(dailyCap({ DAILY_SPEND_CAP_USD: 'abc' })).toBe(5)
    expect(dailyCap({ DAILY_SPEND_CAP_USD: '0' })).toBe(5)
    expect(dailyCap({ DAILY_SPEND_CAP_USD: '2' })).toBe(2)
  })

  it('refuses models with no known price instead of counting them as free', () => {
    expect(() => priceFor('claude-mystery-9', {})).toThrow(/No price/)
  })
})
