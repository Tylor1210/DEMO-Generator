import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import * as THREE from 'three'
import { S, anchors, productGroups } from '../scroll'
import { getState, useStore } from '../store'
import { brand } from '../brand'
import Product from './Product'
import { getShape, visualSize } from './shapes'
import { radialTexture } from './makeLabel'

const { lerp, clamp, damp } = THREE.MathUtils
const KEYS = ['x', 'y', 'z', 'rx', 'ry', 'rz', 's']
const mix = (a, b, t) => { const o = {}; for (const k of KEYS) o[k] = lerp(a[k], b[k], t); return o }
const hidden = (p, dy = -4) => ({ ...p, y: p.y + dy, s: 0.001 })

// Convert a DOM element's box to world units on the z = 0 plane
function anchorWorld(key, size, viewport) {
  const el = anchors.get(key)
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (!r.width) return null
  return {
    x: ((r.left + r.width / 2) / size.width - 0.5) * viewport.width,
    y: -((r.top + r.height / 2) / size.height - 0.5) * viewport.height,
    w: (r.width / size.width) * viewport.width,
    h: (r.height / size.height) * viewport.height,
  }
}

export default function Scene() {
  const P = brand.products
  const groups = useRef([])
  const first = useRef(true)
  const pedestal = useRef()
  const shadowTex = useMemo(() => radialTexture([[0, 'rgba(40,20,60,0.35)'], [0.5, 'rgba(40,20,60,0.12)'], [1, 'rgba(40,20,60,0)']]), [])

  useFrame((state, dt) => {
    const t = S.reduced ? 0 : state.clock.elapsedTime
    const { viewport: vp, size } = state
    const vw = vp.width, vh = vp.height
    const mobile = vw < vh
    const k = clamp(vw / 7.5, 0.5, 1)
    const { selected, detail } = getState()
    const others = P.map((_, i) => i).filter(i => i !== selected)
    const step = Math.min(dt, 0.05)

    const heroX = mobile ? 0 : vw * 0.23
    const heroY = mobile ? -vh * 0.16 : -0.2

    P.forEach((prod, i) => {
      const g = groups.current[i]
      if (!g) return
      const isF = i === selected
      const shp = getShape(prod.shape)
      const norm = 1.3 / visualSize(shp) // so every product reads about the same size

      // HERO: selected product on the pedestal, the rest in an arc behind it
      let h
      if (isF) {
        h = { x: heroX, y: heroY + Math.sin(t * 1.2) * 0.04, z: 0.6, rx: 0.05, ry: Math.sin(t * 0.5) * 0.5, rz: 0, s: (mobile ? 0.95 : 1.15) * norm }
      } else {
        const j = others.indexOf(i)
        const a = ((j / Math.max(others.length - 1, 1)) - 0.5) * 2.6 + Math.sin(t * 0.3) * 0.05
        h = {
          x: heroX + Math.sin(a) * 1.45 * k,
          y: heroY + 0.3 + Math.sin(t * 0.9 + j * 1.7) * 0.06,
          z: -Math.cos(a) * 1.0 - 0.5,
          rx: 0.08, ry: a * 0.6 + Math.sin(t * 0.6 + j) * 0.15, rz: -a * 0.2,
          s: (0.75 * k + 0.05) * norm,
        }
      }

      // BEATS: selected product forward, one full turn per beat, switching sides
      const side = Math.cos(S.spin * Math.PI)
      const b = isF
        ? { x: mobile ? 0 : side * vw * 0.2, y: mobile ? -vh * 0.2 : -0.05, z: 1.1, rx: 0.04, ry: S.spin * Math.PI * 2 + Math.sin(t * 0.6) * 0.1, rz: side * 0.1, s: (mobile ? 0.8 : 1.15) * norm }
        : hidden({ ...h, x: h.x * 1.8 })

      // OFFER: big and centered in front of the giant headline
      const o = isF
        ? { x: 0, y: mobile ? -0.05 : -0.1, z: 1.4, rx: 0.06, ry: -0.3 + Math.sin(t * 0.5) * 0.25, rz: -0.08, s: (mobile ? 0.9 : 1.2) * norm }
        : hidden(b, -1)

      // SHOP: ride on the shop cards (DOM anchors), so the 3D follows the horizontal track
      const a = anchorWorld(`shop-${i}`, size, vp)
      let sh = a
        ? { x: a.x, y: a.y, z: 0, rx: 0.05, ry: Math.sin(t * 0.7 + i) * 0.35, rz: 0, s: Math.min((a.h * 0.8) / shp.height, (a.w * 0.72) / shp.width) }
        : hidden(o)

      // DETAIL: tapped product flies forward next to its info panel
      if (detail >= 0 && S.shop > 0.5) {
        // The opened product flies forward; the rest step out of the way so nothing overlaps it.
        if (i === detail) sh = { x: mobile ? 0 : -vw * 0.18, y: mobile ? vh * 0.2 : -0.05, z: 1.2, rx: 0.05, ry: Math.sin(t * 0.5) * 0.7, rz: 0, s: (mobile ? 0.85 : 1.25) * norm }
        else sh = hidden(sh, -0.6)
      }

      const fFocus = isF ? S.focus : Math.min(1, S.focus * 2.2)
      const target = mix(mix(mix(h, b, fFocus), o, S.offer), sh, S.shop)

      const lam = first.current ? 1e6 : 9
      g.position.set(damp(g.position.x, target.x, lam, step), damp(g.position.y, target.y, lam, step), damp(g.position.z, target.z, lam, step))
      g.rotation.set(damp(g.rotation.x, target.rx, lam, step), damp(g.rotation.y, target.ry, lam, step), damp(g.rotation.z, target.rz, lam, step))
      g.scale.setScalar(damp(g.scale.x, target.s, lam, step))
      g.visible = g.scale.x > 0.01

      if (isF && pedestal.current) {
        const vis = (1 - clamp(S.focus * 1.8, 0, 1))
        const p = pedestal.current
        p.position.set(heroX, heroY - (shp.height * (mobile ? 0.95 : 1.15) * norm) / 2 - 0.03, 0.6)
        p.scale.setScalar(Math.max(vis, 0.001) * (mobile ? 0.85 : 1))
        p.visible = vis > 0.01
      }
    })
    first.current = false
  })

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 5, 5]} intensity={1.8} />
      <directionalLight position={[-4, 3, -2]} intensity={0.8} color={brand.theme.accent2} />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={3} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[10, 4, 1]} />
        <Lightformer form="rect" intensity={2.5} position={[-5, 1, 2]} rotation-y={Math.PI / 2} scale={[3, 8, 1]} />
        <Lightformer form="rect" intensity={2} position={[5, 1, 2]} rotation-y={-Math.PI / 2} scale={[3, 8, 1]} color={brand.theme.accent} />
        <Lightformer form="ring" intensity={1.5} position={[0, 1, 6]} scale={2.5} />
      </Environment>

      {P.map((p, i) => (
        <Product key={p.id} product={p} ref={el => { groups.current[i] = el; productGroups[i] = el }} />
      ))}

      <group ref={pedestal}>
        <mesh position={[0, -0.04, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[2.6, 2.6]} />
          <meshBasicMaterial map={shadowTex} transparent depthWrite={false} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.6, 0.64, 0.06, 64]} />
          <meshPhysicalMaterial color="#ffffff" roughness={0.25} clearcoat={1} />
        </mesh>
        <mesh position={[0, 0.032, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.5, 0.56, 64]} />
          <meshBasicMaterial color={brand.theme.accent} toneMapped={false} />
        </mesh>
      </group>

      <BundleBox />
    </>
  )
}

// Open box that sits in the last shop panel. Bundle picks fly in from wherever they are.
function BundleBox() {
  const box = useStore(s => s.box)
  const group = useRef()
  const n = brand.shop.bundleSize
  const wall = useMemo(() => new THREE.MeshPhysicalMaterial({ color: brand.theme.accent, roughness: 0.45, clearcoat: 0.4 }), [])
  const inner = useMemo(() => new THREE.MeshPhysicalMaterial({ color: new THREE.Color(brand.theme.accent).lerp(new THREE.Color('#ffffff'), 0.75), roughness: 0.6 }), [])

  useFrame(state => {
    const g = group.current
    const a = anchorWorld('routine-box', state.size, state.viewport)
    if (!a || S.shop < 0.02) { g.visible = false; return }
    g.visible = true
    g.position.set(a.x, a.y - a.h * 0.12, 0)
    g.scale.setScalar(Math.min(a.w * 0.85, a.h * 1.4))
  })

  const W = 1, H = 0.36, D = 0.5, T = 0.025
  return (
    <group ref={group} rotation-x={0.32}>
      <mesh position={[0, -H / 2, 0]} material={inner}><boxGeometry args={[W, T, D]} /></mesh>
      <mesh position={[0, -H / 2 + H * 0.35, D / 2]} material={wall}><boxGeometry args={[W, H * 0.7, T]} /></mesh>
      <mesh position={[0, 0, -D / 2]} material={wall}><boxGeometry args={[W, H, T]} /></mesh>
      <mesh position={[-W / 2, 0, 0]} material={wall}><boxGeometry args={[T, H, D]} /></mesh>
      <mesh position={[W / 2, 0, 0]} material={wall}><boxGeometry args={[T, H, D]} /></mesh>
      {box.map((r, slot) => <BoxItem key={r.key} index={r.index} slot={slot} n={n} floor={-H / 2} />)}
    </group>
  )
}

const tmp = new THREE.Vector3()
function BoxItem({ index, slot, n, floor }) {
  const ref = useRef()
  const placed = useRef(false)
  const product = brand.products[index]
  const shape = getShape(product.shape)
  const ts = Math.min(0.55 / shape.height, 0.29 / shape.width)

  useFrame((_, dt) => {
    const g = ref.current
    if (!g?.parent) return
    if (!placed.current) {
      const src = productGroups[index]
      if (src) {
        src.getWorldPosition(tmp)
        g.parent.worldToLocal(tmp)
        g.position.copy(tmp)
        g.scale.setScalar(src.scale.x / g.parent.scale.x)
      }
      placed.current = true
    }
    const step = Math.min(dt, 0.05)
    const tx = (slot - (n - 1) / 2) * 0.31
    const ty = floor + 0.02 + (shape.height * ts) / 2
    g.position.set(damp(g.position.x, tx, 5, step), damp(g.position.y, ty, 5, step), damp(g.position.z, 0, 5, step))
    g.scale.setScalar(damp(g.scale.x, ts, 5, step))
    g.rotation.y = damp(g.rotation.y, 0, 5, step)
  })

  return <Product ref={ref} product={product} />
}
