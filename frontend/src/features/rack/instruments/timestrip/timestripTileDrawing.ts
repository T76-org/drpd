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
  const bleed = tile.bleedPx
  const drawWidth = width + bleed * 2
  const height = tile.heightPx
  context.save()
  context.scale(dpr, dpr)
  context.clearRect(0, 0, drawWidth, height)
  context.translate(bleed, 0)

  const layout = buildTimestripLaneLayout(height)
  drawTimeAxisLane(context, tile, layout, worldStartWallClockUs)
  drawDigitalTraceLane(context, layout, width, bleed)
  drawAnalogTraceLane(context, layout, width, bleed)

  context.restore()
}
