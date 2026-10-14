import type { StageCtx } from '../../../../pipeline/runner.ts'
import type { BrandConfig } from '../../../../pipeline/schema.ts'
import { randomId, slugify } from '../../../../pipeline/lib/text.ts'

const CT: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' }

export async function run(ctx: StageCtx) {
  const config = (await ctx.inputJson<BrandConfig>('05_verify/output/brand.config.final.json'))!
  const prev = await ctx.store.read(`runs/${ctx.runId}/stages/06_publish/output/publish.json`)
  const slug = prev ? JSON.parse(new TextDecoder().decode(prev)).slug as string
    : `${slugify(config.brand, 30) || 'demo'}-${randomId(4)}`

  // Copy referenced images and rewrite run paths to assets/<file>.
  const copied = new Map<string, string>()
  const asset = async (runPath: string | null): Promise<string | null> => {
    if (!runPath) return null
    if (copied.has(runPath)) return copied.get(runPath)!
    const bytes = await ctx.input(runPath)
    if (!bytes) { ctx.log(`  missing image ${runPath}, dropped`); return null }
    const file = runPath.split('/').pop()!
    const name = runPath.startsWith('01_intake') ? `upload-${file}` : file
    await ctx.publicWrite(`demos/${slug}/assets/${name}`, bytes, CT[name.split('.').pop()!] ?? 'application/octet-stream')
    copied.set(runPath, `assets/${name}`)
    return `assets/${name}`
  }
  config.logo = await asset(config.logo)
  for (const p of config.products) {
    p.label = await asset(p.label)
    p.photo = await asset(p.photo)
    p.image = await asset(p.image)
    if (p.shape === 'photo' && !p.photo) p.photo = p.image
  }

  // A re-publish replaces the asset set; remove files the new config no longer uses.
  const keep = new Set([...copied.values()].map(a => `demos/${slug}/${a}`))
  for (const f of await ctx.publicList(`demos/${slug}/assets/`)) if (!keep.has(f)) await ctx.publicDelete(f)

  const ttlDays = Number(ctx.env.DEMO_TTL_DAYS ?? 30)
  const createdAt = new Date()
  const expiresAt = new Date(createdAt.getTime() + ttlDays * 864e5).toISOString()
  const host = ctx.env.PUBLIC_HOST ?? 'tycodes.app'
  const url = `https://${host}/d/${slug}`

  await ctx.publicWrite(`demos/${slug}/config.json`, JSON.stringify(config, null, 2), 'application/json')
  await ctx.publicWrite(`demos/${slug}/meta.json`, JSON.stringify({
    slug, runId: ctx.runId, brand: config.brand, domain: config.domain, status: 'ready',
    createdAt: createdAt.toISOString(), expiresAt, preset: false,
  }, null, 2), 'application/json')
  await ctx.output('06_publish/output/publish.json', JSON.stringify({ slug, url, expiresAt }, null, 2), 'application/json')
  await ctx.progress({ label: 'Publishing your demo', details: [`Live at /d/${slug}`] })
}
