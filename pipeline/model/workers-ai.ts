// Fallback provider for the Worker: Workers AI (free daily allocation).
// Only usable inside a Worker with an `AI` binding. Model ids come from WORKERS_AI_STRONG / WORKERS_AI_CHEAP.
import type { Env, ModelAdapter, ModelRequest, ModelResult, Tier } from '../types.ts'

interface AiBinding { run(model: string, input: unknown): Promise<any> }

export function workersAiAdapter(env: Env, ai: AiBinding): ModelAdapter {
  const modelFor = (tier: Tier) =>
    (tier === 'strong' ? env.WORKERS_AI_STRONG : env.WORKERS_AI_CHEAP) || '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
  return {
    name: 'workers-ai',
    modelFor,
    async generate(req: ModelRequest): Promise<ModelResult> {
      const model = modelFor(req.tier)
      const out = await ai.run(model, {
        messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.user }],
        max_tokens: req.maxTokens ?? 8000,
        ...(req.jsonSchema ? { response_format: { type: 'json_schema', json_schema: req.jsonSchema } } : {}),
      })
      const text = typeof out.response === 'string' ? out.response : JSON.stringify(out.response)
      const json = req.jsonSchema ? (typeof out.response === 'string' ? JSON.parse(out.response) : out.response) : undefined
      return {
        text, json, model,
        tokensIn: out.usage?.prompt_tokens ?? 0,
        tokensOut: out.usage?.completion_tokens ?? 0,
        costUsd: 0,
      }
    },
  }
}
