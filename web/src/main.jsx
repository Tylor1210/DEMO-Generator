import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import Home from './Home'
import Build from './Build'
import './styles.css'

// Two routes, no router library: / and /build/:id.
function App() {
  const [path, setPath] = useState(location.pathname)
  useEffect(() => {
    const on = () => setPath(location.pathname)
    addEventListener('popstate', on)
    return () => removeEventListener('popstate', on)
  }, [])
  const go = to => { history.pushState(null, '', to); setPath(new URL(to, location.origin).pathname); scrollTo(0, 0) }
  const m = path.match(/^\/build\/([a-z0-9-]+)/)
  return m ? <Build id={m[1]} go={go} /> : <Home go={go} />
}

createRoot(document.getElementById('root')).render(<App />)
