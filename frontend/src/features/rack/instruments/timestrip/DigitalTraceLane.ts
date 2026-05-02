import type { TimestripLaneLayout } from './timestripLaneLayout'
import type { TimestripThemePalette } from './timestripTheme'

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
  theme: TimestripThemePalette,
  bleedPx = 0,
): void => {
  context.fillStyle = theme.digitalBackground
  context.fillRect(-bleedPx, layout.digital.y, widthPx + bleedPx * 2, layout.digital.height)
}
