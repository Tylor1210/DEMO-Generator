// Small shared helpers for the site.
let cached
export async function siteConfig() {
  if (!cached) cached = fetch('/api/site').then(r => (r.ok ? r.json() : {})).catch(() => ({}))
  return cached
}

export function Logo() {
  return (
    <a className="logo" href="/" aria-label="tycodes home">
      ty<span>codes</span>
    </a>
  )
}
