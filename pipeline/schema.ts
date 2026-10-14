// The brand config contract between the pipeline and the template.
// zod is the source of truth. `npm run schema` writes workspace/_config/config-schema.json from it.
import { z } from 'zod'

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'hex color like #ff5a3c')
const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase slug')

export const SHAPES = ['can', 'bottle', 'dropper', 'jar', 'tube', 'tub', 'photo'] as const
export const BEAT_IDS = ['safe', 'fit', 'price', 'where'] as const

export const Evidence = z.object({
  id: z.string().describe('E1, E2, ... as in brief.md'),
  claim: z.string().describe('the fact in plain words'),
  quote: z.string().describe('exact text copied from site.md, max 200 chars'),
  sourceUrl: z.string().describe('page URL heading the quote in site.md, or owner:upload / owner:pasted'),
})

export const Product = z.object({
  id,
  name: z.string(),
  type: z.string().describe('what it is, in the brand words: "Probiotic Soda", "Gel Cleanser"'),
  size: z.string().nullable(),
  price: z.number().nullable().describe('regular price as shown on the site, null if not found'),
  shape: z.enum(SHAPES),
  color: hex,
  deep: hex,
  ink: hex,
  label: z.string().nullable().describe('run path of uploaded label artwork, or null'),
  photo: z.string().nullable().describe('run path of a product photo when shape is photo, else null'),
  image: z.string().nullable().describe('run path of the scraped product image, for cards and the static fallback'),
  url: z.string().nullable().describe('product page on the brand site'),
  notes: z.array(z.string()).max(4).describe('2 to 5 word facts for the detail panel'),
  noteIds: z.array(z.string()).describe('evidence id for each note, same order'),
  tags: z.array(z.string()).describe('filter option ids this product fits'),
})

export const FilterOption = z.object({ id, label: z.string(), pick: z.string().describe('product id') })
export const Filter = z.object({
  label: z.string().describe('"Skin type", "Flavor mood", "Heat level"'),
  options: z.array(FilterOption).max(5),
})

export const Claim = z.object({ text: z.string(), claimId: z.string() })
export const Retailer = z.object({ name: z.string(), url: z.string().nullable(), claimId: z.string().nullable() })

export const Beat = z.object({
  id: z.enum(BEAT_IDS),
  question: z.string(),
  title: z.string(),
  body: z.string(),
  proof: z.enum(['claims', 'filter', 'price', 'retailers', 'products']),
  claimIds: z.array(z.string()),
})

export const BrandConfig = z.object({
  version: z.literal(1),
  brand: z.string(),
  wordmark: z.string().describe('how the logo text reads, e.g. "bubble" or "CULTURE POP"'),
  logo: z.string().nullable().describe('run path of the re-hosted logo image, or null'),
  domain: z.string(),
  siteUrl: z.string(),
  checkoutUrl: z.string().describe('brand site shop page; checkout always happens on the brand site'),
  storeLocatorUrl: z.string().nullable(),
  igUrl: z.string().nullable(),
  currency: z.string(),
  category: z.string(),
  theme: z.object({ bg: hex, ink: hex, accent: hex, accent2: hex }),
  fonts: z.object({ pair: z.string().describe('id from font-pairs.md') }),
  hero: z.object({
    kicker: z.string(),
    headline: z.string(),
    sub: z.string(),
    subIds: z.array(z.string()).describe('evidence ids backing the sub line'),
    primaryCta: z.string(),
    secondaryCta: z.string(),
  }),
  featuredIndex: z.number().int().min(0),
  products: z.array(Product).min(1).max(6),
  filter: Filter.nullable(),
  claims: z.array(Claim).max(6),
  retailers: z.array(Retailer).max(8),
  reviews: z.object({
    rating: z.number().nullable(),
    count: z.number().nullable(),
    quotes: z.array(z.object({ text: z.string(), author: z.string(), sourceUrl: z.string() })),
  }),
  beats: z.array(Beat).length(4),
  offer: z.object({
    big: z.string().describe('2 or 3 words, uppercase'),
    title: z.string(),
    sub: z.string(),
    cta: z.string(),
    zipLabel: z.string(),
    isDemo: z.boolean(),
    claimId: z.string().nullable(),
  }),
  shop: z.object({
    title: z.string(),
    sub: z.string(),
    bundleLabel: z.string().describe('"routine", "pack", "bundle"'),
    bundleSize: z.number().int().min(2).max(6),
    bundleDiscount: z.number().min(0).max(0.5),
  }),
  evidence: z.array(Evidence),
  credit: z.string(),
})

export type BrandConfig = z.infer<typeof BrandConfig>
export type EvidenceT = z.infer<typeof Evidence>

export const ConfigStageOutput = z.object({
  config: BrandConfig,
  notes: z.string().describe('markdown: the choices made and why'),
})

export const creditLine = (brand: string) =>
  `Concept demo by tycodes.dev. Not affiliated with or endorsed by ${brand}.`

// JSON Schema for docs (L3) and for the model's structured output.
export function configJsonSchema() {
  return z.toJSONSchema(BrandConfig, { target: 'draft-2020-12' })
}

// Structured outputs accept a subset of JSON Schema. Strip validation-only keywords
// (zod still enforces them after the call) and make every object closed and fully required.
export function toStructuredSchema(schema: any): any {
  const DROP = new Set(['pattern', 'minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum',
    'exclusiveMaximum', 'minItems', 'maxItems', 'format', '$schema', 'default'])
  const walk = (n: any): any => {
    if (Array.isArray(n)) return n.map(walk)
    if (!n || typeof n !== 'object') return n
    const out: any = {}
    for (const [k, v] of Object.entries(n)) {
      if (DROP.has(k)) continue
      out[k] = k === 'properties'
        ? Object.fromEntries(Object.entries(v as object).map(([pk, pv]) => [pk, walk(pv)]))
        : walk(v)
    }
    if (out.type === 'object' && out.properties) {
      out.additionalProperties = false
      out.required = Object.keys(out.properties)
    }
    return out
  }
  return walk(schema)
}
