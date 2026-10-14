import { createRoot } from 'react-dom/client'
import { applyTheme, setBrand } from './brand'
import { initStore } from './store'
import App from './App'
import './styles.css'

// The Worker inlines the config into the page (#demo-config) so there is no extra request.
// In dev, or if it is missing, fetch it from the API.
function demoSlug() {
  const m = location.pathname.match(/\/d\/([a-z0-9-]+)/)
  return m ? m[1] : new URLSearchParams(location.search).get('demo') || ''
}

async function loadConfig(slug) {
  const inline = document.getElementById('demo-config')
  if (inline?.textContent.trim()) return JSON.parse(inline.textContent)
  const res = await fetch(`/api/demos/${slug}`)
  if (!res.ok) throw new Error(String(res.status))
  return res.json()
}

const root = createRoot(document.getElementById('root'))
const slug = demoSlug()

loadConfig(slug)
  .then(cfg => {
    setBrand(cfg, slug, `/api/assets/demos/${slug}`)
    applyTheme()
    initStore()
    root.render(<App />)
  })
  .catch(() => {
    document.documentElement.classList.add('missing')
    root.render(
      <main className="missing-demo">
        <h1>This demo isn’t available.</h1>
        <p>It may have expired or been taken down. Concept demos are temporary.</p>
        <a className="btn big" href="https://tycodes.app/">Build a new one</a>
      </main>,
    )
  })
