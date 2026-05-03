import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { DRPDDevice, type LoggedCapturedMessage } from '../../../lib/device'
import type { RackInstrument } from '../../../lib/rack/types'
import { InstrumentBase } from '../InstrumentBase'
import type { RackDeviceState } from '../RackRenderer'
import styles from './DrpdTimeStripInstrumentView.module.css'
import {
  calculateTimestripWidthPx,
  clampTimestripZoomDenominator,
  formatTimestripZoomDenominator,
  TIMESTRIP_TILE_OVERSCAN,
  TIMESTRIP_TILE_WIDTH_PX,
} from './timestrip/timestripLayout'
import { getTimestripThemePalette } from './timestrip/timestripTheme'
import { TimestripTiledRenderer } from './timestrip/timestripTiledRenderer'
import {
  getTimestripDigitalQueryRange,
  normalizeCapturedMessageForTimestrip,
  type TimestripDigitalEntry,
} from './timestrip/timestripDigitalModel'

const PLACEHOLDER_TIMELINE_END_NS = 10_000_000_000n
const LOG_END_TIMESTAMP_US = (2n ** 63n) - 1n
const DEFAULT_ZOOM_DENOMINATOR = 100_000_000
const ZOOM_DENOMINATOR_STORAGE_KEY = 'drpd:timestrip:zoom-denominator'
const CTRL_WHEEL_ZOOM_STEP = 1.1
const DIGITAL_QUERY_LIMIT = 5000
const DIGITAL_QUERY_OVERSCAN_PX = TIMESTRIP_TILE_WIDTH_PX * (TIMESTRIP_TILE_OVERSCAN + 1)
const readThemeName = () => (
  typeof document === 'undefined' ? 'dark' : document.documentElement.dataset.theme ?? 'dark'
)
const readTimestripTheme = (themeName: string) => getTimestripThemePalette(
  themeName,
  typeof window === 'undefined' ? undefined : window.getComputedStyle(document.documentElement),
)
const readStoredZoomDenominator = (): number => {
  if (typeof window === 'undefined') {
    return DEFAULT_ZOOM_DENOMINATOR
  }
  try {
    const rawValue = window.localStorage.getItem(ZOOM_DENOMINATOR_STORAGE_KEY)
    return rawValue == null ? DEFAULT_ZOOM_DENOMINATOR : clampTimestripZoomDenominator(rawValue)
  } catch {
    return DEFAULT_ZOOM_DENOMINATOR
  }
}
const writeStoredZoomDenominator = (zoomDenominator: number): void => {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(ZOOM_DENOMINATOR_STORAGE_KEY, zoomDenominator.toString())
  } catch {
    // Ignore persistence errors; zoom still updates for the current session.
  }
}
const buildDigitalEntriesSignature = (entries: TimestripDigitalEntry[]): string =>
  entries.map((entry) => {
    if (entry.kind === 'event') {
      return `e:${entry.worldUs}:${entry.eventType ?? ''}`
    }
    return [
      'm',
      entry.startWorldUs,
      entry.endWorldUs,
      entry.label,
      entry.frameBytes.length,
      entry.pulseWidthsNs.length,
      entry.components.length,
    ].join(':')
  }).join('|')

type DigitalInvalidation = 'all' | { startWorldUs: number; endWorldUs: number }
type DigitalQueryRange = { startTimestampUs: bigint; endTimestampUs: bigint }

const calculateDigitalQueryInvalidation = (
  loadedRange: DigitalQueryRange | null,
  nextRange: DigitalQueryRange,
  worldStartTimestampUs: bigint,
): DigitalInvalidation => {
  if (!loadedRange) {
    return 'all'
  }
  if (
    nextRange.endTimestampUs < loadedRange.startTimestampUs ||
    nextRange.startTimestampUs > loadedRange.endTimestampUs
  ) {
    return 'all'
  }

  let startTimestampUs: bigint | null = null
  let endTimestampUs: bigint | null = null
  if (nextRange.startTimestampUs < loadedRange.startTimestampUs) {
    startTimestampUs = nextRange.startTimestampUs
    endTimestampUs = loadedRange.startTimestampUs
  }
  if (nextRange.endTimestampUs > loadedRange.endTimestampUs) {
    startTimestampUs =
      startTimestampUs === null
        ? loadedRange.endTimestampUs
        : startTimestampUs
    endTimestampUs = nextRange.endTimestampUs
  }
  if (startTimestampUs === null || endTimestampUs === null) {
    return {
      startWorldUs: 0,
      endWorldUs: 0,
    }
  }
  return {
    startWorldUs: Number((startTimestampUs - worldStartTimestampUs) * 1000n),
    endWorldUs: Number((endTimestampUs - worldStartTimestampUs) * 1000n),
  }
}

/**
 * Standalone DRPD timestrip instrument shell.
 */
export const DrpdTimeStripInstrumentView = ({
  instrument,
  displayName,
  deviceState,
  isEditMode,
  onRemove,
}: {
  instrument: RackInstrument
  displayName: string
  deviceState?: RackDeviceState
  isEditMode: boolean
  onRemove?: (instrumentId: string) => void
}) => {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const tileLayerRef = useRef<HTMLDivElement | null>(null)
  const rendererRef = useRef<TimestripTiledRenderer | null>(null)
  const digitalEntriesSignatureRef = useRef('')
  const digitalQueryRangeRef = useRef<DigitalQueryRange | null>(null)
  const pendingDigitalInvalidationRef = useRef<DigitalInvalidation | null>(null)
  const [timelineRange, setTimelineRange] = useState(() => ({
    durationNs: PLACEHOLDER_TIMELINE_END_NS,
    worldStartTimestampUs: 0n,
    worldStartWallClockUs: Date.now() * 1000,
  }))
  const [hasLogTimelineRange, setHasLogTimelineRange] = useState(false)
  const [viewportWidthPx, setViewportWidthPx] = useState(0)
  const [viewportHeightPx, setViewportHeightPx] = useState(0)
  const [scrollLeftPx, setScrollLeftPx] = useState(0)
  const [zoomDenominator, setZoomDenominator] = useState(readStoredZoomDenominator)
  const [themeName, setThemeName] = useState(readThemeName)
  const [theme, setTheme] = useState(() => readTimestripTheme(readThemeName()))
  const [digitalEntries, setDigitalEntries] = useState<TimestripDigitalEntry[]>([])
  const [digitalDataRevision, setDigitalDataRevision] = useState(0)
  const zoomReadout = formatTimestripZoomDenominator(zoomDenominator)
  const timelineWidthPx = calculateTimestripWidthPx(
    timelineRange.durationNs,
    zoomDenominator,
    viewportWidthPx,
  )
  const commitZoomDenominator = useCallback((value: number | string) => {
    const nextZoomDenominator = clampTimestripZoomDenominator(value)
    writeStoredZoomDenominator(nextZoomDenominator)
    setZoomDenominator(nextZoomDenominator)
  }, [])
  const queueDigitalInvalidation = useCallback((invalidation: DigitalInvalidation) => {
    const current = pendingDigitalInvalidationRef.current
    if (current === 'all' || invalidation === 'all' || current === null) {
      pendingDigitalInvalidationRef.current = invalidation
      return
    }
    pendingDigitalInvalidationRef.current = {
      startWorldUs: Math.min(current.startWorldUs, invalidation.startWorldUs),
      endWorldUs: Math.max(current.endWorldUs, invalidation.endWorldUs),
    }
  }, [])
  const commitDigitalEntries = useCallback((
    nextEntries: TimestripDigitalEntry[],
    invalidation: DigitalInvalidation,
  ) => {
    const nextSignature = buildDigitalEntriesSignature(nextEntries)
    if (nextSignature === digitalEntriesSignatureRef.current) {
      return
    }
    digitalEntriesSignatureRef.current = nextSignature
    queueDigitalInvalidation(invalidation)
    setDigitalEntries(nextEntries)
    setDigitalDataRevision((revision) => revision + 1)
  }, [queueDigitalInvalidation])
  const handleViewportScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    setScrollLeftPx(event.currentTarget.scrollLeft)
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return undefined
    }

    const handleViewportWheel = (event: WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault()
        const direction = event.deltaY < 0 ? -1 : 1
        const scale = direction < 0 ? 1 / CTRL_WHEEL_ZOOM_STEP : CTRL_WHEEL_ZOOM_STEP
        const nextZoomDenominator = clampTimestripZoomDenominator(Math.round(zoomDenominator * scale))
        const viewportRect = viewport.getBoundingClientRect()
        const pointerX = Math.max(0, event.clientX - viewportRect.left)
        const timestampUnderPointerNs = (viewport.scrollLeft + pointerX) * zoomDenominator
        const nextScrollLeft = Math.max(0, timestampUnderPointerNs / nextZoomDenominator - pointerX)
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
    }

    viewport.addEventListener('wheel', handleViewportWheel, { passive: false })
    return () => {
      viewport.removeEventListener('wheel', handleViewportWheel)
    }
  }, [commitZoomDenominator, zoomDenominator])

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
    if (typeof MutationObserver === 'undefined') {
      return undefined
    }

    const observer = new MutationObserver(() => {
      const nextThemeName = readThemeName()
      setThemeName(nextThemeName)
      setTheme(readTimestripTheme(nextThemeName))
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    setTheme(readTimestripTheme(themeName))
  }, [themeName])

  useEffect(() => {
    const tileLayer = tileLayerRef.current
    if (!tileLayer) {
      return undefined
    }
    const renderer = new TimestripTiledRenderer({ tileLayer })
    rendererRef.current = renderer
    return () => {
      renderer.dispose()
      if (rendererRef.current === renderer) {
        rendererRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const driver = deviceState?.drpdDriver
    if (!driver) {
      return undefined
    }

    let isActive = true
    const refreshTimelineRange = async () => {
      try {
        const [firstMessage] = await driver.queryCapturedMessages({
          startTimestampUs: 0n,
          endTimestampUs: LOG_END_TIMESTAMP_US,
          sortOrder: 'asc',
          limit: 1,
        })
        const [lastMessage] = await driver.queryCapturedMessages({
          startTimestampUs: 0n,
          endTimestampUs: LOG_END_TIMESTAMP_US,
          sortOrder: 'desc',
          limit: 1,
        })
        if (!isActive || !firstMessage || !lastMessage) {
          return
        }

        const startTimestampUs = firstMessage.startTimestampUs
        const endTimestampUs = lastMessage.endTimestampUs
        const startWallClockUs =
          firstMessage.wallClockUs == null
            ? Date.now() * 1000
            : Number(firstMessage.wallClockUs)
        if (!Number.isFinite(startWallClockUs) || endTimestampUs < startTimestampUs) {
          return
        }
        const nextDurationNs = endTimestampUs - startTimestampUs > 0n
          ? (endTimestampUs - startTimestampUs) * 1000n
          : 1n
        setTimelineRange((current) => {
          if (
            current.worldStartTimestampUs === startTimestampUs &&
            current.worldStartWallClockUs === startWallClockUs &&
            current.durationNs === nextDurationNs
          ) {
            return current
          }
          return {
            worldStartTimestampUs: startTimestampUs,
            worldStartWallClockUs: startWallClockUs,
            durationNs: nextDurationNs,
          }
        })
        setHasLogTimelineRange(true)
      } catch {
        // Keep the existing timeline when logging data is temporarily unavailable.
      }
    }

    void refreshTimelineRange()
    return () => {
      isActive = false
    }
  }, [deviceState?.drpdDriver])

  useEffect(() => {
    const driver = deviceState?.drpdDriver
    if (!driver || viewportWidthPx <= 0) {
      digitalQueryRangeRef.current = null
      commitDigitalEntries([], 'all')
      return undefined
    }

    let isActive = true
    const refreshDigitalEntries = async () => {
      const range = getTimestripDigitalQueryRange(
        scrollLeftPx,
        viewportWidthPx,
        zoomDenominator,
        timelineRange.worldStartTimestampUs,
        DIGITAL_QUERY_OVERSCAN_PX,
      )
      const loadedRange = digitalQueryRangeRef.current
      if (
        loadedRange &&
        range.startTimestampUs >= loadedRange.startTimestampUs &&
        range.endTimestampUs <= loadedRange.endTimestampUs
      ) {
        return
      }
      try {
        const rows = await driver.queryCapturedMessages({
          startTimestampUs: range.startTimestampUs,
          endTimestampUs: range.endTimestampUs,
          timeBasis: 'device',
          sortOrder: 'asc',
          limit: DIGITAL_QUERY_LIMIT,
        })
        if (!isActive) {
          return
        }
        const invalidation = calculateDigitalQueryInvalidation(
          loadedRange,
          range,
          timelineRange.worldStartTimestampUs,
        )
        digitalQueryRangeRef.current = range
        const nextEntries = rows.flatMap((row) => {
          const entry = normalizeCapturedMessageForTimestrip(row, timelineRange.worldStartTimestampUs)
          return entry ? [entry] : []
        })
        commitDigitalEntries(nextEntries, invalidation)
      } catch {
        // Keep the last rendered entries when the log store is temporarily unavailable.
      }
    }

    void refreshDigitalEntries()
    return () => {
      isActive = false
    }
  }, [
    commitDigitalEntries,
    deviceState?.drpdDriver,
    scrollLeftPx,
    timelineRange.worldStartTimestampUs,
    timelineRange.worldStartWallClockUs,
    viewportHeightPx,
    viewportWidthPx,
    zoomDenominator,
  ])

  useEffect(() => {
    const driver = deviceState?.drpdDriver
    if (!driver || typeof driver.addEventListener !== 'function') {
      return undefined
    }

    const handleAdded = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined
      if (detail?.kind !== 'message' && detail?.kind !== 'event') {
        return
      }
      const row = detail.row as LoggedCapturedMessage | undefined
      if (!row) {
        return
      }

      const rowTimestampUs = row.startTimestampUs
      const rowWorldStartUs = Number((rowTimestampUs - timelineRange.worldStartTimestampUs) * 1000n)
      const rowDurationNs =
        row.entryKind === 'message'
          ? Math.max(1, Number((row.endTimestampUs - row.startTimestampUs) * 1000n))
          : 1
      const rowWorldEndUs = rowWorldStartUs + rowDurationNs
      if (!hasLogTimelineRange) {
        digitalQueryRangeRef.current = null
        commitDigitalEntries([], 'all')
      }
      setTimelineRange((current) => {
        if (!hasLogTimelineRange) {
          return {
            worldStartTimestampUs: rowTimestampUs,
            worldStartWallClockUs: row.wallClockUs == null ? Date.now() * 1000 : Number(row.wallClockUs),
            durationNs: BigInt(rowDurationNs),
          }
        }
        if (rowTimestampUs < current.worldStartTimestampUs) {
          digitalQueryRangeRef.current = null
          commitDigitalEntries([], 'all')
          return {
            ...current,
            worldStartTimestampUs: rowTimestampUs,
            worldStartWallClockUs: row.wallClockUs == null ? current.worldStartWallClockUs : Number(row.wallClockUs),
            durationNs: current.durationNs,
          }
        }
        const currentEndTimestampUs = current.worldStartTimestampUs + (current.durationNs + 999n) / 1000n
        const nextEndTimestampUs = row.endTimestampUs > rowTimestampUs
          ? row.endTimestampUs
          : rowTimestampUs + BigInt(Math.ceil(rowDurationNs / 1000))
        if (nextEndTimestampUs <= currentEndTimestampUs) {
          return current
        }
        return {
          ...current,
          durationNs: (nextEndTimestampUs - current.worldStartTimestampUs) * 1000n,
        }
      })
      setHasLogTimelineRange(true)

      const loadedRange = digitalQueryRangeRef.current
      if (
        !hasLogTimelineRange ||
        !loadedRange ||
        rowTimestampUs < loadedRange.startTimestampUs ||
        rowTimestampUs > loadedRange.endTimestampUs
      ) {
        return
      }

      const entry = normalizeCapturedMessageForTimestrip(row, timelineRange.worldStartTimestampUs)
      if (!entry) {
        return
      }
      const nextEntries = [...digitalEntries, entry].sort((left, right) => {
        const leftWorldUs = left.kind === 'event' ? left.worldUs : left.startWorldUs
        const rightWorldUs = right.kind === 'event' ? right.worldUs : right.startWorldUs
        return leftWorldUs - rightWorldUs
      })
      commitDigitalEntries(nextEntries, {
        startWorldUs: rowWorldStartUs,
        endWorldUs: rowWorldEndUs,
      })
    }

    const handleDeleted = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined
      if (!detail?.messagesDeleted) {
        return
      }
      digitalQueryRangeRef.current = null
      commitDigitalEntries([], 'all')
      if (detail.reason === 'clear') {
        setTimelineRange({
          durationNs: PLACEHOLDER_TIMELINE_END_NS,
          worldStartTimestampUs: 0n,
          worldStartWallClockUs: Date.now() * 1000,
        })
        setHasLogTimelineRange(false)
      }
    }

    driver.addEventListener(DRPDDevice.LOG_ENTRY_ADDED_EVENT, handleAdded)
    driver.addEventListener(DRPDDevice.LOG_ENTRY_DELETED_EVENT, handleDeleted)
    return () => {
      driver.removeEventListener(DRPDDevice.LOG_ENTRY_ADDED_EVENT, handleAdded)
      driver.removeEventListener(DRPDDevice.LOG_ENTRY_DELETED_EVENT, handleDeleted)
    }
  }, [
    commitDigitalEntries,
    deviceState?.drpdDriver,
    digitalEntries,
    hasLogTimelineRange,
    timelineRange.durationNs,
    timelineRange.worldStartTimestampUs,
    timelineRange.worldStartWallClockUs,
  ])

  useEffect(() => {
    const renderer = rendererRef.current
    renderer?.setViewport({
      scrollLeftPx,
      zoomDenominator,
      viewportWidthPx,
      viewportHeightPx,
      dpr: window.devicePixelRatio || 1,
      worldStartWallClockUs: timelineRange.worldStartWallClockUs,
      theme,
      digitalEntries,
      digitalDataRevision,
    })
    const invalidation = pendingDigitalInvalidationRef.current
    pendingDigitalInvalidationRef.current = null
    if (invalidation === 'all') {
      renderer?.invalidateAllTiles()
    } else if (invalidation) {
      renderer?.invalidateWorldRange(invalidation.startWorldUs, invalidation.endWorldUs)
    }
  }, [
    digitalDataRevision,
    digitalEntries,
    scrollLeftPx,
    theme,
    timelineRange.worldStartWallClockUs,
    viewportHeightPx,
    viewportWidthPx,
    zoomDenominator,
  ])

  return (
    <InstrumentBase
      instrument={instrument}
      displayName={displayName}
      isEditMode={isEditMode}
      contentClassName={styles.content}
      headerAccessory={
        <span className={styles.zoomReadout} aria-label={`Zoom ${zoomReadout} per pixel`}>
          ZOOM {zoomReadout}
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
        onScroll={handleViewportScroll}
      >
        <div
          ref={tileLayerRef}
          className={styles.tileLayer}
          data-testid="drpd-timestrip-tile-layer"
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
