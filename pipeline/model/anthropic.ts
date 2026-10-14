// Default provider: Anthropic API (pay as you go).
import Anthropic from '@anthropic-ai/sdk'
import type { Env, ModelAdapter, ModelRequest, ModelResult, Tier } from '../types.ts'
import { costOf } from '../costs.ts'

export function anthropicAdapter(env: Env): ModelAdapter {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2 })
  const modelFor = (tier: Tier) =>
    tier === 'strong' ? env.MODEL_STRONG || 'claude-opus-5-5' : env.MODEL_CHEAP || 'claude-haiku-5-5'
  const effort = (env.MODEL_EFFORT || 'medium') as 'low' | 'medium' | 'high'

  return {
    name: 'anthropic',
    modelFor,
    async generate(req: ModelRequest): Promise<ModelResult> {
      const model = modelFor(req.tier)
      // Server-side refusal fallback exists for Opus/Sonnet/Fable, not Haiku.
      const withFallback = /opus|sonnet|fable/.test(model)
      const res = await client.beta.messages.create({
        model,
        max_tokens: req.maxTokens ?? 16000,
        system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: req.user }],
        output_config: {
          effort,
          ...(req.jsonSchema ? { format: { type: 'json_schema', schema: req.jsonSchema as Record<string, unknown> } } : {}),
        },
        ...(withFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      })
      if (res.stop_reason === 'refusal') throw new Error(`Model declined the request (${res.stop_details?.category ?? 'no category'})`)
      if (res.stop_reason === 'max_tokens') throw new Error('Model output hit max_tokens; the stage output would be cut off')
      const text = res.content.map(b => (b.type === 'text' ? b.text : '')).join('')
      const u = res.usage
      const tokensIn = u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)
      const tokensOut = u.output_tokens
      let json: unknown
      if (req.jsonSchema) json = JSON.parse(text)
      return { text, json, model: res.model, tokensIn, tokensOut, costUsd: costOf(model, tokensIn, tokensOut, env) }
    },
  }
}
