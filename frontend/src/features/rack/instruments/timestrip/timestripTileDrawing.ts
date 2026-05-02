import type { TimestripVisibleTile } from './timestripLayout'

/**
 * Draw a deterministic repeating placeholder background for a tile.
 *
 * @param context - Canvas 2D rendering context.
 * @param tile - Tile descriptor.
 * @param dpr - Device pixel ratio.
 */
export const drawTimestripPlaceholderTile = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  tile: TimestripVisibleTile,
  dpr: number,
): void => {
  const width = tile.widthPx
  const height = tile.heightPx
  context.save()
  context.scale(dpr, dpr)
  context.clearRect(0, 0, width, height)

  const isEven = tile.tileX % 2 === 0
  context.fillStyle = isEven ? '#171d24' : '#1d242c'
  context.fillRect(0, 0, width, height)

  context.fillStyle = isEven ? 'rgba(92, 170, 255, 0.12)' : 'rgba(255, 192, 92, 0.12)'
  for (let x = 0; x < width; x += 32) {
    context.fillRect(x, 0, 12, height)
  }

  context.strokeStyle = 'rgba(255, 255, 255, 0.28)'
  context.lineWidth = 1
  context.strokeRect(0.5, 0.5, width - 1, height - 1)

  context.fillStyle = 'rgba(255, 255, 255, 0.82)'
  context.font = '12px sans-serif'
  context.textBaseline = 'top'
  context.fillText(tile.key, 12, 12)
  context.fillText(`${tile.worldLeftUs}us`, 12, 30)

  context.restore()
}
