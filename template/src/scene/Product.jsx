import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { asset } from '../brand'
import { getShape } from './shapes'
import { makeLabel, shade } from './makeLabel'
import { photoLabel } from './photoLabel'
import { photoCutoutSized } from '../photo'
import { specFor } from '../shapeSpecs'

// ?labels=generated turns photo labels off (handy for comparing).
const photoLabelsOn = !/labels=generated/.test(location.search)

const loader = new THREE.TextureLoader()

function loadTexture(url, onLoad) {
  const t = loader.load(url, onLoad)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

// Crop a photo like CSS object-fit: cover so it fills the slab without stretching.
function cover(tex, aspect) {
  const img = tex.image
  if (!img?.width) return
  const a = img.width / img.height
  if (a > aspect) { tex.repeat.set(aspect / a, 1); tex.offset.set((1 - aspect / a) / 2, 0) }
  else { tex.repeat.set(1, a / aspect); tex.offset.set(0, (1 - a / aspect) / 2) }
  tex.needsUpdate = true
}

// One packaged product. Real label art (product.label) replaces the generated label.
const Product = forwardRef(function Product({ product, ...props }, ref) {
  const shape = getShape(product.shape)

  const mats = useMemo(() => {
    const labelUrl = asset(product.label)
    const map = labelUrl ? loadTexture(labelUrl) : makeLabel(product, shape.band)
    const photoUrl = shape.aspect ? asset(product.photo || product.image) : null
    const photoMap = photoUrl ? loadTexture(photoUrl, t => cover(t, shape.aspect)) : null
    return {
      label: new THREE.MeshPhysicalMaterial({ map, roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.2, side: THREE.DoubleSide }),
      body: new THREE.MeshPhysicalMaterial({ color: product.color, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2, side: THREE.DoubleSide }),
      cap: new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.3, clearcoat: 0.6 }),
      accent: new THREE.MeshPhysicalMaterial({ color: shade(product.deep, 0.05), roughness: 0.4, clearcoat: 0.5 }),
      metal: new THREE.MeshStandardMaterial({ color: '#d7dbe0', metalness: 1, roughness: 0.22, side: THREE.DoubleSide }),
      photo: photoMap
        ? new THREE.MeshPhysicalMaterial({ map: photoMap, roughness: 0.45, clearcoat: 0.3 })
        : new THREE.MeshPhysicalMaterial({ color: shade(product.color, 0.15), roughness: 0.5 }),
    }
  }, [product, shape])

  useEffect(() => () => Object.values(mats).forEach(m => { m.map?.dispose(); m.dispose() }), [mats])

  // No uploaded label art: wrap the product's own photo around the pack. If the photo doesn't fit the
  // shape's proportions (or the shape is "photo"), show the photo cut out as a floating billboard instead.
  const [billboard, setBillboard] = useState(null)
  useEffect(() => {
    if (product.label || !product.image || !photoLabelsOn) return
    let live = true
    const url = asset(product.image)
    const wrap = shape.labelY && product.shape !== 'photo' ? photoLabel(url, product.shape) : Promise.resolve(null)
    wrap
      .then(async tex => {
        if (tex) {
          if (!live) { tex.dispose(); return }
          const old = mats.label.map
          mats.label.map = tex
          mats.label.needsUpdate = true
          old?.dispose()
          return
        }
        const cut = await photoCutoutSized(url, specFor(product.shape), product.shape)
        if (!cut || !live) return
        const t = loadTexture(cut.src)
        setBillboard({ map: t, aspect: cut.aspect })
      })
      .catch(() => { /* keep the generated label */ })
    return () => { live = false }
  }, [mats, product, shape])
  useEffect(() => () => billboard?.map.dispose(), [billboard])

  return (
    <group ref={ref} {...props}>
      {billboard
        ? <Billboard map={billboard.map} aspect={billboard.aspect} height={shape.height} />
        : shape.parts.map((p, i) => <mesh key={i} geometry={p.geo} material={mats[p.mat]} />)}
    </group>
  )
})

// A flat cut-out that mostly faces the viewer: it undoes most of the parent's spin, keeping a gentle sway.
function Billboard({ map, aspect, height }) {
  const ref = useRef()
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.04, side: THREE.DoubleSide, toneMapped: false }), [map])
  useEffect(() => () => mat.dispose(), [mat])
  useFrame(() => {
    const g = ref.current, parent = g?.parent
    if (!parent) return
    const turns = parent.rotation.y
    g.rotation.y = -turns + Math.sin(turns) * 0.25
  })
  return (
    <mesh ref={ref} material={mat}>
      <planeGeometry args={[height * aspect, height]} />
    </mesh>
  )
}

export default Product
