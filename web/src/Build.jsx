// Build page: polls the run, animates the bar between polls, shows live details, then reveals the demo.
import { useEffect, useRef, useState } from 'react'
import { Logo, siteConfig } from './site'

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

// BUILD_PROMPT 1d: finished stage weights + current weight x min(elapsed / expected, 0.9). Never backwards.
function compute(run, skew) {
  const now = Date.now() + skew
  const total = run.stages.reduce((a, s) => a + s.expectedMs, 0)
  let done = 0, current = null, remaining = 0, slow = false
  for (const s of run.stages) {
    if (s.status === 'done') done += s.expectedMs
    else if ((s.status === 'running' || s.status === 'review') && !current) {
      current = s
      const elapsed = s.startedAt ? now - s.startedAt : 0
      const frac = Math.min(elapsed / s.expectedMs, 0.9)
      done += s.expectedMs * frac
      if (elapsed > s.expectedMs) slow = true
      remaining += Math.max(s.expectedMs - elapsed, s.expectedMs * 0.1)
    } else remaining += s.expectedMs
  }
  return { pct: run.status === 'done' ? 1 : done / total, remaining, current, slow }
}

const etaText = ms => {
  const s = Math.max(5, Math.round(ms / 5000) * 5) // rounded to 5 s, never shown as 0 until done
  return s >= 60 ? `About ${Math.floor(s / 60)} min ${s % 60 ? `${s % 60} seconds ` : ''}left` : `About ${s} seconds left`
}

export default function Build({ id, go }) {
  const [run, setRun] = useState(null)
  const [missing, setMissing] = useState(false)
  const [view, setView] = useState({ pct: 0, eta: '', label: 'Starting', slow: false })
  const [booking, setBooking] = useState('')
  const [reveal, setReveal] = useState(false)
  const skew = useRef(0)
  const best = useRef(0)

  useEffect(() => { siteConfig().then(c => setBooking(c.bookingUrl || '')) }, [])

  // Poll once a second until the run settles.
  useEffect(() => {
    let stop = false, timer
    const tick = async () => {
      try {
        const res = await fetch(`/api/runs/${id}`, { cache: 'no-store' })
        if (res.status === 404) { setMissing(true); return }
        const r = await res.json()
        skew.current = r.serverNow - Date.now()
        setRun(r)
        if (r.status === 'done') { setTimeout(() => setReveal(true), reduced() ? 0 : 700); return }
        if (r.status === 'blocked' || r.status === 'failed') return
      } catch { /* network blip: keep polling */ }
      if (!stop) timer = setTimeout(tick, 1000)
    }
    tick()
    return () => { stop = true; clearTimeout(timer) }
  }, [id])

  // Recompute the bar and ETA every second between polls, so it keeps moving smoothly.
  useEffect(() => {
    if (!run) return
    const update = () => {
      const c = compute(run, skew.current)
      best.current = Math.max(best.current, c.pct)
      setView({
        pct: best.current,
        eta: run.status === 'done' ? 'Done' : etaText(c.remaining),
        label: c.slow ? 'Taking a little longer than usual, almost there' : c.current?.label ?? (run.status === 'done' ? 'Your demo is ready' : 'Starting'),
        slow: c.slow,
      })
    }
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [run])

  if (missing) return <Shell><div className="card"><h1>We can’t find that build.</h1><p className="lede">The link may be mistyped.</p><a className="primary" href="/">Start a new demo</a></div></Shell>
  if (!run) return <Shell><div className="card"><p className="lede">Loading…</p></div></Shell>

  const d = run.details
  const host = (() => { try { return new URL(/^https?:/.test(run.site) ? run.site : `https://${run.site}`).hostname.replace(/^www\./, '') } catch { return '' } })()
  const settled = run.status === 'blocked' || run.status === 'failed'

  return (
    <Shell>
      <div className="card build">
        <p className="eyebrow">{host ? `Demo for ${host}` : 'Building your demo'}</p>
        <h1>{settled ? 'We need a hand with this one.' : run.status === 'done' ? 'Your demo is ready.' : 'Hang tight. This takes about a minute.'}</h1>

        {!settled && (
          <>
            <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(view.pct * 100)} aria-label="Build progress">
              <div className="fill" style={{ transform: `scaleX(${view.pct})` }} />
            </div>
            <div className="bar-meta">
              <span className={view.slow ? 'slow' : ''}>{run.status === 'queued' ? 'Queued' : view.label}</span>
              <span>{run.status === 'queued' ? 'Starts automatically' : view.eta}</span>
            </div>
          </>
        )}

        {run.status === 'review' && <p className="note">We’re giving your demo a quick human check before it goes live.</p>}
        {run.status === 'queued' && <p className="note">We’re at today’s build limit. Yours is in line and will start on its own. Keep this link.</p>}
        {settled && <Trouble run={run} booking={booking} go={go} />}

        <ol className="stages">
          {run.stages.map(s => (
            <li key={s.id} className={s.status}>
              <span className="dot" aria-hidden="true" />
              <span>{s.label}</span>
              <span className="state">{s.status === 'done' ? 'Done' : s.status === 'running' ? 'Working' : s.status === 'blocked' ? 'Needs you' : s.status === 'failed' ? 'Stopped' : ''}</span>
            </li>
          ))}
        </ol>

        {(d.details.length > 0 || d.swatches?.length > 0) && (
          <section className="live" aria-live="polite">
            <h2>What we found</h2>
            {d.swatches?.length > 0 && (
              <div className="swatches">{d.swatches.map(c => <span key={c} className="sw" style={{ background: c }} title={c} />)}</div>
            )}
            <ul className="facts">{d.details.map((t, i) => <li key={i}>{t}</li>)}</ul>
            {d.products?.length > 0 && <div className="chips">{d.products.map(p => <span key={p} className="chip">{p}</span>)}</div>}
            {d.objections?.length > 0 && (
              <>
                <h3>Questions your demo will answer</h3>
                <ul className="objections">{d.objections.map(o => <li key={o}>{o}</li>)}</ul>
              </>
            )}
          </section>
        )}

        {booking && !settled && run.status !== 'done' && (
          <a className="ghost" href={booking} target="_blank" rel="noreferrer">Book a call while you wait</a>
        )}
        {run.status === 'done' && !reveal && <button className="primary" onClick={() => setReveal(true)}>See your demo</button>}
      </div>
      {reveal && run.url && <Reveal run={run} booking={booking} onClose={() => setReveal(false)} />}
    </Shell>
  )
}

function Trouble({ run, booking, go }) {
  const blocked = run.status === 'blocked'
  return (
    <div className="trouble">
      <p className="lede">{blocked ? run.message : 'Something went wrong while building. It’s on us, not your site.'}</p>
      <div className="row">
        <button className="primary" onClick={() => go(`/?more=1`)}>Upload product images instead</button>
        {booking && <a className="ghost" href={booking} target="_blank" rel="noreferrer">Book a call</a>}
      </div>
    </div>
  )
}

function Reveal({ run, booking, onClose }) {
  const [copied, setCopied] = useState(false)
  const full = new URL(run.url, location.origin).toString()
  const dialog = useRef()
  useEffect(() => {
    dialog.current?.showModal?.()
    const onKey = e => { if (e.key === 'Escape') onClose() }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <dialog ref={dialog} className="reveal" onClose={onClose} aria-label="Your demo">
      <div className="frame">
        <iframe title="Demo preview" src={`${run.url}?variant=static`} loading="eager" />
      </div>
      <div className="reveal-actions">
        <a className="primary" href={run.url}>Open full demo</a>
        {booking && <a className="ghost" href={booking} target="_blank" rel="noreferrer">Book a call to make it live</a>}
        <button className="ghost" onClick={async () => { try { await navigator.clipboard.writeText(full); setCopied(true) } catch { /* clipboard blocked */ } }}>
          {copied ? 'Link copied' : 'Copy link'}
        </button>
        <button className="text" onClick={onClose}>Close</button>
      </div>
    </dialog>
  )
}

function Shell({ children }) {
  return (
    <div className="page">
      <header className="top"><Logo /></header>
      <main className="home narrow">{children}</main>
    </div>
  )
}
