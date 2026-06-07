import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildCapturedLogSelectionKey,
  DRPDDevice,
  OnOffState,
  type DRPDLogSelectionState,
  type LoggedAnalogSample,
  type LoggedCapturedMessage,
} from '../../../lib/device'
import type { RackInstrument } from '../../../lib/rack/types'
import { InstrumentBase } from '../InstrumentBase'
import type { RackDeviceState } from '../RackRenderer'
import styles from './DrpdTimeStripInstrumentView.module.css'
import { getTimestripThemePalette } from './timestrip/timestripTheme'
import { TimestripCanvasRenderer } from './timestrip/timestripCanvasRenderer'
import {
  normalizeCapturedMessageForTimestrip,
  type TimestripDigitalEntry,
} from './timestrip/timestripDigitalModel'
import {
  normalizeAnalogSampleForTimestrip,
  type TimestripAnalogSample,
} from './timestrip/timestripAnalogModel'
import { buildTimestripAnalogLegendTicks } from './timestrip/timestripAnalogLegend'
import { buildTimestripLaneLayout } from './timestrip/timestripLaneLayout'
import {
  basisTimestampUsToWorldNs,
  calculateTimestripQueryRange,
  getTimestripBasisOriginUs,
  getTimestripBasisTimestampUs,
  type TimestripBasis,
  type TimestripQueryRange,
  type TimestripTimelineRange,
} from './timestrip/timestripCoordinates'
import { useTimestripViewport } from './timestrip/useTimestripViewport'
import type { TimestripNavigationReason } from './timestrip/useTimestripViewport'
import { useTimestripAnalogHover } from './timestrip/useTimestripAnalogHover'
import { mergeTimestripUnavailableRegions } from './timestrip/timestripUnavailableRegions'
import type { TimestripUnavailableRegion } from './timestrip/timestripUnavailableRegions'

const PLACEHOLDER_TIMELINE_END_NS = 10_000_000_000n
const LOG_START_TIMESTAMP_US = 0n
const LOG_END_TIMESTAMP_US = (2n ** 63n) - 1n
const DIGITAL_QUERY_LIMIT = 5000
const ANALOG_QUERY_LIMIT = 8000
const DIGITAL_QUERY_OVERSCAN_PX = 1024
const ANALOG_QUERY_OVERSCAN_PX = DIGITAL_QUERY_OVERSCAN_PX
const MIN_LIVE_FOLLOW_ZOOM_DENOMINATOR_NS = 16_000_000
const LIVE_FOLLOW_VIEWPORT_FRACTION = 0.5
const LIVE_FOLLOW_INTERVAL_MS = 125
const LIVE_FOLLOW_MAX_STEP_VIEWPORTS = 0.75
const readThemeName = () => (
  typeof document === 'undefined' ? 'dark' : document.documentElement.dataset.theme ?? 'dark'
)
const readTimestripTheme = (themeName: string) => getTimestripThemePalette(
  themeName,
  typeof window === 'undefined' ? undefined : window.getComputedStyle(document.documentElement),
)
const formatAnalogHoverValue = (value: number, unit: 'V' | 'A'): string =>
  `${value.toFixed(unit === 'V' ? 2 : 3)}${unit}`

type DigitalQueryRange = TimestripQueryRange
type AnalogLoadedRange = TimestripQueryRange
type TimelineRangePoint = {
  timestampUs: bigint
  wallClockUs: bigint | null
}
type MessageSelectionKeyParts = {
  startTimestampUs: bigint
  endTimestampUs: bigint
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

const getMessageDurationNs = (row: LoggedCapturedMessage): number =>
  row.entryKind === 'message'
    ? Math.max(1, Number((row.endTimestampUs - row.startTimestampUs) * 1000n))
    : 1

const getLoggedMessageEndWorldNs = (
  row: LoggedCapturedMessage,
  basis: TimestripBasis,
): number | null => {
  const startBasisTimestampUs = getTimestripBasisTimestampUs(row.startTimestampUs, row.wallClockUs, basis)
  if (startBasisTimestampUs === null) {
    return null
  }
  return basisTimestampUsToWorldNs(startBasisTimestampUs, basis) + getMessageDurationNs(row)
}

const getAnalogSampleWorldNs = (
  row: LoggedAnalogSample,
  basis: TimestripBasis,
): number | null => {
  const basisTimestampUs = getTimestripBasisTimestampUs(row.timestampUs, row.wallClockUs, basis)
  return basisTimestampUs === null ? null : basisTimestampUsToWorldNs(basisTimestampUs, basis)
}

const getCaptureBreakWorldNs = (
  row: LoggedCapturedMessage,
  basis: TimestripBasis,
): number | null => {
  if (row.entryKind !== 'event' || row.eventType !== 'capture_changed') {
    return null
  }
  const basisTimestampUs = getTimestripBasisTimestampUs(row.startTimestampUs, row.wallClockUs, basis)
  return basisTimestampUs === null ? null : basisTimestampUsToWorldNs(basisTimestampUs, basis)
}

const buildTimestripUnavailableRegions = (
  digitalEntries: TimestripDigitalEntry[],
  latestDatumWorldNs: number | null,
  timelineEndWorldNs: number,
  zoomDenominator: number,
): TimestripUnavailableRegion[] => {
  const regions: TimestripUnavailableRegion[] = []
  let captureUnavailableStartWorldNs: number | null = null
  const captureEvents = digitalEntries
    .filter((entry): entry is Extract<TimestripDigitalEntry, { kind: 'event' }> => (
      entry.kind === 'event' && entry.eventType === 'capture_changed'
    ))
    .sort((left, right) => left.worldNs - right.worldNs)
  for (const event of captureEvents) {
    const eventText = event.eventText?.toLowerCase() ?? ''
    if (eventText.includes('turned off')) {
      captureUnavailableStartWorldNs = event.worldNs
      continue
    }
    if (eventText.includes('turned on') && captureUnavailableStartWorldNs !== null) {
      regions.push({
        startWorldNs: captureUnavailableStartWorldNs,
        endWorldNs: event.worldNs,
      })
      captureUnavailableStartWorldNs = null
    }
  }
  if (captureUnavailableStartWorldNs !== null) {
    regions.push({
      startWorldNs: captureUnavailableStartWorldNs,
      endWorldNs: timelineEndWorldNs,
    })
  }
  if (latestDatumWorldNs === null) {
    regions.push({
      startWorldNs: 0,
      endWorldNs: timelineEndWorldNs,
    })
  } else if (latestDatumWorldNs < timelineEndWorldNs) {
    const startWorldNs = Math.min(timelineEndWorldNs, latestDatumWorldNs + zoomDenominator)
    regions.push({
      startWorldNs,
      endWorldNs: timelineEndWorldNs,
    })
  }
  return mergeTimestripUnavailableRegions(regions)
}

const isRangeCoveredByLoadedRanges = (
  range: TimestripQueryRange,
  loadedRanges: AnalogLoadedRange[],
): boolean => {
  let coveredUntil: bigint | null = null
  const relevantRanges = loadedRanges
    .filter((loadedRange) => loadedRange.timeBasis === range.timeBasis)
    .sort((left, right) => left.startTimestampUs < right.startTimestampUs ? -1 : left.startTimestampUs > right.startTimestampUs ? 1 : 0)
  for (const loadedRange of relevantRanges) {
    if (loadedRange.endTimestampUs < range.startTimestampUs) {
      continue
    }
    if (loadedRange.startTimestampUs > range.endTimestampUs) {
      break
    }
    if (coveredUntil === null) {
      if (loadedRange.startTimestampUs > range.startTimestampUs) {
        return false
      }
      coveredUntil = loadedRange.endTimestampUs
    } else if (loadedRange.startTimestampUs > coveredUntil + 1n) {
      return false
    } else if (loadedRange.endTimestampUs > coveredUntil) {
      coveredUntil = loadedRange.endTimestampUs
    }
    if (coveredUntil >= range.endTimestampUs) {
      return true
    }
  }
  return false
}

const isTimestampCoveredByLoadedRanges = (
  timestampUs: bigint,
  timeBasis: 'device' | 'wallClock',
  loadedRanges: AnalogLoadedRange[],
): boolean => loadedRanges.some((loadedRange) => (
  loadedRange.timeBasis === timeBasis &&
  timestampUs >= loadedRange.startTimestampUs &&
  timestampUs <= loadedRange.endTimestampUs
))

const mergeLoadedAnalogRange = (
  loadedRanges: AnalogLoadedRange[],
  nextRange: AnalogLoadedRange | null,
): AnalogLoadedRange[] => {
  if (!nextRange) {
    return loadedRanges
  }
  const ranges = [...loadedRanges, nextRange]
    .filter((range) => range.timeBasis === nextRange.timeBasis)
    .sort((left, right) => left.startTimestampUs < right.startTimestampUs ? -1 : left.startTimestampUs > right.startTimestampUs ? 1 : 0)
  const merged: AnalogLoadedRange[] = []
  for (const range of ranges) {
    const previous = merged.at(-1)
    if (!previous || range.startTimestampUs > previous.endTimestampUs + 1n) {
      merged.push({ ...range })
      continue
    }
    if (range.endTimestampUs > previous.endTimestampUs) {
      previous.endTimestampUs = range.endTimestampUs
    }
  }
  return [
    ...loadedRanges.filter((range) => range.timeBasis !== nextRange.timeBasis),
    ...merged,
  ]
}

const mergeTimestripAnalogSamples = (
  currentSamples: TimestripAnalogSample[],
  nextSamples: TimestripAnalogSample[],
): TimestripAnalogSample[] => {
  const byWorldNs = new Map<number, TimestripAnalogSample>()
  for (const sample of currentSamples) {
    byWorldNs.set(sample.worldNs, { ...sample, breakBefore: false })
  }
  for (const sample of nextSamples) {
    byWorldNs.set(sample.worldNs, { ...sample, breakBefore: false })
  }
  return Array.from(byWorldNs.values()).sort((left, right) => left.worldNs - right.worldNs)
}

const mergeWorldNsValues = (current: number[], next: number[]): number[] =>
  Array.from(new Set([...current, ...next])).sort((left, right) => left - right)

const getAnalogCoveredRange = (
  requestedRange: TimestripQueryRange,
  visibleRows: LoggedAnalogSample[],
  hitLimit: boolean,
  usesWallClockBasis: boolean,
): AnalogLoadedRange | null => {
  if (visibleRows.length === 0) {
    return requestedRange
  }
  const timestamps = visibleRows.flatMap((row) => {
    const timestampUs = getAnalogSampleBasisTimestampUs(row, usesWallClockBasis)
    return timestampUs === null ? [] : [timestampUs]
  })
  if (timestamps.length === 0) {
    return null
  }
  const lastTimestampUs = timestamps.at(-1)!
  return {
    ...requestedRange,
    startTimestampUs: requestedRange.startTimestampUs,
    endTimestampUs: hitLimit ? lastTimestampUs : requestedRange.endTimestampUs,
  }
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

const applyAnalogBreaks = (
  samples: TimestripAnalogSample[],
  breakWorldNs: number[],
): TimestripAnalogSample[] => {
  if (samples.length === 0 || breakWorldNs.length === 0) {
    return samples.map((sample) => ({ ...sample, breakBefore: false }))
  }
  const sortedBreaks = [...breakWorldNs]
    .filter(Number.isFinite)
    .sort((left, right) => left - right)
  if (sortedBreaks.length === 0) {
    return samples.map((sample) => ({ ...sample, breakBefore: false }))
  }
  let breakIndex = 0
  return samples.map((sample, sampleIndex) => {
    if (sampleIndex === 0) {
      return { ...sample, breakBefore: false }
    }
    const previous = samples[sampleIndex - 1]
    while (breakIndex < sortedBreaks.length && sortedBreaks[breakIndex] <= previous.worldNs) {
      breakIndex += 1
    }
    const breakBefore =
      breakIndex < sortedBreaks.length &&
      sortedBreaks[breakIndex] > previous.worldNs &&
      sortedBreaks[breakIndex] <= sample.worldNs
    return { ...sample, breakBefore }
  })
}

const getDigitalEntrySortWorldNs = (entry: TimestripDigitalEntry): number =>
  entry.kind === 'event' ? entry.worldNs : entry.startWorldNs

const insertDigitalEntrySorted = (
  entries: TimestripDigitalEntry[],
  entry: TimestripDigitalEntry,
): TimestripDigitalEntry[] => {
  const entryWorldNs = getDigitalEntrySortWorldNs(entry)
  const lastEntry = entries.at(-1)
  if (!lastEntry || getDigitalEntrySortWorldNs(lastEntry) <= entryWorldNs) {
    return [...entries, entry]
  }
  const nextEntries = [...entries]
  let low = 0
  let high = nextEntries.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (getDigitalEntrySortWorldNs(nextEntries[mid]) <= entryWorldNs) {
      low = mid + 1
    } else {
      high = mid
    }
  }
  nextEntries.splice(low, 0, entry)
  return nextEntries
}

const insertAnalogSampleSorted = (
  samples: TimestripAnalogSample[],
  sample: TimestripAnalogSample,
): TimestripAnalogSample[] => {
  const lastSample = samples.at(-1)
  if (!lastSample || lastSample.worldNs <= sample.worldNs) {
    return [...samples, sample]
  }
  const nextSamples = [...samples]
  let low = 0
  let high = nextSamples.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (nextSamples[mid].worldNs <= sample.worldNs) {
      low = mid + 1
    } else {
      high = mid
    }
  }
  nextSamples.splice(low, 0, sample)
  return nextSamples
}

const getLatestLoggedDatumWorldNs = (
  rows: Array<LoggedCapturedMessage | LoggedAnalogSample | null | undefined>,
  basis: TimestripBasis,
): number | null => {
  const values = rows.flatMap((row) => {
    if (!row) {
      return []
    }
    const worldNs = 'timestampUs' in row
      ? getAnalogSampleWorldNs(row, basis)
      : getLoggedMessageEndWorldNs(row, basis)
    return worldNs === null || !Number.isFinite(worldNs) ? [] : [worldNs]
  })
  return values.length === 0 ? null : Math.max(...values)
}

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
  const canvasLayerRef = useRef<HTMLDivElement | null>(null)
  const rendererRef = useRef<TimestripCanvasRenderer | null>(null)
  const centeredSelectionKeyRef = useRef<string | null>(null)
  const liveFollowFrameRef = useRef<number | null>(null)
  const liveFollowImmediateRef = useRef(true)
  const lastLiveFollowCommitMsRef = useRef(0)
  const isLiveFollowPausedByUserRef = useRef(false)
  const userNavigationRevisionRef = useRef(0)
  const scrollHoverUpdateRef = useRef<((logicalScrollLeftPx: number) => void) | null>(null)
  const analogBreakWorldNsRef = useRef<number[]>([])
  const digitalQueryRangeRef = useRef<DigitalQueryRange | null>(null)
  const analogLoadedRangesRef = useRef<AnalogLoadedRange[]>([])
  const [timelineRange, setTimelineRange] = useState<TimestripTimelineRange>(() => ({
    basis: buildTimelineBasis(0n, Date.now() * 1000, false),
    durationNs: PLACEHOLDER_TIMELINE_END_NS,
    hasLogRange: false,
  }))
  const [hasLogTimelineRange, setHasLogTimelineRange] = useState(false)
  const [latestDatumWorldNs, setLatestDatumWorldNs] = useState<number | null>(null)
  const [captureEnabled, setCaptureEnabled] = useState(false)
  const [captureProgressWallClockUs, setCaptureProgressWallClockUs] = useState(() => Date.now() * 1000)
  const [themeName, setThemeName] = useState(readThemeName)
  const [theme, setTheme] = useState(() => readTimestripTheme(readThemeName()))
  const [digitalEntries, setDigitalEntries] = useState<TimestripDigitalEntry[]>([])
  const [digitalDataRevision, setDigitalDataRevision] = useState(0)
  const [analogSamples, setAnalogSamples] = useState<TimestripAnalogSample[]>([])
  const analogSamplesRef = useRef<TimestripAnalogSample[]>([])
  const [analogDataRevision, setAnalogDataRevision] = useState(0)
  const [selectedLogMessageKey, setSelectedLogMessageKey] = useState<string | null>(null)
  const [isLiveFollowEnabled, setIsLiveFollowEnabled] = useState(true)
  const [isLiveFollowPausedByUser, setIsLiveFollowPausedByUser] = useState(false)
  const setLiveFollowPausedByUser = useCallback((isPaused: boolean) => {
    isLiveFollowPausedByUserRef.current = isPaused
    setIsLiveFollowPausedByUser(isPaused)
  }, [])
  const liveCaptureMarkerWorldNs =
    captureEnabled && timelineRange.basis.kind === 'wallClock'
      ? Number((BigInt(Math.floor(captureProgressWallClockUs)) - BigInt(Math.floor(timelineRange.basis.originWallClockUs))) * 1000n)
      : null
  const captureMarkerWorldNs = latestDatumWorldNs === null
    ? liveCaptureMarkerWorldNs
    : liveCaptureMarkerWorldNs === null
      ? latestDatumWorldNs
      : Math.max(latestDatumWorldNs, liveCaptureMarkerWorldNs)
  const shouldExtendViewportForCapture =
    captureEnabled && liveCaptureMarkerWorldNs !== null && Number.isFinite(liveCaptureMarkerWorldNs)
  const viewportDurationNs =
    !shouldExtendViewportForCapture
      ? timelineRange.durationNs
      : BigInt(Math.max(
          Number(timelineRange.durationNs),
          Math.ceil(Math.max(1, liveCaptureMarkerWorldNs)),
        ))
  const handleTimestripUserNavigation = useCallback((reason: TimestripNavigationReason) => {
    if (reason === 'user-scroll' || reason === 'user-wheel' || reason === 'user-zoom') {
      userNavigationRevisionRef.current += 1
      setLiveFollowPausedByUser(true)
      if (liveFollowFrameRef.current !== null) {
        window.cancelAnimationFrame(liveFollowFrameRef.current)
        liveFollowFrameRef.current = null
      }
    }
  }, [setLiveFollowPausedByUser])
  const {
    viewportWidthPx,
    viewportHeightPx,
    scrollLeftPx,
    zoomDenominator,
    zoomReadout,
    timelineWidthPx,
    domTimelineWidthPx,
    scrollToLogicalLeft,
  } = useTimestripViewport(viewportRef, viewportDurationNs, {
    onUserNavigation: handleTimestripUserNavigation,
    onScrollLeftChanged: (nextScrollLeftPx) => {
      scrollHoverUpdateRef.current?.(nextScrollLeftPx)
    },
    tailPaddingViewportFraction:
      (captureMarkerWorldNs ?? latestDatumWorldNs) === null
        ? 0
        : 1 - LIVE_FOLLOW_VIEWPORT_FRACTION,
    minTailPaddingZoomDenominator: MIN_LIVE_FOLLOW_ZOOM_DENOMINATOR_NS,
  })
  const unavailableRegions = useMemo(
    () => buildTimestripUnavailableRegions(
      digitalEntries,
      latestDatumWorldNs,
      Number(viewportDurationNs),
      zoomDenominator,
    ),
    [digitalEntries, latestDatumWorldNs, viewportDurationNs, zoomDenominator],
  )
  const isLiveFollowAvailable = zoomDenominator >= MIN_LIVE_FOLLOW_ZOOM_DENOMINATOR_NS
  const latestFollowWorldNs = captureMarkerWorldNs ?? latestDatumWorldNs
  const maxScrollLeftPx = Math.max(0, timelineWidthPx - viewportWidthPx)
  const latestFollowTargetScrollLeftPx =
    latestFollowWorldNs === null || !Number.isFinite(latestFollowWorldNs) || viewportWidthPx <= 0
      ? null
      : Math.max(
          0,
          Math.min(
            maxScrollLeftPx,
            latestFollowWorldNs / zoomDenominator - viewportWidthPx * LIVE_FOLLOW_VIEWPORT_FRACTION,
          ),
        )
  const isLiveFollowing =
    isLiveFollowAvailable &&
    isLiveFollowEnabled &&
    !isLiveFollowPausedByUser &&
    !selectedLogMessageKey &&
    latestFollowTargetScrollLeftPx !== null
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
  scrollHoverUpdateRef.current = (nextScrollLeftPx) => {
    const pointer = analogHoverPointerRef.current
    if (!pointer) {
      return
    }
    updateAnalogHoverAtViewportPoint(pointer.x, pointer.y, nextScrollLeftPx)
  }
  useEffect(() => {
    const pointer = analogHoverPointerRef.current
    if (!pointer) {
      return
    }
    updateAnalogHoverAtViewportPoint(pointer.x, pointer.y, scrollLeftPx)
  }, [analogHoverPointerRef, scrollLeftPx, updateAnalogHoverAtViewportPoint])
  const resumeLiveFollow = useCallback(() => {
    if (!isLiveFollowAvailable) {
      return
    }
    liveFollowImmediateRef.current = true
    setIsLiveFollowEnabled(true)
    setLiveFollowPausedByUser(false)
  }, [isLiveFollowAvailable, setLiveFollowPausedByUser])
  const handleLiveFollowControlClick = useCallback(() => {
    if (!isLiveFollowAvailable) {
      return
    }
    if (isLiveFollowing) {
      setIsLiveFollowEnabled(false)
      setLiveFollowPausedByUser(false)
      return
    }
    const driver = deviceState?.drpdDriver
    if (selectedLogMessageKey && typeof driver?.clearLogSelection === 'function') {
      void Promise.resolve(driver.clearLogSelection())
        .catch(() => undefined)
        .finally(() => {
          centeredSelectionKeyRef.current = null
          setSelectedLogMessageKey(null)
          resumeLiveFollow()
        })
      return
    }
    if (selectedLogMessageKey) {
      centeredSelectionKeyRef.current = null
      setSelectedLogMessageKey(null)
    }
    resumeLiveFollow()
  }, [
    deviceState?.drpdDriver,
    isLiveFollowAvailable,
    isLiveFollowing,
    resumeLiveFollow,
    selectedLogMessageKey,
  ])
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
  const commitDigitalEntries = useCallback((nextEntries: TimestripDigitalEntry[]) => {
    setDigitalEntries(nextEntries)
    setDigitalDataRevision((revision) => revision + 1)
  }, [])
  const commitAnalogSamples = useCallback((nextSamples: TimestripAnalogSample[]) => {
    analogSamplesRef.current = nextSamples
    setAnalogSamples(nextSamples)
    setAnalogDataRevision((revision) => revision + 1)
  }, [])
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
    if (selectedLogMessageKey) {
      setLiveFollowPausedByUser(true)
      return
    }
    if (isLiveFollowEnabled) {
      liveFollowImmediateRef.current = true
      setLiveFollowPausedByUser(false)
    }
  }, [isLiveFollowEnabled, selectedLogMessageKey, setLiveFollowPausedByUser])

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
    const canvasLayer = canvasLayerRef.current
    if (!canvasLayer) {
      return undefined
    }
    const renderer = new TimestripCanvasRenderer({ canvasLayer })
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
    if (!driver || typeof driver.addEventListener !== 'function') {
      setCaptureEnabled(false)
      return undefined
    }

    const readCaptureEnabled = () => {
      const state = typeof driver.getState === 'function' ? driver.getState() : null
      setCaptureEnabled(state?.captureEnabled === OnOffState.ON)
    }
    const handleStateUpdated = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined
      const changed = Array.isArray(detail?.changed) ? detail.changed : []
      if (changed.includes('captureEnabled')) {
        setCaptureEnabled(detail?.state?.captureEnabled === OnOffState.ON)
      }
    }
    const handleCaptureStatusChanged = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined
      setCaptureEnabled(detail?.current === OnOffState.ON || detail?.captureEnabled === OnOffState.ON)
    }

    readCaptureEnabled()
    driver.addEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdated)
    driver.addEventListener(DRPDDevice.CAPTURE_STATUS_CHANGED_EVENT, handleCaptureStatusChanged)
    return () => {
      driver.removeEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdated)
      driver.removeEventListener(DRPDDevice.CAPTURE_STATUS_CHANGED_EVENT, handleCaptureStatusChanged)
    }
  }, [deviceState?.drpdDriver])

  useEffect(() => {
    if (!captureEnabled || timelineRange.basis.kind !== 'wallClock') {
      return undefined
    }
    const tick = () => {
      setCaptureProgressWallClockUs(Date.now() * 1000)
    }
    tick()
    const interval = window.setInterval(tick, 250)
    return () => {
      window.clearInterval(interval)
    }
  }, [captureEnabled, timelineRange.basis.kind])

  useEffect(() => {
    const driver = deviceState?.drpdDriver
    if (!driver) {
      return undefined
    }

    let isActive = true
    const refreshTimelineRange = async () => {
      try {
        const canQueryTimeBounds =
          'getLoggingTimeBounds' in driver &&
          typeof driver.getLoggingTimeBounds === 'function'
        const timeBounds = canQueryTimeBounds
          ? await driver.getLoggingTimeBounds()
          : null
        const canQueryAnalogSamples = typeof driver.queryAnalogSamples === 'function'
        const [
          firstWallClockMessage,
          lastWallClockMessage,
          firstAnalogSample,
          lastAnalogSample,
          firstDeviceMessage,
          lastDeviceMessage,
        ] = timeBounds
          ? [
              timeBounds.firstWallClockMessage,
              timeBounds.lastWallClockMessage,
              timeBounds.firstAnalogSample,
              timeBounds.lastAnalogSample,
              timeBounds.firstDeviceMessage,
              timeBounds.lastDeviceMessage,
            ]
          : await Promise.all([
              driver.queryCapturedMessages({
                startTimestampUs: LOG_START_TIMESTAMP_US,
                endTimestampUs: LOG_END_TIMESTAMP_US,
                timeBasis: 'wallClock',
                sortOrder: 'asc',
                limit: 1,
              }).then((rows) => rows[0] ?? null),
              driver.queryCapturedMessages({
                startTimestampUs: LOG_START_TIMESTAMP_US,
                endTimestampUs: LOG_END_TIMESTAMP_US,
                timeBasis: 'wallClock',
                sortOrder: 'desc',
                limit: 1,
              }).then((rows) => rows[0] ?? null),
              canQueryAnalogSamples
                ? driver.queryAnalogSamples({
                    startTimestampUs: LOG_START_TIMESTAMP_US,
                    endTimestampUs: LOG_END_TIMESTAMP_US,
                    sortOrder: 'asc',
                    limit: 1,
                  }).then((rows) => rows[0] ?? null)
                : Promise.resolve(null),
              canQueryAnalogSamples
                ? driver.queryAnalogSamples({
                    startTimestampUs: LOG_START_TIMESTAMP_US,
                    endTimestampUs: LOG_END_TIMESTAMP_US,
                    sortOrder: 'desc',
                    limit: 1,
                  }).then((rows) => rows[0] ?? null)
                : Promise.resolve(null),
              driver.queryCapturedMessages({
                startTimestampUs: LOG_START_TIMESTAMP_US,
                endTimestampUs: LOG_END_TIMESTAMP_US,
                sortOrder: 'asc',
                limit: 1,
              }).then((rows) => rows[0] ?? null),
              driver.queryCapturedMessages({
                startTimestampUs: LOG_START_TIMESTAMP_US,
                endTimestampUs: LOG_END_TIMESTAMP_US,
                sortOrder: 'desc',
                limit: 1,
              }).then((rows) => rows[0] ?? null),
            ])
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
        const nextBasis = buildTimelineBasis(startTimestampUs, startWallClockUs, hasWallClockBasis)
        const latestWorldNs = getLatestLoggedDatumWorldNs(
          [
            lastWallClockMessage,
            lastDeviceMessage,
            lastAnalogSample,
          ],
          nextBasis,
        )
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
            basis: nextBasis,
            durationNs: nextDurationNs,
            hasLogRange: true,
          }
        })
        setLatestDatumWorldNs(latestWorldNs)
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
    const startedUserNavigationRevision = userNavigationRevisionRef.current
    const centerSelectedMessage = async () => {
      try {
        const rows = await driver.queryCapturedMessages({
          startTimestampUs: selectionKeyParts.startTimestampUs,
          endTimestampUs: selectionKeyParts.endTimestampUs,
          timeBasis: 'device',
          sortOrder: 'asc',
          limit: 25,
        })
        if (!isActive || startedUserNavigationRevision !== userNavigationRevisionRef.current) {
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
        scrollToLogicalLeft(nextScrollLeft, 'selection')
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
    scrollToLogicalLeft,
    viewportWidthPx,
    zoomDenominator,
  ])

  useEffect(() => {
    if (
      !isLiveFollowing ||
      latestFollowTargetScrollLeftPx === null ||
      viewportWidthPx <= 0
    ) {
      if (liveFollowFrameRef.current !== null) {
        window.cancelAnimationFrame(liveFollowFrameRef.current)
        liveFollowFrameRef.current = null
      }
      return undefined
    }

    let isActive = true
    const tick = (timestampMs: number) => {
      if (!isActive || isLiveFollowPausedByUserRef.current) {
        return
      }
      const elapsedMs = timestampMs - lastLiveFollowCommitMsRef.current
      const immediate = liveFollowImmediateRef.current
      if (immediate || elapsedMs >= LIVE_FOLLOW_INTERVAL_MS) {
        const delta = latestFollowTargetScrollLeftPx - scrollLeftPx
        if (Math.abs(delta) > 1) {
          const maxStepPx = Math.max(1, viewportWidthPx * LIVE_FOLLOW_MAX_STEP_VIEWPORTS)
          const nextScrollLeft = immediate || Math.abs(delta) <= maxStepPx
            ? latestFollowTargetScrollLeftPx
            : scrollLeftPx + Math.sign(delta) * maxStepPx
          scrollToLogicalLeft(nextScrollLeft, 'follow')
        }
        liveFollowImmediateRef.current = false
        lastLiveFollowCommitMsRef.current = timestampMs
      }
      liveFollowFrameRef.current = window.requestAnimationFrame(tick)
    }

    liveFollowFrameRef.current = window.requestAnimationFrame(tick)
    return () => {
      isActive = false
      if (liveFollowFrameRef.current !== null) {
        window.cancelAnimationFrame(liveFollowFrameRef.current)
        liveFollowFrameRef.current = null
      }
    }
  }, [
    isLiveFollowing,
    latestFollowTargetScrollLeftPx,
    scrollLeftPx,
    scrollToLogicalLeft,
    viewportWidthPx,
  ])

  useEffect(() => {
    const driver = deviceState?.drpdDriver
    if (!driver || viewportWidthPx <= 0) {
      digitalQueryRangeRef.current = null
      commitDigitalEntries([])
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
        commitDigitalEntries(nextEntries)
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
      analogLoadedRangesRef.current = []
      commitAnalogSamples([])
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
      if (isRangeCoveredByLoadedRanges(range, analogLoadedRangesRef.current)) {
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
        const coveredRange = getAnalogCoveredRange(
          range,
          visibleRows,
          visibleRows.length >= ANALOG_QUERY_LIMIT,
          timelineRange.basis.kind === 'wallClock',
        )
        analogLoadedRangesRef.current = mergeLoadedAnalogRange(
          analogLoadedRangesRef.current,
          coveredRange,
        )
        const mergedAnalogRows = mergeAnalogSampleRows(
          [...previousRows, ...visibleRows, ...nextRows],
          timelineRange.basis.kind === 'wallClock',
        )
        const analogSpanBasisTimestamps = mergedAnalogRows.flatMap((row) => {
          const timestampUs = getAnalogSampleBasisTimestampUs(row, timelineRange.basis.kind === 'wallClock')
          return timestampUs === null ? [] : [timestampUs]
        })
        const captureBreakRows =
          typeof driver.queryCapturedMessages === 'function' && analogSpanBasisTimestamps.length > 1
            ? await driver.queryCapturedMessages({
              startTimestampUs: analogSpanBasisTimestamps[0],
              endTimestampUs: analogSpanBasisTimestamps.at(-1)!,
              timeBasis: range.timeBasis,
              sortOrder: 'asc',
              eventTypes: ['capture_changed'],
            })
            : []
        if (!isActive) {
          return
        }
        const breakWorldNs = captureBreakRows.flatMap((row) => {
          const worldNs = getCaptureBreakWorldNs(row, timelineRange.basis)
          return worldNs === null || !Number.isFinite(worldNs) ? [] : [worldNs]
        })
        analogBreakWorldNsRef.current = mergeWorldNsValues(analogBreakWorldNsRef.current, breakWorldNs)
        const queriedSamples = mergedAnalogRows.flatMap((row) => {
          const sample = normalizeAnalogSampleForTimestrip(
            row,
            timelineRange.basis.originTimestampUs,
            timelineRange.basis.kind === 'wallClock'
              ? BigInt(Math.floor(timelineRange.basis.originWallClockUs))
              : undefined,
          )
          return sample ? [sample] : []
        })
        const nextSamples = applyAnalogBreaks(
          mergeTimestripAnalogSamples(analogSamplesRef.current, queriedSamples),
          analogBreakWorldNsRef.current,
        )
        commitAnalogSamples(nextSamples)
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

    const pendingAddedRows: Array<{
      kind: 'message' | 'event' | 'analog'
      row: LoggedCapturedMessage | LoggedAnalogSample
    }> = []
    let pendingAddedFrame: number | null = null
    const processAdded = (detail: {
      kind: 'message' | 'event' | 'analog'
      row: LoggedCapturedMessage | LoggedAnalogSample
    }) => {
      const row = detail.row
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
        analogLoadedRangesRef.current = []
        analogBreakWorldNsRef.current = []
        commitDigitalEntries([])
        commitAnalogSamples([])
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
          analogLoadedRangesRef.current = []
          analogBreakWorldNsRef.current = []
          commitDigitalEntries([])
          commitAnalogSamples([])
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
      setLatestDatumWorldNs((current) => Math.max(
        current ?? 0,
        hasLogTimelineRange ? rowWorldEndNs : rowDurationNs,
      ))
      setHasLogTimelineRange(true)

      if (isAnalogRow) {
        const analogRow = row as LoggedAnalogSample
        const sampleBasisTimestampUs = getAnalogSampleBasisTimestampUs(analogRow, timelineRange.basis.kind === 'wallClock')
        const sampleTimeBasis = timelineRange.basis.kind === 'wallClock' ? 'wallClock' : 'device'
        if (
          !hasLogTimelineRange ||
          sampleBasisTimestampUs === null ||
          (timelineRange.basis.kind === 'wallClock' && analogRow.wallClockUs == null) ||
          !isTimestampCoveredByLoadedRanges(sampleBasisTimestampUs, sampleTimeBasis, analogLoadedRangesRef.current)
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
        const nextSamples = applyAnalogBreaks(
          insertAnalogSampleSorted(analogSamples, sample),
          analogBreakWorldNsRef.current,
        )
        commitAnalogSamples(nextSamples)
        return
      }
      const messageRow = row as LoggedCapturedMessage
      const captureBreakWorldNs = getCaptureBreakWorldNs(messageRow, timelineRange.basis)
      if (captureBreakWorldNs !== null && Number.isFinite(captureBreakWorldNs)) {
        analogBreakWorldNsRef.current = [
          ...analogBreakWorldNsRef.current,
          captureBreakWorldNs,
        ].sort((left, right) => left - right)
        commitAnalogSamples(applyAnalogBreaks(analogSamples, analogBreakWorldNsRef.current))
      }
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
      const nextEntries = insertDigitalEntrySorted(digitalEntries, entry)
      commitDigitalEntries(nextEntries)
    }
    const flushAddedRows = () => {
      pendingAddedFrame = null
      const rows = pendingAddedRows.splice(0)
      for (const detail of rows) {
        processAdded(detail)
      }
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
      pendingAddedRows.push({ kind: detail.kind, row })
      if (pendingAddedFrame !== null) {
        return
      }
      pendingAddedFrame = window.requestAnimationFrame(flushAddedRows)
    }

    const handleDeleted = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined
      if (
        detail?.reason !== 'clear' &&
        !detail?.messagesDeleted &&
        !detail?.analogDeleted
      ) {
        return
      }
      digitalQueryRangeRef.current = null
      analogLoadedRangesRef.current = []
      analogBreakWorldNsRef.current = []
      setLatestDatumWorldNs(null)
      commitDigitalEntries([])
      commitAnalogSamples([])
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
      if (pendingAddedFrame !== null) {
        window.cancelAnimationFrame(pendingAddedFrame)
        flushAddedRows()
      }
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
      unavailableRegions,
    })
  }, [
    digitalDataRevision,
    digitalEntries,
    analogDataRevision,
    analogSamples,
    selectedLogMessageKey,
    unavailableRegions,
    scrollLeftPx,
    theme,
    timelineRange.basis.originWallClockUs,
    viewportHeightPx,
    viewportWidthPx,
    zoomDenominator,
  ])
  const liveOverlayLayout = buildTimestripLaneLayout(viewportHeightPx)
  const captureMarkerX =
    captureMarkerWorldNs === null || viewportWidthPx <= 0
      ? null
      : captureMarkerWorldNs / zoomDenominator - scrollLeftPx
  const shouldShowCaptureMarker =
    captureMarkerX !== null &&
    Number.isFinite(captureMarkerX) &&
    captureMarkerX >= 0 &&
    captureMarkerX <= viewportWidthPx

  return (
    <InstrumentBase
      instrument={instrument}
      displayName={displayName}
      isEditMode={isEditMode}
      contentClassName={styles.content}
      headerAccessory={
        <span className={styles.headerControls}>
          <button
            type="button"
            className={styles.liveFollowButton}
            onClick={handleLiveFollowControlClick}
            aria-pressed={isLiveFollowing}
            disabled={!isLiveFollowAvailable}
          >
            {!isLiveFollowAvailable
              ? 'Follow unavailable'
              : isLiveFollowing
              ? 'Following live'
              : !isLiveFollowEnabled
                ? 'Follow live'
                : 'Follow live'}
          </button>
          <span className={styles.zoomReadout} aria-label={`Zoom ${zoomReadout} per pixel`}>
            ZOOM {zoomReadout}
          </span>
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
          onClick={selectClosestLogEntry}
          onMouseMove={updateAnalogHover}
          onMouseLeave={clearAnalogHover}
          onPointerMove={updateAnalogHover}
          onPointerLeave={clearAnalogHover}
        >
          <div
            ref={canvasLayerRef}
            className={styles.canvasLayer}
            data-testid="drpd-timestrip-canvas-layer"
            style={{
              width: `${viewportWidthPx}px`,
              height: `${viewportHeightPx}px`,
            }}
          />
          {shouldShowCaptureMarker ? (
            <div
              className={styles.captureMarkerOverlay}
              data-testid="drpd-timestrip-capture-marker"
              style={{
                top: `${liveOverlayLayout.digital.y}px`,
                height: `${liveOverlayLayout.analog.y + liveOverlayLayout.analog.height - liveOverlayLayout.digital.y}px`,
                transform: `translate3d(${captureMarkerX}px, 0, 0)`,
              }}
            />
          ) : null}
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
