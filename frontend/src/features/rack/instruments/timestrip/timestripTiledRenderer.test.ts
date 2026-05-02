import { describe, expect, it, vi } from 'vitest'
import { TimestripTiledRenderer, type TimestripRendererViewport } from './timestripTiledRenderer'

const buildCanvasContext = () => ({
  clearRect: vi.fn(),
  drawImage: vi.fn(),
  fillRect: vi.fn(),
  setTransform: vi.fn(),
  fillStyle: '',
})

const buildViewport = (zoomDenominator: number): TimestripRendererViewport => ({
  scrollLeftPx: 0,
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
  it('clears cached tiles when zoom denominator changes', () => {
    const context = buildCanvasContext()
    const canvas = document.createElement('canvas')
    vi.spyOn(canvas, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
    const frameCallbacks: FrameRequestCallback[] = []
    const worker = new TestWorker()
    const renderer = new TimestripTiledRenderer({
      canvas,
      createWorker: () => worker as unknown as Worker,
      requestAnimationFrame: (callback) => {
        frameCallbacks.push(callback)
        return frameCallbacks.length
      },
      cancelAnimationFrame: vi.fn(),
    })

    renderer.setViewport(buildViewport(1000))
    frameCallbacks.shift()?.(0)
    expect(worker.postMessage).toHaveBeenCalled()
    expect(worker.postMessage.mock.calls[0][0].tile.key.startsWith('z1000:')).toBe(true)

    renderer.setViewport(buildViewport(909))
    frameCallbacks.shift()?.(16)
    expect(worker.postMessage.mock.calls.at(-1)?.[0].tile.key.startsWith('z909:')).toBe(true)
    expect(renderer.getCacheSize()).toBe(0)

    renderer.dispose()
  })
})
