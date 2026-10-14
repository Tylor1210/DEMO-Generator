// Color helpers: parsing, WCAG contrast and auto-fixing.

export function parseColor(s: string): string | null {
  s = s.trim().toLowerCase()
  let m = s.match(/^#([0-9a-f]{3})$/)
  if (m) return '#' + m[1].split('').map(c => c + c).join('')
  m = s.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/)
  if (m) return '#' + m[1]
  m = s.match(/^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/)
  if (m) return toHex([+m[1], +m[2], +m[3]])
  return null
}

export const toRgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
export const toHex = (rgb: number[]) => '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')

export function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map(v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

export function saturation(hex: string): number {
  const [r, g, b] = toRgb(hex).map(v => v / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  return max === 0 ? 0 : (max - min) / max
}

// Move `fg` toward black or white (whichever gets there with the smaller change) until it reaches `min` on `bg`.
export function ensureContrast(fg: string, bg: string, min = 4.5): string {
  if (contrast(fg, bg) >= min) return fg
  const src = toRgb(fg)
  let best: { t: number; c: string } | null = null
  for (const target of [[0, 0, 0], [255, 255, 255]]) {
    for (let t = 0.05; t <= 1.0001; t += 0.05) {
      const c = toHex(src.map((v, i) => v + (target[i] - v) * t))
      if (contrast(c, bg) >= min) { if (!best || t < best.t) best = { t, c }; break }
    }
  }
  if (best) return best.c
  return contrast('#000000', bg) >= contrast('#ffffff', bg) ? '#000000' : '#ffffff'
}
