import { useCallback, useRef, useState, type MouseEvent, type PointerEvent, type RefObject } from 'react'
import {
  interpolateTimestripAnalogSample,
  type TimestripAnalogHoverValue,
  type TimestripAnalogSample,
} from './timestripAnalogModel'
import { buildTimestripLaneLayout } from './timestripLaneLayout'

export const useTimestripAnalogHover = ({
  viewportRef,
  viewportWidthPx,
  viewportHeightPx,
  scrollLeftPx,
  zoomDenominator,
  analogSamples,
}: {
  viewportRef: RefObject<HTMLDivElement | null>
  viewportWidthPx: number
  viewportHeightPx: number
  scrollLeftPx: number
  zoomDenominator: number
  analogSamples: TimestripAnalogSample[]
}) => {
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  const [analogHover, setAnalogHover] = useState<{
    x: number
    y: number
    value: TimestripAnalogHoverValue
  } | null>(null)

  const updateAnalogHoverAtViewportPoint = useCallback((x: number, y: number, logicalScrollLeftPx = scrollLeftPx) => {
    const viewport = viewportRef.current
    if (!viewport || viewportWidthPx <= 0 || viewportHeightPx <= 0) {
      pointerRef.current = null
      setAnalogHover(null)
      return
    }
    const viewportX = Math.max(0, Math.min(viewportWidthPx, x))
    const viewportY = Math.max(0, Math.min(viewportHeightPx, y))
    const layout = buildTimestripLaneLayout(viewportHeightPx)
    if (viewportY < layout.analog.y || viewportY > layout.analog.y + layout.analog.height) {
      pointerRef.current = null
      setAnalogHover(null)
      return
    }
    pointerRef.current = { x: viewportX, y: viewportY }
    const worldNs = (logicalScrollLeftPx + viewportX) * zoomDenominator
    const value = interpolateTimestripAnalogSample(analogSamples, worldNs)
    setAnalogHover(value ? { x: viewportX, y: viewportY, value } : null)
  }, [analogSamples, scrollLeftPx, viewportHeightPx, viewportRef, viewportWidthPx, zoomDenominator])

  const updateAnalogHover = useCallback((event: PointerEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current
    if (!viewport) {
      setAnalogHover(null)
      return
    }
    const rect = viewport.getBoundingClientRect()
    updateAnalogHoverAtViewportPoint(event.clientX - rect.left, event.clientY - rect.top)
  }, [updateAnalogHoverAtViewportPoint, viewportRef])

  const clearAnalogHover = useCallback(() => {
    pointerRef.current = null
    setAnalogHover(null)
  }, [])

  return {
    analogHover,
    analogHoverPointerRef: pointerRef,
    updateAnalogHoverAtViewportPoint,
    updateAnalogHover,
    clearAnalogHover,
  }
}
