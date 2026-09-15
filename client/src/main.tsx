import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Register the cache-first service worker only in production builds.
// updateViaCache: 'none' — sw.js itself is a plain static file, subject to
// ordinary browser HTTP caching unless told otherwise; without this, a
// returning visitor's browser can keep serving an OLD cached sw.js for up
// to 24h (the spec's own max recheck interval) even right after a fresh
// deploy, silently running stale worker logic despite a correct new file
// already live on the server.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // The new worker takes control (skipWaiting + clients.claim in sw.js) but
  // an already-open tab's currently-running JS doesn't swap itself out —
  // reload once when that handover happens so visitors actually see the
  // new build instead of stale UI with a silently-updated worker
  // underneath. Guarded against firing twice (the event can repeat).
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return
    reloaded = true
    window.location.reload()
  })

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' })
      .then((reg) => {
        // Also nudge an immediate check on THIS load (not just future
        // navigations) so an update deployed while the tab was closed is
        // picked up right away rather than waiting for the next visit.
        reg.update().catch(() => {})
      })
      .catch(() => {
        /* offline support is best-effort */
      })
  })
}

createRoot(document.getElementById('root')!).render(<App />)
