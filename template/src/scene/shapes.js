import * as THREE from 'three'

// Parametric packaging shapes. Every shape is centered on y = 0 and reports its height,
// so the scene can size any product the same way. Label "band" dims are used to give the
// label canvas the right aspect ratio (no stretched text).
//
// Parts: { geo, mat: 'label' | 'body' | 'cap' | 'accent' | 'metal' | 'photo' }
// thetaStart / phiStart = PI puts u = 0.5 (center of the label art) facing the camera.
// workspace/_config/shape-catalog.md lists these names for the pipeline. Keep them in sync.

const V = (x, y) => new THREE.Vector2(x, y)
const cache = new Map()

function lathe(points, seg = 72) {
  return new THREE.LatheGeometry(points.map(([x, y]) => V(x, y)), seg, Math.PI)
}
function band(r, y0, y1, seg = 96) {
  const g = new THREE.CylinderGeometry(r, r, y1 - y0, seg, 1, true, Math.PI, Math.PI * 2)
  g.translate(0, (y0 + y1) / 2, 0)
  return g
}
function roundedCap(r, y0, y1, bevel = 0.025) {
  return lathe([[0, y0], [r - bevel, y0], [r, y0 + bevel], [r, y1 - bevel], [r - bevel, y1], [0, y1]], 48)
}

function bottle() {
  const r = 0.32
  return {
    height: 1.3, width: 0.66,
    band: { r: r + 0.003, h: 0.78 },
    parts: [
      { geo: lathe([[0, -0.65], [r - 0.06, -0.65], [r, -0.6], [r, 0.28], [r - 0.05, 0.36], [0.14, 0.42], [0.13, 0.45], [0, 0.45]]), mat: 'body' },
      { geo: band(r + 0.003, -0.52, 0.26), mat: 'label' },
      { geo: roundedCap(0.165, 0.43, 0.65), mat: 'cap' },
    ],
  }
}

function dropper() {
  const r = 0.27
  return {
    height: 1.2, width: 0.56,
    band: { r: r + 0.003, h: 0.56 },
    parts: [
      { geo: lathe([[0, -0.6], [r - 0.05, -0.6], [r, -0.55], [r, 0.08], [r - 0.07, 0.17], [0.1, 0.22], [0.1, 0.27], [0, 0.27]]), mat: 'body' },
      { geo: band(r + 0.003, -0.5, 0.06), mat: 'label' },
      { geo: roundedCap(0.13, 0.24, 0.38, 0.02), mat: 'cap' },
      { geo: lathe([[0, 0.37], [0.085, 0.37], [0.095, 0.45], [0.09, 0.53], [0.06, 0.59], [0, 0.6]], 40), mat: 'accent' },
    ],
  }
}

function jar() {
  const r = 0.46
  return {
    height: 0.8, width: 0.95,
    band: { r: r + 0.003, h: 0.36 },
    parts: [
      { geo: lathe([[0, -0.4], [r - 0.06, -0.4], [r, -0.35], [r, 0.14], [r - 0.03, 0.17], [0, 0.17]]), mat: 'body' },
      { geo: band(r + 0.003, -0.32, 0.09), mat: 'label' },
      { geo: roundedCap(r + 0.015, 0.15, 0.4, 0.05), mat: 'cap' },
    ],
  }
}

function tube() {
  const r = 0.27, y0 = -0.5, y1 = 0.62
  const g = new THREE.CylinderGeometry(r, r, y1 - y0, 96, 40, true, Math.PI, Math.PI * 2)
  g.translate(0, (y0 + y1) / 2, 0)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) - y0) / (y1 - y0)
    const e = THREE.MathUtils.smoothstep(t, 0.2, 1)
    p.setX(i, p.getX(i) * (1 + 0.42 * e))
    p.setZ(i, p.getZ(i) * (1 - 0.93 * e))
  }
  g.computeVertexNormals()
  const crimp = new THREE.BoxGeometry(r * 2 * 1.44, 0.09, 0.035)
  crimp.translate(0, y1 + 0.035, 0)
  return {
    height: 1.4, width: 0.8,
    band: { r, h: (y1 - y0) * 0.9 },
    parts: [
      { geo: g, mat: 'label' },
      { geo: crimp, mat: 'body' },
      { geo: roundedCap(0.2, -0.7, y0 + 0.01, 0.03), mat: 'cap' },
    ],
  }
}

// Standard 12 oz can (66 x 122 mm), ported from the hand-built Culture Pop demo.
function can() {
  const R = 0.33, HALF = 0.61
  const body = lathe([
    [0, -HALF + 0.035], [0.2, -HALF + 0.02], [0.26, -HALF], [0.3, -HALF + 0.01],
    [R, -HALF + 0.06], [R, HALF - 0.11], [0.305, HALF - 0.04], [0.275, HALF - 0.01],
    [0.278, HALF], [0.268, HALF + 0.004], [0.26, HALF - 0.01], [0, HALF - 0.012],
  ], 96)
  const label = band(R + 0.002, -HALF + 0.07, HALF - 0.12)
  const tab = new THREE.TorusGeometry(0.06, 0.012, 8, 24)
  tab.rotateX(-Math.PI / 2)
  tab.translate(0, HALF - 0.005, 0.1)
  return {
    height: 1.22, width: 0.66,
    band: { r: R + 0.002, h: HALF * 2 - 0.19 },
    parts: [
      { geo: body, mat: 'metal' },
      { geo: label, mat: 'label' },
      { geo: tab, mat: 'metal' },
    ],
  }
}

// Wide supplement tub with a screw lid.
function tub() {
  const r = 0.44
  return {
    height: 0.95, width: 0.92,
    band: { r: r + 0.003, h: 0.5 },
    parts: [
      { geo: lathe([[0, -0.47], [r - 0.07, -0.47], [r - 0.02, -0.44], [r, -0.38], [r, 0.2], [r - 0.02, 0.22], [0, 0.22]]), mat: 'body' },
      { geo: band(r + 0.003, -0.36, 0.14), mat: 'label' },
      { geo: roundedCap(r + 0.02, 0.2, 0.48, 0.04), mat: 'cap' },
    ],
  }
}

// Anything that isn't a standard package: the product photo on a rounded slab with a little thickness.
function photo() {
  const w = 0.9, h = 1.2, rad = 0.08, depth = 0.06
  const s = new THREE.Shape()
  s.moveTo(-w / 2 + rad, -h / 2)
  s.lineTo(w / 2 - rad, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + rad)
  s.lineTo(w / 2, h / 2 - rad); s.quadraticCurveTo(w / 2, h / 2, w / 2 - rad, h / 2)
  s.lineTo(-w / 2 + rad, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - rad)
  s.lineTo(-w / 2, -h / 2 + rad); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + rad, -h / 2)
  const slab = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 3, curveSegments: 12 })
  slab.translate(0, 0, -depth / 2)
  const face = new THREE.ShapeGeometry(s, 12)
  const uv = face.attributes.uv, pos = face.attributes.position
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + h / 2) / h)
  face.translate(0, 0, depth / 2 + 0.014)
  return {
    height: h, width: w, aspect: w / h,
    band: { r: 0.3, h: 0.6 },
    parts: [
      { geo: slab, mat: 'body' },
      { geo: face, mat: 'photo' },
    ],
  }
}

const builders = { bottle, dropper, jar, tube, can, tub, photo }
export const SHAPES = Object.keys(builders)

// Visual size used to make different shapes read as similar sizes
export const visualSize = sh => Math.max(sh.height, sh.width * 1.45)

export function getShape(name) {
  if (!cache.has(name)) cache.set(name, (builders[name] || bottle)())
  return cache.get(name)
}
