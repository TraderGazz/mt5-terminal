import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Register the cache-first service worker only in production builds.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* offline support is best-effort */
    })
  })
}

createRoot(document.getElementById('root')!).render(<App />)
