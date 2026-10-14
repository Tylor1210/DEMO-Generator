import { useEffect, useRef, useState } from 'react'
import { Logo } from './site'

const MAX_IMAGES = 4

export default function Home({ go }) {
  const q = new URLSearchParams(location.search)
  const [url, setUrl] = useState(q.get('url') ?? '')
  const [email, setEmail] = useState('')
  const [owner, setOwner] = useState(false)
  const [more, setMore] = useState(q.get('more') === '1')
  const [ig, setIg] = useState('')
  const [pasted, setPasted] = useState('')
  const [images, setImages] = useState([]) // [{ file, kind, preview }]
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const moreRef = useRef()

  useEffect(() => { if (q.get('more') === '1') moreRef.current?.scrollIntoView({ block: 'center' }) }, [])
  useEffect(() => () => images.forEach(i => URL.revokeObjectURL(i.preview)), [images])

  const addFiles = files => {
    const next = [...images]
    for (const f of files) {
      if (next.length >= MAX_IMAGES) break
      if (!/^image\//.test(f.type)) continue
      next.push({ file: f, kind: 'photo', preview: URL.createObjectURL(f) })
    }
    setImages(next)
  }

  const submit = async e => {
    e.preventDefault()
    setError('')
    setBusy(true)
    const fd = new FormData()
    fd.set('url', url)
    fd.set('email', email)
    fd.set('ownerClaim', owner ? 'true' : 'false')
    if (ig) fd.set('igUrl', ig)
    if (pasted) fd.set('pasted', pasted)
    images.forEach(i => { fd.append('images', i.file); fd.append('kinds', i.kind) })
    try {
      const res = await fetch('/api/runs', { method: 'POST', body: fd })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Something went wrong. Please try again.')
      if (body.existing) { location.href = body.url; return }
      go(body.url)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <header className="top"><Logo /></header>
      <main className="home">
        <section className="intro">
          <p className="eyebrow">Shoppable 3D product demos</p>
          <h1>Your turn. Paste your website.</h1>
          <p className="lede">We read your site, write the copy from your own words, and build a scroll demo your customers can shop. It takes about a minute.</p>
        </section>

        <form className="card form" onSubmit={submit} noValidate>
          <label className="field">
            <span>Website</span>
            <input type="url" inputMode="url" autoComplete="url" placeholder="yourbrand.com" required value={url} onChange={e => setUrl(e.target.value)} />
          </label>
          <label className="field">
            <span>Email</span>
            <input type="email" inputMode="email" autoComplete="email" placeholder="you@yourbrand.com" required value={email} onChange={e => setEmail(e.target.value)} />
            <small>So we can send you the demo link.</small>
          </label>
          <label className="check">
            <input type="checkbox" checked={owner} onChange={e => setOwner(e.target.checked)} />
            <span>I own or work for this business</span>
          </label>

          <button type="button" className="disclosure" aria-expanded={more} onClick={() => setMore(!more)}>
            {more ? 'Hide extras' : 'Add product images or Instagram (optional)'}
          </button>

          {more && (
            <div className="extras" ref={moreRef}>
              <label className="field">
                <span>Instagram</span>
                <input type="url" inputMode="url" placeholder="instagram.com/yourbrand" value={ig} onChange={e => setIg(e.target.value)} />
                <small>Saved as a link only. We don’t read Instagram.</small>
              </label>

              <div className="field">
                <span>Product images (up to 4)</span>
                <label className="drop">
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" multiple onChange={e => { addFiles(e.target.files); e.target.value = '' }} disabled={images.length >= MAX_IMAGES} />
                  <span>{images.length >= MAX_IMAGES ? 'That’s the max' : 'Choose images'}</span>
                </label>
                {images.length > 0 && (
                  <ul className="thumbs">
                    {images.map((img, i) => (
                      <li key={img.preview}>
                        <img src={img.preview} alt="" />
                        <div className="seg" role="radiogroup" aria-label={`Image ${i + 1} type`}>
                          {[['photo', 'Product photo'], ['label', 'Label artwork']].map(([k, l]) => (
                            <button type="button" key={k} role="radio" aria-checked={img.kind === k} className={img.kind === k ? 'on' : ''}
                              onClick={() => setImages(images.map((x, j) => (j === i ? { ...x, kind: k } : x)))}>{l}</button>
                          ))}
                        </div>
                        <button type="button" className="remove" aria-label={`Remove image ${i + 1}`} onClick={() => setImages(images.filter((_, j) => j !== i))}>Remove</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <label className="field">
                <span>Product info</span>
                <textarea rows={4} placeholder="Product names, prices, what's in them, where to buy them" value={pasted} onChange={e => setPasted(e.target.value)} />
                <small>Only needed if your site blocks bots. We use your words as written.</small>
              </label>
            </div>
          )}

          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" type="submit" disabled={busy || !url || !email}>
            {busy ? 'Starting…' : 'Build my demo'}
          </button>
          <p className="fine">Demos are labeled concepts, unlisted and temporary. They never take payments for your brand.</p>
        </form>
      </main>
    </div>
  )
}
