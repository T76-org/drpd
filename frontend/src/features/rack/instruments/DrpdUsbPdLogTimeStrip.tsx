import {
  useEffect,
  useRef,
  useState,
  type RefObject,
  type PointerEvent,
} from 'react'
import { DRPDDevice, type MessageLogTimeStripWindow } from '../../../lib/device'
import type { RackDeviceState } from '../RackRenderer'
import styles from './DrpdUsbPdLogTimeStrip.module.css'
import { DrpdUsbPdLogTimeStripRenderer } from './DrpdUsbPdLogTimeStripRenderer'
import {
  DEFAULT_WINDOW_US,
  clampWindowStartUs,
  centerWindowOnTimestampUs,
  parseLogSelectionKey,
  zoomWindowAroundFocusUs,
} from './DrpdUsbPdLogTimeStrip.utils'

const LIVE_EDGE_TOLERANCE_DIVISOR = 50n

const resolveLogEntryLatestTimestampUs = (detail: unknown): bigint | null => {
  if (!detail || typeof detail !== 'object') {
    return null
  }
  const probe = detail as {
    kind?: string
    row?: { timestampUs?: bigint; endTimestampUs?: bigint; entryKind?: string }
  }
  if (probe.kind === 'analog') {
    return probe.row?.timestampUs ?? null
  }
  if (probe.kind === 'message') {
    return probe.row?.endTimestampUs ?? null
  }
  return null
}

const isWindowAtLiveEdge = (
  windowStartUs: bigint,
  windowDurationUs: bigint,
  latestTimestampUs: bigint | null,
): boolean => {
  if (latestTimestampUs === null) {
    return true
  }
  const toleranceUs = windowDurationUs > LIVE_EDGE_TOLERANCE_DIVISOR
    ? windowDurationUs / LIVE_EDGE_TOLERANCE_DIVISOR
    : 1n
  return windowStartUs + windowDurationUs >= latestTimestampUs - toleranceUs
}

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
  const windowStartUsRef = useRef(0n)
  const windowDurationUsRef = useRef(DEFAULT_WINDOW_US)
  const dataRef = useRef<MessageLogTimeStripWindow | null>(null)
  const followLiveRef = useRef(true)
  const [width, setWidth] = useState(0)
  const [windowDurationUs, setWindowDurationUs] = useState<bigint>(DEFAULT_WINDOW_US)
  const [windowStartUs, setWindowStartUs] = useState<bigint>(0n)
  const [data, setData] = useState<MessageLogTimeStripWindow | null>(null)
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const refreshTimerRef = useRef<number | null>(null)

  useEffect(() => {
    windowStartUsRef.current = windowStartUs
  }, [windowStartUs])

  useEffect(() => {
    windowDurationUsRef.current = windowDurationUs
  }, [windowDurationUs])

  useEffect(() => {
    dataRef.current = data
  }, [data])

  useEffect(() => {
    initialAlignmentDoneRef.current = false
    lastAutoCenterSignatureRef.current = null
    windowStartUsRef.current = 0n
    windowDurationUsRef.current = DEFAULT_WINDOW_US
    dataRef.current = null
    followLiveRef.current = true
    setData(null)
    setWindowDurationUs(DEFAULT_WINDOW_US)
    setWindowStartUs(0n)
    setRefreshVersion(0)
  }, [driver])

  useEffect(() => () => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!driver) {
      return undefined
    }
    const scheduleRefresh = (): void => {
      if (refreshTimerRef.current !== null) {
        return
      }
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null
        setRefreshVersion((current) => current + 1)
      }, 0)
    }
    const handleAdded = (event: Event): void => {
      const detail = event instanceof CustomEvent ? event.detail : undefined
      const currentData = dataRef.current
      const currentWindowStartUs = windowStartUsRef.current
      const currentWindowDurationUs = windowDurationUsRef.current
      const addedLatestTimestampUs = resolveLogEntryLatestTimestampUs(detail)
      if (followLiveRef.current && addedLatestTimestampUs !== null) {
        const nextStartUs = clampWindowStartUs(
          addedLatestTimestampUs - currentWindowDurationUs,
          currentWindowDurationUs,
          currentData?.earliestTimestampUs ?? null,
          addedLatestTimestampUs,
        )
        if (nextStartUs !== currentWindowStartUs) {
          windowStartUsRef.current = nextStartUs
          setWindowStartUs(nextStartUs)
          return
        }
      }
      scheduleRefresh()
    }
    const handleDeleted = (event: Event): void => {
      const detail = event instanceof CustomEvent ? event.detail : undefined
      if (detail?.reason !== 'clear') {
        scheduleRefresh()
        return
      }
      initialAlignmentDoneRef.current = false
      lastAutoCenterSignatureRef.current = null
      panRef.current = null
      setHoverPosition(null)
      windowStartUsRef.current = 0n
      windowDurationUsRef.current = DEFAULT_WINDOW_US
      dataRef.current = null
      followLiveRef.current = true
      setData(null)
      setWindowDurationUs(DEFAULT_WINDOW_US)
      setWindowStartUs(0n)
      setRefreshVersion((current) => current + 1)
    }
    driver.addEventListener(DRPDDevice.LOG_ENTRY_ADDED_EVENT, handleAdded)
    driver.addEventListener(DRPDDevice.LOG_ENTRY_DELETED_EVENT, handleDeleted)
    return () => {
      driver.removeEventListener(DRPDDevice.LOG_ENTRY_ADDED_EVENT, handleAdded)
      driver.removeEventListener(DRPDDevice.LOG_ENTRY_DELETED_EVENT, handleDeleted)
    }
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
    const handleZoomLocal = (direction: 'in' | 'out', focusRatio = 0.5): void => {
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
      followLiveRef.current = isWindowAtLiveEdge(
        nextWindow.windowStartUs,
        nextWindow.windowDurationUs,
        data?.latestTimestampUs ?? null,
      )
      windowStartUsRef.current = nextWindow.windowStartUs
      windowDurationUsRef.current = nextWindow.windowDurationUs
      setWindowStartUs(nextWindow.windowStartUs)
      setWindowDurationUs(nextWindow.windowDurationUs)
    }
    const handleNativeWheel = (event: globalThis.WheelEvent): void => {
      if (width <= 0) {
        return
      }
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        const rect = element.getBoundingClientRect()
        const relativeX = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0.5
        handleZoomLocal(event.deltaY < 0 ? 'in' : 'out', Math.max(0, Math.min(1, relativeX)))
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
      setWindowStartUs((current) => {
        const nextStartUs = clampWindowStartUs(
          current + deltaUs,
          windowDurationUs,
          data?.earliestTimestampUs ?? null,
          data?.latestTimestampUs ?? null,
        )
        followLiveRef.current = isWindowAtLiveEdge(
          nextStartUs,
          windowDurationUs,
          data?.latestTimestampUs ?? null,
        )
        windowStartUsRef.current = nextStartUs
        return nextStartUs
      })
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
        dataRef.current = next
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
            followLiveRef.current = true
            windowStartUsRef.current = alignedStartUs
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
  }, [driver, refreshVersion, width, windowDurationUs, windowStartUs])

  useEffect(() => {
    const parsed = selectedKey ? parseLogSelectionKey(selectedKey) : null
    if (!parsed) {
      lastAutoCenterSignatureRef.current = null
      return
    }
    const signature = selectedKey
    if (lastAutoCenterSignatureRef.current === signature) {
      return
    }
    lastAutoCenterSignatureRef.current = signature
    setWindowStartUs((current) => {
      const nextStartUs = centerWindowOnTimestampUs(
        parsed.startTimestampUs,
        windowDurationUs,
      )
      const clampedStartUs = clampWindowStartUs(
        nextStartUs,
        windowDurationUs,
        data?.earliestTimestampUs ?? null,
        data?.latestTimestampUs ?? null,
      )
      followLiveRef.current = isWindowAtLiveEdge(
        clampedStartUs,
        windowDurationUs,
        data?.latestTimestampUs ?? null,
      )
      windowStartUsRef.current = clampedStartUs
      return clampedStartUs === current ? current : clampedStartUs
    })
  }, [selectedKey, windowDurationUs])

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
      startWindowStartUs: windowStartUsRef.current,
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
    const nextStartUs = clampWindowStartUs(
        pan.startWindowStartUs - deltaUs,
        windowDurationUs,
        data?.earliestTimestampUs ?? null,
        data?.latestTimestampUs ?? null,
      )
    followLiveRef.current = isWindowAtLiveEdge(
      nextStartUs,
      windowDurationUs,
      data?.latestTimestampUs ?? null,
    )
    windowStartUsRef.current = nextStartUs
    setWindowStartUs(nextStartUs)
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
