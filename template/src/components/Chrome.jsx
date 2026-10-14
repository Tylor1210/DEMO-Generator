// Always-on UI: demo bar, nav, sticky buy bar, cart drawer, toast, footer.
import { useEffect, useRef, useState } from 'react'
import { asset, brand, bundleWord, money, slug } from '../brand'
import { actions, totals, useStore } from '../store'
import { track } from '../analytics'

// Moves focus into a panel when it opens and back to where it was when it closes.
export function useFocusPanel(open, ref) {
  const prev = useRef(null)
  useEffect(() => {
    if (open) {
      prev.current = document.activeElement
      requestAnimationFrame(() => ref.current?.querySelector('button, a, input')?.focus({ preventScroll: true }))
    } else if (prev.current) {
      prev.current.focus?.({ preventScroll: true })
      prev.current = null
    }
  }, [open, ref])
}

export function DemoBar() {
  return (
    <div className="demobar" role="note">
      <p>Concept demo built by <a href="https://tycodes.dev" target="_blank" rel="noreferrer">tycodes.dev</a>. Not associated with or endorsed by {brand.brand}.</p>
    </div>
  )
}

export function Nav({ goTo }) {
  const count = useStore(s => totals(s).count)
  const [solid, setSolid] = useState(false)
  useEffect(() => {
    const on = () => setSolid(scrollY > 40)
    on()
    addEventListener('scroll', on, { passive: true })
    return () => removeEventListener('scroll', on)
  }, [])
  const logo = asset(brand.logo)
  return (
    <header className={`nav ${solid ? 'solid' : ''}`}>
      <a className="logo" href="#hero" onClick={e => { e.preventDefault(); goTo('#hero') }} aria-label={`${brand.brand} home`}>
        {logo ? <img src={logo} alt={brand.brand} height="32" /> : brand.wordmark}
      </a>
      <nav className="nav-right">
        <a className="link" href="#shop" onClick={e => { e.preventDefault(); track('cta_click', { cta: 'nav_skip_to_shop' }); goTo('#shop') }}>
          Skip to shop
        </a>
        <button className="cart-btn" onClick={() => { actions.toggleCart(true); track('cta_click', { cta: 'nav_cart' }) }} aria-label={`Cart, ${count} items`}>
          Cart <span className="count">{count}</span>
        </button>
      </nav>
    </header>
  )
}

export function BuyBar() {
  const selected = useStore(s => s.selected)
  const blocked = useStore(s => s.detail >= 0 || s.cartOpen)
  const [past, setPast] = useState(false)
  useEffect(() => {
    const on = () => setPast(scrollY > innerHeight * 0.6)
    on()
    addEventListener('scroll', on, { passive: true })
    return () => removeEventListener('scroll', on)
  }, [])
  const P = brand.products
  const p = P[selected]
  const price = money(p.price)
  return (
    <div className={`buybar ${past && !blocked ? 'show' : ''}`} role="region" aria-label="Quick buy" inert={!(past && !blocked) || undefined}>
      <div className="swatches" role="radiogroup" aria-label="Choose product">
        {P.map((x, i) => (
          <button
            key={x.id} role="radio" aria-checked={i === selected} aria-label={x.name}
            className={`swatch ${i === selected ? 'on' : ''}`} style={{ background: x.color }}
            onClick={() => actions.select(i, 'buybar')}
          />
        ))}
      </div>
      <div className="bb-info">
        <strong>{p.name}</strong>
        <span>{[p.type, price].filter(Boolean).join(' · ')}</span>
      </div>
      <button className="btn" onClick={() => actions.addToCart(selected, 'buybar')}>Add to cart</button>
    </div>
  )
}

export function CartDrawer() {
  const state = useStore(s => s) // the whole state object only changes on updates
  const { cartOpen: open, cart, bundles } = state
  const t = totals(state)
  const ref = useRef()
  useFocusPanel(open, ref)
  const P = brand.products
  const lines = Object.entries(cart).map(([i, q]) => ({ p: P[i], i: +i, q }))
  const host = brand.checkoutUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const empty = !lines.length && !bundles.length
  return (
    <>
      <div className={`scrim ${open ? 'show' : ''}`} onClick={() => actions.toggleCart(false)} />
      <aside ref={ref} className={`drawer ${open ? 'open' : ''}`} inert={!open || undefined} aria-label="Cart">
        <div className="drawer-head">
          <h3>Your cart</h3>
          <button className="x" onClick={() => actions.toggleCart(false)} aria-label="Close cart">×</button>
        </div>
        {empty && <p className="muted">Nothing here yet. Tap a product to add it.</p>}
        <ul className="lines">
          {bundles.map(b => {
            const known = b.items.every(i => P[i].price != null)
            const full = b.items.reduce((a, i) => a + (P[i].price ?? 0), 0)
            return (
              <li key={b.key} className="bundle-line">
                <span className="dots">{b.items.map((i, k) => <span key={k} className="dot" style={{ background: P[i].color }} />)}</span>
                <span className="ln">Your {bundleWord()}<small>{b.items.map(i => P[i].name).join(', ')}</small></span>
                <span className="bundle-price">
                  {known && <s>{money(full)}</s>}
                  <span>{known ? money(full * (1 - b.discount)) : `${Math.round(b.discount * 100)}% off`}</span>
                </span>
                <button className="x small-x" onClick={() => actions.removeBundle(b.key)} aria-label={`Remove ${bundleWord()}`}>×</button>
              </li>
            )
          })}
          {lines.map(({ p, i, q }) => (
            <li key={p.id}>
              <span className="dot" style={{ background: p.color }} />
              <span className="ln">{p.name}<small>{p.type}</small></span>
              <span className="qty">
                <button onClick={() => actions.setQty(i, q - 1)} aria-label={`Remove one ${p.name}`}>−</button>
                {q}
                <button onClick={() => actions.setQty(i, q + 1)} aria-label={`Add one ${p.name}`}>+</button>
              </span>
              <span>{p.price != null ? money(p.price * q) : 'See site'}</span>
            </li>
          ))}
        </ul>
        <div className="drawer-foot">
          <div className="row"><span>Subtotal</span><strong>{money(t.sum)}</strong></div>
          {t.saved > 0 && <p className="muted small">You save {money(t.saved)} with your {bundleWord()}.{brand.offer.isDemo ? ' (Demo offer)' : ''}</p>}
          {t.unknown > 0 && <p className="muted small">Plus {t.unknown} item{t.unknown === 1 ? '' : 's'} priced on {host}.</p>}
          <a className="btn block" href={brand.checkoutUrl} target="_blank" rel="noreferrer"
            onClick={() => track('checkout_click', { subtotal: Math.round(t.sum), items: t.count })}>
            Checkout on {host}
          </a>
          <p className="muted small">This is a demo. Checkout happens on the brand’s own site.</p>
        </div>
      </aside>
    </>
  )
}

export function Toast() {
  const msg = useStore(s => s.toast)
  return <div className={`toast ${msg ? 'show' : ''}`} role="status" aria-live="polite">{msg}</div>
}

export function Footer() {
  const [reported, setReported] = useState(false)
  const report = async () => {
    if (!confirm('Report this demo? It will be taken down until we review it.')) return
    try { await fetch(`/api/report/${slug}`, { method: 'POST' }) } catch { /* still thank them */ }
    track('report_click')
    setReported(true)
  }
  return (
    <footer className="footer">
      <p>{brand.credit}</p>
      <p className="muted small">Product facts come from {brand.domain}. Prices and availability may have changed.</p>
      {reported ? <p className="small">Thanks. The demo is down until we review it.</p>
        : <button className="link-btn small" onClick={report}>Report this demo</button>}
    </footer>
  )
}

