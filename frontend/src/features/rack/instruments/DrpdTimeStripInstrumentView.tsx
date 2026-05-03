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
import {
  interpolateTimestripAnalogSample,
  normalizeAnalogSampleForTimestrip,
  type TimestripAnalogHoverValue,
  type TimestripAnalogSample,
} from './timestrip/timestripAnalogModel'
import { buildTimestripAnalogLegendTicks } from './timestrip/timestripAnalogLegend'
import { buildTimestripLaneLayout } from './timestrip/timestripLaneLayout'

const PLACEHOLDER_TIMELINE_END_NS = 10_000_000_000n
const LOG_START_TIMESTAMP_US = 0n
const LOG_END_TIMESTAMP_US = (2n ** 63n) - 1n
const DEFAULT_ZOOM_DENOMINATOR = 100_000_000
const ZOOM_DENOMINATOR_STORAGE_KEY = 'drpd:timestrip:zoom-denominator'
const CTRL_WHEEL_ZOOM_STEP = 2
const DIGITAL_QUERY_LIMIT = 5000
const ANALOG_QUERY_LIMIT = 8000
const DIGITAL_QUERY_OVERSCAN_PX = TIMESTRIP_TILE_WIDTH_PX * (TIMESTRIP_TILE_OVERSCAN + 1)
const ANALOG_QUERY_OVERSCAN_PX = DIGITAL_QUERY_OVERSCAN_PX
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

const buildAnalogSamplesSignature = (samples: TimestripAnalogSample[]): string =>
  samples.map((sample) => [
    sample.worldUs,
    sample.voltageV,
    sample.currentA,
  ].join(':')).join('|')

const formatAnalogHoverValue = (value: number, unit: 'V' | 'A'): string =>
  `${value.toFixed(unit === 'V' ? 2 : 3)}${unit}`

type TimestripInvalidation = 'all' | { startWorldUs: number; endWorldUs: number }
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

const calculateQueryInvalidation = (
  loadedRange: DigitalQueryRange | null,
  nextRange: DigitalQueryRange,
  worldStartTimestampUs: bigint,
): TimestripInvalidation => {
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
  const resizeFrameRef = useRef<number | null>(null)
  const pendingViewportSizeRef = useRef<{ width: number; height: number } | null>(null)
  const analogHoverPointerRef = useRef<{ x: number; y: number } | null>(null)
  const digitalEntriesSignatureRef = useRef('')
  const analogSamplesSignatureRef = useRef('')
  const digitalQueryRangeRef = useRef<DigitalQueryRange | null>(null)
  const analogQueryRangeRef = useRef<DigitalQueryRange | null>(null)
  const pendingTileInvalidationRef = useRef<TimestripInvalidation | null>(null)
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
  const [analogSamples, setAnalogSamples] = useState<TimestripAnalogSample[]>([])
  const [analogDataRevision, setAnalogDataRevision] = useState(0)
  const [analogHover, setAnalogHover] = useState<{
    x: number
    y: number
    value: TimestripAnalogHoverValue
  } | null>(null)
  const zoomReadout = formatTimestripZoomDenominator(zoomDenominator)
  const timelineWidthPx = calculateTimestripWidthPx(
    timelineRange.durationNs,
    zoomDenominator,
    viewportWidthPx,
  )
  const analogLegendTicks = buildTimestripAnalogLegendTicks(viewportHeightPx)
  const updateAnalogHoverAtViewportPoint = useCallback((x: number, y: number) => {
    const viewport = viewportRef.current
    if (!viewport || viewportWidthPx <= 0 || viewportHeightPx <= 0) {
      analogHoverPointerRef.current = null
      setAnalogHover(null)
      return
    }
    const viewportX = Math.max(0, Math.min(viewportWidthPx, x))
    const viewportY = Math.max(0, Math.min(viewportHeightPx, y))
    const layout = buildTimestripLaneLayout(viewportHeightPx)
    if (viewportY < layout.analog.y || viewportY > layout.analog.y + layout.analog.height) {
      analogHoverPointerRef.current = null
      setAnalogHover(null)
      return
    }
    analogHoverPointerRef.current = { x: viewportX, y: viewportY }
    const worldUs = (viewport.scrollLeft + viewportX) * zoomDenominator
    const value = interpolateTimestripAnalogSample(analogSamples, worldUs)
    setAnalogHover(value ? { x: viewportX, y: viewportY, value } : null)
  }, [analogSamples, viewportHeightPx, viewportWidthPx, zoomDenominator])
  const updateAnalogHover = useCallback((event: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current
    if (!viewport) {
      setAnalogHover(null)
      return
    }
    const rect = viewport.getBoundingClientRect()
    updateAnalogHoverAtViewportPoint(event.clientX - rect.left, event.clientY - rect.top)
  }, [updateAnalogHoverAtViewportPoint])
  const clearAnalogHover = useCallback(() => {
    analogHoverPointerRef.current = null
    setAnalogHover(null)
  }, [])
  const commitZoomDenominator = useCallback((value: number | string) => {
    const nextZoomDenominator = clampTimestripZoomDenominator(value)
    writeStoredZoomDenominator(nextZoomDenominator)
    setZoomDenominator(nextZoomDenominator)
  }, [])
  const queueTileInvalidation = useCallback((invalidation: TimestripInvalidation) => {
    const current = pendingTileInvalidationRef.current
    if (current === 'all' || invalidation === 'all' || current === null) {
      pendingTileInvalidationRef.current = invalidation
      return
    }
    pendingTileInvalidationRef.current = {
      startWorldUs: Math.min(current.startWorldUs, invalidation.startWorldUs),
      endWorldUs: Math.max(current.endWorldUs, invalidation.endWorldUs),
    }
  }, [])
  const commitDigitalEntries = useCallback((
    nextEntries: TimestripDigitalEntry[],
    invalidation: TimestripInvalidation,
  ) => {
    const nextSignature = buildDigitalEntriesSignature(nextEntries)
    if (nextSignature === digitalEntriesSignatureRef.current) {
      return
    }
    digitalEntriesSignatureRef.current = nextSignature
    queueTileInvalidation(invalidation)
    setDigitalEntries(nextEntries)
    setDigitalDataRevision((revision) => revision + 1)
  }, [queueTileInvalidation])
  const commitAnalogSamples = useCallback((
    nextSamples: TimestripAnalogSample[],
    invalidation: TimestripInvalidation,
  ) => {
    const nextSignature = buildAnalogSamplesSignature(nextSamples)
    if (nextSignature === analogSamplesSignatureRef.current) {
      return
    }
    analogSamplesSignatureRef.current = nextSignature
    queueTileInvalidation(invalidation)
    setAnalogSamples(nextSamples)
    setAnalogDataRevision((revision) => revision + 1)
  }, [queueTileInvalidation])
  const handleViewportScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    setScrollLeftPx(event.currentTarget.scrollLeft)
    const pointer = analogHoverPointerRef.current
    if (pointer) {
      updateAnalogHoverAtViewportPoint(pointer.x, pointer.y)
    }
  }, [updateAnalogHoverAtViewportPoint])

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

    const commitViewportSize = (width: number, height: number) => {
      setViewportWidthPx(width)
      setViewportHeightPx(height)
    }
    const queueViewportSize = (width: number, height: number) => {
      pendingViewportSizeRef.current = { width, height }
      if (resizeFrameRef.current !== null) {
        return
      }
      resizeFrameRef.current = window.requestAnimationFrame(() => {
        resizeFrameRef.current = null
        const nextSize = pendingViewportSizeRef.current
        pendingViewportSizeRef.current = null
        if (!nextSize) {
          return
        }
        commitViewportSize(nextSize.width, nextSize.height)
      })
    }
    commitViewportSize(
      Math.max(0, Math.floor(viewport.clientWidth)),
      Math.max(0, Math.floor(viewport.clientHeight)),
    )

    if (typeof ResizeObserver === 'undefined') {
      return () => {
        if (resizeFrameRef.current !== null) {
          window.cancelAnimationFrame(resizeFrameRef.current)
          resizeFrameRef.current = null
        }
        pendingViewportSizeRef.current = null
      }
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      const inlineSize = entry?.contentBoxSize?.[0]?.inlineSize ?? entry?.contentRect.width
      const blockSize = entry?.contentBoxSize?.[0]?.blockSize ?? entry?.contentRect.height
      queueViewportSize(
        Math.max(0, Math.floor(inlineSize ?? viewport.clientWidth)),
        Math.max(0, Math.floor(blockSize ?? viewport.clientHeight)),
      )
    })
    observer.observe(viewport)
    return () => {
      observer.disconnect()
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current)
        resizeFrameRef.current = null
      }
      pendingViewportSizeRef.current = null
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
        const [firstDeviceMessage] = await driver.queryCapturedMessages({
          startTimestampUs: LOG_START_TIMESTAMP_US,
          endTimestampUs: LOG_END_TIMESTAMP_US,
          sortOrder: 'asc',
          limit: 1,
        })
        const [lastDeviceMessage] = await driver.queryCapturedMessages({
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
        const invalidation = calculateQueryInvalidation(
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
    if (!driver || typeof driver.queryAnalogSamples !== 'function' || viewportWidthPx <= 0) {
      analogQueryRangeRef.current = null
      commitAnalogSamples([], 'all')
      return undefined
    }

    let isActive = true
    const refreshAnalogSamples = async () => {
      const range = getTimestripDigitalQueryRange(
        scrollLeftPx,
        viewportWidthPx,
        zoomDenominator,
        timelineRange.hasWallClockBasis
          ? BigInt(Math.floor(timelineRange.worldStartWallClockUs))
          : timelineRange.worldStartTimestampUs,
        ANALOG_QUERY_OVERSCAN_PX,
      )
      const loadedRange = analogQueryRangeRef.current
      if (
        loadedRange &&
        range.startTimestampUs >= loadedRange.startTimestampUs &&
        range.endTimestampUs <= loadedRange.endTimestampUs
      ) {
        return
      }
      try {
        const rows = await driver.queryAnalogSamples({
          startTimestampUs: range.startTimestampUs,
          endTimestampUs: range.endTimestampUs,
          timeBasis: timelineRange.hasWallClockBasis ? 'wallClock' : 'device',
          sortOrder: 'asc',
          limit: ANALOG_QUERY_LIMIT,
        })
        if (!isActive) {
          return
        }
        const invalidation = calculateQueryInvalidation(
          loadedRange,
          range,
          timelineRange.hasWallClockBasis
            ? BigInt(Math.floor(timelineRange.worldStartWallClockUs))
            : timelineRange.worldStartTimestampUs,
        )
        analogQueryRangeRef.current = range
        const nextSamples = rows.flatMap((row) => {
          const sample = normalizeAnalogSampleForTimestrip(
            row,
            timelineRange.worldStartTimestampUs,
            timelineRange.hasWallClockBasis
              ? BigInt(Math.floor(timelineRange.worldStartWallClockUs))
              : undefined,
          )
          return sample ? [sample] : []
        })
        commitAnalogSamples(nextSamples, invalidation)
      } catch {
        // Keep the last rendered samples when the log store is temporarily unavailable.
      }
    }

    void refreshAnalogSamples()
    return () => {
      isActive = false
    }
  }, [
    commitAnalogSamples,
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
        analogQueryRangeRef.current = null
        commitDigitalEntries([], 'all')
        commitAnalogSamples([], 'all')
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
          analogQueryRangeRef.current = null
          commitDigitalEntries([], 'all')
          commitAnalogSamples([], 'all')
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
        const analogRow = row as LoggedAnalogSample
        const loadedRange = analogQueryRangeRef.current
        if (
          !hasLogTimelineRange ||
          !loadedRange ||
          (timelineRange.hasWallClockBasis && analogRow.wallClockUs == null) ||
          (timelineRange.hasWallClockBasis
            ? analogRow.wallClockUs! < loadedRange.startTimestampUs || analogRow.wallClockUs! > loadedRange.endTimestampUs
            : analogRow.timestampUs < loadedRange.startTimestampUs || analogRow.timestampUs > loadedRange.endTimestampUs)
        ) {
          return
        }

        const sample = normalizeAnalogSampleForTimestrip(
          analogRow,
          timelineRange.worldStartTimestampUs,
          timelineRange.hasWallClockBasis
            ? BigInt(Math.floor(timelineRange.worldStartWallClockUs))
            : undefined,
        )
        if (!sample) {
          return
        }
        const nextSamples = [...analogSamples, sample].sort((left, right) => left.worldUs - right.worldUs)
        commitAnalogSamples(nextSamples, {
          startWorldUs: rowWorldStartUs,
          endWorldUs: rowWorldEndUs,
        })
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
      analogQueryRangeRef.current = null
      commitDigitalEntries([], 'all')
      commitAnalogSamples([], 'all')
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
    analogSamples,
    commitAnalogSamples,
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
      analogSamples,
      analogDataRevision,
    })
    const invalidation = pendingTileInvalidationRef.current
    pendingTileInvalidationRef.current = null
    if (invalidation === 'all') {
      renderer?.invalidateAllTiles()
    } else if (invalidation) {
      renderer?.invalidateWorldRange(invalidation.startWorldUs, invalidation.endWorldUs)
    }
  }, [
    digitalDataRevision,
    digitalEntries,
    analogDataRevision,
    analogSamples,
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
      <div className={styles.frame} data-testid="drpd-timestrip-frame">
        <div className={`${styles.legend} ${styles.voltageLegend}`} data-testid="drpd-timestrip-voltage-legend">
          {analogLegendTicks.voltage.map((tick) => (
            <span
              key={tick.value}
              className={styles.legendTick}
              style={{ top: `${tick.y}px` }}
            >
              {tick.label}
            </span>
          ))}
        </div>
        <div
          ref={viewportRef}
          className={styles.viewport}
          data-testid="drpd-timestrip-viewport"
          onScroll={handleViewportScroll}
          onMouseMove={updateAnalogHover}
          onMouseLeave={clearAnalogHover}
          onPointerMove={updateAnalogHover}
          onPointerLeave={clearAnalogHover}
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
        {analogHover ? (
          <div
            className={styles.analogHoverOverlay}
            data-testid="drpd-timestrip-analog-hover"
            style={{
              left: `${44 + analogHover.x}px`,
              top: `${analogHover.y}px`,
            }}
          >
            <span className={styles.analogHoverVoltage}>
              {formatAnalogHoverValue(analogHover.value.voltageV, 'V')}
            </span>
            <span className={styles.analogHoverCurrent}>
              {formatAnalogHoverValue(analogHover.value.currentA, 'A')}
            </span>
          </div>
        ) : null}
        <div
          className={`${styles.legend} ${styles.currentLegend}`}
          data-testid="drpd-timestrip-current-legend"
        >
          {analogLegendTicks.current.map((tick) => (
            <span
              key={tick.value}
              className={styles.legendTick}
              style={{ top: `${tick.y}px` }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      </div>
    </InstrumentBase>
  )
}
