import type { TimestripLaneLayout } from './timestripLaneLayout'

/**
 * Draw an empty analog trace lane background.
 *
 * @param context - Canvas 2D context.
 * @param layout - Lane layout.
 * @param widthPx - Tile width in CSS pixels.
 */
export const drawAnalogTraceLane = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layout: TimestripLaneLayout,
  widthPx: number,
): void => {
  context.fillStyle = '#10151d'
  context.fillRect(0, layout.analog.y, widthPx, layout.analog.height)
}
