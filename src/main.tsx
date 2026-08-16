import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const rootEl = document.getElementById('root')

if (!rootEl) {
  throw new Error('Root element #root not found')
}

try {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  try {
    sessionStorage.removeItem('traduttore_sw_rescue')
  } catch {
    /* ignore */
  }
} catch (err) {
  console.error('App failed to start:', err)
  rootEl.innerHTML =
    '<div style="min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui;color:#e2e8f0;background:#05070d;text-align:center">' +
    '<div><p style="font-size:18px;font-weight:600;margin:0 0 8px">Qualcosa non ha caricato</p>' +
    '<p style="font-size:14px;color:#94a3b8;margin:0 0 16px">Tocca per ricaricare l’app</p>' +
    '<button onclick="location.reload()" style="border:0;border-radius:12px;padding:12px 18px;background:#3b82f6;color:#fff;font-weight:600">Ricarica</button></div></div>'
}
