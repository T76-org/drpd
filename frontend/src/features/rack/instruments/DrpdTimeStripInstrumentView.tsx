import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { RackInstrument } from '../../../lib/rack/types'
import { InstrumentBase } from '../InstrumentBase'
import styles from './DrpdTimeStripInstrumentView.module.css'
import {
  calculateTimestripWidthPx,
  clampTimestripZoomDenominator,
} from './timestrip/timestripLayout'
import { TimestripTiledRenderer } from './timestrip/timestripTiledRenderer'

const PLACEHOLDER_TIMELINE_START_US = 0n
const PLACEHOLDER_TIMELINE_END_US = 10_000_000n
const DEFAULT_ZOOM_DENOMINATOR = 1000
const CTRL_WHEEL_ZOOM_STEP = 1.1

/**
 * Standalone DRPD timestrip instrument shell.
 */
export const DrpdTimeStripInstrumentView = ({
  instrument,
  displayName,
  isEditMode,
  onRemove,
}: {
  instrument: RackInstrument
  displayName: string
  isEditMode: boolean
  onRemove?: (instrumentId: string) => void
}) => {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<TimestripTiledRenderer | null>(null)
  const [worldStartWallClockUs] = useState(() => Date.now() * 1000)
  const [viewportWidthPx, setViewportWidthPx] = useState(0)
  const [viewportHeightPx, setViewportHeightPx] = useState(0)
  const [scrollLeftPx, setScrollLeftPx] = useState(0)
  const [zoomDenominator, setZoomDenominator] = useState(DEFAULT_ZOOM_DENOMINATOR)
  const timelineDurationUs = PLACEHOLDER_TIMELINE_END_US - PLACEHOLDER_TIMELINE_START_US
  const timelineWidthPx = calculateTimestripWidthPx(
    timelineDurationUs,
    zoomDenominator,
    viewportWidthPx,
  )
  const commitZoomDenominator = useCallback((value: number | string) => {
    const nextZoomDenominator = clampTimestripZoomDenominator(value)
    setZoomDenominator(nextZoomDenominator)
  }, [])
  const handleViewportWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const viewport = event.currentTarget
    if (event.ctrlKey) {
      event.preventDefault()
      const direction = event.deltaY < 0 ? -1 : 1
      const scale = direction < 0 ? 1 / CTRL_WHEEL_ZOOM_STEP : CTRL_WHEEL_ZOOM_STEP
      const nextZoomDenominator = clampTimestripZoomDenominator(Math.round(zoomDenominator * scale))
      const viewportRect = viewport.getBoundingClientRect()
      const pointerX = Math.max(0, event.clientX - viewportRect.left)
      const timestampUnderPointerUs = (viewport.scrollLeft + pointerX) * zoomDenominator
      const nextScrollLeft = Math.max(0, timestampUnderPointerUs / nextZoomDenominator - pointerX)
      flushSync(() => {
        commitZoomDenominator(nextZoomDenominator)
      })
      viewport.scrollLeft = nextScrollLeft
      return
    }

    const scrollDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    if (scrollDelta === 0 || viewport.scrollWidth <= viewport.clientWidth) {
      return
    }
    event.preventDefault()
    viewport.scrollLeft += scrollDelta
    setScrollLeftPx(viewport.scrollLeft)
  }, [commitZoomDenominator, zoomDenominator])

  const handleViewportScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    setScrollLeftPx(event.currentTarget.scrollLeft)
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return undefined
    }

    const updateViewportWidth = () => {
      setViewportWidthPx(Math.max(0, Math.floor(viewport.clientWidth)))
      setViewportHeightPx(Math.max(0, Math.floor(viewport.clientHeight)))
    }
    updateViewportWidth()

    if (typeof ResizeObserver === 'undefined') {
      return undefined
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      const inlineSize = entry?.contentBoxSize?.[0]?.inlineSize ?? entry?.contentRect.width
      const blockSize = entry?.contentBoxSize?.[0]?.blockSize ?? entry?.contentRect.height
      setViewportWidthPx(Math.max(0, Math.floor(inlineSize ?? viewport.clientWidth)))
      setViewportHeightPx(Math.max(0, Math.floor(blockSize ?? viewport.clientHeight)))
    })
    observer.observe(viewport)
    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return undefined
    }
    const renderer = new TimestripTiledRenderer({ canvas })
    rendererRef.current = renderer
    return () => {
      renderer.dispose()
      if (rendererRef.current === renderer) {
        rendererRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    rendererRef.current?.setViewport({
      scrollLeftPx,
      zoomDenominator,
      viewportWidthPx,
      viewportHeightPx,
      dpr: window.devicePixelRatio || 1,
      worldStartWallClockUs,
    })
  }, [scrollLeftPx, viewportHeightPx, viewportWidthPx, worldStartWallClockUs, zoomDenominator])

  return (
    <InstrumentBase
      instrument={instrument}
      displayName={displayName}
      isEditMode={isEditMode}
      contentClassName={styles.content}
      headerAccessory={
        <span className={styles.zoomReadout} aria-label={`Zoom 1:${zoomDenominator}`}>
          Zoom 1:{zoomDenominator}
        </span>
      }
      onClose={
        onRemove
          ? () => {
              onRemove(instrument.id)
            }
          : undefined
      }
    >
      <div
        ref={viewportRef}
        className={styles.viewport}
        data-testid="drpd-timestrip-viewport"
        onWheel={handleViewportWheel}
        onScroll={handleViewportScroll}
      >
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          data-testid="drpd-timestrip-canvas"
          style={{
            width: `${viewportWidthPx}px`,
            height: `${viewportHeightPx}px`,
          }}
        />
        <div
          className={styles.timeline}
          data-testid="drpd-timestrip-timeline"
          style={{ width: `${timelineWidthPx}px` }}
        />
      </div>
    </InstrumentBase>
  )
}
