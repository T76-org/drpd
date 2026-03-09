import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import './App.css'
import { RackView } from './features/rack/RackView'

/**
 * Application root component.
 */
const App = () => {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const scaleShellRef = useRef<HTMLDivElement | null>(null)
  const [appliedScale, setAppliedScale] = useState(1)

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const scaleShell = scaleShellRef.current
    if (!viewport || !scaleShell) {
      return undefined
    }

    const updateScale = () => {
      const preferredScale = Number.parseFloat(
        getComputedStyle(viewport).getPropertyValue('--app-scale'),
      )
      const nextPreferredScale =
        Number.isFinite(preferredScale) && preferredScale > 0 ? preferredScale : 1
      const naturalHeight = scaleShell.scrollHeight
      const viewportHeight = viewport.clientHeight

      if (naturalHeight <= 0 || viewportHeight <= 0) {
        setAppliedScale(nextPreferredScale)
        return
      }

      if (viewportHeight < naturalHeight) {
        setAppliedScale(1)
        return
      }

      const heightFitScale = viewportHeight / naturalHeight
      setAppliedScale(Math.max(1, Math.min(nextPreferredScale, heightFitScale)))
    }

    updateScale()
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => updateScale())
        : null
    observer?.observe(viewport)
    observer?.observe(scaleShell)
    window.addEventListener('resize', updateScale)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updateScale)
    }
  }, [])

  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--global-app-scale', String(appliedScale))
    return () => {
      document.documentElement.style.removeProperty('--global-app-scale')
    }
  }, [appliedScale])

  return (
    <div className="appViewport" data-testid="app-viewport" ref={viewportRef}>
      <div
        className="appScaleShell"
        data-testid="app-scale-shell"
        data-app-scale={appliedScale.toFixed(3)}
        style={{ '--app-scale-applied': String(appliedScale) } as CSSProperties}
      >
        <div className="appScaleContent" data-testid="app-scale-content" ref={scaleShellRef}>
          <RackView />
        </div>
      </div>
    </div>
  )
}

export default App
