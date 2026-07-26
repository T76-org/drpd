import { describe, expect, it, vi } from 'vitest'
import { drawTimestripViewport } from './timestripViewportDrawing'
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

const buildTrackingContext = () => {
  const fillStyles: string[] = []
  const fillRects: Array<[number, number, number, number, string]> = []
  const context = {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(() => {
      fillStyles.push(context.fillStyle)
      const args = context.fillRect.mock.calls.at(-1) as [number, number, number, number] | undefined
      if (args) {
        fillRects.push([...args, context.fillStyle])
      }
    }),
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
  }
  return {
    context: context as unknown as CanvasRenderingContext2D,
    fillStyles,
    fillRects,
  }
}

const viewport = {
  worldLeftNs: 0,
  zoomDenominator: 1000,
  widthPx: 512,
  heightPx: 240,
}

describe('timestripViewportDrawing', () => {
  it('draws lane backgrounds and viewport-local tick labels', () => {
    const context = buildContext()

    drawTimestripViewport(context, viewport, 2, DEFAULT_TIMESTRIP_THEME, [], [], 1_700_000_000_000_000)

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

    drawTimestripViewport(context, viewport, 1, {
      canvasBackground: '#ffffff',
      timeAxisBackground: '#eeeeee',
      digitalBackground: '#dddddd',
      analogBackground: '#cccccc',
      tickColor: '#222222',
      tickTextColor: '#111111',
      messageFillColor: '#aaaaaa',
      messageStrokeColor: '#999999',
      messageTextColor: '#888888',
      selectedMessageBackgroundColor: '#bbbbbb',
      selectedMessageFillColor: '#777777',
      waveformColor: '#777777',
      componentFillColor: '#666666',
      byteFillColor: '#555555',
      preambleFillColor: '#444444',
      sopFillColor: '#333333',
      headerFillColor: '#222222',
      dataFillColor: '#111111',
      crc32FillColor: '#000000',
      eventCaptureColor: '#f00',
      eventRoleColor: '#0f0',
      eventStatusColor: '#00f',
      eventMarkColor: '#ff0',
      eventSinkErrorsColor: '#f08',
      eventSinkWarningColor: '#f80',
      eventSyncTriggerColor: '#08f',
      eventOvpColor: '#f0f',
      eventOcpColor: '#0ff',
      voltageTraceColor: '#05BAFA',
      currentTraceColor: '#01A804',
      analogGridColor: 'rgba(255, 255, 255, 0.09)',
      captureMarkerColor: '#fedcba',
      unavailableOverlayFillColor: 'rgba(255, 255, 255, 0.05)',
      unavailableOverlayStrokeColor: 'rgba(255, 255, 255, 0.15)',
    })

    expect(context.fillStyle).toBe('#cccccc')
  })

  it('draws a subtle unavailable-region shade in viewport coordinates', () => {
    const context = buildContext()

    drawTimestripViewport(
      context,
      viewport,
      1,
      DEFAULT_TIMESTRIP_THEME,
      [],
      [],
      1_700_000_000_000_000,
      null,
      null,
      [{ startWorldNs: 100_000, endWorldNs: 200_000 }],
    )

    expect(context.fillRect).toHaveBeenCalledWith(100, 0, 100, 240)
  })

  it('colors detailed digital components and bytes by message segment', () => {
    const { context, fillStyles } = buildTrackingContext()

    drawTimestripViewport(
      context,
      viewport,
      1,
      DEFAULT_TIMESTRIP_THEME,
      [
        {
          kind: 'message',
          selectionKey: 'message:20:220:1',
          startWorldNs: 20_000,
          endWorldNs: 220_000,
          label: 'Source Capabilities',
          pulseWidthsNs: [10_000, 10_000],
          frameBytes: [0x18, 0x18, 0x18, 0x11, 0xb0, 0x99, 0x04, 0x00, 0xb8, 0xe1, 0x4e, 0x58],
          components: [
            { label: 'Preamble', startUs: 0, durationUs: 20_000, byteStart: 0, byteLength: 0 },
            { label: 'SOP', startUs: 20_000, durationUs: 40_000, byteStart: 0, byteLength: 4 },
            { label: 'Header', startUs: 60_000, durationUs: 20_000, byteStart: 4, byteLength: 2 },
            { label: 'Data', startUs: 80_000, durationUs: 20_000, byteStart: 6, byteLength: 2 },
            { label: 'CRC32', startUs: 100_000, durationUs: 40_000, byteStart: 8, byteLength: 4 },
          ],
        },
      ],
      [],
      1_700_000_000_000_000,
    )

    expect(fillStyles).toContain(DEFAULT_TIMESTRIP_THEME.preambleFillColor)
    expect(fillStyles).toContain(DEFAULT_TIMESTRIP_THEME.sopFillColor)
    expect(fillStyles).toContain(DEFAULT_TIMESTRIP_THEME.headerFillColor)
    expect(fillStyles).toContain(DEFAULT_TIMESTRIP_THEME.dataFillColor)
    expect(fillStyles).toContain(DEFAULT_TIMESTRIP_THEME.crc32FillColor)
  })

  it('draws a subtle selection background through the digital and analog lanes', () => {
    const { context, fillRects, fillStyles } = buildTrackingContext()

    drawTimestripViewport(
      context,
      viewport,
      1,
      DEFAULT_TIMESTRIP_THEME,
      [
        {
          kind: 'message',
          selectionKey: 'message:20:220:1',
          startWorldNs: 20_000,
          endWorldNs: 220_000,
          label: 'Source Capabilities',
          pulseWidthsNs: [],
          frameBytes: [],
          components: [],
        },
      ],
      [],
      1_700_000_000_000_000,
      'message:20:220:1',
    )

    expect(fillStyles).toContain(DEFAULT_TIMESTRIP_THEME.selectedMessageBackgroundColor)
    expect(fillRects).toContainEqual([
      20,
      34,
      200,
      206,
      DEFAULT_TIMESTRIP_THEME.selectedMessageBackgroundColor,
    ])
    expect(fillRects).toContainEqual([
      20,
      34,
      2,
      206,
      DEFAULT_TIMESTRIP_THEME.tickTextColor,
    ])
    expect(fillRects).toContainEqual([
      218,
      34,
      2,
      206,
      DEFAULT_TIMESTRIP_THEME.tickTextColor,
    ])
  })
})
