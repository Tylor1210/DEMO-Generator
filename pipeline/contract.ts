// Parses an ICM stage contract (stages/NN_name/CONTEXT.md).
// The Inputs table is the control point: the runner loads exactly these files and nothing else.

export type Layer = 3 | 4
export interface InputRef { layer: Layer; path: string; why: string }
export interface OutputRef { path: string; why: string }
export interface Contract {
  stage: string
  type: 'script' | 'agent'
  model: 'strong' | 'mid' | 'cheap' | null
  gate: 'auto' | 'review'
  label: string
  meta: Record<string, string>
  inputs: InputRef[]
  outputs: OutputRef[]
  process: string
}

export class ContractError extends Error {}

function frontMatter(md: string): { meta: Record<string, string>; body: string } {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return { meta: {}, body: md }
  const meta: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^\s*([\w-]+)\s*:\s*(.*?)\s*$/)
    if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, '')
  }
  return { meta, body: md.slice(m[0].length) }
}

function section(body: string, name: string): string | null {
  const re = new RegExp(`^##\\s+${name}\\s*$`, 'im')
  const m = re.exec(body)
  if (!m) return null
  const rest = body.slice(m.index + m[0].length)
  const next = rest.search(/^##\s+/m)
  return (next === -1 ? rest : rest.slice(0, next)).trim()
}

function tableRows(text: string): string[][] {
  const rows = text.split(/\r?\n/).filter(l => l.trim().startsWith('|'))
  return rows
    .map(l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()))
    .filter(cells => !cells.every(c => /^:?-{2,}:?$/.test(c) || c === ''))
}

const stripTicks = (s: string) => s.replace(/^`|`$/g, '').trim()

function parseLayer(s: string): Layer {
  const m = s.match(/(?:L|Layer\s*)([34])/i)
  if (!m) throw new ContractError(`Unknown layer "${s}". Use L3 or L4.`)
  return Number(m[1]) as Layer
}

export function parseContract(md: string, stageHint = ''): Contract {
  const { meta, body } = frontMatter(md)
  const stage = meta.stage || stageHint
  if (!stage) throw new ContractError('Contract has no stage name')
  const type = meta.type
  if (type !== 'script' && type !== 'agent') throw new ContractError(`${stage}: front matter "type" must be script or agent`)
  const model = (meta.model || null) as Contract['model']
  if (model && !['strong', 'mid', 'cheap'].includes(model)) throw new ContractError(`${stage}: model must be strong, mid or cheap`)
  if (type === 'agent' && !model) throw new ContractError(`${stage}: agent stages need a model`)
  if (meta.effort && !['low', 'medium', 'high'].includes(meta.effort)) throw new ContractError(`${stage}: effort must be low, medium or high`)
  const gate = (meta.gate || 'auto') as Contract['gate']
  if (gate !== 'auto' && gate !== 'review') throw new ContractError(`${stage}: gate must be auto or review`)

  const inputsText = section(body, 'Inputs')
  const outputsText = section(body, 'Outputs')
  if (inputsText == null) throw new ContractError(`${stage}: missing "## Inputs" section`)
  if (outputsText == null) throw new ContractError(`${stage}: missing "## Outputs" section`)

  const inRows = tableRows(inputsText)
  const inHeader = inRows.shift()?.map(c => c.toLowerCase()) ?? []
  const li = inHeader.indexOf('layer'), pi = inHeader.indexOf('path'), wi = inHeader.indexOf('why')
  if (li < 0 || pi < 0) throw new ContractError(`${stage}: Inputs table needs Layer and Path columns`)
  const inputs = inRows.map(r => ({ layer: parseLayer(r[li]), path: stripTicks(r[pi]), why: wi >= 0 ? r[wi] ?? '' : '' }))

  const outRows = tableRows(outputsText)
  const outHeader = outRows.shift()?.map(c => c.toLowerCase()) ?? []
  const opi = outHeader.indexOf('path'), owi = outHeader.indexOf('why')
  if (opi < 0) throw new ContractError(`${stage}: Outputs table needs a Path column`)
  const outputs = outRows.map(r => ({ path: stripTicks(r[opi]), why: owi >= 0 ? r[owi] ?? '' : '' }))

  for (const o of outputs) {
    if (!o.path.startsWith(`${stage}/output/`)) throw new ContractError(`${stage}: output "${o.path}" must live under ${stage}/output/`)
  }

  return {
    stage, type, model, gate,
    label: meta.label || stage,
    meta, inputs, outputs,
    process: section(body, 'Process') ?? '',
  }
}

// Minimal glob: supports * within one path segment.
export function globToRegExp(glob: string): RegExp {
  const esc = glob.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')
  return new RegExp(`^${esc}$`)
}
export const isGlob = (p: string) => p.includes('*')
