// Book-a-call popup and floating button (BUILD_PROMPT 1b). The booking link comes from the site, not the brand config.
// The popup opens once per session on the first of: 25 s on the page, reaching the offer, or exit intent on desktop.
// It never opens while the product panel or cart is open. Booking pages open in a new tab (Google blocks embedding).
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { track } from '../analytics'
import { useFocusPanel } from './Chrome'

const SEEN = 'bc_seen'
export const bookingUrl = () => {
  try { return JSON.parse(document.getElementById('site-config')?.textContent || '{}').bookingUrl || '' } catch { return '' }
}
const seen = () => { try { return sessionStorage.getItem(SEEN) === '1' } catch { return false } }

export default function BookCall() {
  const url = bookingUrl()
  const blocked = useStore(s => s.detail >= 0 || s.cartOpen)
  const [want, setWant] = useState(false) // a trigger fired
  const [open, setOpen] = useState(false)
  const [pill, setPill] = useState(seen())
  const ref = useRef()
  useFocusPanel(open, ref)

  // Triggers
  useEffect(() => {
    if (!url || seen()) return
    const fire = reason => setWant(w => { if (!w) track('booking_prompt', { reason }); return true })
    const t = setTimeout(() => fire('time'), 25_000)
    const offer = document.getElementById('offer')
    const io = offer && new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) fire('offer') }, { threshold: 0.4 })
    io?.observe(offer)
    const desktop = matchMedia('(hover: hover) and (pointer: fine)').matches
    const onLeave = e => { if (desktop && e.clientY <= 0 && !e.relatedTarget) fire('exit') }
    document.addEventListener('mouseout', onLeave)
    return () => { clearTimeout(t); io?.disconnect(); document.removeEventListener('mouseout', onLeave) }
  }, [url])

  // Open when a trigger has fired and nothing else is open
  useEffect(() => {
    if (want && !blocked && !seen()) {
      setOpen(true)
      try { sessionStorage.setItem(SEEN, '1') } catch { /* private mode */ }
      track('booking_open', { from: 'popup' })
    }
  }, [want, blocked])

  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') close() }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [open])

  const close = () => { setOpen(false); setPill(true) }
  const book = from => { track('booking_click', { from }); close() }
  if (!url) return null

  return (
    <>
      {open && (
        <div className="bc-wrap" role="presentation" onClick={e => { if (e.target === e.currentTarget) close() }}>
          <div className="bc" role="dialog" aria-modal="true" aria-labelledby="bc-title" ref={ref}>
            <h2 id="bc-title">Like it? Get this live on your site.</h2>
            <p>Book a 15-minute call and we’ll build your real version.</p>
            <div className="bc-actions">
              <a className="btn big" href={url} target="_blank" rel="noreferrer" onClick={() => book('popup')}>Book my call</a>
              <button className="btn ghost" onClick={close}>Keep exploring</button>
            </div>
          </div>
        </div>
      )}
      {pill && !open && !blocked && (
        <a className="bc-pill" href={url} target="_blank" rel="noreferrer" onClick={() => { track('booking_open', { from: 'pill' }); book('pill') }}>
          Book a call
        </a>
      )}
    </>
  )
}
