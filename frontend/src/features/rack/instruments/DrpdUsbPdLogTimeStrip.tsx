import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from 'react'
import type { MessageLogTimeStripWindow } from '../../../lib/device'
import type { RackDeviceState } from '../RackRenderer'
import styles from './DrpdUsbPdLogTimeStrip.module.css'
import { buildDrpdUsbPdLogStyleVariables } from './DrpdUsbPdLogTimeStrip.config'
import { DrpdUsbPdLogTimeStripRenderer } from './DrpdUsbPdLogTimeStripRenderer'
import {
  DEFAULT_WINDOW_US,
  clampWindowStartUs,
  centerWindowOnSpanUs,
  parseMessageSelectionKey,
  zoomWindowDurationUs,
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
  const styleVariables = buildDrpdUsbPdLogStyleVariables()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const scrollbarRef = useRef<HTMLDivElement | null>(null)
  const initialAlignmentDoneRef = useRef(false)
  const panRef = useRef<{ pointerId: number; startX: number; startWindowStartUs: bigint } | null>(null)
  const suppressScrollSyncRef = useRef(false)
  const [width, setWidth] = useState(0)
  const [windowDurationUs, setWindowDurationUs] = useState(DEFAULT_WINDOW_US)
  const [windowStartUs, setWindowStartUs] = useState(0n)
  const [data, setData] = useState<MessageLogTimeStripWindow | null>(null)

  useEffect(() => {
    initialAlignmentDoneRef.current = false
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
      return
    }
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
  }, [data?.earliestTimestampUs, data?.latestTimestampUs, selectedKey, windowDurationUs])

  const scrollModel = useMemo(() => {
    const earliestTimestampUs = data?.earliestTimestampUs ?? null
    const latestTimestampUs = data?.latestTimestampUs ?? null
    if (earliestTimestampUs === null || latestTimestampUs === null) {
      return {
        enabled: false,
        contentWidthPx: Math.max(width, 1),
        maxScrollLeftPx: 0,
        maxOffsetUs: 0n,
      }
    }
    const rawMaxOffsetUs = latestTimestampUs - earliestTimestampUs - windowDurationUs
    const maxOffsetUs = rawMaxOffsetUs > 0n ? rawMaxOffsetUs : 0n
    const contentWidthPx =
      maxOffsetUs === 0n
        ? Math.max(width, 1)
        : Math.max(width + Math.min(12_000, Math.max(width, 1) * 6), width + 1)
    return {
      enabled: maxOffsetUs > 0n,
      contentWidthPx,
      maxScrollLeftPx: Math.max(0, contentWidthPx - Math.max(width, 1)),
      maxOffsetUs,
    }
  }, [data?.earliestTimestampUs, data?.latestTimestampUs, width, windowDurationUs])

  useEffect(() => {
    const scrollbar = scrollbarRef.current
    if (!scrollbar || !scrollModel.enabled || !data?.earliestTimestampUs) {
      if (scrollbar) {
        suppressScrollSyncRef.current = true
        scrollbar.scrollLeft = 0
        requestAnimationFrame(() => {
          suppressScrollSyncRef.current = false
        })
      }
      return
    }
    const offsetUs = windowStartUs - data.earliestTimestampUs
    const ratio =
      scrollModel.maxOffsetUs > 0n
        ? Number(offsetUs) / Number(scrollModel.maxOffsetUs)
        : 0
    const nextScrollLeft = Math.max(
      0,
      Math.min(scrollModel.maxScrollLeftPx, Math.round(ratio * scrollModel.maxScrollLeftPx)),
    )
    suppressScrollSyncRef.current = true
    scrollbar.scrollLeft = nextScrollLeft
    requestAnimationFrame(() => {
      suppressScrollSyncRef.current = false
    })
  }, [
    data?.earliestTimestampUs,
    scrollModel.contentWidthPx,
    scrollModel.enabled,
    scrollModel.maxOffsetUs,
    scrollModel.maxScrollLeftPx,
    windowStartUs,
  ])

  /**
   * Apply a new zoom level around the current window center.
   *
   * @param direction - Zoom direction.
   */
  const handleZoom = (direction: 'in' | 'out'): void => {
    setWindowDurationUs((currentDurationUs) => {
      const nextDurationUs = zoomWindowDurationUs(currentDurationUs, direction)
      const centerUs = windowStartUs + currentDurationUs / 2n
      const nextStartUs = clampWindowStartUs(
        centerUs - nextDurationUs / 2n,
        nextDurationUs,
        data?.earliestTimestampUs ?? null,
        data?.latestTimestampUs ?? null,
      )
      setWindowStartUs(nextStartUs)
      return nextDurationUs
    })
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
   * Pan horizontally with the mouse wheel.
   *
   * @param event - Wheel event.
   */
  const handleWheel = (event: WheelEvent<HTMLDivElement>): void => {
    if (width <= 0) {
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

  /**
   * Scroll the visible window across the available time range.
   *
   * @param scrollLeftPx - Horizontal scrollbar offset.
   */
  const handleScrollbarScroll = (scrollLeftPx: number): void => {
    if (
      suppressScrollSyncRef.current ||
      !scrollModel.enabled ||
      !data?.earliestTimestampUs ||
      scrollModel.maxScrollLeftPx <= 0
    ) {
      return
    }
    const ratio = scrollLeftPx / scrollModel.maxScrollLeftPx
    const offsetUs = BigInt(Math.round(ratio * Number(scrollModel.maxOffsetUs)))
    setWindowStartUs(
      clampWindowStartUs(
        data.earliestTimestampUs + offsetUs,
        windowDurationUs,
        data.earliestTimestampUs,
        data.latestTimestampUs,
      ),
    )
  }

  return (
    <div className={styles.timeStripShell} ref={containerRef} style={styleVariables}>
      <div className={styles.timeStripToolbar}>
        <div className={styles.timeStripMeta} />
        <div className={styles.timeStripButtons}>
          <button
            type="button"
            className={styles.timeStripButton}
            onClick={() => {
              handleZoom('out')
            }}
            disabled={isEditMode}
          >
            Zoom Out
          </button>
          <button
            type="button"
            className={styles.timeStripButton}
            onClick={() => {
              handleZoom('in')
            }}
            disabled={isEditMode}
          >
            Zoom In
          </button>
        </div>
      </div>
      <DrpdUsbPdLogTimeStripRenderer
        width={Math.max(width, 1)}
        data={data}
        selectedKey={selectedKey}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onWheel={handleWheel}
      />
      <div
        ref={scrollbarRef}
        className={styles.timeStripScrollbar}
        onScroll={(event) => {
          handleScrollbarScroll(event.currentTarget.scrollLeft)
        }}
        data-testid="drpd-usbpd-log-timestrip-scrollbar"
      >
        <div
          className={styles.timeStripScrollbarTrack}
          style={{ width: `${scrollModel.contentWidthPx}px` }}
        />
      </div>
    </div>
  )
}
