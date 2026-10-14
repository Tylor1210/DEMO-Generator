// Reads the brand's own front-on product photos: finds the product, unrolls its label, cuts it out.
// No three.js here, so the static page can use it without loading the 3D chunk.
// Works when the photo shows the product alone on a plain background (most store product shots).
// Returns null when the photo doesn't look usable, and the generated label stays.

const loadImage = url => new Promise((res, rej) => {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => res(img)
  img.onerror = rej
  img.src = url
})

const dist2 = (d, i, c) => (d[i] - c[0]) ** 2 + (d[i + 1] - c[1]) ** 2 + (d[i + 2] - c[2]) ** 2

// Background = the most common color (quantized). Patterned backgrounds still have one dominant color;
// lifestyle shots don't, and those return null.
function backgroundColor(d, w, h) {
  const bins = new Map()
  for (let i = 0; i < d.length; i += 16) {
    const k = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4)
    const b = bins.get(k) ?? [0, 0, 0, 0]
    b[0] += d[i]; b[1] += d[i + 1]; b[2] += d[i + 2]; b[3]++
    bins.set(k, b)
  }
  let best = null
  for (const b of bins.values()) if (!best || b[3] > best[3]) best = b
  const share = best[3] / (d.length / 16)
  return share > 0.2 ? [best[0] / best[3], best[1] / best[3], best[2] / best[3]] : null
}

const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }

// Finds the background color and the product's position and size in the photo.
async function analyze(url, shape, name) {
  const img = await loadImage(url)
  const scale = Math.min(1, 700 / Math.max(img.width, img.height))
  const w = Math.round(img.width * scale), h = Math.round(img.height * scale)
  const src = document.createElement('canvas')
  src.width = w; src.height = h
  const sg = src.getContext('2d', { willReadFrequently: true })
  sg.drawImage(img, 0, 0, w, h)
  const d = sg.getImageData(0, 0, w, h).data
  const bg = backgroundColor(d, w, h)
  if (!bg) return null

  // Two ways to find the product's width on each row; we keep whichever matches the shape best.
  //  - "center run": product pixels around the center column, stopping after 4 background pixels.
  //    Handles patterned backgrounds (shapes touching the product only affect a few rows).
  //  - "outer edges": first and last non-background pixel of the row. Handles products the same
  //    color as their background (pink can on pink), where the shaded edges still stand out.
  const T = 40 ** 2
  const isBg = (x, y) => dist2(d, (y * w + x) * 4, bg) < T
  const c0 = Math.round(w / 2)
  const centerRun = [], outer = []
  for (let y = 0; y < h; y++) {
    if (!isBg(c0, y)) {
      let x0 = c0, x1 = c0, gap = 0
      for (let x = c0; x > 0 && gap < 4; x--) { if (isBg(x, y)) gap++; else { gap = 0; x0 = x } }
      gap = 0
      for (let x = c0; x < w - 1 && gap < 4; x++) { if (isBg(x, y)) gap++; else { gap = 0; x1 = x } }
      centerRun.push({ y, x0, x1, width: x1 - x0 })
    }
    let a0 = -1, a1 = -1
    for (let x = 2; x < w - 2; x++) if (!isBg(x, y)) { a0 = x; break }
    for (let x = w - 3; x > 1; x--) if (!isBg(x, y)) { a1 = x; break }
    if (a0 >= 0 && a1 - a0 > w * 0.05) outer.push({ y, x0: a0, x1: a1, width: a1 - a0 })
  }
  const shapeRatio = shape.height / (shape.bandR * 2)
  const measure = spans => {
    if (spans.length < h * 0.25) return null
    const wMed = median(spans.map(s => s.width))
    // Body rows: close to the typical width (skips pull tabs, caps, shoulders and stray shapes).
    const body = spans.filter(s => Math.abs(s.width - wMed) < wMed * 0.1)
    if (body.length < h * 0.2) return null
    const top = name === 'can' ? body[0].y : spans[0].y
    const bottom = name === 'can' ? body[body.length - 1].y : spans[spans.length - 1].y
    const fit = Math.abs((bottom - top) / wMed / shapeRatio - 1)
    return { cx: median(body.map(s => (s.x0 + s.x1) / 2)), r: wMed / 2, top, bottom, fit }
  }
  const best = [measure(centerRun), measure(outer)].filter(Boolean).sort((p, q) => p.fit - q.fit)[0]
  // Proportions must roughly match the 3D shape, or the wrap would look wrong.
  if (!best || best.fit > 0.25) return null
  // Topmost product row on the center column (a can's pull tab or a bottle's cap), not stray pattern shapes.
  const first = centerRun[0]?.y ?? best.top
  const runs = new Map(centerRun.map(s => [s.y, s]))
  return { src, sg, d, w, h, bg, first, runs, ...best }
}

// Same photo analysis, shared by the 3D label and the static cut-out.
const cache = new Map()
const analyzePhoto = (url, shape, name) => {
  const k = `${url}|${name}`
  if (!cache.has(k)) cache.set(k, analyze(url, shape, name).catch(() => null))
  return cache.get(k)
}

/**
 * Wrap-around label canvas from a front-on product photo, or null.
 * @param shape  spec from shapeSpecs.js
 * @param name   shape name; cans are measured from the rim so the pull tab doesn't count
 */
export async function photoLabelCanvas(url, shape, name) {
  const a = await analyzePhoto(url, shape, name)
  if (!a) return null
  const { src, sg, d, w, cx, r, top, bottom } = a

  // Label band rows in the photo, from the shape's label position.
  const [ly0, ly1] = shape.labelY
  const toRow = yShape => top + ((shape.height / 2 - yShape) / shape.height) * (bottom - top)
  const sy0 = toRow(ly1), sy1 = toRow(ly0)

  // Output canvas: the full 360 degree wrap, front at the center.
  const W = Math.min(innerWidth, innerHeight) < 600 ? 1024 : 2048
  const H = Math.round(Math.min(W * 0.78, Math.max(W * 0.14, (W * shape.bandH) / (2 * Math.PI * shape.bandR))))
  const out = document.createElement('canvas')
  out.width = W; out.height = H
  const g = out.getContext('2d')

  // Back of the pack: the product's own color. Median of two vertical strips either side of the
  // center, so letters and artwork on the front don't skew it.
  const vals = [[], [], []]
  for (const side of [-1, 1]) {
    const x = Math.round(cx + side * r * 0.65)
    for (let y = Math.round(sy0); y < sy1; y += 2) {
      const i = (y * w + x) * 4
      vals[0].push(d[i]); vals[1].push(d[i + 1]); vals[2].push(d[i + 2])
    }
  }
  const body3 = vals.map(v => Math.round(median(v)))
  g.fillStyle = `rgb(${body3.join(',')})`
  g.fillRect(0, 0, W, H)

  // Front: unroll the visible half. A column at angle t sits at x = cx + r sin(t) in the photo.
  const maxT = (78 * Math.PI) / 180
  const cols = Math.round((maxT / (2 * Math.PI)) * W)
  for (let i = -cols; i <= cols; i++) {
    const t = (i / W) * 2 * Math.PI
    const sx = cx + r * Math.sin(t)
    const sw = Math.max(1, r * Math.cos(t) * ((2 * Math.PI) / W))
    g.drawImage(src, sx, sy0, sw, sy1 - sy0, W / 2 + i, 0, 1.5, H)
  }
  // Soften the seam where the photo meets the back color.
  for (const side of [-1, 1]) {
    const x = W / 2 + side * cols
    const grad = g.createLinearGradient(x - side * W * 0.03, 0, x, 0)
    grad.addColorStop(0, `rgba(${body3.join(',')},0)`)
    grad.addColorStop(1, `rgba(${body3.join(',')},1)`)
    g.fillStyle = grad
    g.fillRect(Math.min(x, x - side * W * 0.03), 0, W * 0.03, H)
  }

  return out
}

// The product cut out of its photo (background keyed out), for the static fallback. Data URL or null.
export async function photoCutout(url, shape, name) {
  const a = await analyzePhoto(url, shape, name)
  if (!a) return null
  const { sg, d, w, bg, cx, r, first, bottom } = a
  const x0 = Math.max(0, Math.floor(cx - r - 3)), x1 = Math.min(w, Math.ceil(cx + r + 3))
  const y0 = Math.max(0, first - 2), y1 = Math.min(a.h, bottom + 4)
  const cw = x1 - x0, ch = y1 - y0
  const out = sg.createImageData(cw, ch)
  const lo = 22 ** 2, hi = 48 ** 2
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = ((y + y0) * w + (x + x0)) * 4, o = (y * cw + x) * 4
      const k = dist2(d, i, bg)
      out.data[o] = d[i]; out.data[o + 1] = d[i + 1]; out.data[o + 2] = d[i + 2]
      // Above the body (tab, cap, shoulders) keep only the product run measured on that row,
      // so background shapes beside it are dropped.
      const dx = Math.abs(x + x0 - cx), aboveBody = y + y0 < a.top
      if (aboveBody) {
        const run = a.runs.get(y + y0)
        if (!run || x + x0 < run.x0 - 1 || x + x0 > run.x1 + 1 || run.x1 - run.x0 > 2.2 * r) { out.data[o + 3] = 0; continue }
      }
      // Soft key: background-colored pixels fade out; the body itself stays solid.
      const inside = !aboveBody && dx < r * 0.9
      out.data[o + 3] = inside ? 255 : Math.round(255 * Math.min(1, Math.max(0, (k - lo) / (hi - lo))))
    }
  }
  const c = document.createElement('canvas')
  c.width = cw; c.height = ch
  c.getContext('2d').putImageData(out, 0, 0)
  return c.toDataURL('image/webp', 0.9)
}
