// Agent stage with structured JSON output, zod validation and one retry with the errors appended.
import { z } from 'zod'
import type { StageCtx } from '../../../../pipeline/runner.ts'
import { ConfigStageOutput, toStructuredSchema } from '../../../../pipeline/schema.ts'

const OUT = '04_config/output'

export async function run(ctx: StageCtx) {
  const ask = `Return one JSON object: {"config": <brand config matching _config/config-schema.json>, "notes": "<markdown>"}.`
  const { system, user } = await ctx.assemblePrompt(ask)
  let schema: object | undefined = toStructuredSchema(z.toJSONSchema(ConfigStageOutput, { target: 'draft-2020-12' }))

  let lastErr = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = attempt === 0 ? user
      : `${user}\n\nYour previous answer failed validation. Fix these problems and return the full JSON again:\n${lastErr}`
    let raw: unknown
    try {
      const r = await ctx.callModel(ctx.contract.model ?? 'strong', system, prompt, schema)
      raw = r.json ?? extractJson(r.text)
    } catch (e: any) {
      // Some providers reject large schemas. Fall back to prompt-only JSON and let zod do the checking.
      if (schema && /schema|output_config|format/i.test(e.message ?? '')) {
        ctx.log(`  structured output rejected (${e.message.slice(0, 120)}); retrying with plain JSON`)
        schema = undefined
        attempt--
        continue
      }
      throw e
    }
    const parsed = ConfigStageOutput.safeParse(raw)
    if (parsed.success) {
      const { config, notes } = parsed.data
      await ctx.output(`${OUT}/brand.config.json`, JSON.stringify(config, null, 2), 'application/json')
      await ctx.output(`${OUT}/config-notes.md`, notes.trim() + '\n', 'text/markdown')
      const pair = config.fonts.pair
      await ctx.progress({
        label: 'Designing your demo',
        details: [`Picked fonts: ${pair}`, `Hero product: ${config.products[config.featuredIndex]?.name ?? config.products[0].name}`],
        swatches: [config.theme.bg, config.theme.ink, config.theme.accent, config.theme.accent2],
        products: config.products.map(p => p.name),
      })
      return
    }
    lastErr = z.prettifyError(parsed.error)
    ctx.log(`  validation failed (attempt ${attempt + 1}):\n${lastErr.split('\n').slice(0, 8).join('\n')}`)
  }
  throw new Error(`Config did not match the schema after a retry:\n${lastErr}`)
}

function extractJson(text: string): unknown {
  const start = text.indexOf('{'), end = text.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('Model returned no JSON')
  return JSON.parse(text.slice(start, end + 1))
}
