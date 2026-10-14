// The model writes brief.md through the runner's default agent path. This adds the live progress details.
import { runAgentDefault, type StageCtx } from '../../../../pipeline/runner.ts'

export async function run(ctx: StageCtx) {
  await runAgentDefault(ctx)
  const md = (await ctx.store.read(`runs/${ctx.runId}/stages/03_brief/output/brief.md`))!
  const text = new TextDecoder().decode(md)
  const section = (name: string) => text.split(new RegExp(`^## ${name}\\s*$`, 'm'))[1]?.split(/^## /m)[0] ?? ''
  const products = [...section('Hero products').matchAll(/^### (.+)$/gm)].map(m => m[1].trim())
  const objections = [...section('Beats').matchAll(/^### \w+:\s*(.+)$/gm)].map(m => m[1].trim())
  const evidence = (section('Evidence').match(/^### /gm) ?? []).length
  await ctx.progress({
    label: 'Writing your brief',
    details: [`${products.length} hero products, ${evidence} quoted facts`],
    products,
    objections,
  })
}
