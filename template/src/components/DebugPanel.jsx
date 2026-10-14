// Open the page with ?debug=1 to see live analytics. Handy during a pitch:
// "here's what people scroll to, tap and add to cart."
import { useEffect, useState } from 'react'
import { clearEvents, getEvents, onEvents, variant } from '../analytics'

export default function DebugPanel({ mode }) {
  const [events, setEvents] = useState(getEvents())
  const [min, setMin] = useState(false)
  useEffect(() => onEvents(setEvents), [])

  const counts = {}
  const sections = []
  const products = {}
  events.forEach(e => {
    counts[e.name] = (counts[e.name] || 0) + 1
    if (e.name === 'section_view' && !sections.includes(e.props.section)) sections.push(e.props.section)
    if (e.props.product && (e.name === 'product_select' || e.name === 'product_open' || e.name === 'add_to_cart')) {
      products[e.props.product] = (products[e.props.product] || 0) + 1
    }
  })

  return (
    <div className={`debug ${min ? 'min' : ''}`}>
      <div className="debug-head">
        <strong>Analytics</strong>
        <span>variant: {variant} · {mode}</span>
        <button onClick={() => setMin(!min)}>{min ? '▲' : '▼'}</button>
      </div>
      {!min && (
        <>
          <h4>Events</h4>
          <ul>{Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => <li key={k}><span>{k}</span><b>{v}</b></li>)}</ul>
          <h4>Sections reached</h4>
          <p>{sections.join(' → ') || 'none yet'}</p>
          <h4>Product interest</h4>
          <ul>{Object.entries(products).sort((a, b) => b[1] - a[1]).map(([k, v]) => <li key={k}><span>{k}</span><b>{v}</b></li>)}</ul>
          <h4>Last events</h4>
          <ol className="log">{events.slice(-6).reverse().map(e => <li key={e.t + e.name}>{e.name} {e.props.product || e.props.section || e.props.cta || ''}</li>)}</ol>
          <button className="clear" onClick={clearEvents}>Clear</button>
        </>
      )}
    </div>
  )
}
