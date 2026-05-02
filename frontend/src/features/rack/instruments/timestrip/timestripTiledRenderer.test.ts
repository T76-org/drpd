import { describe, expect, it, vi } from 'vitest'
import {
  calculateTimestripTilePoolSize,
  TimestripTiledRenderer,
  type TimestripRendererViewport,
} from './timestripTiledRenderer'

const buildCanvasContext = () => ({
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  clip: vi.fn(),
  drawImage: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  lineTo: vi.fn(),
  measureText: vi.fn((text: string) => ({ width: text.length * 6 })),
  moveTo: vi.fn(),
  rect: vi.fn(),
  restore: vi.fn(),
  save: vi.fn(),
  scale: vi.fn(),
  setTransform: vi.fn(),
  stroke: vi.fn(),
  strokeRect: vi.fn(),
  translate: vi.fn(),
  fillStyle: '',
  font: '',
  lineWidth: 1,
  strokeStyle: '',
  textAlign: 'start',
  textBaseline: 'alphabetic',
})

const buildViewport = (zoomDenominator: number, scrollLeftPx = 0): TimestripRendererViewport => ({
  scrollLeftPx,
  zoomDenominator,
  viewportWidthPx: 512,
  viewportHeightPx: 120,
  dpr: 1,
  worldStartWallClockUs: 1_700_000_000_000_000,
})

class TestWorker {
  public onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  public readonly postMessage = vi.fn()
  public readonly terminate = vi.fn()
}

describe('TimestripTiledRenderer', () => {
  it('sizes the tile canvas pool to visible tiles plus left/right spare', () => {
    expect(calculateTimestripTilePoolSize(0)).toBe(2)
    expect(calculateTimestripTilePoolSize(1)).toBe(3)
    expect(calculateTimestripTilePoolSize(512)).toBe(3)
    expect(calculateTimestripTilePoolSize(513)).toBe(4)
  })

  it('creates a bounded tile canvas pool and requests visible tiles', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => buildCanvasContext() as unknown as CanvasRenderingContext2D,
    )
    const tileLayer = document.createElement('div')
    const tickCanvas = document.createElement('canvas')
    const frameCallbacks: FrameRequestCallback[] = []
    const worker = new TestWorker()
    const renderer = new TimestripTiledRenderer({
      tileLayer,
      tickCanvas,
      createWorker: () => worker as unknown as Worker,
      requestAnimationFrame: (callback) => {
        frameCallbacks.push(callback)
        return frameCallbacks.length
      },
      cancelAnimationFrame: vi.fn(),
    })

    renderer.setViewport(buildViewport(1000))
    frameCallbacks.shift()?.(0)

    expect(renderer.getPoolSize()).toBe(3)
    expect(tileLayer.querySelectorAll('canvas[data-timestrip-tile-canvas="true"]')).toHaveLength(3)
    expect(worker.postMessage).toHaveBeenCalledTimes(2)
    expect(worker.postMessage.mock.calls[0][0].tile.key.startsWith('z1000:')).toBe(true)

    renderer.dispose()
  })

  it('does not redraw for identical viewport updates', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => buildCanvasContext() as unknown as CanvasRenderingContext2D,
    )
    const tileLayer = document.createElement('div')
    const tickCanvas = document.createElement('canvas')
    const frameCallbacks: FrameRequestCallback[] = []
    const worker = new TestWorker()
    const renderer = new TimestripTiledRenderer({
      tileLayer,
      tickCanvas,
      createWorker: () => worker as unknown as Worker,
      requestAnimationFrame: (callback) => {
        frameCallbacks.push(callback)
        return frameCallbacks.length
      },
      cancelAnimationFrame: vi.fn(),
    })

    const viewport = buildViewport(1000)
    renderer.setViewport(viewport)
    frameCallbacks.shift()?.(0)
    const requestCount = worker.postMessage.mock.calls.length

    renderer.setViewport(viewport)

    expect(frameCallbacks).toHaveLength(0)
    expect(worker.postMessage).toHaveBeenCalledTimes(requestCount)

    renderer.dispose()
  })

  it('recycles tile canvases when crossing a tile boundary', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => buildCanvasContext() as unknown as CanvasRenderingContext2D,
    )
    const tileLayer = document.createElement('div')
    const tickCanvas = document.createElement('canvas')
    const frameCallbacks: FrameRequestCallback[] = []
    const worker = new TestWorker()
    const renderer = new TimestripTiledRenderer({
      tileLayer,
      tickCanvas,
      createWorker: () => worker as unknown as Worker,
      requestAnimationFrame: (callback) => {
        frameCallbacks.push(callback)
        return frameCallbacks.length
      },
      cancelAnimationFrame: vi.fn(),
    })

    renderer.setViewport(buildViewport(1000))
    frameCallbacks.shift()?.(0)
    const initialTileCanvases = Array.from(tileLayer.querySelectorAll('canvas'))
    const initialRequestCount = worker.postMessage.mock.calls.length

    renderer.setViewport(buildViewport(1000, 513))
    frameCallbacks.shift()?.(16)

    expect(Array.from(tileLayer.querySelectorAll('canvas'))).toEqual(initialTileCanvases)
    expect(worker.postMessage.mock.calls.length).toBeGreaterThan(initialRequestCount)
    expect(worker.postMessage.mock.calls.at(-1)?.[0].tile.key).toBe('z1000:2:0')

    renderer.dispose()
  })

  it('resets pool assignments when zoom changes', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => buildCanvasContext() as unknown as CanvasRenderingContext2D,
    )
    const tileLayer = document.createElement('div')
    const tickCanvas = document.createElement('canvas')
    const frameCallbacks: FrameRequestCallback[] = []
    const worker = new TestWorker()
    const renderer = new TimestripTiledRenderer({
      tileLayer,
      tickCanvas,
      createWorker: () => worker as unknown as Worker,
      requestAnimationFrame: (callback) => {
        frameCallbacks.push(callback)
        return frameCallbacks.length
      },
      cancelAnimationFrame: vi.fn(),
    })

    renderer.setViewport(buildViewport(1000))
    frameCallbacks.shift()?.(0)
    renderer.setViewport(buildViewport(909))
    frameCallbacks.shift()?.(16)

    expect(worker.postMessage.mock.calls.at(-1)?.[0].tile.key.startsWith('z909:')).toBe(true)
    expect(renderer.getPoolSize()).toBe(3)

    renderer.dispose()
  })
})
