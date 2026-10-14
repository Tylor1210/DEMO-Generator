// The brand config is loaded at runtime (one build renders every demo).
// Modules read `brand` lazily (inside functions and components), never at import time.
import fontPairs from './fontPairs.json'

export let brand = null
export let slug = ''
let assetBase = ''

export function setBrand(cfg, demoSlug, base) {
  slug = demoSlug
  assetBase = base
  brand = {
    ...cfg,
    filter: cfg.filter?.options?.length >= 2 ? cfg.filter : null,
    claims: cfg.claims ?? [],
    retailers: cfg.retailers ?? [],
    reviews: cfg.reviews ?? { rating: null, count: null, quotes: [] },
  }
  if (brand.featuredIndex >= brand.products.length) brand.featuredIndex = 0
  return brand
}

// Config image paths are relative to the demo folder ("assets/x.webp").
export const asset = p => (!p ? null : /^(https?:)?\/\//.test(p) || p.startsWith('/') ? p : `${assetBase}/${p}`)

let fmt
export function money(n) {
  if (n == null) return null
  if (!fmt) {
    try { fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: brand.currency || 'USD' }) } catch { fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }) }
  }
  return fmt.format(n)
}

// Shown near the 3D product and in the footer (BUILD: the 3D model is a simplified stand-in).
export const modelNote = () => `The 3D packaging is a simplified model made for this concept demo. See the real product on ${brand.domain}.`

export const bundleWord = () => brand.shop.bundleLabel || 'bundle'
export const cap = s => s.charAt(0).toUpperCase() + s.slice(1)
export const tagLabel = id => brand.filter?.options.find(o => o.id === id)?.label ?? null

// ---------- theme ----------

const lum = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
// Text that sits on a colored fill: white if it reads, otherwise the brand ink (or near-black).
export const onColor = fill => (contrast('#ffffff', fill) >= 3 ? '#ffffff' : contrast(brand.theme.ink, fill) >= 4.5 ? brand.theme.ink : '#111111')

export function fontsFor(cfg) {
  return fontPairs[cfg.fonts?.pair] ?? fontPairs.clean
}

export function applyTheme() {
  const t = brand.theme
  const f = fontsFor(brand)
  const root = document.documentElement.style
  root.setProperty('--bg', t.bg)
  root.setProperty('--page-bg', t.bg)
  root.setProperty('--ink', t.ink)
  root.setProperty('--accent', t.accent)
  root.setProperty('--accent2', t.accent2)
  root.setProperty('--on-accent', onColor(t.accent))
  root.setProperty('--display', `"${f.display}", system-ui, sans-serif`)
  root.setProperty('--body', `"${f.body}", system-ui, sans-serif`)
  root.setProperty('--display-weight', String(f.weight))
  document.title = `${brand.brand} | concept demo`
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.bg)

  const fam = (name, w) => `family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@${w}`
  const families = f.display === f.body ? [fam(f.display, `400;600;700;${f.weight}`)] : [fam(f.display, f.weight), fam(f.body, '400;600;700')]
  if (document.getElementById('brand-fonts')) return // index.html already started loading them
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`
  document.head.appendChild(link)
}
