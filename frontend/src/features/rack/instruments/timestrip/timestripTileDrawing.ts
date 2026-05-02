import type { TimestripVisibleTile } from './timestripLayout'
import { drawAnalogTraceLane } from './AnalogTraceLane'
import { drawDigitalTraceLane } from './DigitalTraceLane'
import { drawTimeAxisLane } from './TimeAxisLane'
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
  worldStartWallClockUs: number,
): void => {
  const width = tile.widthPx
  const height = tile.heightPx
  context.save()
  context.scale(dpr, dpr)
  context.clearRect(0, 0, width, height)

  const layout = buildTimestripLaneLayout(height)
  drawTimeAxisLane(context, tile, layout, worldStartWallClockUs)
  drawDigitalTraceLane(context, layout, width)
  drawAnalogTraceLane(context, layout, width)

  context.fillStyle = 'rgba(255, 255, 255, 0.18)'
  context.fillRect(0, layout.timeAxis.height, width, layout.separatorHeightPx)
  context.fillRect(0, layout.analog.y - layout.separatorHeightPx, width, layout.separatorHeightPx)

  context.strokeStyle = 'rgba(255, 255, 255, 0.16)'
  context.lineWidth = 1
  context.strokeRect(0.5, 0.5, width - 1, height - 1)

  context.restore()
}
