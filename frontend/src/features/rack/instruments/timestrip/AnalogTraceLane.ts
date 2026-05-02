import type { TimestripLaneLayout } from './timestripLaneLayout'
import type { TimestripThemePalette } from './timestripTheme'

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
  theme: TimestripThemePalette,
  bleedPx = 0,
): void => {
  context.fillStyle = theme.analogBackground
  context.fillRect(-bleedPx, layout.analog.y, widthPx + bleedPx * 2, layout.analog.height)
}
