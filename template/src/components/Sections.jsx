// Page sections, in scroll order: hero, objection beats, offer.
import { useState } from 'react'
import { brand, bundleWord, money } from '../brand'
import { actions, useStore } from '../store'
import { track } from '../analytics'
import StaticProduct from './StaticProduct'

export function Hero({ goTo }) {
  const selected = useStore(s => s.selected)
  const h = brand.hero
  return (
    <section id="hero" className="section hero" data-track="hero">
      <div className="hero-copy front">
        <p className="kicker">{h.kicker}</p>
        <h1>{h.headline}</h1>
        {h.sub && <p className="sub">{h.sub}</p>}
        <div className="ctas">
          <a className="btn big" href="#shop" onClick={e => { e.preventDefault(); track('cta_click', { cta: 'hero_primary' }); goTo('#shop') }}>
            {h.primaryCta}
          </a>
          <a className="btn ghost" href="#offer" onClick={e => { e.preventDefault(); track('cta_click', { cta: 'hero_secondary' }); goTo('#offer') }}>
            {h.secondaryCta}
          </a>
        </div>
        <Claims />
      </div>
      <div className="product-slot hero-slot">
        <StaticProduct product={brand.products[selected]} className="static-only" />
      </div>
    </section>
  )
}

const Claims = () => (brand.claims.length ? <ul className="claims">{brand.claims.map(c => <li key={c.text}>{c.text}</li>)}</ul> : null)

function ReviewSlot() {
  const r = brand.reviews
  if (r.quotes.length) {
    const q = r.quotes[0]
    return <figure className="review"><blockquote>“{q.text}”</blockquote><figcaption>{q.author}</figcaption></figure>
  }
  return <div className="review placeholder">Verified customer review goes here (real reviews only, with permission)</div>
}

function Rating() {
  const { rating, count } = brand.reviews
  if (rating == null) return <span className="tag placeholder">Add verified rating</span>
  return <span className="tag">{rating.toFixed(1)} out of 5 from {count.toLocaleString()} reviews</span>
}

function Proof({ kind }) {
  const selected = useStore(s => s.selected)
  const [pick, setPick] = useState(null)
  const P = brand.products
  if (kind === 'claims') return (
    <div className="proof">
      <Claims />
      <ReviewSlot />
    </div>
  )
  if (kind === 'filter' && brand.filter) return (
    <div className="proof">
      <div className="chips" role="group" aria-label={brand.filter.label}>
        {brand.filter.options.map(o => (
          <button key={o.id} className={`chip ${pick === o.id ? 'on' : ''}`} aria-pressed={pick === o.id} onClick={() => {
            setPick(o.id)
            const i = P.findIndex(p => p.id === o.pick)
            track('filter_pick', { option: o.id, product: o.pick })
            if (i >= 0) actions.select(i, 'filter')
          }}>{o.label}</button>
        ))}
      </div>
      {pick && <Match index={selected} source="filter" />}
    </div>
  )
  if (kind === 'filter' || kind === 'products') return (
    <div className="proof">
      <div className="chips" role="group" aria-label="Products">
        {P.map((p, i) => (
          <button key={p.id} className={`chip ${i === selected ? 'on' : ''}`} aria-pressed={i === selected} onClick={() => actions.select(i, 'beat_products')}>{p.name}</button>
        ))}
      </div>
      <Match index={selected} source="beat_products" />
    </div>
  )
  if (kind === 'price') {
    const n = brand.shop.bundleSize
    const priced = P.filter(p => p.price != null)
    const cheapest = priced.length >= n ? [...priced].sort((a, b) => a.price - b.price).slice(0, n).reduce((a, p) => a + p.price, 0) : null
    return (
      <div className="proof">
        <ul className="prices">
          {P.map((p, i) => (
            <li key={p.id}>
              <button className={i === selected ? 'on' : ''} aria-pressed={i === selected} onClick={() => actions.select(i, 'price_list')}>
                <span className="dot" style={{ background: p.color }} /><span className="pname">{p.name}</span>
                <span className="pval">{money(p.price) ?? 'See site'}</span>
              </button>
            </li>
          ))}
        </ul>
        {cheapest != null && (
          <p className="muted small">
            A {n}-item {bundleWord()} starts around {money(cheapest)}, or {money(cheapest * (1 - brand.shop.bundleDiscount))} with the {bundleWord()} discount{brand.offer.isDemo ? ' (demo offer)' : ''}.
          </p>
        )}
      </div>
    )
  }
  if (kind === 'retailers') return (
    <div className="proof">
      <ul className="retailers">{brand.retailers.map(r => <li key={r.name}>{r.name}</li>)}</ul>
      <Rating />
    </div>
  )
  return null
}

function Match({ index, source }) {
  const p = brand.products[index]
  return (
    <p className="match">
      <span>Your pick: <strong>{p.name}</strong></span>
      <button className="link-btn" onClick={() => actions.addToCart(index, source)}>
        Add to cart{p.price != null ? ` · ${money(p.price)}` : ''}
      </button>
    </p>
  )
}

export function Beats() {
  return (
    <section id="beats">
      {brand.beats.map((b, i) => (
        <div key={b.id} className={`section beat ${i % 2 ? 'flip' : ''}`} data-track={`beat_${b.id}`}>
          <div className="beat-card front reveal">
            <p className="question">{b.question}</p>
            {b.title && <h2>{b.title}</h2>}
            {b.body && <p className="body">{b.body}</p>}
            <Proof kind={b.proof} />
          </div>
          <div className="product-slot"><BeatProduct /></div>
        </div>
      ))}
    </section>
  )
}

function BeatProduct() {
  const selected = useStore(s => s.selected)
  return <StaticProduct product={brand.products[selected]} className="static-only" />
}

// Retailer search pages we can link to with the brand name. Unknown retailers are only listed.
const SEARCH = {
  target: q => `https://www.target.com/s?searchTerm=${q}`,
  walmart: q => `https://www.walmart.com/search?q=${q}`,
  'ulta beauty': q => `https://www.ulta.com/search?search=${q}`,
  ulta: q => `https://www.ulta.com/search?search=${q}`,
  amazon: q => `https://www.amazon.com/s?k=${q}`,
  'whole foods': q => `https://www.wholefoodsmarket.com/search?text=${q}`,
  'whole foods market': q => `https://www.wholefoodsmarket.com/search?text=${q}`,
  kroger: q => `https://www.kroger.com/search?query=${q}`,
  costco: q => `https://www.costco.com/CatalogSearch?keyword=${q}`,
  sephora: q => `https://www.sephora.com/search?keyword=${q}`,
  cvs: q => `https://www.cvs.com/search?searchTerm=${q}`,
  walgreens: q => `https://www.walgreens.com/search/results.jsp?Ntt=${q}`,
  'sprouts': q => `https://shop.sprouts.com/search?search_term=${q}`,
  'sprouts farmers market': q => `https://shop.sprouts.com/search?search_term=${q}`,
}

function storeLinks() {
  if (brand.storeLocatorUrl) return [{ name: 'Store locator', href: brand.storeLocatorUrl }]
  const q = encodeURIComponent(brand.brand)
  return brand.retailers
    .map(r => ({ name: r.name, href: r.url || SEARCH[r.name.toLowerCase()]?.(q) }))
    .filter(l => l.href)
}

export function Offer({ goTo }) {
  const [zip, setZip] = useState('')
  const [sent, setSent] = useState(false)
  const o = brand.offer
  const links = storeLinks()
  return (
    <section id="offer" className="section offer" data-track="offer">
      <div className="giant back" aria-hidden="true">{o.big}</div>
      <div className="offer-card front reveal">
        {o.isDemo && <span className="demo-tag">Demo offer</span>}
        <h2>{o.title}</h2>
        {o.sub && <p>{o.sub}</p>}
        <a className="btn big" href="#shop" onClick={e => { e.preventDefault(); track('cta_click', { cta: 'offer_primary' }); goTo('#shop') }}>{o.cta}</a>
        {links.length > 0 && (
          <form className="zip" onSubmit={e => {
            e.preventDefault()
            if (!/^\d{5}$/.test(zip)) return
            setSent(true)
            track('store_finder_submit', { zip3: zip.slice(0, 3) })
          }}>
            <label htmlFor="zip">{o.zipLabel}</label>
            <div className="zip-row">
              <input id="zip" inputMode="numeric" autoComplete="postal-code" placeholder="ZIP code" maxLength={5}
                value={zip} onChange={e => { setZip(e.target.value.replace(/\D/g, '')); setSent(false) }} />
              <button className="btn dark" type="submit">Find</button>
            </div>
            {sent && (
              <p className="store-links">
                Check stock near {zip}:{' '}
                {links.map(l => <a key={l.name} href={l.href} target="_blank" rel="noreferrer" onClick={() => track('retailer_click', { retailer: l.name })}>{l.name}</a>)}
              </p>
            )}
          </form>
        )}
      </div>
    </section>
  )
}
