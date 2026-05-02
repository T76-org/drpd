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
  bleedPx = 0,
): void => {
  context.fillStyle = '#10151d'
  context.fillRect(-bleedPx, layout.analog.y, widthPx + bleedPx * 2, layout.analog.height)
}
