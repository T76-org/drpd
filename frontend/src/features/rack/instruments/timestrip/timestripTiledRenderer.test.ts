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

const makeBitmap = () => ({
  close: vi.fn(),
}) as unknown as ImageBitmap

describe('TimestripTiledRenderer', () => {
  it('sizes the tile canvas pool to visible tiles plus left/right spare', () => {
    expect(calculateTimestripTilePoolSize(0)).toBe(3)
    expect(calculateTimestripTilePoolSize(1)).toBe(4)
    expect(calculateTimestripTilePoolSize(512)).toBe(4)
    expect(calculateTimestripTilePoolSize(513)).toBe(5)
  })

  it('creates a bounded tile canvas pool and requests visible tiles', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => buildCanvasContext() as unknown as CanvasRenderingContext2D,
    )
    const tileLayer = document.createElement('div')
    const frameCallbacks: FrameRequestCallback[] = []
    const worker = new TestWorker()
    const renderer = new TimestripTiledRenderer({
      tileLayer,
      createWorker: () => worker as unknown as Worker,
      requestAnimationFrame: (callback) => {
        frameCallbacks.push(callback)
        return frameCallbacks.length
      },
      cancelAnimationFrame: vi.fn(),
    })

    renderer.setViewport(buildViewport(1000))
    frameCallbacks.shift()?.(0)

    const tileCanvases = Array.from(
      tileLayer.querySelectorAll<HTMLCanvasElement>('canvas[data-timestrip-tile-canvas="true"]'),
    )
    expect(renderer.getPoolSize()).toBe(4)
    expect(tileCanvases).toHaveLength(4)
    expect(tileCanvases[0].style.width).toBe('512px')
    expect(tileCanvases[0].width).toBe(512)
    expect(tileCanvases[0].style.transform).toBe('translate3d(0px, 0, 0)')
    expect(worker.postMessage).toHaveBeenCalledTimes(2)
    expect(worker.postMessage.mock.calls[0][0].tile.key.startsWith('z1000:')).toBe(true)
    expect(worker.postMessage.mock.calls[0][0].worldStartWallClockUs).toBe(1_700_000_000_000_000)

    renderer.dispose()
  })

  it('does not redraw for identical viewport updates', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => buildCanvasContext() as unknown as CanvasRenderingContext2D,
    )
    const tileLayer = document.createElement('div')
    const frameCallbacks: FrameRequestCallback[] = []
    const worker = new TestWorker()
    const renderer = new TimestripTiledRenderer({
      tileLayer,
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
    const frameCallbacks: FrameRequestCallback[] = []
    const worker = new TestWorker()
    const renderer = new TimestripTiledRenderer({
      tileLayer,
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

    renderer.setViewport(buildViewport(1000, 1))
    frameCallbacks.shift()?.(16)
    const primedRequestCount = worker.postMessage.mock.calls.length
    renderer.setViewport(buildViewport(1000, 513))
    frameCallbacks.shift()?.(32)

    expect(Array.from(tileLayer.querySelectorAll('canvas'))).toEqual(initialTileCanvases)
    expect(worker.postMessage.mock.calls.length).toBe(primedRequestCount + 1)
    expect(worker.postMessage.mock.calls.at(-1)?.[0].tile.key).toBe('z1000:3:0')

    renderer.dispose()
  })

  it('keeps committed tile pixels until a replacement bitmap is ready', () => {
    const contexts = [
      buildCanvasContext(),
      buildCanvasContext(),
      buildCanvasContext(),
      buildCanvasContext(),
    ]
    let contextIndex = 0
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => contexts[Math.min(contextIndex++, contexts.length - 1)] as unknown as CanvasRenderingContext2D,
    )
    const tileLayer = document.createElement('div')
    const frameCallbacks: FrameRequestCallback[] = []
    const worker = new TestWorker()
    const renderer = new TimestripTiledRenderer({
      tileLayer,
      createWorker: () => worker as unknown as Worker,
      requestAnimationFrame: (callback) => {
        frameCallbacks.push(callback)
        return frameCallbacks.length
      },
      cancelAnimationFrame: vi.fn(),
    })

    renderer.setViewport(buildViewport(1000))
    frameCallbacks.shift()?.(0)
    const firstRequest = worker.postMessage.mock.calls[0][0]
    worker.onmessage?.({
      data: {
        type: 'tileRendered',
        requestId: firstRequest.requestId,
        tileKey: firstRequest.tile.key,
        tile: firstRequest.tile,
        bitmap: makeBitmap(),
        generation: firstRequest.generation,
      },
    } as MessageEvent<unknown>)
    frameCallbacks.shift()?.(16)
    const firstCanvasContext = contexts[0]
    const committedClearCount = vi.mocked(firstCanvasContext.clearRect).mock.calls.length

    renderer.invalidateAllTiles()
    frameCallbacks.shift()?.(32)

    expect(firstCanvasContext.clearRect).toHaveBeenCalledTimes(committedClearCount)
    expect(worker.postMessage.mock.calls.length).toBeGreaterThan(2)

    renderer.dispose()
  })

  it('defers backing-store resize for committed canvases until replacement pixels are ready', () => {
    const contexts = [
      buildCanvasContext(),
      buildCanvasContext(),
      buildCanvasContext(),
      buildCanvasContext(),
    ]
    let contextIndex = 0
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => contexts[Math.min(contextIndex++, contexts.length - 1)] as unknown as CanvasRenderingContext2D,
    )
    const tileLayer = document.createElement('div')
    const frameCallbacks: FrameRequestCallback[] = []
    const worker = new TestWorker()
    const renderer = new TimestripTiledRenderer({
      tileLayer,
      createWorker: () => worker as unknown as Worker,
      requestAnimationFrame: (callback) => {
        frameCallbacks.push(callback)
        return frameCallbacks.length
      },
      cancelAnimationFrame: vi.fn(),
    })

    renderer.setViewport(buildViewport(1000))
    frameCallbacks.shift()?.(0)
    const firstRequest = worker.postMessage.mock.calls[0][0]
    worker.onmessage?.({
      data: {
        type: 'tileRendered',
        requestId: firstRequest.requestId,
        tileKey: firstRequest.tile.key,
        tile: firstRequest.tile,
        bitmap: makeBitmap(),
        generation: firstRequest.generation,
      },
    } as MessageEvent<unknown>)
    frameCallbacks.shift()?.(16)
    const firstCanvas = tileLayer.querySelector('canvas')
    const firstCanvasContext = contexts[0]
    const committedClearCount = vi.mocked(firstCanvasContext.clearRect).mock.calls.length

    renderer.setViewport({
      ...buildViewport(1000),
      viewportHeightPx: 180,
    })
    frameCallbacks.shift()?.(32)

    expect(firstCanvas?.style.height).toBe('180px')
    expect(firstCanvas?.height).toBe(120)
    expect(firstCanvasContext.clearRect).toHaveBeenCalledTimes(committedClearCount)

    let replacementRequest = firstRequest
    for (let index = worker.postMessage.mock.calls.length - 1; index >= 0; index -= 1) {
      const request = worker.postMessage.mock.calls[index][0]
      if (request.tile.key === firstRequest.tile.key) {
        replacementRequest = request
        break
      }
    }
    worker.onmessage?.({
      data: {
        type: 'tileRendered',
        requestId: replacementRequest.requestId,
        tileKey: replacementRequest.tile.key,
        tile: replacementRequest.tile,
        bitmap: makeBitmap(),
        generation: replacementRequest.generation,
      },
    } as MessageEvent<unknown>)
    frameCallbacks.shift()?.(48)

    expect(firstCanvas?.height).toBe(180)
    expect(firstCanvasContext.clearRect).toHaveBeenCalledTimes(committedClearCount + 1)

    renderer.dispose()
  })

  it('resets pool assignments when zoom changes', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => buildCanvasContext() as unknown as CanvasRenderingContext2D,
    )
    const tileLayer = document.createElement('div')
    const frameCallbacks: FrameRequestCallback[] = []
    const worker = new TestWorker()
    const renderer = new TimestripTiledRenderer({
      tileLayer,
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
    expect(renderer.getPoolSize()).toBe(4)

    renderer.dispose()
  })
})
