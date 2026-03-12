import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const REFERENCE_VIEWPORT_WIDTH_PX = 1024
const REFERENCE_CONTENT_WIDTH_PX = 800
const MIN_UI_SCALE = 0.82
const MAX_UI_SCALE = 2.8

const updateUiScale = (): void => {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return
  }
  const viewportWidth =
    window.screen?.width ??
    window.innerWidth ??
    document.documentElement.clientWidth
  const rawScale =
    (viewportWidth / REFERENCE_VIEWPORT_WIDTH_PX) *
    (REFERENCE_CONTENT_WIDTH_PX / REFERENCE_VIEWPORT_WIDTH_PX)

  const clampedScale = Math.max(MIN_UI_SCALE, Math.min(MAX_UI_SCALE, rawScale))
  document.documentElement.style.setProperty('--ui-scale', clampedScale.toFixed(4))
}

updateUiScale()
window.addEventListener('resize', updateUiScale, { passive: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
