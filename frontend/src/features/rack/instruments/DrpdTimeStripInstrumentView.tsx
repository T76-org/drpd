import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  buildCapturedLogSelectionKey,
  DRPDDevice,
  type DRPDLogSelectionState,
  type LoggedAnalogSample,
  type LoggedCapturedMessage,
} from '../../../lib/device'
import type { RackInstrument } from '../../../lib/rack/types'
import { InstrumentBase } from '../InstrumentBase'
import type { RackDeviceState } from '../RackRenderer'
import styles from './DrpdTimeStripInstrumentView.module.css'
import {
  TIMESTRIP_TILE_OVERSCAN,
  TIMESTRIP_TILE_WIDTH_PX,
} from './timestrip/timestripLayout'
import { getTimestripThemePalette } from './timestrip/timestripTheme'
import { TimestripTiledRenderer } from './timestrip/timestripTiledRenderer'
import {
  normalizeCapturedMessageForTimestrip,
  type TimestripDigitalEntry,
} from './timestrip/timestripDigitalModel'
import {
  normalizeAnalogSampleForTimestrip,
  type TimestripAnalogSample,
} from './timestrip/timestripAnalogModel'
import { buildTimestripAnalogLegendTicks } from './timestrip/timestripAnalogLegend'
import {
  basisTimestampUsToWorldNs,
  calculateTimestripQueryRange,
  getTimestripBasisOriginUs,
  type TimestripBasis,
  type TimestripQueryRange,
  type TimestripTimelineRange,
  type TimestripWorldRange,
} from './timestrip/timestripCoordinates'
import { useTimestripViewport } from './timestrip/useTimestripViewport'
import { useTimestripAnalogHover } from './timestrip/useTimestripAnalogHover'

const PLACEHOLDER_TIMELINE_END_NS = 10_000_000_000n
const LOG_START_TIMESTAMP_US = 0n
const LOG_END_TIMESTAMP_US = (2n ** 63n) - 1n
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
const buildDigitalEntriesSignature = (entries: TimestripDigitalEntry[]): string =>
  entries.map((entry) => {
    if (entry.kind === 'event') {
      return `e:${entry.worldNs}:${entry.eventType ?? ''}`
    }
    return [
      'm',
      entry.startWorldNs,
      entry.endWorldNs,
      entry.selectionKey,
      entry.label,
      entry.frameBytes.length,
      entry.pulseWidthsNs.length,
      entry.components.length,
    ].join(':')
  }).join('|')

const buildAnalogSamplesSignature = (samples: TimestripAnalogSample[]): string =>
  samples.map((sample) => [
    sample.worldNs,
    sample.voltageV,
    sample.currentA,
  ].join(':')).join('|')

const formatAnalogHoverValue = (value: number, unit: 'V' | 'A'): string =>
  `${value.toFixed(unit === 'V' ? 2 : 3)}${unit}`

type TimestripInvalidation = 'all' | TimestripWorldRange
type DigitalQueryRange = TimestripQueryRange
type TimelineRangePoint = {
  timestampUs: bigint
  wallClockUs: bigint | null
}
type MessageSelectionKeyParts = {
  startTimestampUs: bigint
  endTimestampUs: bigint
}

const calculateQueryInvalidation = (
  loadedRange: DigitalQueryRange | null,
  nextRange: DigitalQueryRange,
  basis: TimestripBasis,
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
      startWorldNs: 0,
      endWorldNs: 0,
    }
  }
  return {
    startWorldNs: basisTimestampUsToWorldNs(startTimestampUs, basis),
    endWorldNs: basisTimestampUsToWorldNs(endTimestampUs, basis),
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

const buildTimelineBasis = (
  originTimestampUs: bigint,
  originWallClockUs: number,
  hasWallClockBasis: boolean,
): TimestripBasis => ({
  kind: hasWallClockBasis ? 'wallClock' : 'device',
  originTimestampUs,
  originWallClockUs,
})

const getCapturedRowBasisTimestampUs = (
  row: LoggedCapturedMessage,
  hasWallClockBasis: boolean,
): bigint | null => {
  if (!hasWallClockBasis) {
    return row.startTimestampUs
  }
  return row.wallClockUs
}

const getClosestCapturedRow = (
  rows: LoggedCapturedMessage[],
  targetTimestampUs: bigint,
  hasWallClockBasis: boolean,
): LoggedCapturedMessage | null => {
  let closestRow: LoggedCapturedMessage | null = null
  let closestDistance: bigint | null = null
  for (const row of rows) {
    const rowTimestampUs = getCapturedRowBasisTimestampUs(row, hasWallClockBasis)
    if (rowTimestampUs === null) {
      continue
    }
    const distance = rowTimestampUs > targetTimestampUs
      ? rowTimestampUs - targetTimestampUs
      : targetTimestampUs - rowTimestampUs
    if (closestDistance === null || distance < closestDistance) {
      closestDistance = distance
      closestRow = row
    }
  }
  return closestRow
}

const getAnalogSampleBasisTimestampUs = (
  row: LoggedAnalogSample,
  hasWallClockBasis: boolean,
): bigint | null => {
  if (!hasWallClockBasis) {
    return row.timestampUs
  }
  return row.wallClockUs
}

const mergeAnalogSampleRows = (
  rows: LoggedAnalogSample[],
  hasWallClockBasis: boolean,
): LoggedAnalogSample[] => {
  const seen = new Set<string>()
  return rows
    .filter((row) => {
      const timestampUs = getAnalogSampleBasisTimestampUs(row, hasWallClockBasis)
      if (timestampUs === null) {
        return false
      }
      const key = `${row.timestampUs}:${row.wallClockUs ?? 'null'}:${row.createdAtMs}`
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
    .sort((left, right) => {
      const leftTimestampUs = getAnalogSampleBasisTimestampUs(left, hasWallClockBasis) ?? 0n
      const rightTimestampUs = getAnalogSampleBasisTimestampUs(right, hasWallClockBasis) ?? 0n
      return leftTimestampUs < rightTimestampUs ? -1 : leftTimestampUs > rightTimestampUs ? 1 : 0
    })
}

const parseMessageSelectionKey = (selectionKey: string): MessageSelectionKeyParts | null => {
  const parts = selectionKey.split(':')
  if (parts.length !== 4 || parts[0] !== 'message') {
    return null
  }
  try {
    return {
      startTimestampUs: BigInt(parts[1]),
      endTimestampUs: BigInt(parts[2]),
    }
  } catch {
    return null
  }
}

const normalizeSelectionState = (value: unknown): DRPDLogSelectionState => {
  const probe = value as Partial<DRPDLogSelectionState>
  return {
    selectedKeys: Array.isArray(probe?.selectedKeys)
      ? probe.selectedKeys.filter((key): key is string => typeof key === 'string')
      : [],
    anchorIndex: typeof probe?.anchorIndex === 'number' ? probe.anchorIndex : null,
    activeIndex: typeof probe?.activeIndex === 'number' ? probe.activeIndex : null,
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
  const centeredSelectionKeyRef = useRef<string | null>(null)
  const digitalEntriesSignatureRef = useRef('')
  const analogSamplesSignatureRef = useRef('')
  const digitalQueryRangeRef = useRef<DigitalQueryRange | null>(null)
  const analogQueryRangeRef = useRef<DigitalQueryRange | null>(null)
  const pendingTileInvalidationRef = useRef<TimestripInvalidation | null>(null)
  const [timelineRange, setTimelineRange] = useState<TimestripTimelineRange>(() => ({
    basis: buildTimelineBasis(0n, Date.now() * 1000, false),
    durationNs: PLACEHOLDER_TIMELINE_END_NS,
    hasLogRange: false,
  }))
  const [hasLogTimelineRange, setHasLogTimelineRange] = useState(false)
  const [themeName, setThemeName] = useState(readThemeName)
  const [theme, setTheme] = useState(() => readTimestripTheme(readThemeName()))
  const [digitalEntries, setDigitalEntries] = useState<TimestripDigitalEntry[]>([])
  const [digitalDataRevision, setDigitalDataRevision] = useState(0)
  const [analogSamples, setAnalogSamples] = useState<TimestripAnalogSample[]>([])
  const [analogDataRevision, setAnalogDataRevision] = useState(0)
  const [selectedLogMessageKey, setSelectedLogMessageKey] = useState<string | null>(null)
  const {
    viewportWidthPx,
    viewportHeightPx,
    scrollLeftPx,
    setScrollLeftPx,
    zoomDenominator,
    zoomReadout,
    timelineWidthPx,
    domTimelineWidthPx,
    domScrollLeftToLogical,
    logicalScrollLeftToDom,
    handleViewportScroll: handleViewportScrollState,
  } = useTimestripViewport(viewportRef, timelineRange.durationNs)
  const analogLegendTicks = buildTimestripAnalogLegendTicks(viewportHeightPx)
  const {
    analogHover,
    analogHoverPointerRef,
    updateAnalogHoverAtViewportPoint,
    updateAnalogHover,
    clearAnalogHover,
  } = useTimestripAnalogHover({
    viewportRef,
    viewportWidthPx,
    viewportHeightPx,
    scrollLeftPx,
    zoomDenominator,
    analogSamples,
  })
  const handleViewportScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const nextScrollLeftPx = domScrollLeftToLogical(event.currentTarget.scrollLeft)
    handleViewportScrollState(event)
    const pointer = analogHoverPointerRef.current
    if (pointer) {
      flushSync(() => {
        updateAnalogHoverAtViewportPoint(
          pointer.x,
          pointer.y,
          nextScrollLeftPx,
        )
      })
    }
  }, [domScrollLeftToLogical, handleViewportScrollState, updateAnalogHoverAtViewportPoint])
  const selectClosestLogEntry = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const driver = deviceState?.drpdDriver
    const viewport = viewportRef.current
    if (
      !driver ||
      typeof driver.queryCapturedMessages !== 'function' ||
      typeof driver.setLogSelectionState !== 'function' ||
      !viewport ||
      viewportWidthPx <= 0
    ) {
      return
    }

    const rect = viewport.getBoundingClientRect()
    const viewportX = Math.max(0, Math.min(viewportWidthPx, event.clientX - rect.left))
    const worldNs = Math.max(0, Math.floor((scrollLeftPx + viewportX) * zoomDenominator))
    const timelineStartUs = getTimestripBasisOriginUs(timelineRange.basis)
    const targetTimestampUs = timelineStartUs + BigInt(Math.floor(worldNs / 1000))
    const timeBasis = timelineRange.basis.kind === 'wallClock' ? 'wallClock' : 'device'

    void (async () => {
      try {
        const [previousRows, nextRows] = await Promise.all([
          driver.queryCapturedMessages({
            startTimestampUs: LOG_START_TIMESTAMP_US,
            endTimestampUs: targetTimestampUs,
            timeBasis,
            sortOrder: 'desc',
            limit: 1,
          }),
          targetTimestampUs < LOG_END_TIMESTAMP_US
            ? driver.queryCapturedMessages({
              startTimestampUs: targetTimestampUs + 1n,
              endTimestampUs: LOG_END_TIMESTAMP_US,
              timeBasis,
              sortOrder: 'asc',
              limit: 1,
            })
            : Promise.resolve([]),
        ])
        const closestRow = getClosestCapturedRow(
          [...previousRows, ...nextRows],
          targetTimestampUs,
          timelineRange.basis.kind === 'wallClock',
        )
        if (!closestRow) {
          return
        }
        await Promise.resolve(driver.setLogSelectionState({
          selectedKeys: [buildCapturedLogSelectionKey(closestRow)],
          anchorIndex: null,
          activeIndex: null,
        }))
      } catch {
        // Keep the current selection if the log store is temporarily unavailable.
      }
    })()
  }, [
    deviceState?.drpdDriver,
    scrollLeftPx,
    timelineRange.basis.originTimestampUs,
    timelineRange.basis.originWallClockUs,
    timelineRange.basis.kind === 'wallClock',
    viewportWidthPx,
    zoomDenominator,
  ])
  const queueTileInvalidation = useCallback((invalidation: TimestripInvalidation) => {
    const current = pendingTileInvalidationRef.current
    if (current === 'all' || invalidation === 'all' || current === null) {
      pendingTileInvalidationRef.current = invalidation
      return
    }
    pendingTileInvalidationRef.current = {
      startWorldNs: Math.min(current.startWorldNs, invalidation.startWorldNs),
      endWorldNs: Math.max(current.endWorldNs, invalidation.endWorldNs),
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
  const readSelectedLogMessageKey = useCallback(async (): Promise<string | null> => {
    const driver = deviceState?.drpdDriver
    if (!driver || typeof driver.getLogSelectionState !== 'function') {
      return null
    }
    const selection = normalizeSelectionState(await Promise.resolve(driver.getLogSelectionState()))
    if (selection.selectedKeys.length !== 1 || !selection.selectedKeys[0].startsWith('message:')) {
      return null
    }
    return selection.selectedKeys[0]
  }, [deviceState?.drpdDriver])

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
            current.basis.originTimestampUs === startTimestampUs &&
            current.basis.originWallClockUs === startWallClockUs &&
            current.durationNs === nextDurationNs &&
            (current.basis.kind === 'wallClock') === hasWallClockBasis
          ) {
            return current
          }
          return {
            basis: buildTimelineBasis(startTimestampUs, startWallClockUs, hasWallClockBasis),
            durationNs: nextDurationNs,
            hasLogRange: true,
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
    if (!driver || typeof driver.addEventListener !== 'function') {
      setSelectedLogMessageKey(null)
      return undefined
    }

    let isActive = true
    const refreshSelectedLogMessageKey = () => {
      void readSelectedLogMessageKey().then((nextSelectionKey) => {
        if (isActive) {
          setSelectedLogMessageKey(nextSelectionKey)
        }
      })
    }
    const handleStateUpdated = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined
      const changed = Array.isArray(detail?.changed) ? detail.changed : []
      if (changed.includes('logSelection')) {
        refreshSelectedLogMessageKey()
      }
    }

    refreshSelectedLogMessageKey()
    driver.addEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdated)
    return () => {
      isActive = false
      driver.removeEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdated)
    }
  }, [deviceState?.drpdDriver, readSelectedLogMessageKey])

  useEffect(() => {
    const driver = deviceState?.drpdDriver
    const viewport = viewportRef.current
    if (!selectedLogMessageKey) {
      centeredSelectionKeyRef.current = null
      return undefined
    }
    if (
      !driver ||
      !viewport ||
      !hasLogTimelineRange ||
      viewportWidthPx <= 0 ||
      timelineWidthPx <= 0 ||
      centeredSelectionKeyRef.current === selectedLogMessageKey
    ) {
      return undefined
    }
    const selectionKeyParts = parseMessageSelectionKey(selectedLogMessageKey)
    if (!selectionKeyParts) {
      return undefined
    }

    let isActive = true
    const centerSelectedMessage = async () => {
      try {
        const rows = await driver.queryCapturedMessages({
          startTimestampUs: selectionKeyParts.startTimestampUs,
          endTimestampUs: selectionKeyParts.endTimestampUs,
          timeBasis: 'device',
          sortOrder: 'asc',
          limit: 25,
        })
        if (!isActive) {
          return
        }
        const selectedRow = rows.find((row) => buildCapturedLogSelectionKey(row) === selectedLogMessageKey)
        if (!selectedRow) {
          return
        }
        const basisStartUs = timelineRange.basis.kind === 'wallClock' && selectedRow.wallClockUs != null
          ? BigInt(Math.floor(timelineRange.basis.originWallClockUs))
          : timelineRange.basis.originTimestampUs
        const rowStartUs = timelineRange.basis.kind === 'wallClock' && selectedRow.wallClockUs != null
          ? selectedRow.wallClockUs
          : selectedRow.startTimestampUs
        const rowWorldStartNs = Number((rowStartUs - basisStartUs) * 1000n)
        if (!Number.isFinite(rowWorldStartNs)) {
          return
        }
        const maxScrollLeft = Math.max(
          0,
          timelineWidthPx - viewportWidthPx,
        )
        const nextScrollLeft = Math.max(
          0,
          Math.min(maxScrollLeft, rowWorldStartNs / zoomDenominator - viewportWidthPx / 2),
        )
        viewport.scrollLeft = logicalScrollLeftToDom(nextScrollLeft)
        setScrollLeftPx(nextScrollLeft)
        centeredSelectionKeyRef.current = selectedLogMessageKey
      } catch {
        // Keep the current viewport if the selected row is no longer available.
      }
    }

    void centerSelectedMessage()
    return () => {
      isActive = false
    }
  }, [
    deviceState?.drpdDriver,
    hasLogTimelineRange,
    selectedLogMessageKey,
    timelineRange.basis.originTimestampUs,
    timelineRange.basis.originWallClockUs,
    timelineRange.basis.kind === 'wallClock',
    timelineWidthPx,
    logicalScrollLeftToDom,
    viewportWidthPx,
    zoomDenominator,
  ])

  useEffect(() => {
    const driver = deviceState?.drpdDriver
    if (!driver || viewportWidthPx <= 0) {
      digitalQueryRangeRef.current = null
      commitDigitalEntries([], 'all')
      return undefined
    }

    let isActive = true
    const refreshDigitalEntries = async () => {
      const range = calculateTimestripQueryRange(
        scrollLeftPx,
        viewportWidthPx,
        zoomDenominator,
        timelineRange.basis,
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
          timeBasis: range.timeBasis,
          sortOrder: 'asc',
          limit: DIGITAL_QUERY_LIMIT,
        })
        if (!isActive) {
          return
        }
        const invalidation = calculateQueryInvalidation(
          loadedRange,
          range,
          timelineRange.basis,
        )
        digitalQueryRangeRef.current = range
        const nextEntries = rows.flatMap((row) => {
          const entry = normalizeCapturedMessageForTimestrip(
            row,
            timelineRange.basis.originTimestampUs,
            timelineRange.basis.kind === 'wallClock'
              ? BigInt(Math.floor(timelineRange.basis.originWallClockUs))
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
    timelineRange.basis.originTimestampUs,
    timelineRange.basis.originWallClockUs,
    timelineRange.basis.kind === 'wallClock',
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
      const range = calculateTimestripQueryRange(
        scrollLeftPx,
        viewportWidthPx,
        zoomDenominator,
        timelineRange.basis,
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
        const [previousRows, visibleRows, nextRows] = await Promise.all([
          range.startTimestampUs > LOG_START_TIMESTAMP_US
            ? driver.queryAnalogSamples({
              startTimestampUs: LOG_START_TIMESTAMP_US,
              endTimestampUs: range.startTimestampUs - 1n,
              timeBasis: range.timeBasis,
              sortOrder: 'desc',
              limit: 1,
            })
            : Promise.resolve([]),
          driver.queryAnalogSamples({
            startTimestampUs: range.startTimestampUs,
            endTimestampUs: range.endTimestampUs,
            timeBasis: range.timeBasis,
            sortOrder: 'asc',
            limit: ANALOG_QUERY_LIMIT,
          }),
          range.endTimestampUs < LOG_END_TIMESTAMP_US
            ? driver.queryAnalogSamples({
              startTimestampUs: range.endTimestampUs + 1n,
              endTimestampUs: LOG_END_TIMESTAMP_US,
              timeBasis: range.timeBasis,
              sortOrder: 'asc',
              limit: 1,
            })
            : Promise.resolve([]),
        ])
        if (!isActive) {
          return
        }
        const invalidation = calculateQueryInvalidation(
          loadedRange,
          range,
          timelineRange.basis,
        )
        analogQueryRangeRef.current = range
        const nextSamples = mergeAnalogSampleRows(
          [...previousRows, ...visibleRows, ...nextRows],
          timelineRange.basis.kind === 'wallClock',
        ).flatMap((row) => {
          const sample = normalizeAnalogSampleForTimestrip(
            row,
            timelineRange.basis.originTimestampUs,
            timelineRange.basis.kind === 'wallClock'
              ? BigInt(Math.floor(timelineRange.basis.originWallClockUs))
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
    timelineRange.basis.originTimestampUs,
    timelineRange.basis.originWallClockUs,
    timelineRange.basis.kind === 'wallClock',
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
      const rowWorldStartNs =
        timelineRange.basis.kind === 'wallClock' && rowWallClockUs != null
          ? Number((rowWallClockUs - BigInt(Math.floor(timelineRange.basis.originWallClockUs))) * 1000n)
          : Number((rowTimestampUs - timelineRange.basis.originTimestampUs) * 1000n)
      const rowDurationNs =
        !isAnalogRow && (row as LoggedCapturedMessage).entryKind === 'message'
          ? Math.max(1, Number(((row as LoggedCapturedMessage).endTimestampUs - (row as LoggedCapturedMessage).startTimestampUs) * 1000n))
          : 1
      const rowWorldEndNs = rowWorldStartNs + rowDurationNs
      if (!hasLogTimelineRange) {
        digitalQueryRangeRef.current = null
        analogQueryRangeRef.current = null
        commitDigitalEntries([], 'all')
        commitAnalogSamples([], 'all')
      }
      setTimelineRange((current) => {
        const rowDurationUs = BigInt(Math.ceil(rowDurationNs / 1000))
        const currentStartBasisUs = current.basis.kind === 'wallClock'
          ? BigInt(Math.floor(current.basis.originWallClockUs))
          : current.basis.originTimestampUs
        const currentEndBasisUs = currentStartBasisUs + (current.durationNs + 999n) / 1000n
        const usesWallClockBasis = current.basis.kind === 'wallClock' && rowWallClockUs != null
        const rowStartBasisUs = usesWallClockBasis ? rowWallClockUs! : rowTimestampUs
        const rowEndBasisUs = usesWallClockBasis
          ? rowStartBasisUs + rowDurationUs
          : !isAnalogRow && (row as LoggedCapturedMessage).endTimestampUs > rowTimestampUs
            ? (row as LoggedCapturedMessage).endTimestampUs
            : rowTimestampUs + rowDurationUs
        if (!hasLogTimelineRange) {
          return {
            basis: buildTimelineBasis(
              rowTimestampUs,
              rowWallClockUs == null ? Date.now() * 1000 : Number(rowWallClockUs),
              rowWallClockUs != null,
            ),
            durationNs: BigInt(rowDurationNs),
            hasLogRange: true,
          }
        }
        if (rowStartBasisUs < currentStartBasisUs) {
          digitalQueryRangeRef.current = null
          analogQueryRangeRef.current = null
          commitDigitalEntries([], 'all')
          commitAnalogSamples([], 'all')
          return {
            ...current,
            basis: buildTimelineBasis(
              rowTimestampUs,
              rowWallClockUs == null ? current.basis.originWallClockUs : Number(rowWallClockUs),
              current.basis.kind === 'wallClock' && rowWallClockUs != null,
            ),
            durationNs: (currentEndBasisUs - rowStartBasisUs) * 1000n,
            hasLogRange: true,
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
          (timelineRange.basis.kind === 'wallClock' && analogRow.wallClockUs == null) ||
          (timelineRange.basis.kind === 'wallClock'
            ? analogRow.wallClockUs! < loadedRange.startTimestampUs || analogRow.wallClockUs! > loadedRange.endTimestampUs
            : analogRow.timestampUs < loadedRange.startTimestampUs || analogRow.timestampUs > loadedRange.endTimestampUs)
        ) {
          return
        }

        const sample = normalizeAnalogSampleForTimestrip(
          analogRow,
          timelineRange.basis.originTimestampUs,
          timelineRange.basis.kind === 'wallClock'
            ? BigInt(Math.floor(timelineRange.basis.originWallClockUs))
            : undefined,
        )
        if (!sample) {
          return
        }
        const nextSamples = [...analogSamples, sample].sort((left, right) => left.worldNs - right.worldNs)
        commitAnalogSamples(nextSamples, {
          startWorldNs: rowWorldStartNs,
          endWorldNs: rowWorldEndNs,
        })
        return
      }
      const messageRow = row as LoggedCapturedMessage
      const loadedRange = digitalQueryRangeRef.current
      if (
        !hasLogTimelineRange ||
        !loadedRange ||
        (timelineRange.basis.kind === 'wallClock' && messageRow.wallClockUs == null) ||
        (timelineRange.basis.kind === 'wallClock'
          ? messageRow.wallClockUs! < loadedRange.startTimestampUs || messageRow.wallClockUs! > loadedRange.endTimestampUs
          : rowTimestampUs < loadedRange.startTimestampUs || rowTimestampUs > loadedRange.endTimestampUs)
      ) {
        return
      }

      const entry = normalizeCapturedMessageForTimestrip(
        messageRow,
        timelineRange.basis.originTimestampUs,
        timelineRange.basis.kind === 'wallClock'
          ? BigInt(Math.floor(timelineRange.basis.originWallClockUs))
          : undefined,
      )
      if (!entry) {
        return
      }
      const nextEntries = [...digitalEntries, entry].sort((left, right) => {
        const leftWorldUs = left.kind === 'event' ? left.worldNs : left.startWorldNs
        const rightWorldUs = right.kind === 'event' ? right.worldNs : right.startWorldNs
        return leftWorldUs - rightWorldUs
      })
      commitDigitalEntries(nextEntries, {
        startWorldNs: rowWorldStartNs,
        endWorldNs: rowWorldEndNs,
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
          basis: buildTimelineBasis(0n, Date.now() * 1000, false),
          durationNs: PLACEHOLDER_TIMELINE_END_NS,
          hasLogRange: false,
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
    timelineRange.basis.originTimestampUs,
    timelineRange.basis.originWallClockUs,
    timelineRange.basis.kind === 'wallClock',
  ])

  useEffect(() => {
    const renderer = rendererRef.current
    renderer?.setViewport({
      scrollLeftPx,
      zoomDenominator,
      viewportWidthPx,
      viewportHeightPx,
      dpr: window.devicePixelRatio || 1,
      worldStartWallClockUs: timelineRange.basis.originWallClockUs,
      theme,
      digitalEntries,
      digitalDataRevision,
      analogSamples,
      analogDataRevision,
      selectedMessageKey: selectedLogMessageKey,
    })
    const invalidation = pendingTileInvalidationRef.current
    pendingTileInvalidationRef.current = null
    if (invalidation === 'all') {
      renderer?.invalidateAllTiles()
    } else if (invalidation) {
      renderer?.invalidateWorldRange(invalidation.startWorldNs, invalidation.endWorldNs)
    }
  }, [
    digitalDataRevision,
    digitalEntries,
    analogDataRevision,
    analogSamples,
    selectedLogMessageKey,
    scrollLeftPx,
    theme,
    timelineRange.basis.originWallClockUs,
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
          onClick={selectClosestLogEntry}
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
            style={{ width: `${domTimelineWidthPx}px` }}
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
