import { describe, expect, it, vi } from 'vitest'
import {
  TimestripCanvasRenderer,
  type TimestripRendererViewport,
} from './timestripCanvasRenderer'

const buildCanvasContext = () => ({
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  clip: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  lineTo: vi.fn(),
  measureText: vi.fn((text: string) => ({ width: text.length * 6 })),
  moveTo: vi.fn(),
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
})

const buildViewport = (overrides: Partial<TimestripRendererViewport> = {}): TimestripRendererViewport => ({
  scrollLeftPx: 0,
  zoomDenominator: 1000,
  viewportWidthPx: 512,
  viewportHeightPx: 120,
  dpr: 2,
  worldStartWallClockUs: 1_700_000_000_000_000,
  ...overrides,
})

describe('TimestripCanvasRenderer', () => {
  it('creates one canvas and sizes its backing store by DPR', () => {
    const context = buildCanvasContext()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => context as unknown as CanvasRenderingContext2D,
    )
    const canvasLayer = document.createElement('div')
    const frameCallbacks: FrameRequestCallback[] = []
    const renderer = new TimestripCanvasRenderer({
      canvasLayer,
      requestAnimationFrame: (callback) => {
        frameCallbacks.push(callback)
        return frameCallbacks.length
      },
      cancelAnimationFrame: vi.fn(),
    })

    renderer.setViewport(buildViewport())
    frameCallbacks.shift()?.(0)

    const canvases = canvasLayer.querySelectorAll<HTMLCanvasElement>('canvas[data-timestrip-canvas="true"]')
    expect(canvases).toHaveLength(1)
    expect(canvases[0].style.width).toBe('512px')
    expect(canvases[0].style.height).toBe('120px')
    expect(canvases[0].width).toBe(1024)
    expect(canvases[0].height).toBe(240)
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 512, 120)

    renderer.dispose()
  })

  it('coalesces multiple viewport changes into one scheduled render', () => {
    const context = buildCanvasContext()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => context as unknown as CanvasRenderingContext2D,
    )
    const canvasLayer = document.createElement('div')
    const frameCallbacks: FrameRequestCallback[] = []
    const renderer = new TimestripCanvasRenderer({
      canvasLayer,
      requestAnimationFrame: (callback) => {
        frameCallbacks.push(callback)
        return frameCallbacks.length
      },
      cancelAnimationFrame: vi.fn(),
    })

    renderer.setViewport(buildViewport({ scrollLeftPx: 1 }))
    renderer.setViewport(buildViewport({ scrollLeftPx: 2 }))
    renderer.setViewport(buildViewport({ scrollLeftPx: 3 }))

    expect(frameCallbacks).toHaveLength(1)
    frameCallbacks.shift()?.(0)
    expect(context.clearRect).toHaveBeenCalledTimes(1)

    renderer.dispose()
  })

  it('redraws on scroll, zoom, data, theme, and selection changes', () => {
    const context = buildCanvasContext()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => context as unknown as CanvasRenderingContext2D,
    )
    const canvasLayer = document.createElement('div')
    const frameCallbacks: FrameRequestCallback[] = []
    const renderer = new TimestripCanvasRenderer({
      canvasLayer,
      requestAnimationFrame: (callback) => {
        frameCallbacks.push(callback)
        return frameCallbacks.length
      },
      cancelAnimationFrame: vi.fn(),
    })
    const renderNextFrame = () => {
      frameCallbacks.shift()?.(0)
    }

    renderer.setViewport(buildViewport())
    renderNextFrame()
    renderer.setViewport(buildViewport({ scrollLeftPx: 12 }))
    renderNextFrame()
    renderer.setViewport(buildViewport({ scrollLeftPx: 12, zoomDenominator: 500 }))
    renderNextFrame()
    renderer.setViewport(buildViewport({ scrollLeftPx: 12, zoomDenominator: 500, digitalDataRevision: 1 }))
    renderNextFrame()
    renderer.setViewport(buildViewport({
      scrollLeftPx: 12,
      zoomDenominator: 500,
      digitalDataRevision: 1,
      analogDataRevision: 1,
    }))
    renderNextFrame()
    renderer.setViewport(buildViewport({
      scrollLeftPx: 12,
      zoomDenominator: 500,
      digitalDataRevision: 1,
      analogDataRevision: 1,
      selectedMessageKey: 'message:1:2:3',
    }))
    renderNextFrame()
    renderer.setViewport(buildViewport({
      scrollLeftPx: 12,
      zoomDenominator: 500,
      digitalDataRevision: 1,
      analogDataRevision: 1,
      selectedMessageKey: 'message:1:2:3',
      theme: {
        canvasBackground: '#fff',
        timeAxisBackground: '#eee',
        digitalBackground: '#ddd',
        analogBackground: '#ccc',
        tickColor: '#222',
        tickTextColor: '#111',
        messageFillColor: '#aaa',
        messageStrokeColor: '#999',
        messageTextColor: '#888',
        selectedMessageBackgroundColor: '#bbb',
        selectedMessageFillColor: '#777',
        waveformColor: '#777',
        componentFillColor: '#666',
        byteFillColor: '#555',
        preambleFillColor: '#444',
        sopFillColor: '#333',
        headerFillColor: '#222',
        dataFillColor: '#111',
        crc32FillColor: '#000',
        eventCaptureColor: '#f00',
        eventRoleColor: '#0f0',
        eventStatusColor: '#00f',
        eventMarkColor: '#ff0',
        eventOvpColor: '#f0f',
        eventOcpColor: '#0ff',
        voltageTraceColor: '#05BAFA',
        currentTraceColor: '#01A804',
        analogGridColor: 'rgba(255, 255, 255, 0.09)',
        captureMarkerColor: '#fedcba',
      },
    }))
    renderNextFrame()

    expect(context.clearRect).toHaveBeenCalledTimes(7)

    renderer.dispose()
  })

  it('cancels pending RAF and removes the canvas on dispose', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => buildCanvasContext() as unknown as CanvasRenderingContext2D,
    )
    const canvasLayer = document.createElement('div')
    const cancelAnimationFrame = vi.fn()
    const renderer = new TimestripCanvasRenderer({
      canvasLayer,
      requestAnimationFrame: () => 42,
      cancelAnimationFrame,
    })

    renderer.setViewport(buildViewport())
    renderer.dispose()

    expect(cancelAnimationFrame).toHaveBeenCalledWith(42)
    expect(canvasLayer.querySelector('canvas')).toBeNull()
  })
})
