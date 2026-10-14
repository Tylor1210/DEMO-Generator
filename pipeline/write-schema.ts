// Writes generated files from their sources of truth:
// - workspace/_config/config-schema.json from the zod schema (L3 reference for the config stage)
// - template/src/fontPairs.json from workspace/_config/font-pairs.md (so the template loads what the factory lists)
import { readFileSync, writeFileSync } from 'node:fs'
import { configJsonSchema } from './schema.ts'

const schemaOut = new URL('../workspace/_config/config-schema.json', import.meta.url)
writeFileSync(schemaOut, JSON.stringify(configJsonSchema(), null, 1) + '\n')
console.log('wrote', schemaOut.pathname)

export function parseFontPairs(md: string) {
  const pairs: Record<string, { display: string; weight: number; body: string }> = {}
  for (const line of md.split('\n')) {
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
    if (cells.length < 4 || !/^[a-z][a-z0-9-]*$/.test(cells[0]) || cells[0] === 'id') continue
    pairs[cells[0]] = { display: cells[1], weight: Number(cells[2]), body: cells[3] }
  }
  return pairs
}

const pairs = parseFontPairs(readFileSync(new URL('../workspace/_config/font-pairs.md', import.meta.url), 'utf8'))
const fontsOut = new URL('../template/src/fontPairs.json', import.meta.url)
writeFileSync(fontsOut, JSON.stringify(pairs, null, 2) + '\n')
console.log('wrote', fontsOut.pathname, Object.keys(pairs).length, 'pairs')
