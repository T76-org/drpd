import { describe, expect, it, vi } from 'vitest'
import type { TimestripVisibleTile } from './timestripLayout'
import { drawTimestripTile } from './timestripTileDrawing'

const buildContext = () =>
  ({
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    lineTo: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 6 })),
    moveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    translate: vi.fn(),
    fillStyle: '',
    font: '',
    lineWidth: 1,
    strokeStyle: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
  }) as unknown as CanvasRenderingContext2D

const tile: TimestripVisibleTile = {
  key: 'z1000:0:0',
  tileX: 0,
  tileY: 0,
  zoomLevel: 'z1000',
  zoomLevelDenominator: 1000,
  worldLeftUs: 0,
  worldWidthUs: 512_000,
  widthPx: 512,
  heightPx: 240,
  bleedPx: 160,
}

describe('timestripTileDrawing', () => {
  it('draws lane backgrounds without tile-local tick labels', () => {
    const context = buildContext()

    drawTimestripTile(context, tile, 2, 1_700_000_000_000_000)

    expect(context.scale).toHaveBeenCalledWith(2, 2)
    expect(context.fillRect).toHaveBeenCalled()
    expect(context.fillText).not.toHaveBeenCalled()
  })
})
