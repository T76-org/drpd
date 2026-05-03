import type { TimestripVisibleTile } from './timestripLayout'
import { drawAnalogTraceLane } from './AnalogTraceLane'
import { drawDigitalTraceLane } from './DigitalTraceLane'
import { drawTimeAxisLane } from './TimeAxisLane'
import { buildTimestripLaneLayout } from './timestripLaneLayout'
import type { TimestripThemePalette } from './timestripTheme'
import type { TimestripDigitalEntry } from './timestripDigitalModel'
import type { TimestripAnalogSample } from './timestripAnalogModel'

/**
 * Draw a deterministic timestrip tile.
 *
 * @param context - Canvas 2D rendering context.
 * @param tile - Tile descriptor.
 * @param dpr - Device pixel ratio.
 * @param theme - Current theme palette.
 */
export const drawTimestripTile = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  tile: TimestripVisibleTile,
  dpr: number,
  theme: TimestripThemePalette,
  digitalEntries: TimestripDigitalEntry[] = [],
  analogSamples: TimestripAnalogSample[] = [],
  worldStartWallClockUs = 0,
): void => {
  const width = tile.widthPx
  const height = tile.heightPx
  context.save()
  context.scale(dpr, dpr)
  context.clearRect(0, 0, width, height)

  const layout = buildTimestripLaneLayout(height)
  drawTimeAxisLane(context, tile, layout, worldStartWallClockUs, theme)
  drawDigitalTraceLane(context, layout, width, theme, {
    worldLeftUs: tile.worldLeftUs,
    zoomDenominator: tile.zoomLevelDenominator,
    entries: digitalEntries,
  })
  drawAnalogTraceLane(context, layout, width, theme, {
    worldLeftUs: tile.worldLeftUs,
    zoomDenominator: tile.zoomLevelDenominator,
    samples: analogSamples,
  })

  context.restore()
}
