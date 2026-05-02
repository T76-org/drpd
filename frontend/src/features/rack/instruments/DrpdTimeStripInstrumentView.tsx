import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RackInstrument } from '../../../lib/rack/types'
import { InstrumentBase } from '../InstrumentBase'
import styles from './DrpdTimeStripInstrumentView.module.css'
import {
  calculateTimestripWidthPx,
  clampTimestripZoomDenominator,
} from './timestrip/timestripLayout'

const PLACEHOLDER_TIMELINE_START_US = 0n
const PLACEHOLDER_TIMELINE_END_US = 10_000_000n
const DEFAULT_ZOOM_DENOMINATOR = 1000

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
  const [viewportWidthPx, setViewportWidthPx] = useState(0)
  const [zoomDenominator, setZoomDenominator] = useState(DEFAULT_ZOOM_DENOMINATOR)
  const [zoomInputValue, setZoomInputValue] = useState(DEFAULT_ZOOM_DENOMINATOR.toString())
  const timelineDurationUs = PLACEHOLDER_TIMELINE_END_US - PLACEHOLDER_TIMELINE_START_US
  const timelineWidthPx = calculateTimestripWidthPx(
    timelineDurationUs,
    zoomDenominator,
    viewportWidthPx,
  )
  const commitZoomDenominator = useCallback((value: number | string) => {
    const nextZoomDenominator = clampTimestripZoomDenominator(value)
    setZoomDenominator(nextZoomDenominator)
    setZoomInputValue(nextZoomDenominator.toString())
  }, [])
  const headerControls = useMemo(
    () => [
      {
        id: 'timestrip-zoom',
        label: `Zoom 1:${zoomDenominator}`,
        renderPopover: () => (
          <div className={styles.zoomPopover}>
            <label className={styles.zoomField}>
              <span className={styles.zoomLabel}>Zoom ratio</span>
              <input
                type="range"
                min="1"
                max="1000"
                step="1"
                value={zoomDenominator}
                onChange={(event) => {
                  commitZoomDenominator(event.currentTarget.value)
                }}
              />
            </label>
            <label className={styles.zoomField}>
              <span className={styles.zoomLabel}>1:</span>
              <input
                type="number"
                min="1"
                max="1000"
                step="1"
                value={zoomInputValue}
                className={styles.zoomInput}
                onChange={(event) => {
                  const nextValue = event.currentTarget.value
                  setZoomInputValue(nextValue)
                  if (nextValue !== '') {
                    commitZoomDenominator(nextValue)
                  }
                }}
                onBlur={() => {
                  if (zoomInputValue === '') {
                    setZoomInputValue(zoomDenominator.toString())
                  }
                }}
              />
            </label>
          </div>
        ),
      },
    ],
    [commitZoomDenominator, zoomDenominator, zoomInputValue],
  )

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return undefined
    }

    const updateViewportWidth = () => {
      setViewportWidthPx(Math.max(0, Math.floor(viewport.clientWidth)))
    }
    updateViewportWidth()

    if (typeof ResizeObserver === 'undefined') {
      return undefined
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      const inlineSize = entry?.contentBoxSize?.[0]?.inlineSize ?? entry?.contentRect.width
      setViewportWidthPx(Math.max(0, Math.floor(inlineSize ?? viewport.clientWidth)))
    })
    observer.observe(viewport)
    return () => {
      observer.disconnect()
    }
  }, [])

  return (
    <InstrumentBase
      instrument={instrument}
      displayName={displayName}
      isEditMode={isEditMode}
      contentClassName={styles.content}
      headerControls={headerControls}
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
      >
        <div
          className={styles.timeline}
          data-testid="drpd-timestrip-timeline"
          style={{ width: `${timelineWidthPx}px` }}
        />
      </div>
    </InstrumentBase>
  )
}
