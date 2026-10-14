// Measurement layer.
// - track() keeps events locally (for the ?debug=1 panel) and batches them to POST /api/events,
//   so every demo shows real numbers in admin.
// - It also forwards to Plausible / PostHog / GA4 if one of their snippets is on the page.
import { slug } from './brand'

const KEY = 'sd_events'
const listeners = new Set()
let events = []
try { events = JSON.parse(sessionStorage.getItem(KEY) || '[]') } catch { events = [] }

// Variant for A/B testing the animated vs static page.
//   ?variant=3d | ?variant=static  forces one
//   ?ab=1                           assigns 50/50 and remembers it per visitor
export const variant = (() => {
  const q = new URLSearchParams(location.search)
  const forced = q.get('variant')
  if (forced === '3d' || forced === 'static') return forced
  if (q.get('ab') === '1') {
    try {
      let v = localStorage.getItem('sd_variant')
      if (!v) { v = Math.random() < 0.5 ? '3d' : 'static'; localStorage.setItem('sd_variant', v) }
      return v
    } catch { return '3d' }
  }
  return '3d'
})()

// One id per tab session, so admin can count visitors without cookies or personal data.
const session = (() => {
  try {
    let s = sessionStorage.getItem('sd_session')
    if (!s) { s = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('sd_session', s) }
    return s
  } catch { return 'nostorage' }
})()

// ---------- sender ----------
const queue = []
let timer = null
const ENDPOINT = '/api/events'

function flush(useBeacon = false) {
  clearTimeout(timer); timer = null
  if (!queue.length || !slug) return
  const body = JSON.stringify({ slug, session, events: queue.splice(0, 50) })
  try {
    if (useBeacon && navigator.sendBeacon) navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))
    else fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {})
  } catch { /* analytics never breaks the page */ }
  if (queue.length) timer = setTimeout(flush, 1000)
}
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true) })
addEventListener('pagehide', () => flush(true))

export function track(name, props = {}) {
  const ev = { name, props: { ...props, variant }, t: Date.now() }
  events = [...events.slice(-499), ev]
  try { sessionStorage.setItem(KEY, JSON.stringify(events)) } catch { /* storage off */ }
  listeners.forEach(fn => fn(events))
  queue.push(ev)
  if (queue.length >= 20) flush()
  else if (!timer) timer = setTimeout(flush, 5000)
  try {
    window.dataLayer?.push({ event: name, ...ev.props })
    window.plausible?.(name, { props: ev.props })
    window.posthog?.capture?.(name, ev.props)
  } catch { /* never let analytics break the page */ }
  if (import.meta.env.DEV) console.debug('[track]', name, ev.props)
}

export const getEvents = () => events
export const onEvents = fn => { listeners.add(fn); return () => listeners.delete(fn) }
export function clearEvents() {
  events = []
  try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
  listeners.forEach(fn => fn(events))
}

// Section views (once per page load) and scroll depth milestones
export function startScrollTracking() {
  const seen = new Set()
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      const id = e.target.dataset.track
      if (e.isIntersecting && !seen.has(id)) { seen.add(id); track('section_view', { section: id }) }
    })
  }, { threshold: 0.4 })
  document.querySelectorAll('[data-track]').forEach(el => io.observe(el))

  const marks = [25, 50, 75, 100]
  const hit = new Set()
  let ticking = false
  const onScroll = () => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(() => {
      ticking = false
      const max = document.documentElement.scrollHeight - innerHeight
      const pct = max > 0 ? (scrollY / max) * 100 : 100
      marks.forEach(m => { if (pct >= m - 1 && !hit.has(m)) { hit.add(m); track('scroll_depth', { pct: m }) } })
    })
  }
  addEventListener('scroll', onScroll, { passive: true })
  return () => { io.disconnect(); removeEventListener('scroll', onScroll) }
}
