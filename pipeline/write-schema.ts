// Writes the L3 schema file from the zod source of truth.
import { writeFileSync } from 'node:fs'
import { configJsonSchema } from './schema.ts'

const out = new URL('../workspace/_config/config-schema.json', import.meta.url)
writeFileSync(out, JSON.stringify(configJsonSchema(), null, 1) + '\n')
console.log('wrote', out.pathname)
