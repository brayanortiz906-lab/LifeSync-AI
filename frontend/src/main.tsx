import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// v44: service worker para que la app se pueda instalar en el celular
// (Android) y siga abriendo aunque no haya internet.
if ('serviceWorker' in navigator) {
  const base = import.meta.env.BASE_URL || '/'
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${base}sw.js`).catch(() => undefined)
  })
}
