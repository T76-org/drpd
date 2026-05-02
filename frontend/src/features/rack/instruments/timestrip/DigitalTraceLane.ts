import type { TimestripLaneLayout } from './timestripLaneLayout'

/**
 * Draw an empty digital trace lane background.
 *
 * @param context - Canvas 2D context.
 * @param layout - Lane layout.
 * @param widthPx - Tile width in CSS pixels.
 */
export const drawDigitalTraceLane = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layout: TimestripLaneLayout,
  widthPx: number,
): void => {
  context.fillStyle = '#121821'
  context.fillRect(0, layout.digital.y, widthPx, layout.digital.height)
}
