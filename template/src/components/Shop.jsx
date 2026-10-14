// Left-to-right shop. On desktop, vertical scroll moves the shelf sideways (short pin).
// On touch/reduced motion it's a native swipe row with scroll-snap. 3D products ride on the [shop-i] anchors.
import { useRef } from 'react'
import { brand, bundleWord, cap, money, tagLabel } from '../brand'
import { actions, useStore } from '../store'
import { anchorRef } from '../scroll'
import { isTouch } from '../motion'
import { useFocusPanel } from './Chrome'
import StaticProduct from './StaticProduct'

const cardTag = p => p.tags.map(tagLabel).filter(Boolean)[0] ?? p.type

export function Shop() {
  const box = useStore(s => s.box)
  const P = brand.products
  const n = brand.shop.bundleSize
  const word = bundleWord()
  const prices = box.map(r => P[r.index].price)
  const known = prices.every(p => p != null)
  const sum = prices.reduce((a, p) => a + (p ?? 0), 0)
  const full = box.length === n
  const total = full ? sum * (1 - brand.shop.bundleDiscount) : sum

  return (
    <section id="shop" className="shop" data-track="shop">
      <div className="shop-track">
        <div className="panel intro back">
          <p className="kicker">Shop</p>
          <h2>{brand.shop.title}</h2>
          <p className="sub">{brand.shop.sub}</p>
          <p className="progress">{cap(word)}: <strong>{box.length}/{n}</strong></p>
          <span className="hint">{isTouch() ? 'Swipe to see more →' : 'Keep scrolling →'}</span>
        </div>

        {P.map((p, i) => (
          <article key={p.id} className="panel card back" style={{ '--c': p.color }} data-track={`card_${p.id}`}>
            <button className="card-hit" onClick={() => actions.openDetail(i, 'shop_card')} aria-label={`See details for ${p.name}`}>
              <div className="anchor" ref={anchorRef(`shop-${i}`)}>
                <StaticProduct product={p} className="static-only" />
              </div>
            </button>
            <div className="card-info">
              <span className="step">{cardTag(p)}</span>
              <h3>{p.name}</h3>
              <p className="muted">{[p.type, p.size].filter(Boolean).join(' · ')}</p>
              <div className="card-row">
                <strong>{money(p.price) ?? 'See site'}</strong>
                <button className="btn small" onClick={() => actions.addToCart(i, 'shop_card')}>Add</button>
                <button className="btn small ghost" onClick={() => actions.addToBox(i)} aria-label={`Add ${p.name} to your ${word}`}>+ {cap(word)}</button>
              </div>
            </div>
          </article>
        ))}

        <div className="panel routine back" data-track="bundle_box">
          <h3>Your {word}</h3>
          <div className="box-anchor" ref={anchorRef('routine-box')}>
            <div className="static-only static-box">
              {Array.from({ length: n }, (_, k) => (
                <span key={k} className="slot" style={{ background: box[k] ? P[box[k].index].color : undefined }} />
              ))}
            </div>
          </div>
          <ul className="routine-list">
            {box.map(r => (
              <li key={r.key}>
                <span className="dot" style={{ background: P[r.index].color }} />{P[r.index].name}
                <button className="x" onClick={() => actions.removeFromBox(r.key)} aria-label={`Remove ${P[r.index].name}`}>×</button>
              </li>
            ))}
            {Array.from({ length: n - box.length }, (_, k) => <li key={`e${k}`} className="empty">Empty slot</li>)}
          </ul>
          <div className="routine-total">
            {known && box.length > 0 && <>{full && <s>{money(sum)}</s>} <strong>{money(total)}</strong></>}
            {full && <span className="tag">{Math.round(brand.shop.bundleDiscount * 100)}% off{brand.offer.isDemo ? ' · demo offer' : ''}</span>}
          </div>
          <button className="btn block" disabled={!box.length} onClick={() => actions.boxToCart()}>
            {full ? `Add ${word} to cart` : `Pick ${n - box.length} more`}
          </button>
        </div>
      </div>
    </section>
  )
}

export function DetailPanel() {
  const detail = useStore(s => s.detail)
  const ref = useRef()
  const open = detail >= 0
  useFocusPanel(open, ref)
  const P = brand.products
  const i = Math.max(detail, 0)
  const p = P[i]
  const tags = p.tags.map(tagLabel).filter(Boolean)
  return (
    <>
      <div className={`detail-dim ${open ? 'show' : ''}`} onClick={() => actions.closeDetail()} />
      <aside ref={ref} className={`detail ${open ? 'open' : ''}`} inert={!open || undefined} aria-label={`${p.name} details`} style={{ '--c': p.color }}>
        <button className="x" onClick={() => actions.closeDetail()} aria-label="Close">×</button>
        <div className="detail-static static-only"><StaticProduct product={p} /></div>
        <span className="step">{cardTag(p)}</span>
        <h2>{p.name}</h2>
        <p className="muted">{[p.type, p.size].filter(Boolean).join(' · ')}</p>
        {p.notes.length > 0 && <ul className="notes">{p.notes.map(n => <li key={n}>{n}</li>)}</ul>}
        {brand.filter && tags.length > 0 && <p className="muted small">{brand.filter.label}: {tags.join(', ')}</p>}
        <div className="detail-cta">
          <strong className="price">{money(p.price) ?? 'Price on site'}</strong>
          <button className="btn" onClick={() => actions.addToCart(i, 'detail')}>Add to cart</button>
          <button className="btn ghost" onClick={() => { actions.addToBox(i); actions.closeDetail() }}>+ {cap(bundleWord())}</button>
        </div>
        {p.url && <a className="link-btn small" href={p.url} target="_blank" rel="noreferrer">See it on {brand.domain}</a>}
        <div className="detail-nav">
          <button onClick={() => actions.openDetail((i - 1 + P.length) % P.length, 'detail_prev')}>← Prev</button>
          <button onClick={() => actions.openDetail((i + 1) % P.length, 'detail_next')}>Next →</button>
        </div>
      </aside>
    </>
  )
}
