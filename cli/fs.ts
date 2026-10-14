// Filesystem implementations of Store and Workspace for local runs.
import { mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import type { Store, Workspace } from '../pipeline/types.ts'

async function walk(dir: string): Promise<string[]> {
  let entries
  try { entries = await readdir(dir, { withFileTypes: true }) } catch { return [] }
  const out: string[] = []
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(p)))
    else if (e.name !== '.gitkeep' && e.name !== '.DS_Store') out.push(p)
  }
  return out
}

const safeJoin = (root: string, p: string) => {
  const full = join(root, p)
  if (relative(root, full).startsWith('..')) throw new Error(`Path escapes the store: ${p}`)
  return full
}

export class FsStore implements Store {
  constructor(private root: string) {}
  async read(path: string) {
    try { return new Uint8Array(await readFile(safeJoin(this.root, path))) } catch { return null }
  }
  async write(path: string, data: Uint8Array | string) {
    const full = safeJoin(this.root, path)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, data)
  }
  async list(prefix: string) {
    const base = safeJoin(this.root, prefix.replace(/\/[^/]*$/, '') || '.')
    return (await walk(base)).map(p => relative(this.root, p)).filter(p => p.startsWith(prefix)).sort()
  }
  async delete(path: string) { await rm(safeJoin(this.root, path), { force: true }) }
}

export class FsWorkspace implements Workspace {
  constructor(private root: string) {}
  async read(path: string) {
    try { return await readFile(safeJoin(this.root, path), 'utf8') } catch { return null }
  }
  async list(prefix: string) {
    return (await walk(safeJoin(this.root, prefix || '.'))).map(p => relative(this.root, p)).sort()
  }
}
