import type { TimestripVisibleTile } from './timestripLayout'
import { drawAnalogTraceLane } from './AnalogTraceLane'
import { drawDigitalTraceLane } from './DigitalTraceLane'
import { buildTimestripLaneLayout } from './timestripLaneLayout'

/**
 * Draw a deterministic timestrip tile.
 *
 * @param context - Canvas 2D rendering context.
 * @param tile - Tile descriptor.
 * @param dpr - Device pixel ratio.
 * @param worldStartWallClockUs - Wall-clock microseconds at world X = 0.
 */
export const drawTimestripTile = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  tile: TimestripVisibleTile,
  dpr: number,
  _worldStartWallClockUs: number,
): void => {
  const width = tile.widthPx
  const bleed = tile.bleedPx
  const drawWidth = width + bleed * 2
  const height = tile.heightPx
  context.save()
  context.scale(dpr, dpr)
  context.clearRect(0, 0, drawWidth, height)
  context.translate(bleed, 0)

  const layout = buildTimestripLaneLayout(height)
  context.fillStyle = '#161d26'
  context.fillRect(0, layout.timeAxis.y, width, layout.timeAxis.height)
  drawDigitalTraceLane(context, layout, width)
  drawAnalogTraceLane(context, layout, width)

  context.restore()
}
