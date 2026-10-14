// Loaded lazily after the page has painted. Nothing above the fold waits on this.
import { useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import Scene from './Scene'
import { brand, fontsFor } from '../brand'

function useFontsReady(families) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const done = () => setReady(true)
    const timeout = setTimeout(done, 2000)
    Promise.all(families.map(f => document.fonts.load(f))).then(done, done).finally(() => clearTimeout(timeout))
  }, [families])
  return ready
}

// Labels are drawn on canvases, so the brand fonts must be loaded first.
const fontList = () => { const f = fontsFor(brand); return [`${f.weight} 100px "${f.display}"`, `600 30px "${f.body}"`] }

export default function Stage3D({ onReady }) {
  const [families] = useState(fontList)
  const fonts = useFontsReady(families)
  if (!fonts) return null
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 0.2, 6], fov: 35 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.NeutralToneMapping
        requestAnimationFrame(() => onReady?.())
      }}
    >
      <Scene />
    </Canvas>
  )
}
