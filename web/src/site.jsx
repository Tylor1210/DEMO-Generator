import { useEffect, useState } from 'react'

// Small shared helpers for the site.
let cached
export async function siteConfig() {
  if (!cached) cached = fetch('/api/site').then(r => (r.ok ? r.json() : {})).catch(() => ({}))
  return cached
}

// Typing loop for the wordmark: ".dev" holds, the cursor deletes it, ".app" types in and holds
// five times as long as the ".dev" hold plus the deletion, then it goes back. Still ".app" with reduced motion.
const DEV_HOLD = 1500
const KEY_MS = 110
const APP_HOLD = 5 * (DEV_HOLD + 4 * KEY_MS)

function useTld() {
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const [text, setText] = useState(reduce ? '.app' : '.dev')
  const [typing, setTyping] = useState(false)
  useEffect(() => {
    if (reduce) return
    let live = true, timer
    const wait = ms => new Promise(r => { timer = setTimeout(r, ms) })
    const swap = async (from, to) => {
      setTyping(true)
      for (let i = from.length - 1; i >= 0 && live; i--) { setText(from.slice(0, i)); await wait(KEY_MS) }
      for (let i = 1; i <= to.length && live; i++) { setText(to.slice(0, i)); await wait(KEY_MS) }
      setTyping(false)
    }
    ;(async () => {
      while (live) {
        await wait(DEV_HOLD); if (!live) break
        await swap('.dev', '.app')
        await wait(APP_HOLD); if (!live) break
        await swap('.app', '.dev')
      }
    })()
    return () => { live = false; clearTimeout(timer) }
  }, [reduce])
  return { text, typing }
}

function Mark() {
  return (
    <svg className="mark" viewBox="0 0 40 40" width="36" height="36" aria-hidden="true">
      <rect x="1" y="1" width="38" height="38" rx="9" fill="#1b1a33" stroke="#8b7cf6" strokeWidth="1.5" />
      <circle cx="8" cy="7.5" r="1.4" fill="#ff5f57" />
      <circle cx="12.5" cy="7.5" r="1.4" fill="#febc2e" />
      <circle cx="17" cy="7.5" r="1.4" fill="#28c840" />
      <path d="M14 15.5 9 22l5 6.5M26 15.5l5 6.5-5 6.5M22.5 13.5 17.5 30.5" fill="none" stroke="#a99cff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Logo() {
  const { text, typing } = useTld()
  return (
    <a className="logo" href="/" aria-label="tycodes home">
      <Mark />
      <span className="word" aria-hidden="true">
        tycodes<span className="tail"><span className="tld">{text}</span><span className={`cursor ${typing ? 'typing' : ''}`} /></span>
      </span>
    </a>
  )
}
