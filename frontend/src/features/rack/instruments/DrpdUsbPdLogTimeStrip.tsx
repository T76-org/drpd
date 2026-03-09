import {
  useEffect,
  useRef,
  useState,
  type RefObject,
  type PointerEvent,
} from 'react'
import type { MessageLogTimeStripWindow } from '../../../lib/device'
import type { RackDeviceState } from '../RackRenderer'
import styles from './DrpdUsbPdLogTimeStrip.module.css'
import { DrpdUsbPdLogTimeStripRenderer } from './DrpdUsbPdLogTimeStripRenderer'
import {
  DEFAULT_WINDOW_US,
  clampWindowStartUs,
  centerWindowOnSpanUs,
  parseMessageSelectionKey,
  zoomWindowAroundFocusUs,
} from './DrpdUsbPdLogTimeStrip.utils'

/**
 * Time-strip controller for the Message Log instrument.
 */
export const DrpdUsbPdLogTimeStrip = ({
  driver,
  selectedKey,
  isEditMode,
}: {
  driver?: RackDeviceState['drpdDriver']
  selectedKey: string | null
  isEditMode: boolean
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const initialAlignmentDoneRef = useRef(false)
  const lastAutoCenterSignatureRef = useRef<string | null>(null)
  const panRef = useRef<{ pointerId: number; startX: number; startWindowStartUs: bigint } | null>(null)
  const [width, setWidth] = useState(0)
  const [windowDurationUs, setWindowDurationUs] = useState(DEFAULT_WINDOW_US)
  const [windowStartUs, setWindowStartUs] = useState(0n)
  const [data, setData] = useState<MessageLogTimeStripWindow | null>(null)
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    initialAlignmentDoneRef.current = false
    lastAutoCenterSignatureRef.current = null
    setData(null)
    setWindowDurationUs(DEFAULT_WINDOW_US)
    setWindowStartUs(0n)
  }, [driver])

  useEffect(() => {
    const element = containerRef.current
    if (!element || typeof ResizeObserver === 'undefined') {
      return undefined
    }
    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? 0
      setWidth(nextWidth)
    })
    observer.observe(element)
    setWidth(element.clientWidth)
    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    const element = viewportRef.current
    if (!element) {
      return undefined
    }
    const handleNativeWheel = (event: globalThis.WheelEvent): void => {
      if (width <= 0) {
        return
      }
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        const rect = element.getBoundingClientRect()
        const relativeX = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0.5
        handleZoom(event.deltaY < 0 ? 'in' : 'out', Math.max(0, Math.min(1, relativeX)))
        return
      }
      const dominantDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY
      if (dominantDelta === 0) {
        return
      }
      event.preventDefault()
      const deltaUs = BigInt(Math.round((dominantDelta / width) * Number(windowDurationUs)))
      setWindowStartUs((current) =>
        clampWindowStartUs(
          current + deltaUs,
          windowDurationUs,
          data?.earliestTimestampUs ?? null,
          data?.latestTimestampUs ?? null,
        ),
      )
    }
    element.addEventListener('wheel', handleNativeWheel, { passive: false })
    return () => {
      element.removeEventListener('wheel', handleNativeWheel)
    }
  }, [data?.earliestTimestampUs, data?.latestTimestampUs, width, windowDurationUs, windowStartUs])

  useEffect(() => {
    if (!driver || width <= 0 || !('queryMessageLogTimeStripWindow' in driver)) {
      setData(null)
      return
    }
    let cancelled = false
    void driver
      .queryMessageLogTimeStripWindow({
        windowStartUs,
        windowDurationUs,
        analogPointBudget: Math.max(64, Math.floor(width * 1.5)),
      })
      .then((next) => {
        if (cancelled) {
          return
        }
        setData(next)
        if (!initialAlignmentDoneRef.current && next.latestTimestampUs !== null) {
          initialAlignmentDoneRef.current = true
          const alignedStartUs = clampWindowStartUs(
            next.latestTimestampUs - windowDurationUs,
            windowDurationUs,
            next.earliestTimestampUs,
            next.latestTimestampUs,
          )
          if (alignedStartUs !== windowStartUs) {
            setWindowStartUs(alignedStartUs)
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [driver, width, windowDurationUs, windowStartUs])

  useEffect(() => {
    const parsed = selectedKey ? parseMessageSelectionKey(selectedKey) : null
    if (!parsed) {
      lastAutoCenterSignatureRef.current = null
      return
    }
    const signature = [
      selectedKey,
      data?.earliestTimestampUs?.toString() ?? 'null',
      data?.latestTimestampUs?.toString() ?? 'null',
    ].join(':')
    if (lastAutoCenterSignatureRef.current === signature) {
      return
    }
    lastAutoCenterSignatureRef.current = signature
    setWindowStartUs((current) => {
      const nextStartUs = centerWindowOnSpanUs(
        parsed.startTimestampUs,
        parsed.endTimestampUs,
        windowDurationUs,
      )
      const clampedStartUs = clampWindowStartUs(
        nextStartUs,
        windowDurationUs,
        data?.earliestTimestampUs ?? null,
        data?.latestTimestampUs ?? null,
      )
      return clampedStartUs === current ? current : clampedStartUs
    })
  }, [data?.earliestTimestampUs, data?.latestTimestampUs, selectedKey])

  const handleZoom = (direction: 'in' | 'out', focusRatio = 0.5): void => {
    const nextWindow = zoomWindowAroundFocusUs(
      windowStartUs,
      windowDurationUs,
      direction,
      focusRatio,
      data?.earliestTimestampUs ?? null,
      data?.latestTimestampUs ?? null,
    )
    if (
      nextWindow.windowStartUs === windowStartUs &&
      nextWindow.windowDurationUs === windowDurationUs
    ) {
      return
    }
    setWindowStartUs(nextWindow.windowStartUs)
    setWindowDurationUs(nextWindow.windowDurationUs)
  }

  /**
   * Begin panning the time strip.
   *
   * @param event - Pointer event.
   */
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (isEditMode) {
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWindowStartUs: windowStartUs,
    }
  }

  /**
   * Continue panning the time strip.
   *
   * @param event - Pointer event.
   */
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    setHoverPosition({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    })
    const pan = panRef.current
    if (!pan || pan.pointerId !== event.pointerId || width <= 0) {
      return
    }
    const deltaPx = event.clientX - pan.startX
    const deltaUs = BigInt(Math.round((deltaPx / width) * Number(windowDurationUs)))
    setWindowStartUs(
      clampWindowStartUs(
        pan.startWindowStartUs - deltaUs,
        windowDurationUs,
        data?.earliestTimestampUs ?? null,
        data?.latestTimestampUs ?? null,
      ),
    )
  }

  /**
   * End panning the time strip.
   */
  const handlePointerEnd = (): void => {
    panRef.current = null
  }

  /**
   * Clear hover state when leaving the strip.
   */
  const handlePointerLeave = (): void => {
    setHoverPosition(null)
  }

  return (
    <div className={styles.timeStripShell} ref={containerRef}>
      <DrpdUsbPdLogTimeStripRenderer
        viewportRef={viewportRef as RefObject<HTMLDivElement>}
        width={Math.max(width, 1)}
        data={data}
        hoverPosition={hoverPosition}
        selectedKey={selectedKey}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerLeave={handlePointerLeave}
      />
    </div>
  )
}
