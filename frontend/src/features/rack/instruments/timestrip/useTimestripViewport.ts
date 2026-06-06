import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { select, zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior } from 'd3'
import {
  calculateTimestripWidthPx,
} from './timestripLayout'
import { calculatePointerStableZoom } from './timestripCoordinates'
import {
  calculateTimestripDomTimelineWidthPx,
  calculateTimestripScrollScale,
  clampTimestripLogicalScrollLeft,
  clampTimestripZoomDenominator,
  domScrollLeftToLogicalTimestripScrollLeft,
  formatTimestripZoomDenominator,
  getNextTimestripZoomDenominator,
  logicalScrollLeftToDomTimestripScrollLeft,
  MAX_TIMESTRIP_ZOOM_DENOMINATOR,
  MIN_TIMESTRIP_ZOOM_DENOMINATOR,
  readStoredTimestripZoomDenominator,
  timestripZoomDenominatorToD3Scale,
  writeStoredTimestripZoomDenominator,
} from './timestripZoom'

const PROGRAMMATIC_SCROLL_GUARD_MS = 250
const WHEEL_SCROLLBAR_IDLE_SYNC_MS = 120

export type TimestripNavigationReason =
  | 'follow'
  | 'selection'
  | 'user-scroll'
  | 'user-wheel'
  | 'user-zoom'

export interface TimestripViewportOptions {
  onUserNavigation?: (reason: TimestripNavigationReason) => void
  onScrollLeftChanged?: (logicalScrollLeftPx: number) => void
  tailPaddingViewportFraction?: number
  minTailPaddingZoomDenominator?: number
}

export const useTimestripViewport = (
  viewportRef: RefObject<HTMLDivElement | null>,
  timelineDurationNs: bigint,
  options: TimestripViewportOptions = {},
) => {
  const onUserNavigation = options.onUserNavigation
  const onScrollLeftChanged = options.onScrollLeftChanged
  const tailPaddingViewportFraction = options.tailPaddingViewportFraction ?? 0
  const minTailPaddingZoomDenominator = options.minTailPaddingZoomDenominator ?? 0
  const resizeFrameRef = useRef<number | null>(null)
  const scrollPublishFrameRef = useRef<number | null>(null)
  const wheelScrollbarSyncTimeoutRef = useRef<number | null>(null)
  const pendingViewportSizeRef = useRef<{ width: number; height: number } | null>(null)
  const pendingScrollLeftPxRef = useRef<number | null>(null)
  const logicalScrollLeftRef = useRef(0)
  const d3ZoomBehaviorRef = useRef<ZoomBehavior<HTMLDivElement, unknown> | null>(null)
  const isSyncingD3ZoomRef = useRef(false)
  const zoomDenominatorRef = useRef<number | null>(null)
  const hasLogicalScrollLeftRef = useRef(false)
  const scrollScaleRef = useRef(1)
  const programmaticScrollReasonRef = useRef<TimestripNavigationReason | null>(null)
  const programmaticScrollTargetPxRef = useRef<number | null>(null)
  const recentProgrammaticScrollTargetsRef = useRef<Array<{
    domScrollLeftPx: number
    logicalScrollLeftPx: number
  }>>([])
  const programmaticScrollClearTimeoutRef = useRef<number | null>(null)
  const [viewportWidthPx, setViewportWidthPx] = useState(0)
  const [viewportHeightPx, setViewportHeightPx] = useState(0)
  const [scrollLeftPx, setScrollLeftPx] = useState(0)
  if (zoomDenominatorRef.current === null) {
    zoomDenominatorRef.current = readStoredTimestripZoomDenominator()
  }
  const [zoomDenominator, setZoomDenominator] = useState(() => zoomDenominatorRef.current ?? readStoredTimestripZoomDenominator())
  const zoomReadout = formatTimestripZoomDenominator(zoomDenominator)
  const timelineContentWidthPx = calculateTimestripWidthPx(
    timelineDurationNs,
    zoomDenominator,
    viewportWidthPx,
  )
  const timelineWidthPx = timelineContentWidthPx + (
    zoomDenominator >= minTailPaddingZoomDenominator
      ? Math.max(0, viewportWidthPx * tailPaddingViewportFraction)
      : 0
  )
  const domTimelineWidthPx = calculateTimestripDomTimelineWidthPx(timelineWidthPx, viewportWidthPx)
  const scrollScale = calculateTimestripScrollScale(timelineWidthPx, domTimelineWidthPx, viewportWidthPx)
  scrollScaleRef.current = scrollScale
  const domScrollLeftToLogical = useCallback((domScrollLeftPx: number): number =>
    domScrollLeftToLogicalTimestripScrollLeft(domScrollLeftPx, scrollScaleRef.current),
  [])
  const logicalScrollLeftToDom = useCallback((logicalScrollLeftPx: number): number =>
    logicalScrollLeftToDomTimestripScrollLeft(logicalScrollLeftPx, scrollScaleRef.current),
  [])
  const commitZoomDenominator = useCallback((value: number | string) => {
    const nextZoomDenominator = clampTimestripZoomDenominator(value)
    zoomDenominatorRef.current = nextZoomDenominator
    writeStoredTimestripZoomDenominator(nextZoomDenominator)
    setZoomDenominator(nextZoomDenominator)
  }, [])
  const publishScrollLeft = useCallback((logicalScrollLeftPx: number, immediate = false) => {
    const nextScrollLeftPx = Math.max(0, logicalScrollLeftPx)
    logicalScrollLeftRef.current = nextScrollLeftPx
    hasLogicalScrollLeftRef.current = true
    if (immediate) {
      pendingScrollLeftPxRef.current = null
      if (scrollPublishFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollPublishFrameRef.current)
        scrollPublishFrameRef.current = null
      }
      setScrollLeftPx(nextScrollLeftPx)
      return
    }
    pendingScrollLeftPxRef.current = nextScrollLeftPx
    if (scrollPublishFrameRef.current !== null) {
      return
    }
    scrollPublishFrameRef.current = window.requestAnimationFrame(() => {
      scrollPublishFrameRef.current = null
      const pendingScrollLeftPx = pendingScrollLeftPxRef.current
      pendingScrollLeftPxRef.current = null
      if (pendingScrollLeftPx !== null) {
        setScrollLeftPx(pendingScrollLeftPx)
      }
    })
  }, [])
  const scheduleProgrammaticScrollGuardClear = useCallback(() => {
    if (programmaticScrollClearTimeoutRef.current !== null) {
      window.clearTimeout(programmaticScrollClearTimeoutRef.current)
    }
    programmaticScrollClearTimeoutRef.current = window.setTimeout(() => {
      programmaticScrollClearTimeoutRef.current = null
      programmaticScrollReasonRef.current = null
      programmaticScrollTargetPxRef.current = null
      recentProgrammaticScrollTargetsRef.current = []
    }, PROGRAMMATIC_SCROLL_GUARD_MS)
  }, [])
  const getExpectedProgrammaticScroll = useCallback((domScrollLeftPx: number, logicalScrollLeftPx: number): number | null => {
    if (programmaticScrollReasonRef.current === null) {
      return null
    }
    const expectedTarget = recentProgrammaticScrollTargetsRef.current.find((target) => (
      Math.abs(logicalScrollLeftPx - target.logicalScrollLeftPx) <= 1 ||
      Math.abs(domScrollLeftPx - target.domScrollLeftPx) <= 1
    ))
    if (expectedTarget) {
      return expectedTarget.logicalScrollLeftPx
    }
    return programmaticScrollReasonRef.current === 'user-zoom' || programmaticScrollReasonRef.current === 'user-wheel'
      ? programmaticScrollTargetPxRef.current
      : null
  }, [])
  const markProgrammaticScroll = useCallback((
    logicalScrollLeftPx: number,
    domScrollLeftPx: number,
    reason: TimestripNavigationReason,
  ) => {
    programmaticScrollReasonRef.current = reason
    programmaticScrollTargetPxRef.current = logicalScrollLeftPx
    recentProgrammaticScrollTargetsRef.current = [
      ...recentProgrammaticScrollTargetsRef.current,
      { domScrollLeftPx, logicalScrollLeftPx },
    ].slice(-8)
    scheduleProgrammaticScrollGuardClear()
  }, [scheduleProgrammaticScrollGuardClear])
  const scrollToLogicalLeft = useCallback((
    logicalScrollLeftPx: number,
    reason: TimestripNavigationReason,
  ) => {
    const viewport = viewportRef.current
    const nextScrollLeftPx = Math.max(0, logicalScrollLeftPx)
    if (!viewport) {
      logicalScrollLeftRef.current = nextScrollLeftPx
      hasLogicalScrollLeftRef.current = true
      setScrollLeftPx(nextScrollLeftPx)
      return
    }
    const nextDomScrollLeftPx = logicalScrollLeftToDom(nextScrollLeftPx)
    markProgrammaticScroll(nextScrollLeftPx, nextDomScrollLeftPx, reason)
    viewport.scrollLeft = nextDomScrollLeftPx
    onScrollLeftChanged?.(nextScrollLeftPx)
    publishScrollLeft(nextScrollLeftPx, true)
  }, [logicalScrollLeftToDom, markProgrammaticScroll, onScrollLeftChanged, publishScrollLeft, viewportRef])
  const syncD3ZoomTransform = useCallback((viewport: HTMLDivElement, nextZoomDenominator: number) => {
    const behavior = d3ZoomBehaviorRef.current
    if (!behavior) {
      return
    }
    isSyncingD3ZoomRef.current = true
    try {
      select(viewport).call(
        behavior.transform,
        zoomIdentity.scale(timestripZoomDenominatorToD3Scale(nextZoomDenominator)),
      )
    } finally {
      isSyncingD3ZoomRef.current = false
    }
  }, [])

  useEffect(() => () => {
    if (programmaticScrollClearTimeoutRef.current !== null) {
      window.clearTimeout(programmaticScrollClearTimeoutRef.current)
      programmaticScrollClearTimeoutRef.current = null
    }
    if (scrollPublishFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollPublishFrameRef.current)
      scrollPublishFrameRef.current = null
    }
    if (wheelScrollbarSyncTimeoutRef.current !== null) {
      window.clearTimeout(wheelScrollbarSyncTimeoutRef.current)
      wheelScrollbarSyncTimeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return undefined
    }

    const handleViewportScroll = () => {
      const domScrollLeftPx = viewport.scrollLeft
      const convertedScrollLeftPx = domScrollLeftToLogical(domScrollLeftPx)
      const expectedProgrammaticScrollLeftPx = getExpectedProgrammaticScroll(domScrollLeftPx, convertedScrollLeftPx)
      const nextScrollLeftPx = expectedProgrammaticScrollLeftPx ?? convertedScrollLeftPx
      if (expectedProgrammaticScrollLeftPx === null) {
        onUserNavigation?.('user-scroll')
      }
      onScrollLeftChanged?.(nextScrollLeftPx)
      publishScrollLeft(nextScrollLeftPx)
    }
    viewport.addEventListener('scroll', handleViewportScroll)

    return () => {
      viewport.removeEventListener('scroll', handleViewportScroll)
    }
  }, [domScrollLeftToLogical, getExpectedProgrammaticScroll, onScrollLeftChanged, onUserNavigation, publishScrollLeft, viewportRef])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return undefined
    }

    const handleD3Zoom = (event: D3ZoomEvent<HTMLDivElement, unknown>) => {
      if (isSyncingD3ZoomRef.current) {
        return
      }
      const sourceEvent = event.sourceEvent
      if (!(sourceEvent instanceof WheelEvent) || !sourceEvent.ctrlKey) {
        return
      }
      onUserNavigation?.('user-zoom')
      const currentZoomDenominator = zoomDenominatorRef.current ?? zoomDenominator
      const nextZoomDenominator = getNextTimestripZoomDenominator(
        currentZoomDenominator,
        sourceEvent.deltaY < 0 ? 'in' : 'out',
      )
      const viewportRect = viewport.getBoundingClientRect()
      const effectiveViewportWidthPx = viewportWidthPx || Math.max(0, Math.floor(viewport.clientWidth))
      const pointerX = Math.max(0, Math.min(effectiveViewportWidthPx, sourceEvent.clientX - viewportRect.left))
      const domLogicalScrollLeftPx = domScrollLeftToLogical(viewport.scrollLeft)
      const logicalScrollLeftPx = hasLogicalScrollLeftRef.current
        ? logicalScrollLeftRef.current
        : domLogicalScrollLeftPx
      const nextUnclampedScrollLeft = calculatePointerStableZoom({
        currentScrollLeftPx: logicalScrollLeftPx,
        pointerX,
        currentZoomDenominator,
        nextZoomDenominator,
      })
      const nextTimelineWidthPx = calculateTimestripWidthPx(
        timelineDurationNs,
        nextZoomDenominator,
        effectiveViewportWidthPx,
      ) + (
        nextZoomDenominator >= minTailPaddingZoomDenominator
          ? Math.max(0, effectiveViewportWidthPx * tailPaddingViewportFraction)
          : 0
      )
      const nextDomTimelineWidthPx = calculateTimestripDomTimelineWidthPx(
        nextTimelineWidthPx,
        effectiveViewportWidthPx,
      )
      const nextScrollScale = calculateTimestripScrollScale(
        nextTimelineWidthPx,
        nextDomTimelineWidthPx,
        effectiveViewportWidthPx,
      )
      const nextScrollLeft = clampTimestripLogicalScrollLeft(
        nextUnclampedScrollLeft,
        nextTimelineWidthPx,
        effectiveViewportWidthPx,
      )
      const nextDomScrollLeft = logicalScrollLeftToDomTimestripScrollLeft(nextScrollLeft, nextScrollScale)
      zoomDenominatorRef.current = nextZoomDenominator
      scrollScaleRef.current = nextScrollScale
      markProgrammaticScroll(nextScrollLeft, nextDomScrollLeft, 'user-zoom')
      commitZoomDenominator(nextZoomDenominator)
      syncD3ZoomTransform(viewport, nextZoomDenominator)
      onScrollLeftChanged?.(nextScrollLeft)
      publishScrollLeft(nextScrollLeft, true)
    }

    const behavior = zoom<HTMLDivElement, unknown>()
      .filter((event: Event) => event instanceof WheelEvent && event.ctrlKey)
      .scaleExtent([
        timestripZoomDenominatorToD3Scale(MAX_TIMESTRIP_ZOOM_DENOMINATOR),
        timestripZoomDenominatorToD3Scale(MIN_TIMESTRIP_ZOOM_DENOMINATOR),
      ])
      .wheelDelta((event: WheelEvent) => event.deltaY < 0 ? 1 : -1)
      .on('zoom', handleD3Zoom)

    d3ZoomBehaviorRef.current = behavior
    const selection = select(viewport)
    selection.call(behavior)
    selection.on('dblclick.zoom', null)
    syncD3ZoomTransform(viewport, zoomDenominator)

    return () => {
      selection.on('.zoom', null)
      if (d3ZoomBehaviorRef.current === behavior) {
        d3ZoomBehaviorRef.current = null
      }
    }
  }, [
    commitZoomDenominator,
    domScrollLeftToLogical,
    markProgrammaticScroll,
    minTailPaddingZoomDenominator,
    onUserNavigation,
    onScrollLeftChanged,
    publishScrollLeft,
    syncD3ZoomTransform,
    tailPaddingViewportFraction,
    timelineDurationNs,
    viewportRef,
    viewportWidthPx,
    zoomDenominator,
  ])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }
    syncD3ZoomTransform(viewport, zoomDenominator)
  }, [syncD3ZoomTransform, viewportRef, zoomDenominator])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return undefined
    }

    const handleViewportWheel = (event: WheelEvent) => {
      if (event.ctrlKey) {
        return
      }
      const scrollDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      if (scrollDelta === 0 || viewport.scrollWidth <= viewport.clientWidth) {
        return
      }
      event.preventDefault()
      onUserNavigation?.('user-wheel')
      const nextScrollLeft = clampTimestripLogicalScrollLeft(
        logicalScrollLeftRef.current + scrollDelta,
        timelineWidthPx,
        viewportWidthPx,
      )
      const nextDomScrollLeft = logicalScrollLeftToDom(nextScrollLeft)
      markProgrammaticScroll(nextScrollLeft, nextDomScrollLeft, 'user-wheel')
      onScrollLeftChanged?.(nextScrollLeft)
      publishScrollLeft(nextScrollLeft)
      if (wheelScrollbarSyncTimeoutRef.current !== null) {
        window.clearTimeout(wheelScrollbarSyncTimeoutRef.current)
      }
      wheelScrollbarSyncTimeoutRef.current = window.setTimeout(() => {
        wheelScrollbarSyncTimeoutRef.current = null
        if (Math.abs(viewport.scrollLeft - nextDomScrollLeft) < 1) {
          return
        }
        markProgrammaticScroll(nextScrollLeft, nextDomScrollLeft, 'user-wheel')
        viewport.scrollLeft = nextDomScrollLeft
      }, WHEEL_SCROLLBAR_IDLE_SYNC_MS)
    }

    viewport.addEventListener('wheel', handleViewportWheel, { passive: false })
    return () => {
      viewport.removeEventListener('wheel', handleViewportWheel)
    }
  }, [
    domScrollLeftToLogical,
    logicalScrollLeftToDom,
    markProgrammaticScroll,
    onUserNavigation,
    onScrollLeftChanged,
    publishScrollLeft,
    timelineWidthPx,
    viewportRef,
    viewportWidthPx,
    zoomDenominator,
  ])

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
  }, [viewportRef])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || viewportWidthPx <= 0) {
      return
    }
    const nextLogicalScrollLeft = clampTimestripLogicalScrollLeft(scrollLeftPx, timelineWidthPx, viewportWidthPx)
    const nextDomScrollLeft = logicalScrollLeftToDom(nextLogicalScrollLeft)
    if (nextLogicalScrollLeft !== scrollLeftPx) {
      publishScrollLeft(nextLogicalScrollLeft, true)
    }
    if (programmaticScrollReasonRef.current === 'user-zoom' || programmaticScrollReasonRef.current === 'user-wheel') {
      return
    }
    if (Math.abs(viewport.scrollLeft - nextDomScrollLeft) > 1) {
      markProgrammaticScroll(nextLogicalScrollLeft, nextDomScrollLeft, 'follow')
      viewport.scrollLeft = nextDomScrollLeft
    }
  }, [logicalScrollLeftToDom, markProgrammaticScroll, publishScrollLeft, scrollLeftPx, timelineWidthPx, viewportRef, viewportWidthPx])

  return {
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
    scrollToLogicalLeft,
  }
}
