// 3D side of photo labels: wraps the unrolled photo canvas in a texture.
import * as THREE from 'three'
import { photoLabelCanvas } from '../photo'
import { specFor } from '../shapeSpecs'

export async function photoLabel(url, shapeName) {
  const canvas = await photoLabelCanvas(url, specFor(shapeName), shapeName)
  if (!canvas) return null
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}
