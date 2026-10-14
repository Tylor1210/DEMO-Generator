import { describe, expect, it } from 'vitest'
import { readdirSync, existsSync } from 'node:fs'
import { isPrivateIp, parseRobots, robotsAllows, registrableDomain, assertSafeUrl } from '../pipeline/lib/net.ts'
import { containsQuote, fixDashes, normalize, supportScore } from '../pipeline/lib/text.ts'
import { contrast, ensureContrast } from '../pipeline/lib/color.ts'
import { parseFileBlocks } from '../pipeline/runner.ts'
import { REGISTERED_SCRIPTS } from '../pipeline/registry.ts'
import { normalizeUrl } from '../workspace/stages/01_intake/scripts/intake.ts'

describe('SSRF guard', () => {
  it('flags private, loopback and link-local ranges', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', '100.64.0.1'])
      expect(isPrivateIp(ip), ip).toBe(true)
    for (const ip of ['8.8.8.8', '104.16.1.1', '2606:4700::1111']) expect(isPrivateIp(ip), ip).toBe(false)
  })
  it('rejects bad schemes, ports and local names without a network call', async () => {
    await expect(assertSafeUrl('ftp://example.com')).rejects.toThrow(/http/)
    await expect(assertSafeUrl('http://example.com:8080')).rejects.toThrow(/port/)
    await expect(assertSafeUrl('http://localhost')).rejects.toThrow()
    await expect(assertSafeUrl('http://127.0.0.1')).rejects.toThrow(/Private/)
    await expect(assertSafeUrl('http://user:pw@example.com')).rejects.toThrow(/credentials/)
  })
})

describe('robots.txt', () => {
  const txt = `User-agent: *\nDisallow: /checkout\nAllow: /checkout/thanks$\n\nUser-agent: tycodes-demo-bot\nDisallow: /private\n`
  it('prefers our own group over *', () => {
    const rules = parseRobots(txt)
    expect(robotsAllows(rules, '/private/x')).toBe(false)
    expect(robotsAllows(rules, '/checkout')).toBe(true) // our group doesn't mention it
  })
  it('uses longest match with Allow winning ties', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /\nAllow: /products\n')
    expect(robotsAllows(rules, '/products/a')).toBe(true)
    expect(robotsAllows(rules, '/about')).toBe(false)
  })
  it('empty Disallow allows everything', () => {
    expect(robotsAllows(parseRobots('User-agent: *\nDisallow:\n'), '/')).toBe(true)
  })
})

describe('urls and domains', () => {
  it('normalizes input URLs', () => {
    expect(normalizeUrl('HelloBubble.com/?utm_source=x&a=1#top').toString()).toBe('https://hellobubble.com/?a=1')
  })
  it('finds the registrable domain', () => {
    expect(registrableDomain('www.shop.brand.com')).toBe('brand.com')
    expect(registrableDomain('brand.co.uk')).toBe('brand.co.uk')
  })
})

describe('evidence matching', () => {
  const site = 'Every can is made with live probiotics.\nNo refined sugars and no stevia.\nFind us at Whole Foods Market.'
  it('accepts close paraphrase of words on the page', () => {
    expect(supportScore('No refined sugar', site)).toBeGreaterThanOrEqual(0.8)
    expect(supportScore('Live probiotics in every can', site)).toBeGreaterThanOrEqual(0.8)
  })
  it('rejects facts that are not there', () => {
    expect(supportScore('Keto certified with 5g protein', site)).toBeLessThan(0.5)
  })
  it('matches quotes after normalizing quotes and dashes', () => {
    expect(containsQuote(normalize(site), '“No refined sugars and no stevia.”')).toBe(true)
  })
  it('removes em and en dashes', () => {
    expect(fixDashes('Bright — and fizzy')).toBe('Bright, and fizzy')
    expect(fixDashes('Ages 3–5')).toBe('Ages 3-5')
  })
})

describe('contrast', () => {
  it('pushes text until it reads', () => {
    const fixed = ensureContrast('#ffcc00', '#ffffff')
    expect(contrast(fixed, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })
  it('switches direction when white can never work', () => {
    const fixed = ensureContrast('#ffffff', '#d82476')
    expect(contrast(fixed, '#d82476')).toBeGreaterThanOrEqual(4.5)
  })
})

describe('runner', () => {
  it('parses <file> blocks', () => {
    expect(parseFileBlocks('<file path="a/output/x.md">\nhello\n</file>')).toEqual({ 'a/output/x.md': 'hello\n' })
  })
  it('registers every stage script on disk', () => {
    const base = new URL('../workspace/stages/', import.meta.url)
    const onDisk = readdirSync(base).filter(d => /^\d\d_/.test(d)).flatMap(stage => {
      const dir = new URL(`${stage}/scripts/`, base)
      return existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.ts')).map(f => `${stage}/scripts/${f}`) : []
    })
    expect(onDisk.sort()).toEqual([...REGISTERED_SCRIPTS].sort())
  })
})
