// The factory's L3 markdown, the config schema and the template must agree on names.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { SHAPES } from '../pipeline/schema.ts'

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const tableIds = (md: string) => [...md.matchAll(/^\|\s*([a-z][a-z0-9-]*)\s*\|/gm)].map(m => m[1]).filter(id => !['shape', 'id'].includes(id))

describe('factory stays in sync', () => {
  it('shape catalog, schema and template list the same shapes', () => {
    const catalog = tableIds(read('workspace/_config/shape-catalog.md')).sort()
    const template = read('template/src/scene/shapes.js').match(/const builders = \{([^}]+)\}/)![1].split(',').map(s => s.trim()).sort()
    expect(catalog).toEqual([...SHAPES].sort())
    expect(template).toEqual([...SHAPES].sort())
  })
  it('template font pairs match font-pairs.md (run npm run schema after editing it)', () => {
    const md = tableIds(read('workspace/_config/font-pairs.md')).sort()
    const json = Object.keys(JSON.parse(read('template/src/fontPairs.json'))).sort()
    expect(json).toEqual(md)
  })
})
