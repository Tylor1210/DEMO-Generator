import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { parseContract, ContractError, globToRegExp } from '../pipeline/contract.ts'

const md = `---
stage: 03_brief
type: agent
model: strong
gate: review
label: Writing your brief
---
# 03 Brief

## Inputs
| Layer | Path | Why |
|---|---|---|
| L4 | \`02_collect/output/site.md\` | evidence |
| Layer 3 | _config/playbook.md | rules |
| L3 | \`shared/examples/*.json\` | examples |

## Process
1. Do the thing.

## Outputs
| Path | Why |
|---|---|
| \`03_brief/output/brief.md\` | the brief |
`

describe('parseContract', () => {
  it('reads front matter, inputs, outputs and process', () => {
    const c = parseContract(md)
    expect(c).toMatchObject({ stage: '03_brief', type: 'agent', model: 'strong', gate: 'review', label: 'Writing your brief' })
    expect(c.inputs).toEqual([
      { layer: 4, path: '02_collect/output/site.md', why: 'evidence' },
      { layer: 3, path: '_config/playbook.md', why: 'rules' },
      { layer: 3, path: 'shared/examples/*.json', why: 'examples' },
    ])
    expect(c.outputs).toEqual([{ path: '03_brief/output/brief.md', why: 'the brief' }])
    expect(c.process).toBe('1. Do the thing.')
  })

  it('defaults gate to auto and model to null for scripts', () => {
    const c = parseContract(md.replace('type: agent', 'type: script').replace('model: strong\n', '').replace('gate: review\n', ''))
    expect(c.gate).toBe('auto')
    expect(c.model).toBeNull()
  })

  it('rejects contracts that break the rules', () => {
    expect(() => parseContract(md.replace('type: agent', 'type: robot'))).toThrow(ContractError)
    expect(() => parseContract(md.replace('model: strong\n', ''))).toThrow(/need a model/)
    expect(() => parseContract(md.replace('## Inputs', '## Stuff'))).toThrow(/Inputs/)
    expect(() => parseContract(md.replace('03_brief/output/brief.md', '04_config/output/x.md'))).toThrow(/must live under/)
    expect(() => parseContract(md.replace('| L4 |', '| L9 |'))).toThrow(/layer/i)
  })

  it('editing the markdown changes what the stage loads', () => {
    const edited = md.replace('| Layer 3 | _config/playbook.md | rules |\n', '')
    expect(parseContract(edited).inputs.map(i => i.path)).not.toContain('_config/playbook.md')
  })

  it('parses every real contract in the workspace', () => {
    const dir = new URL('../workspace/stages/', import.meta.url)
    for (const stage of readdirSync(dir).filter(d => /^\d\d_/.test(d))) {
      const c = parseContract(readFileSync(new URL(`${stage}/CONTEXT.md`, dir), 'utf8'))
      expect(c.stage).toBe(stage)
      expect(c.inputs.length).toBeGreaterThan(0)
      expect(c.outputs.length).toBeGreaterThan(0)
    }
  })

  it('globs match one path segment', () => {
    expect(globToRegExp('shared/examples/*.json').test('shared/examples/bubble.config.json')).toBe(true)
    expect(globToRegExp('shared/examples/*.json').test('shared/examples/x/y.json')).toBe(false)
  })
})
