import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import {
  calculateTimestripWidthPx,
  clampTimestripZoomDenominator,
  formatTimestripZoomDenominator,
} from './timestripLayout'
import { calculatePointerStableZoom } from './timestripCoordinates'

const DEFAULT_ZOOM_DENOMINATOR = 100_000_000
const ZOOM_DENOMINATOR_STORAGE_KEY = 'drpd:timestrip:zoom-denominator'
const CTRL_WHEEL_ZOOM_STEP = 2
const MAX_DOM_TIMELINE_WIDTH_PX = 16_000_000
const PROGRAMMATIC_SCROLL_GUARD_MS = 250

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

const calculateDomTimelineWidthPx = (timelineWidthPx: number, viewportWidthPx: number): number =>
  Math.max(viewportWidthPx, Math.min(timelineWidthPx, MAX_DOM_TIMELINE_WIDTH_PX))

const calculateScrollScale = (
  timelineWidthPx: number,
  domTimelineWidthPx: number,
  viewportWidthPx: number,
): number => {
  const logicalScrollableWidth = Math.max(0, timelineWidthPx - viewportWidthPx)
  const domScrollableWidth = Math.max(0, domTimelineWidthPx - viewportWidthPx)
  if (logicalScrollableWidth <= 0 || domScrollableWidth <= 0) {
    return 1
  }
  return logicalScrollableWidth / domScrollableWidth
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
  const pendingViewportSizeRef = useRef<{ width: number; height: number } | null>(null)
  const pendingScrollLeftPxRef = useRef<number | null>(null)
  const programmaticScrollReasonRef = useRef<TimestripNavigationReason | null>(null)
  const programmaticScrollTargetPxRef = useRef<number | null>(null)
  const recentProgrammaticScrollTargetsRef = useRef<number[]>([])
  const programmaticScrollClearTimeoutRef = useRef<number | null>(null)
  const [viewportWidthPx, setViewportWidthPx] = useState(0)
  const [viewportHeightPx, setViewportHeightPx] = useState(0)
  const [scrollLeftPx, setScrollLeftPx] = useState(0)
  const [zoomDenominator, setZoomDenominator] = useState(readStoredZoomDenominator)
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
  const domTimelineWidthPx = calculateDomTimelineWidthPx(timelineWidthPx, viewportWidthPx)
  const scrollScale = calculateScrollScale(timelineWidthPx, domTimelineWidthPx, viewportWidthPx)
  const domScrollLeftToLogical = useCallback((domScrollLeftPx: number): number =>
    Math.max(0, domScrollLeftPx) * scrollScale,
  [scrollScale])
  const logicalScrollLeftToDom = useCallback((logicalScrollLeftPx: number): number =>
    Math.max(0, logicalScrollLeftPx) / scrollScale,
  [scrollScale])
  const commitZoomDenominator = useCallback((value: number | string) => {
    const nextZoomDenominator = clampTimestripZoomDenominator(value)
    writeStoredZoomDenominator(nextZoomDenominator)
    setZoomDenominator(nextZoomDenominator)
  }, [])
  const publishScrollLeft = useCallback((logicalScrollLeftPx: number, immediate = false) => {
    const nextScrollLeftPx = Math.max(0, logicalScrollLeftPx)
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
  const isExpectedProgrammaticScroll = useCallback((logicalScrollLeftPx: number): boolean => (
    programmaticScrollReasonRef.current !== null &&
    recentProgrammaticScrollTargetsRef.current.some((targetPx) => Math.abs(logicalScrollLeftPx - targetPx) <= 1)
  ), [])
  const scrollToLogicalLeft = useCallback((
    logicalScrollLeftPx: number,
    reason: TimestripNavigationReason,
  ) => {
    const viewport = viewportRef.current
    const nextScrollLeftPx = Math.max(0, logicalScrollLeftPx)
    if (!viewport) {
      setScrollLeftPx(nextScrollLeftPx)
      return
    }
    programmaticScrollReasonRef.current = reason
    programmaticScrollTargetPxRef.current = nextScrollLeftPx
    recentProgrammaticScrollTargetsRef.current = [
      ...recentProgrammaticScrollTargetsRef.current,
      nextScrollLeftPx,
    ].slice(-8)
    scheduleProgrammaticScrollGuardClear()
    viewport.scrollLeft = logicalScrollLeftToDom(nextScrollLeftPx)
    onScrollLeftChanged?.(nextScrollLeftPx)
    publishScrollLeft(nextScrollLeftPx, true)
  }, [logicalScrollLeftToDom, onScrollLeftChanged, publishScrollLeft, scheduleProgrammaticScrollGuardClear, viewportRef])

  useEffect(() => () => {
    if (programmaticScrollClearTimeoutRef.current !== null) {
      window.clearTimeout(programmaticScrollClearTimeoutRef.current)
      programmaticScrollClearTimeoutRef.current = null
    }
    if (scrollPublishFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollPublishFrameRef.current)
      scrollPublishFrameRef.current = null
    }
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return undefined
    }

    const handleViewportScroll = () => {
      const nextScrollLeftPx = domScrollLeftToLogical(viewport.scrollLeft)
      if (!isExpectedProgrammaticScroll(nextScrollLeftPx)) {
        onUserNavigation?.('user-scroll')
      }
      onScrollLeftChanged?.(nextScrollLeftPx)
      publishScrollLeft(nextScrollLeftPx)
    }
    viewport.addEventListener('scroll', handleViewportScroll)

    return () => {
      viewport.removeEventListener('scroll', handleViewportScroll)
    }
  }, [domScrollLeftToLogical, isExpectedProgrammaticScroll, onScrollLeftChanged, onUserNavigation, publishScrollLeft, viewportRef])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return undefined
    }

    const handleViewportWheel = (event: WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault()
        onUserNavigation?.('user-zoom')
        const direction = event.deltaY < 0 ? -1 : 1
        const scale = direction < 0 ? 1 / CTRL_WHEEL_ZOOM_STEP : CTRL_WHEEL_ZOOM_STEP
        const nextZoomDenominator = clampTimestripZoomDenominator(Math.round(zoomDenominator * scale))
        const viewportRect = viewport.getBoundingClientRect()
        const pointerX = Math.max(0, event.clientX - viewportRect.left)
        const logicalScrollLeftPx = domScrollLeftToLogical(viewport.scrollLeft)
        const nextScrollLeft = calculatePointerStableZoom({
          currentScrollLeftPx: logicalScrollLeftPx,
          pointerX,
          currentZoomDenominator: zoomDenominator,
          nextZoomDenominator,
        })
        const nextTimelineWidthPx = calculateTimestripWidthPx(
          timelineDurationNs,
          nextZoomDenominator,
          viewportWidthPx,
        ) + (
          nextZoomDenominator >= minTailPaddingZoomDenominator
            ? Math.max(0, viewportWidthPx * tailPaddingViewportFraction)
            : 0
        )
        const nextDomTimelineWidthPx = calculateDomTimelineWidthPx(nextTimelineWidthPx, viewportWidthPx)
        const nextScrollScale = calculateScrollScale(nextTimelineWidthPx, nextDomTimelineWidthPx, viewportWidthPx)
        commitZoomDenominator(nextZoomDenominator)
        viewport.scrollLeft = nextScrollLeft / nextScrollScale
        onScrollLeftChanged?.(nextScrollLeft)
        publishScrollLeft(nextScrollLeft, true)
        return
      }

      const scrollDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      if (scrollDelta === 0 || viewport.scrollWidth <= viewport.clientWidth) {
        return
      }
      event.preventDefault()
      onUserNavigation?.('user-wheel')
      const nextScrollLeft = Math.max(0, domScrollLeftToLogical(viewport.scrollLeft) + scrollDelta)
      viewport.scrollLeft = logicalScrollLeftToDom(nextScrollLeft)
      const committedScrollLeft = domScrollLeftToLogical(viewport.scrollLeft)
      onScrollLeftChanged?.(committedScrollLeft)
      publishScrollLeft(committedScrollLeft, true)
    }

    viewport.addEventListener('wheel', handleViewportWheel, { passive: false })
    return () => {
      viewport.removeEventListener('wheel', handleViewportWheel)
    }
  }, [
    commitZoomDenominator,
    domScrollLeftToLogical,
    logicalScrollLeftToDom,
    minTailPaddingZoomDenominator,
    onUserNavigation,
    onScrollLeftChanged,
    publishScrollLeft,
    tailPaddingViewportFraction,
    timelineDurationNs,
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
    const maxLogicalScrollLeft = Math.max(0, timelineWidthPx - viewportWidthPx)
    const nextLogicalScrollLeft = Math.max(0, Math.min(maxLogicalScrollLeft, scrollLeftPx))
    const nextDomScrollLeft = logicalScrollLeftToDom(nextLogicalScrollLeft)
    if (Math.abs(viewport.scrollLeft - nextDomScrollLeft) > 1) {
      programmaticScrollReasonRef.current = 'follow'
      programmaticScrollTargetPxRef.current = nextLogicalScrollLeft
      scheduleProgrammaticScrollGuardClear()
      viewport.scrollLeft = nextDomScrollLeft
    }
    if (nextLogicalScrollLeft !== scrollLeftPx) {
      publishScrollLeft(nextLogicalScrollLeft, true)
    }
  }, [logicalScrollLeftToDom, publishScrollLeft, scheduleProgrammaticScrollGuardClear, scrollLeftPx, timelineWidthPx, viewportRef, viewportWidthPx])

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
