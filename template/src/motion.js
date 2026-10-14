// Decides whether this visitor gets the 3D version or the static one.
// The page is static-first: text, CTAs and CSS product renders paint immediately,
// then 3D loads afterwards only if this returns true.
import { variant } from './analytics'

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function hasWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch { return false }
}

function lowEndDevice() {
  const mem = navigator.deviceMemory // Chrome only; undefined elsewhere
  const cores = navigator.hardwareConcurrency || 8
  const saveData = navigator.connection?.saveData
  return saveData || (mem !== undefined && mem <= 2) || (mem !== undefined && mem <= 4 && cores <= 4)
}

export function shouldUse3D() {
  if (variant === 'static') return { use3D: false, reason: 'variant' }
  if (reducedMotion()) return { use3D: false, reason: 'reduced-motion' }
  if (!hasWebGL()) return { use3D: false, reason: 'no-webgl' }
  if (lowEndDevice()) return { use3D: false, reason: 'low-end' }
  return { use3D: true, reason: 'ok' }
}

export const isTouch = () => window.matchMedia('(hover: none), (pointer: coarse)').matches
