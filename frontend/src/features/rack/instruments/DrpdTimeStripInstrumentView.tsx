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

const PLACEHOLDER_TIMELINE_START_US = 0n
const PLACEHOLDER_TIMELINE_END_US = 10_000_000n
const LOG_END_TIMESTAMP_US = (2n ** 63n) - 1n
const DEFAULT_ZOOM_DENOMINATOR = 1000
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
type DigitalQueryRange = { startWallClockUs: bigint; endWallClockUs: bigint }

const calculateDigitalQueryInvalidation = (
  loadedRange: DigitalQueryRange | null,
  nextRange: DigitalQueryRange,
  worldStartWallClockUs: number,
): DigitalInvalidation => {
  if (!loadedRange) {
    return 'all'
  }
  if (
    nextRange.endWallClockUs < loadedRange.startWallClockUs ||
    nextRange.startWallClockUs > loadedRange.endWallClockUs
  ) {
    return 'all'
  }

  let startWallClockUs: bigint | null = null
  let endWallClockUs: bigint | null = null
  if (nextRange.startWallClockUs < loadedRange.startWallClockUs) {
    startWallClockUs = nextRange.startWallClockUs
    endWallClockUs = loadedRange.startWallClockUs
  }
  if (nextRange.endWallClockUs > loadedRange.endWallClockUs) {
    startWallClockUs =
      startWallClockUs === null
        ? loadedRange.endWallClockUs
        : startWallClockUs
    endWallClockUs = nextRange.endWallClockUs
  }
  if (startWallClockUs === null || endWallClockUs === null) {
    return {
      startWorldUs: 0,
      endWorldUs: 0,
    }
  }
  return {
    startWorldUs: Number(startWallClockUs) - worldStartWallClockUs,
    endWorldUs: Number(endWallClockUs) - worldStartWallClockUs,
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
    durationUs: PLACEHOLDER_TIMELINE_END_US - PLACEHOLDER_TIMELINE_START_US,
    worldStartWallClockUs: Date.now() * 1000,
  }))
  const [viewportWidthPx, setViewportWidthPx] = useState(0)
  const [viewportHeightPx, setViewportHeightPx] = useState(0)
  const [scrollLeftPx, setScrollLeftPx] = useState(0)
  const [zoomDenominator, setZoomDenominator] = useState(DEFAULT_ZOOM_DENOMINATOR)
  const [themeName, setThemeName] = useState(readThemeName)
  const [theme, setTheme] = useState(() => readTimestripTheme(readThemeName()))
  const [digitalEntries, setDigitalEntries] = useState<TimestripDigitalEntry[]>([])
  const [digitalDataRevision, setDigitalDataRevision] = useState(0)
  const timelineWidthPx = calculateTimestripWidthPx(
    timelineRange.durationUs,
    zoomDenominator,
    viewportWidthPx,
  )
  const commitZoomDenominator = useCallback((value: number | string) => {
    const nextZoomDenominator = clampTimestripZoomDenominator(value)
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
        if (
          !isActive ||
          firstMessage?.wallClockUs == null ||
          lastMessage?.wallClockUs == null
        ) {
          return
        }

        const startWallClockUs = Number(firstMessage.wallClockUs)
        const endWallClockUs = Number(lastMessage.wallClockUs)
        if (!Number.isFinite(startWallClockUs) || !Number.isFinite(endWallClockUs)) {
          return
        }
        const nextDurationUs = BigInt(Math.max(1, Math.ceil(endWallClockUs - startWallClockUs)))
        setTimelineRange((current) => {
          if (
            current.worldStartWallClockUs === startWallClockUs &&
            current.durationUs === nextDurationUs
          ) {
            return current
          }
          return {
            worldStartWallClockUs: startWallClockUs,
            durationUs: nextDurationUs,
          }
        })
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
        timelineRange.worldStartWallClockUs,
        DIGITAL_QUERY_OVERSCAN_PX,
      )
      const loadedRange = digitalQueryRangeRef.current
      if (
        loadedRange &&
        range.startWallClockUs >= loadedRange.startWallClockUs &&
        range.endWallClockUs <= loadedRange.endWallClockUs
      ) {
        return
      }
      try {
        const rows = await driver.queryCapturedMessages({
          startTimestampUs: range.startWallClockUs,
          endTimestampUs: range.endWallClockUs,
          timeBasis: 'wallClock',
          sortOrder: 'asc',
          limit: DIGITAL_QUERY_LIMIT,
        })
        if (!isActive) {
          return
        }
        const invalidation = calculateDigitalQueryInvalidation(
          loadedRange,
          range,
          timelineRange.worldStartWallClockUs,
        )
        digitalQueryRangeRef.current = range
        const nextEntries = rows.flatMap((row) => {
          const entry = normalizeCapturedMessageForTimestrip(row, timelineRange.worldStartWallClockUs)
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
    timelineRange.worldStartWallClockUs,
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
      if (!row?.wallClockUs) {
        return
      }

      const rowWallClockUs = row.wallClockUs
      const rowWorldStartUs = Number(rowWallClockUs) - timelineRange.worldStartWallClockUs
      const rowDurationUs =
        row.entryKind === 'message'
          ? Math.max(1, Number(row.endTimestampUs - row.startTimestampUs))
          : 1
      const rowWorldEndUs = rowWorldStartUs + rowDurationUs
      setTimelineRange((current) => {
        if (rowWallClockUs < BigInt(Math.floor(current.worldStartWallClockUs))) {
          digitalQueryRangeRef.current = null
          commitDigitalEntries([], 'all')
          return {
            worldStartWallClockUs: Number(rowWallClockUs),
            durationUs: current.durationUs,
          }
        }
        const currentEndWallClockUs = BigInt(Math.floor(current.worldStartWallClockUs)) + current.durationUs
        const nextEndWallClockUs = rowWallClockUs + BigInt(Math.ceil(rowDurationUs))
        if (nextEndWallClockUs <= currentEndWallClockUs) {
          return current
        }
        return {
          ...current,
          durationUs: nextEndWallClockUs - BigInt(Math.floor(current.worldStartWallClockUs)),
        }
      })

      const loadedRange = digitalQueryRangeRef.current
      if (
        !loadedRange ||
        rowWallClockUs < loadedRange.startWallClockUs ||
        rowWallClockUs > loadedRange.endWallClockUs
      ) {
        return
      }

      const entry = normalizeCapturedMessageForTimestrip(row, timelineRange.worldStartWallClockUs)
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
          durationUs: PLACEHOLDER_TIMELINE_END_US - PLACEHOLDER_TIMELINE_START_US,
          worldStartWallClockUs: Date.now() * 1000,
        })
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
    timelineRange.durationUs,
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
