import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { brand } from './brand'
import { S } from './scroll'
import { actions, useStore } from './store'
import { startScrollTracking, track } from './analytics'
import { isTouch, reducedMotion, shouldUse3D } from './motion'
import { BuyBar, CartDrawer, DemoBar, Footer, Nav, Toast } from './components/Chrome'
import { Beats, Hero, Offer } from './components/Sections'
import { DetailPanel, Shop } from './components/Shop'
import DebugPanel from './components/DebugPanel'
import BookCall from './components/BookCall'

gsap.registerPlugin(ScrollTrigger)

// 3D is code-split: the page (text, CTAs, CSS products) paints first, 3D streams in after.
const Stage3D = lazy(() => import('./scene/Stage3D'))
const debug = new URLSearchParams(location.search).has('debug')

export default function App() {
  const root = useRef()
  const lenisRef = useRef(null)
  const [mode] = useState(() => shouldUse3D())
  const [load3D, setLoad3D] = useState(false)
  const selected = useStore(s => s.selected)
  const t0 = useRef(performance.now())

  // Selected product tints the page
  useEffect(() => {
    const p = brand.products[selected]
    document.documentElement.style.setProperty('--tint', p.color)
    document.documentElement.style.setProperty('--tint-deep', p.deep)
  }, [selected])

  // Start 3D only after first paint + idle, never blocking the page
  useEffect(() => {
    track('page_mode', { use3D: mode.use3D, reason: mode.reason })
    if (!mode.use3D) return
    const start = () => setLoad3D(true)
    const idle = window.requestIdleCallback || (cb => setTimeout(cb, 200))
    const go = () => idle(start, { timeout: 1500 })
    if (document.readyState === 'complete') go()
    else addEventListener('load', go, { once: true })
  }, [mode])

  const on3DReady = useCallback(() => {
    document.documentElement.classList.add('has-3d')
    track('three_ready', { ms: Math.round(performance.now() - t0.current) })
  }, [])

  const goTo = useCallback(sel => {
    const el = document.querySelector(sel)
    if (!el) return
    if (lenisRef.current) lenisRef.current.scrollTo(el, { duration: 1.1 })
    else el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' })
  }, [])

  useEffect(() => startScrollTracking(), [])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') { actions.closeDetail(); actions.toggleCart(false) } }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  useLayoutEffect(() => {
    const reduced = reducedMotion()
    S.reduced = reduced

    // Light smoothing on desktop wheels only. Touch keeps native scrolling.
    let raf
    if (!reduced && !isTouch()) {
      const lenis = new Lenis({ lerp: 0.14, wheelMultiplier: 1 })
      lenisRef.current = lenis
      lenis.on('scroll', ScrollTrigger.update)
      raf = time => lenis.raf(time * 1000)
      gsap.ticker.add(raf)
      gsap.ticker.lagSmoothing(0)
    }

    const ctx = gsap.context(() => {
      const nB = brand.beats.length
      const stage = (trigger, start, end, key, to) =>
        gsap.fromTo(S, { [key]: 0 }, { [key]: to, ease: 'none', immediateRender: false, scrollTrigger: { trigger, start, end, scrub: true } })

      stage('#beats', 'top bottom', 'top top', 'focus', 1)
      stage('#beats', 'top top', 'bottom bottom', 'spin', nB - 1)
      stage('#offer', 'top bottom', 'top top', 'offer', 1)
      stage('#shop', 'top bottom', 'top top', 'shop', 1)

      // Backdrop: bg -> accent for the offer -> bg for the shop. One timeline, so the two
      // halves can't fight over --bg (two separate tweens left the hero stuck on the accent).
      gsap.timeline({ scrollTrigger: { trigger: '#offer', start: 'top bottom', endTrigger: '#shop', end: 'top 30%', scrub: true } })
        .fromTo(document.documentElement, { '--bg': brand.theme.bg }, { '--bg': brand.theme.accent, ease: 'none', duration: 1 })
        .to(document.documentElement, { '--bg': brand.theme.accent, duration: 0.6 })
        .to(document.documentElement, { '--bg': brand.theme.bg, ease: 'none', duration: 1 })

      // Horizontal shelf: desktop with motion only. Short pin, distance = overflow width.
      const mm = gsap.matchMedia()
      mm.add('(min-width: 900px) and (hover: hover) and (prefers-reduced-motion: no-preference)', () => {
        const track = document.querySelector('.shop-track')
        const dist = () => Math.max(0, track.scrollWidth - innerWidth)
        gsap.to(track, {
          x: () => -dist(), ease: 'none',
          scrollTrigger: { trigger: '#shop', start: 'top top', end: () => `+=${dist()}`, pin: true, scrub: true, invalidateOnRefresh: true, anticipatePin: 1 },
        })
      })

      if (!reduced) {
        gsap.utils.toArray('.reveal').forEach(el => {
          gsap.from(el, { opacity: 0, y: 32, duration: 0.7, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 80%', toggleActions: 'play none none reverse' } })
        })
      }
    }, root)

    // Fonts arrive after first layout; re-measure once they do.
    document.fonts?.ready.then(() => ScrollTrigger.refresh())

    return () => {
      ctx.revert()
      if (raf) gsap.ticker.remove(raf)
      lenisRef.current?.destroy()
      lenisRef.current = null
    }
  }, [])

  // Pause smooth scroll while an overlay is open
  const overlay = useStore(s => s.detail >= 0 || s.cartOpen)
  useEffect(() => {
    const l = lenisRef.current
    if (l) overlay ? l.stop() : l.start()
    document.documentElement.classList.toggle('lock', overlay)
  }, [overlay])

  return (
    <div ref={root}>
      <div className="backdrop" />
      {load3D && (
        <div className="canvas-wrap">
          <Suspense fallback={null}><Stage3D onReady={on3DReady} /></Suspense>
        </div>
      )}
      <DemoBar />
      <Nav goTo={goTo} />
      <main inert={overlay || undefined}>
        <Hero goTo={goTo} />
        <Beats />
        <Offer goTo={goTo} />
        <Shop />
        <Footer />
      </main>
      <DetailPanel />
      <BuyBar />
      <CartDrawer />
      <Toast />
      <BookCall />
      {debug && <DebugPanel mode={mode.use3D ? '3d' : `static (${mode.reason})`} />}
    </div>
  )
}
