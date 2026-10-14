import * as THREE from 'three'
import { brand, fontsFor, tagLabel } from '../brand'

// Draws a wrap-around label. Canvas aspect = circumference / height, so text isn't stretched.
// The center of the canvas (x = W/2) faces the viewer.
export function makeLabel(product, bandDims) {
  // Phones get half-size labels: a quarter of the pixels to draw and upload, and the can is small on screen anyway.
  const W = Math.min(innerWidth, innerHeight) < 600 ? 1024 : 2048
  const H = Math.round(Math.min(W * 0.78, Math.max(W * 0.14, (W * bandDims.h) / (2 * Math.PI * bandDims.r))))
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')

  const bg = g.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, product.color)
  bg.addColorStop(1, shade(product.color, -0.08))
  g.fillStyle = bg
  g.fillRect(0, 0, W, H)

  // Neutral trim: thin bands in the product's deep shade at the top and bottom of the wrap
  g.fillStyle = product.deep
  g.globalAlpha = 0.55
  g.fillRect(0, H * 0.04, W, H * 0.025)
  g.fillRect(0, H * 0.935, W, H * 0.025)
  g.globalAlpha = 1

  const ink = product.ink
  const f = fontsFor(brand)
  const display = `"${f.display}", system-ui, sans-serif`
  const body = `"${f.body}", system-ui, sans-serif`
  const dw = f.weight
  // Only about a quarter of the wrap faces the viewer; text wider than that runs around the sides.
  const maxW = W * 0.24
  const fit = (text, weight, size, family) => {
    g.font = `${weight} ${size}px ${family}`
    const w = g.measureText(text).width
    const s = Math.floor(size * Math.min(1, maxW / w))
    g.font = `${weight} ${s}px ${family}`
    return s
  }

  g.fillStyle = ink
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const cx = W / 2

  const short = H / W < 0.22 // wide, short wraps (jars) get a compact layout
  fit(brand.wordmark, dw, H * (short ? 0.2 : 0.13), display)
  g.fillText(brand.wordmark, cx, H * (short ? 0.2 : 0.18))

  fit(product.name.toUpperCase(), dw, H * (short ? 0.3 : 0.17), display)
  g.fillText(product.name.toUpperCase(), cx, H * (short ? 0.5 : 0.45))

  fit(product.type, 600, H * (short ? 0.11 : 0.065), body)
  g.globalAlpha = 0.85
  g.fillText(product.type, cx, H * (short ? 0.72 : 0.6))
  if (product.size) {
    fit(product.size, 600, H * (short ? 0.08 : 0.04), body)
    g.fillText(product.size, cx, H * (short ? 0.88 : 0.86))
  }
  g.globalAlpha = 1

  // A sticker with the product's filter tag (skin type, flavor mood), if it has one
  const tag = product.tags?.map(tagLabel).find(Boolean)
  if (!short && tag) {
    g.font = `700 ${Math.round(H * 0.04)}px ${body}`
    const label = tag.toUpperCase()
    const pw = g.measureText(label).width + H * 0.06
    const ph = H * 0.07
    g.fillStyle = 'rgba(255,255,255,0.85)'
    roundRect(g, cx - pw / 2, H * 0.7 - ph / 2, pw, ph, ph / 2)
    g.fill()
    g.fillStyle = ink
    g.fillText(label, cx, H * 0.7 + 1)
  }

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

export function shade(hex, amt) {
  const c = new THREE.Color(hex)
  const hsl = {}
  c.getHSL(hsl)
  c.setHSL(hsl.h, hsl.s, THREE.MathUtils.clamp(hsl.l + amt, 0, 1))
  return '#' + c.getHexString()
}

export function radialTexture(stops) {
  const s = 256
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  stops.forEach(([o, col]) => r.addColorStop(o, col))
  g.fillStyle = r
  g.fillRect(0, 0, s, s)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
