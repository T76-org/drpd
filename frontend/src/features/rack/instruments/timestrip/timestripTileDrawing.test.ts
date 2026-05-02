import { describe, expect, it, vi } from 'vitest'
import type { TimestripVisibleTile } from './timestripLayout'
import { drawTimestripTile } from './timestripTileDrawing'
import { DEFAULT_TIMESTRIP_THEME } from './timestripTheme'

const buildContext = () =>
  ({
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    lineTo: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 6 })),
    moveTo: vi.fn(),
    clip: vi.fn(),
    rect: vi.fn(),
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
  bleedPx: 0,
}

describe('timestripTileDrawing', () => {
  it('draws lane backgrounds and tile-local tick labels', () => {
    const context = buildContext()

    drawTimestripTile(context, tile, 2, DEFAULT_TIMESTRIP_THEME, [], 1_700_000_000_000_000)

    expect(context.scale).toHaveBeenCalledWith(2, 2)
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 512, 240)
    expect(context.translate).not.toHaveBeenCalled()
    expect(context.fillRect).toHaveBeenCalled()
    expect(
      vi.mocked(context.fillRect).mock.calls.filter(([x, , width]) => x === 0 && width === 512),
    ).toHaveLength(3)
    expect(context.fillText).toHaveBeenCalled()
  })

  it('uses the provided theme for lane backgrounds', () => {
    const context = buildContext()

    drawTimestripTile(context, tile, 1, {
      canvasBackground: '#ffffff',
      timeAxisBackground: '#eeeeee',
      digitalBackground: '#dddddd',
      analogBackground: '#cccccc',
      tickColor: '#222222',
      tickTextColor: '#111111',
      messageFillColor: '#aaaaaa',
      messageStrokeColor: '#999999',
      messageTextColor: '#888888',
      waveformColor: '#777777',
      componentFillColor: '#666666',
      byteFillColor: '#555555',
      eventCaptureColor: '#f00',
      eventRoleColor: '#0f0',
      eventStatusColor: '#00f',
      eventMarkColor: '#ff0',
      eventOvpColor: '#f0f',
      eventOcpColor: '#0ff',
    })

    expect(context.fillStyle).toBe('#cccccc')
  })
})
