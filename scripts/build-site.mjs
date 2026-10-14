// Builds the generator site (web/) and the demo template (template/) into one static folder for the Worker:
// site-dist/ = web at /, template at /_demo/.
import { execSync } from 'node:child_process'
import { cpSync, rmSync, mkdirSync } from 'node:fs'

const run = (cmd, cwd) => execSync(cmd, { cwd: new URL(cwd, import.meta.url), stdio: 'inherit' })
run('npx vite build', '../web/')
run('npx vite build', '../template/')
const out = new URL('../site-dist/', import.meta.url)
rmSync(out, { recursive: true, force: true })
mkdirSync(out)
cpSync(new URL('../web/dist/', import.meta.url), out, { recursive: true })
cpSync(new URL('../template/dist/', import.meta.url), new URL('_demo/', out), { recursive: true })
console.log('site-dist ready')
