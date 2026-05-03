import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { DRPDDevice, type LoggedAnalogSample, type LoggedCapturedMessage } from '../../../lib/device'
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
const LOG_START_TIMESTAMP_US = 0n
const LOG_END_TIMESTAMP_US = (2n ** 63n) - 1n
const DEFAULT_ZOOM_DENOMINATOR = 100_000_000
const ZOOM_DENOMINATOR_STORAGE_KEY = 'drpd:timestrip:zoom-denominator'
const CTRL_WHEEL_ZOOM_STEP = 2
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
type TimelineRange = {
  durationNs: bigint
  worldStartTimestampUs: bigint
  worldStartWallClockUs: number
  hasWallClockBasis: boolean
}
type TimelineRangePoint = {
  timestampUs: bigint
  wallClockUs: bigint | null
}

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

const compareTimelinePointDeviceTime = (left: TimelineRangePoint, right: TimelineRangePoint): number =>
  left.timestampUs < right.timestampUs ? -1 : left.timestampUs > right.timestampUs ? 1 : 0

const compareTimelinePointWallClock = (left: TimelineRangePoint, right: TimelineRangePoint): number => {
  if (left.wallClockUs === null && right.wallClockUs === null) {
    return compareTimelinePointDeviceTime(left, right)
  }
  if (left.wallClockUs === null) {
    return 1
  }
  if (right.wallClockUs === null) {
    return -1
  }
  return left.wallClockUs < right.wallClockUs
    ? -1
    : left.wallClockUs > right.wallClockUs
      ? 1
      : compareTimelinePointDeviceTime(left, right)
}

const messageToTimelinePoint = (row: LoggedCapturedMessage): TimelineRangePoint => ({
  timestampUs: row.startTimestampUs,
  wallClockUs: row.wallClockUs,
})

const analogToTimelinePoint = (row: LoggedAnalogSample): TimelineRangePoint => ({
  timestampUs: row.timestampUs,
  wallClockUs: row.wallClockUs,
})

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
  const [timelineRange, setTimelineRange] = useState<TimelineRange>(() => ({
    durationNs: PLACEHOLDER_TIMELINE_END_NS,
    worldStartTimestampUs: 0n,
    worldStartWallClockUs: Date.now() * 1000,
    hasWallClockBasis: false,
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
        const [firstWallClockMessage] = await driver.queryCapturedMessages({
          startTimestampUs: LOG_START_TIMESTAMP_US,
          endTimestampUs: LOG_END_TIMESTAMP_US,
          timeBasis: 'wallClock',
          sortOrder: 'asc',
          limit: 1,
        })
        const [lastWallClockMessage] = await driver.queryCapturedMessages({
          startTimestampUs: LOG_START_TIMESTAMP_US,
          endTimestampUs: LOG_END_TIMESTAMP_US,
          timeBasis: 'wallClock',
          sortOrder: 'desc',
          limit: 1,
        })
        const canQueryAnalogSamples = typeof driver.queryAnalogSamples === 'function'
        const [firstAnalogSample] = canQueryAnalogSamples
          ? await driver.queryAnalogSamples({
            startTimestampUs: LOG_START_TIMESTAMP_US,
            endTimestampUs: LOG_END_TIMESTAMP_US,
            sortOrder: 'asc',
            limit: 1,
          })
          : [null]
        const [lastAnalogSample] = canQueryAnalogSamples
          ? await driver.queryAnalogSamples({
            startTimestampUs: LOG_START_TIMESTAMP_US,
            endTimestampUs: LOG_END_TIMESTAMP_US,
            sortOrder: 'desc',
            limit: 1,
          })
          : [null]
        const [firstDeviceMessage] = firstWallClockMessage && lastWallClockMessage
          ? [null]
          : await driver.queryCapturedMessages({
            startTimestampUs: LOG_START_TIMESTAMP_US,
            endTimestampUs: LOG_END_TIMESTAMP_US,
            sortOrder: 'asc',
            limit: 1,
          })
        const [lastDeviceMessage] = firstWallClockMessage && lastWallClockMessage
          ? [null]
          : await driver.queryCapturedMessages({
            startTimestampUs: LOG_START_TIMESTAMP_US,
            endTimestampUs: LOG_END_TIMESTAMP_US,
            sortOrder: 'desc',
            limit: 1,
          })
        const candidatePoints = [
          firstWallClockMessage ? messageToTimelinePoint(firstWallClockMessage) : null,
          lastWallClockMessage ? messageToTimelinePoint(lastWallClockMessage) : null,
          firstDeviceMessage ? messageToTimelinePoint(firstDeviceMessage) : null,
          lastDeviceMessage ? messageToTimelinePoint(lastDeviceMessage) : null,
          firstAnalogSample ? analogToTimelinePoint(firstAnalogSample) : null,
          lastAnalogSample ? analogToTimelinePoint(lastAnalogSample) : null,
        ].filter((point): point is TimelineRangePoint => point !== null)
        const wallClockCandidatePoints = candidatePoints.filter((point) => point.wallClockUs !== null)
        const hasWallClockBasis = wallClockCandidatePoints.length === candidatePoints.length
        const sortedPoints = [...(hasWallClockBasis ? wallClockCandidatePoints : candidatePoints)].sort(
          hasWallClockBasis ? compareTimelinePointWallClock : compareTimelinePointDeviceTime,
        )
        const firstPoint = sortedPoints[0]
        const lastPoint = sortedPoints.at(-1)
        if (!isActive || !firstPoint || !lastPoint) {
          return
        }

        const startTimestampUs = firstPoint.timestampUs
        const endTimestampUs = lastPoint.timestampUs
        const startWallClockUs =
          firstPoint.wallClockUs == null
            ? Date.now() * 1000
            : Number(firstPoint.wallClockUs)
        const endWallClockUs =
          lastPoint.wallClockUs == null
            ? null
            : Number(lastPoint.wallClockUs)
        if (
          !Number.isFinite(startWallClockUs) ||
          endTimestampUs < startTimestampUs ||
          (hasWallClockBasis && (endWallClockUs === null || !Number.isFinite(endWallClockUs)))
        ) {
          return
        }
        const nextDurationNs =
          hasWallClockBasis && endWallClockUs !== null
            ? BigInt(Math.max(1, Math.ceil((endWallClockUs - startWallClockUs) * 1000)))
            : endTimestampUs - startTimestampUs > 0n
              ? (endTimestampUs - startTimestampUs) * 1000n
              : 1n
        setTimelineRange((current) => {
          if (
            current.worldStartTimestampUs === startTimestampUs &&
            current.worldStartWallClockUs === startWallClockUs &&
            current.durationNs === nextDurationNs &&
            current.hasWallClockBasis === hasWallClockBasis
          ) {
            return current
          }
          return {
            worldStartTimestampUs: startTimestampUs,
            worldStartWallClockUs: startWallClockUs,
            durationNs: nextDurationNs,
            hasWallClockBasis,
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
        timelineRange.hasWallClockBasis
          ? BigInt(Math.floor(timelineRange.worldStartWallClockUs))
          : timelineRange.worldStartTimestampUs,
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
          timeBasis: timelineRange.hasWallClockBasis ? 'wallClock' : 'device',
          sortOrder: 'asc',
          limit: DIGITAL_QUERY_LIMIT,
        })
        if (!isActive) {
          return
        }
        const invalidation = calculateDigitalQueryInvalidation(
          loadedRange,
          range,
          timelineRange.hasWallClockBasis
            ? BigInt(Math.floor(timelineRange.worldStartWallClockUs))
            : timelineRange.worldStartTimestampUs,
        )
        digitalQueryRangeRef.current = range
        const nextEntries = rows.flatMap((row) => {
          const entry = normalizeCapturedMessageForTimestrip(
            row,
            timelineRange.worldStartTimestampUs,
            timelineRange.hasWallClockBasis
              ? BigInt(Math.floor(timelineRange.worldStartWallClockUs))
              : undefined,
          )
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
    timelineRange.hasWallClockBasis,
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
      if (detail?.kind !== 'message' && detail?.kind !== 'event' && detail?.kind !== 'analog') {
        return
      }
      const row = detail.row as LoggedCapturedMessage | LoggedAnalogSample | undefined
      if (!row) {
        return
      }

      const isAnalogRow = detail.kind === 'analog'
      const rowTimestampUs = isAnalogRow
        ? (row as LoggedAnalogSample).timestampUs
        : (row as LoggedCapturedMessage).startTimestampUs
      const rowWallClockUs = row.wallClockUs
      const rowWorldStartUs =
        timelineRange.hasWallClockBasis && rowWallClockUs != null
          ? Number((rowWallClockUs - BigInt(Math.floor(timelineRange.worldStartWallClockUs))) * 1000n)
          : Number((rowTimestampUs - timelineRange.worldStartTimestampUs) * 1000n)
      const rowDurationNs =
        !isAnalogRow && (row as LoggedCapturedMessage).entryKind === 'message'
          ? Math.max(1, Number(((row as LoggedCapturedMessage).endTimestampUs - (row as LoggedCapturedMessage).startTimestampUs) * 1000n))
          : 1
      const rowWorldEndUs = rowWorldStartUs + rowDurationNs
      if (!hasLogTimelineRange) {
        digitalQueryRangeRef.current = null
        commitDigitalEntries([], 'all')
      }
      setTimelineRange((current) => {
        const rowDurationUs = BigInt(Math.ceil(rowDurationNs / 1000))
        const currentStartBasisUs = current.hasWallClockBasis
          ? BigInt(Math.floor(current.worldStartWallClockUs))
          : current.worldStartTimestampUs
        const currentEndBasisUs = currentStartBasisUs + (current.durationNs + 999n) / 1000n
        const usesWallClockBasis = current.hasWallClockBasis && rowWallClockUs != null
        const rowStartBasisUs = usesWallClockBasis ? rowWallClockUs! : rowTimestampUs
        const rowEndBasisUs = usesWallClockBasis
          ? rowStartBasisUs + rowDurationUs
          : !isAnalogRow && (row as LoggedCapturedMessage).endTimestampUs > rowTimestampUs
            ? (row as LoggedCapturedMessage).endTimestampUs
            : rowTimestampUs + rowDurationUs
        if (!hasLogTimelineRange) {
          return {
            worldStartTimestampUs: rowTimestampUs,
            worldStartWallClockUs: rowWallClockUs == null ? Date.now() * 1000 : Number(rowWallClockUs),
            durationNs: BigInt(rowDurationNs),
            hasWallClockBasis: rowWallClockUs != null,
          }
        }
        if (rowStartBasisUs < currentStartBasisUs) {
          digitalQueryRangeRef.current = null
          commitDigitalEntries([], 'all')
          return {
            ...current,
            worldStartTimestampUs: rowTimestampUs,
            worldStartWallClockUs: rowWallClockUs == null ? current.worldStartWallClockUs : Number(rowWallClockUs),
            durationNs: (currentEndBasisUs - rowStartBasisUs) * 1000n,
            hasWallClockBasis: current.hasWallClockBasis && rowWallClockUs != null,
          }
        }
        if (rowEndBasisUs <= currentEndBasisUs) {
          return current
        }
        return {
          ...current,
          durationNs: (rowEndBasisUs - currentStartBasisUs) * 1000n,
        }
      })
      setHasLogTimelineRange(true)

      if (isAnalogRow) {
        return
      }
      const messageRow = row as LoggedCapturedMessage
      const loadedRange = digitalQueryRangeRef.current
      if (
        !hasLogTimelineRange ||
        !loadedRange ||
        (timelineRange.hasWallClockBasis && messageRow.wallClockUs == null) ||
        (timelineRange.hasWallClockBasis
          ? messageRow.wallClockUs! < loadedRange.startTimestampUs || messageRow.wallClockUs! > loadedRange.endTimestampUs
          : rowTimestampUs < loadedRange.startTimestampUs || rowTimestampUs > loadedRange.endTimestampUs)
      ) {
        return
      }

      const entry = normalizeCapturedMessageForTimestrip(
        messageRow,
        timelineRange.worldStartTimestampUs,
        timelineRange.hasWallClockBasis
          ? BigInt(Math.floor(timelineRange.worldStartWallClockUs))
          : undefined,
      )
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
          hasWallClockBasis: false,
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
    timelineRange.hasWallClockBasis,
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
