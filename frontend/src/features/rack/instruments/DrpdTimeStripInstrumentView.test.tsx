import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildCapturedLogSelectionKey,
  DRPDDevice,
  type DRPDLogSelectionState,
  type LoggedAnalogSample,
  type LoggedCapturedMessage,
} from '../../../lib/device'
import type { RackInstrument } from '../../../lib/rack/types'
import type { RackDeviceState } from '../RackRenderer'
import { DrpdTimeStripInstrumentView } from './DrpdTimeStripInstrumentView'

const buildCanvasContext = () => ({
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  drawImage: vi.fn(),
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

/**
 * Build a minimal timestrip rack instrument.
 *
 * @returns Rack instrument.
 */
const buildInstrument = (): RackInstrument => ({
  id: 'inst-timestrip',
  instrumentIdentifier: 'com.mta.drpd.timestrip',
})

/**
 * Render the timestrip instrument in its default state.
 */
const renderTimestrip = (deviceState?: RackDeviceState) => {
  return render(
    <DrpdTimeStripInstrumentView
      instrument={buildInstrument()}
      displayName="Timestrip"
      deviceState={deviceState}
      isEditMode={false}
    />,
  )
}

const buildDeviceState = (
  queryCapturedMessages: ReturnType<typeof vi.fn>,
  queryAnalogSamples?: ReturnType<typeof vi.fn>,
): RackDeviceState =>
  ({
    record: {
      id: 'device-1',
      identifier: 'com.mta.drpd',
      displayName: 'DRPD',
      vendorId: 0,
      productId: 0,
    },
    status: 'connected',
    drpdDriver: {
      queryCapturedMessages,
      queryAnalogSamples,
    },
  }) as unknown as RackDeviceState

const buildRangeDeviceState = (endTimestampUs: bigint): RackDeviceState => {
  const queryCapturedMessages = vi.fn(async (query: { sortOrder?: 'asc' | 'desc'; timeBasis?: 'device' | 'wallClock' }) => {
    if (query.timeBasis === 'wallClock') {
      return []
    }
    return [
      buildCapturedMessage({
        startTimestampUs: query.sortOrder === 'desc' ? endTimestampUs : 0n,
        endTimestampUs: query.sortOrder === 'desc' ? endTimestampUs : 1_000n,
        createdAtMs: query.sortOrder === 'desc' ? 2 : 1,
      }),
    ]
  })
  return buildDeviceState(queryCapturedMessages)
}

const attachSelectionDriver = (deviceState: RackDeviceState) => {
  const driver = deviceState.drpdDriver as unknown as {
    queryCapturedMessages: ReturnType<typeof vi.fn>
    setLogSelectionState?: ReturnType<typeof vi.fn>
  }
  driver.setLogSelectionState = vi.fn()
  return {
    queryCapturedMessages: driver.queryCapturedMessages,
    setLogSelectionState: driver.setLogSelectionState,
  }
}

const buildCapturedMessage = (overrides: Partial<LoggedCapturedMessage> = {}): LoggedCapturedMessage => ({
  entryKind: 'message',
  eventType: null,
  eventText: null,
  eventWallClockMs: null,
  wallClockUs: null,
  startTimestampUs: 6_000_000n,
  endTimestampUs: 10_000_000n,
  displayTimestampUs: null,
  decodeResult: 0,
  sopKind: 'SOP',
  messageKind: 'DATA',
  messageType: 1,
  messageId: 0,
  senderPowerRole: 'SOURCE',
  senderDataRole: 'DFP',
  pulseCount: 0,
  rawPulseWidths: new Float64Array(),
  rawSop: Uint8Array.from([0x12, 0x12, 0x12, 0x13]),
  rawDecodedData: Uint8Array.from([0x61, 0x01, 0xaa, 0xbb, 0xcc, 0xdd]),
  parseError: null,
  createdAtMs: 1,
  ...overrides,
})

const buildAnalogSample = (overrides: Partial<LoggedAnalogSample> = {}): LoggedAnalogSample => ({
  timestampUs: 6_000_000n,
  displayTimestampUs: null,
  wallClockUs: null,
  vbusV: 5,
  ibusA: 0.1,
  role: null,
  createdAtMs: 1,
  ...overrides,
})

const setViewportGeometry = (viewport: HTMLElement, width = 500, left = 100) => {
  Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: width })
  Object.defineProperty(viewport, 'scrollWidth', { configurable: true, value: 10_000 })
  viewport.getBoundingClientRect = () =>
    ({
      left,
      right: left + width,
      top: 0,
      bottom: 100,
      width,
      height: 100,
      x: left,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect
}

const scrollViewportTo = (viewport: HTMLElement, scrollLeft: number) => {
  viewport.scrollLeft = scrollLeft
  fireEvent.scroll(viewport)
}

const localStorageItems = new Map<string, string>()
const localStorageMock = {
  getItem: vi.fn((key: string) => localStorageItems.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageItems.set(key, value)
  }),
  removeItem: vi.fn((key: string) => {
    localStorageItems.delete(key)
  }),
  clear: vi.fn(() => {
    localStorageItems.clear()
  }),
}

describe('DrpdTimeStripInstrumentView', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.stubGlobal('localStorage', localStorageMock)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      buildCanvasContext() as unknown as CanvasRenderingContext2D,
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders a viewport, timeline spacer, and single canvas layer without svg', () => {
    const { container } = renderTimestrip()

    expect(screen.getByTestId('drpd-timestrip-frame')).toBeInTheDocument()
    expect(screen.getByTestId('drpd-timestrip-viewport')).toBeInTheDocument()
    expect(screen.getByTestId('drpd-timestrip-timeline')).toHaveStyle({
      width: '100px',
    })
    expect(screen.getByTestId('drpd-timestrip-canvas-layer')).toBeInTheDocument()
    expect(screen.queryByTestId('drpd-timestrip-tick-canvas')).toBeNull()
    expect(screen.getByTestId('drpd-timestrip-canvas-layer').querySelectorAll('canvas[data-timestrip-canvas="true"]')).toHaveLength(1)
    expect(container.querySelectorAll('canvas')).toHaveLength(1)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('renders voltage and current analog lane legends outside the viewport', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)

    renderTimestrip()

    const frame = screen.getByTestId('drpd-timestrip-frame')
    const viewport = screen.getByTestId('drpd-timestrip-viewport')
    const voltageLegend = screen.getByTestId('drpd-timestrip-voltage-legend')
    const currentLegend = screen.getByTestId('drpd-timestrip-current-legend')

    expect(frame.children[0]).toBe(voltageLegend)
    expect(frame.children[1]).toBe(viewport)
    expect(frame.children[2]).toBe(currentLegend)
    expect(within(voltageLegend).getByText('60V')).toBeInTheDocument()
    expect(within(voltageLegend).getByText('0V')).toBeInTheDocument()
    expect(within(currentLegend).getByText('6A')).toBeInTheDocument()
    expect(within(currentLegend).getByText('0A')).toBeInTheDocument()
    expect(screen.getByTestId('drpd-timestrip-timeline')).toHaveStyle({
      width: '500px',
    })
  })

  it('renders zoom as passive header text without button or popover controls', () => {
    renderTimestrip()

    expect(screen.getByLabelText('Zoom 100ms per pixel')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /zoom/i })).toBeNull()
    expect(screen.queryByRole('slider')).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()
  })

  it('restores zoom from local storage', () => {
    window.localStorage.setItem('drpd:timestrip:zoom-denominator', '1000')

    renderTimestrip()

    expect(screen.getByLabelText('Zoom 1µs per pixel')).toBeInTheDocument()
    expect(screen.getByTestId('drpd-timestrip-timeline')).toHaveStyle({
      width: '10000000px',
    })
  })

  it('maps mouse wheel movement to horizontal viewport scroll', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
    const deviceState = buildRangeDeviceState(2_000_000_000n)
    const { queryCapturedMessages } = attachSelectionDriver(deviceState)
    renderTimestrip(deviceState)
    const viewport = screen.getByTestId('drpd-timestrip-viewport')
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 500 })
    Object.defineProperty(viewport, 'scrollWidth', { configurable: true, value: 10_000 })

    await waitFor(() => {
      expect(screen.getByTestId('drpd-timestrip-timeline')).toHaveStyle({
        width: '20250px',
      })
    })

    await act(async () => {
      fireEvent.wheel(viewport, { deltaY: 240 })
      await new Promise((resolve) => window.requestAnimationFrame(resolve))
    })

    await waitFor(() => {
      expect(viewport.scrollLeft).toBe(240)
    })
    queryCapturedMessages.mockClear()
    fireEvent.click(viewport, { clientX: 200, clientY: 60 })
    await waitFor(() => {
      expect(queryCapturedMessages).toHaveBeenCalledWith(expect.objectContaining({
        endTimestampUs: 44000000n,
        sortOrder: 'desc',
      }))
    })
  })

  it('applies fine wheel scrolling logically when DOM scroll quantizes at high zoom', async () => {
    window.localStorage.setItem('drpd:timestrip:zoom-denominator', '500')
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
    const deviceState = buildRangeDeviceState(100_000_000_000n)
    const { queryCapturedMessages } = attachSelectionDriver(deviceState)
    renderTimestrip(deviceState)
    const viewport = screen.getByTestId('drpd-timestrip-viewport')
    setViewportGeometry(viewport)
    let domScrollLeft = 0
    Object.defineProperty(viewport, 'scrollLeft', {
      configurable: true,
      get: () => domScrollLeft,
      set: (value: number) => {
        domScrollLeft = Math.floor(value)
      },
    })

    await waitFor(() => {
      expect(screen.getByTestId('drpd-timestrip-timeline')).toHaveStyle({
        width: '16000000px',
      })
    })

    await act(async () => {
      fireEvent.wheel(viewport, { deltaY: 4, clientX: 200 })
      await new Promise((resolve) => window.requestAnimationFrame(resolve))
    })

    expect(viewport.scrollLeft).toBe(0)
    queryCapturedMessages.mockClear()
    fireEvent.click(viewport, { clientX: 200, clientY: 60 })
    await waitFor(() => {
      expect(queryCapturedMessages).toHaveBeenCalledWith(expect.objectContaining({
        endTimestampUs: 52n,
        sortOrder: 'desc',
      }))
    })
  })

  it('accumulates rapid high-zoom wheel scrolling without DOM quantization resets', async () => {
    window.localStorage.setItem('drpd:timestrip:zoom-denominator', '500')
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
    const deviceState = buildRangeDeviceState(100_000_000_000n)
    const { queryCapturedMessages } = attachSelectionDriver(deviceState)
    renderTimestrip(deviceState)
    const viewport = screen.getByTestId('drpd-timestrip-viewport')
    setViewportGeometry(viewport)
    let domScrollLeft = 0
    Object.defineProperty(viewport, 'scrollLeft', {
      configurable: true,
      get: () => domScrollLeft,
      set: (value: number) => {
        domScrollLeft = Math.floor(value)
      },
    })

    await waitFor(() => {
      expect(screen.getByTestId('drpd-timestrip-timeline')).toHaveStyle({
        width: '16000000px',
      })
    })

    await act(async () => {
      fireEvent.wheel(viewport, { deltaY: 4, clientX: 200 })
      fireEvent.wheel(viewport, { deltaY: 40, clientX: 200 })
      fireEvent.wheel(viewport, { deltaY: 80, clientX: 200 })
      await new Promise((resolve) => window.requestAnimationFrame(resolve))
    })

    queryCapturedMessages.mockClear()
    fireEvent.click(viewport, { clientX: 200, clientY: 60 })
    await waitFor(() => {
      expect(queryCapturedMessages).toHaveBeenCalledWith(expect.objectContaining({
        endTimestampUs: 112n,
        sortOrder: 'desc',
      }))
    })
  })

  it('uses ctrl wheel to change zoom instead of scrolling', () => {
    renderTimestrip()
    const viewport = screen.getByTestId('drpd-timestrip-viewport')
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 500 })
    Object.defineProperty(viewport, 'scrollWidth', { configurable: true, value: 10_000 })

    fireEvent.wheel(viewport, { ctrlKey: true, deltaY: -240 })

    expect(screen.getByLabelText('Zoom 50ms per pixel')).toBeInTheDocument()
    expect(window.localStorage.getItem('drpd:timestrip:zoom-denominator')).toBe('50000000')
    expect(viewport.scrollLeft).toBe(0)

    fireEvent.wheel(viewport, { ctrlKey: true, deltaY: 240 })

    expect(screen.getByLabelText('Zoom 100ms per pixel')).toBeInTheDocument()
    expect(viewport.scrollLeft).toBe(0)
  })

  it('allows ctrl wheel zooming out to 400ms per pixel', () => {
    renderTimestrip()
    const viewport = screen.getByTestId('drpd-timestrip-viewport')
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 500 })
    Object.defineProperty(viewport, 'scrollWidth', { configurable: true, value: 10_000 })

    fireEvent.wheel(viewport, { ctrlKey: true, deltaY: 240 })

    expect(screen.getByLabelText('Zoom 200ms per pixel')).toBeInTheDocument()
    expect(window.localStorage.getItem('drpd:timestrip:zoom-denominator')).toBe('200000000')

    fireEvent.wheel(viewport, { ctrlKey: true, deltaY: 240 })

    expect(screen.getByLabelText('Zoom 400ms per pixel')).toBeInTheDocument()
    expect(window.localStorage.getItem('drpd:timestrip:zoom-denominator')).toBe('400000000')

    fireEvent.wheel(viewport, { ctrlKey: true, deltaY: 240 })

    expect(screen.getByLabelText('Zoom 400ms per pixel')).toBeInTheDocument()
    expect(window.localStorage.getItem('drpd:timestrip:zoom-denominator')).toBe('400000000')
  })

  it('keeps the timestamp under the pointer stable during ctrl wheel zoom', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
    const deviceState = buildRangeDeviceState(2_000_000_000n)
    const { queryCapturedMessages } = attachSelectionDriver(deviceState)
    renderTimestrip(deviceState)
    const viewport = screen.getByTestId('drpd-timestrip-viewport')
    setViewportGeometry(viewport)
    const pointerX = 150

    await waitFor(() => {
      expect(screen.getByTestId('drpd-timestrip-timeline')).toHaveStyle({
        width: '20250px',
      })
    })

    const initialScrollLeft = 5000
    scrollViewportTo(viewport, initialScrollLeft)
    const timestampUnderPointerBeforeNs = (initialScrollLeft + pointerX) * 100_000_000

    await act(async () => {
      fireEvent.wheel(viewport, { ctrlKey: true, clientX: 250, deltaY: -240 })
      await new Promise((resolve) => window.requestAnimationFrame(resolve))
    })

    expect(screen.getByLabelText('Zoom 50ms per pixel')).toBeInTheDocument()
    queryCapturedMessages.mockClear()
    fireEvent.click(viewport, { clientX: 250, clientY: 60 })
    await waitFor(() => {
      expect(queryCapturedMessages).toHaveBeenCalledWith(expect.objectContaining({
        endTimestampUs: BigInt(Math.floor(timestampUnderPointerBeforeNs / 1000)),
        sortOrder: 'desc',
      }))
    })
  })

  it('keeps the timestamp under the pointer stable during rapid ctrl wheel zoom', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
    const deviceState = buildRangeDeviceState(2_000_000_000n)
    const { queryCapturedMessages } = attachSelectionDriver(deviceState)
    renderTimestrip(deviceState)
    const viewport = screen.getByTestId('drpd-timestrip-viewport')
    setViewportGeometry(viewport)
    const pointerX = 150

    await waitFor(() => {
      expect(screen.getByTestId('drpd-timestrip-timeline')).toHaveStyle({
        width: '20250px',
      })
    })

    const initialScrollLeft = 5000
    scrollViewportTo(viewport, initialScrollLeft)
    const timestampUnderPointerBeforeNs = (initialScrollLeft + pointerX) * 100_000_000

    await act(async () => {
      fireEvent.wheel(viewport, { ctrlKey: true, clientX: 250, deltaY: -240 })
      fireEvent.wheel(viewport, { ctrlKey: true, clientX: 250, deltaY: -240 })
      fireEvent.wheel(viewport, { ctrlKey: true, clientX: 250, deltaY: -240 })
      fireEvent.wheel(viewport, { ctrlKey: true, clientX: 250, deltaY: -240 })
      await new Promise((resolve) => window.requestAnimationFrame(resolve))
    })

    expect(screen.getByLabelText('Zoom 5ms per pixel')).toBeInTheDocument()
    queryCapturedMessages.mockClear()
    fireEvent.click(viewport, { clientX: 250, clientY: 60 })
    await waitFor(() => {
      expect(queryCapturedMessages).toHaveBeenCalledWith(expect.objectContaining({
        endTimestampUs: BigInt(Math.floor(timestampUnderPointerBeforeNs / 1000)),
        sortOrder: 'desc',
      }))
    })
  })

  it('keeps the timestamp under the pointer stable during ctrl wheel zoom out', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
    window.localStorage.setItem('drpd:timestrip:zoom-denominator', '50000000')
    const deviceState = buildRangeDeviceState(2_000_000_000n)
    const { queryCapturedMessages } = attachSelectionDriver(deviceState)
    renderTimestrip(deviceState)
    const viewport = screen.getByTestId('drpd-timestrip-viewport')
    setViewportGeometry(viewport)
    const pointerX = 320

    await waitFor(() => {
      expect(screen.getByTestId('drpd-timestrip-timeline')).toHaveStyle({
        width: '40250px',
      })
    })

    const initialScrollLeft = 10_000
    scrollViewportTo(viewport, initialScrollLeft)
    const timestampUnderPointerBeforeNs = (initialScrollLeft + pointerX) * 50_000_000

    await act(async () => {
      fireEvent.wheel(viewport, { ctrlKey: true, clientX: 420, deltaY: 240 })
      await new Promise((resolve) => window.requestAnimationFrame(resolve))
    })

    expect(screen.getByLabelText('Zoom 100ms per pixel')).toBeInTheDocument()
    queryCapturedMessages.mockClear()
    fireEvent.click(viewport, { clientX: 420, clientY: 60 })
    await waitFor(() => {
      expect(queryCapturedMessages).toHaveBeenCalledWith(expect.objectContaining({
        endTimestampUs: BigInt(Math.floor(timestampUnderPointerBeforeNs / 1000)),
        sortOrder: 'desc',
      }))
    })
  })

  it('keeps ctrl wheel zoom pointer-stable when DOM scroll scaling is active', async () => {
    window.localStorage.setItem('drpd:timestrip:zoom-denominator', '1000')
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
    const deviceState = buildRangeDeviceState(100_000_000n)
    const { queryCapturedMessages } = attachSelectionDriver(deviceState)
    renderTimestrip(deviceState)
    const viewport = screen.getByTestId('drpd-timestrip-viewport')
    setViewportGeometry(viewport)
    const pointerX = 250

    await waitFor(() => {
      expect(screen.getByTestId('drpd-timestrip-timeline')).toHaveStyle({
        width: '16000000px',
      })
    })

    const initialScrollLeft = 4_000_000
    scrollViewportTo(viewport, initialScrollLeft)
    const beforeScale = (100_000_000 - 500) / (16_000_000 - 500)
    const timestampUnderPointerBeforeNs = (initialScrollLeft * beforeScale + pointerX) * 1000

    await act(async () => {
      fireEvent.wheel(viewport, { ctrlKey: true, clientX: 350, deltaY: -240 })
      await new Promise((resolve) => window.requestAnimationFrame(resolve))
    })

    expect(screen.getByLabelText('Zoom 500ns per pixel')).toBeInTheDocument()
    queryCapturedMessages.mockClear()
    fireEvent.click(viewport, { clientX: 350, clientY: 60 })
    await waitFor(() => {
      expect(queryCapturedMessages).toHaveBeenCalledWith(expect.objectContaining({
        endTimestampUs: BigInt(Math.floor(timestampUnderPointerBeforeNs / 1000)),
        sortOrder: 'desc',
      }))
    })
  })

  it('does not publish stale DOM-scaled scroll when zoom crosses below 100µs', async () => {
    window.localStorage.setItem('drpd:timestrip:zoom-denominator', '100000')
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
    const queryCapturedMessages = vi.fn(async (query: {
      sortOrder?: 'asc' | 'desc'
      timeBasis?: 'device' | 'wallClock'
    }) => {
      if (query.timeBasis === 'wallClock') {
        return []
      }
      if (query.sortOrder) {
        return [
          buildCapturedMessage({
            startTimestampUs: query.sortOrder === 'desc' ? 1_000_000_000n : 0n,
            endTimestampUs: query.sortOrder === 'desc' ? 1_000_000_000n : 1_000n,
            createdAtMs: query.sortOrder === 'desc' ? 2 : 1,
          }),
        ]
      }
      return []
    })
    const setLogSelectionState = vi.fn()
    const deviceState = {
      ...buildDeviceState(queryCapturedMessages),
      drpdDriver: {
        queryCapturedMessages,
        setLogSelectionState,
      },
    } as unknown as RackDeviceState
    renderTimestrip(deviceState)
    const viewport = screen.getByTestId('drpd-timestrip-viewport')
    setViewportGeometry(viewport)

    await waitFor(() => {
      expect(screen.getByTestId('drpd-timestrip-timeline')).toHaveStyle({
        width: '10000000px',
      })
    })
    queryCapturedMessages.mockClear()
    viewport.scrollLeft = 5_000_000

    act(() => {
      fireEvent.wheel(viewport, { ctrlKey: true, clientX: 350, deltaY: -240 })
      fireEvent.scroll(viewport)
    })
    await act(async () => {
      await new Promise((resolve) => window.requestAnimationFrame(resolve))
    })
    fireEvent.click(viewport, { clientX: 350, clientY: 60 })

    await waitFor(() => {
      expect(queryCapturedMessages).toHaveBeenCalledWith(expect.objectContaining({
        endTimestampUs: 500_025_000n,
        limit: 1,
        sortOrder: 'desc',
      }))
    })
  })

  it('clamps ctrl wheel zoom at the left edge only when the pinned timestamp would need negative scroll', () => {
    window.localStorage.setItem('drpd:timestrip:zoom-denominator', '50000000')
    renderTimestrip()
    const viewport = screen.getByTestId('drpd-timestrip-viewport')
    setViewportGeometry(viewport)
    viewport.scrollLeft = 0

    act(() => {
      fireEvent.wheel(viewport, { ctrlKey: true, clientX: 450, deltaY: 240 })
    })

    expect(screen.getByLabelText('Zoom 100ms per pixel')).toBeInTheDocument()
    expect(viewport.scrollLeft).toBe(0)
  })

  it('follows the latest datum by default when no packet is selected', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
    const queryCapturedMessages = vi.fn(async (query: { sortOrder?: 'asc' | 'desc'; timeBasis?: 'device' | 'wallClock' }) => {
      if (query.timeBasis === 'wallClock') {
        return []
      }
      return [
        buildCapturedMessage({
          startTimestampUs: query.sortOrder === 'desc' ? 200_000_000n : 0n,
          endTimestampUs: query.sortOrder === 'desc' ? 200_000_000n : 1_000n,
          createdAtMs: query.sortOrder === 'desc' ? 2 : 1,
        }),
      ]
    })
    const deviceState = buildDeviceState(queryCapturedMessages)
    attachSelectionDriver(deviceState)
    renderTimestrip(deviceState)
    const viewport = screen.getByTestId('drpd-timestrip-viewport')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Following live' })).toBeInTheDocument()
      expect(viewport.scrollLeft).toBe(1750)
    })
  })

  it('pauses live follow on ctrl wheel and keeps the pointer timestamp stable', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
    const queryCapturedMessages = vi.fn(async (query: { sortOrder?: 'asc' | 'desc'; timeBasis?: 'device' | 'wallClock' }) => {
      if (query.timeBasis === 'wallClock') {
        return []
      }
      return [
        buildCapturedMessage({
          startTimestampUs: query.sortOrder === 'desc' ? 200_000_000n : 0n,
          endTimestampUs: query.sortOrder === 'desc' ? 200_000_000n : 1_000n,
          createdAtMs: query.sortOrder === 'desc' ? 2 : 1,
        }),
      ]
    })
    const deviceState = buildDeviceState(queryCapturedMessages)
    attachSelectionDriver(deviceState)
    renderTimestrip(deviceState)
    const viewport = screen.getByTestId('drpd-timestrip-viewport')
    setViewportGeometry(viewport)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Following live' })).toBeInTheDocument()
      expect(viewport.scrollLeft).toBe(1750)
    })

    const pointerX = 250
    const timestampUnderPointerBeforeNs = (viewport.scrollLeft + pointerX) * 100_000_000
    await act(async () => {
      fireEvent.wheel(viewport, { ctrlKey: true, clientX: 350, deltaY: -240 })
      await new Promise((resolve) => window.requestAnimationFrame(resolve))
    })

    expect(screen.getByRole('button', { name: 'Follow live' })).toBeInTheDocument()
    expect(screen.getByLabelText('Zoom 50ms per pixel')).toBeInTheDocument()
    queryCapturedMessages.mockClear()
    fireEvent.click(viewport, { clientX: 350, clientY: 60 })
    await waitFor(() => {
      expect(queryCapturedMessages).toHaveBeenCalledWith(expect.objectContaining({
        endTimestampUs: BigInt(Math.floor(timestampUnderPointerBeforeNs / 1000)),
        sortOrder: 'desc',
      }))
    })
  })

  it('pauses live follow on manual scroll and resumes from Follow live', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
    const eventTarget = new EventTarget()
    const queryCapturedMessages = vi.fn(async (query: { sortOrder?: 'asc' | 'desc'; timeBasis?: 'device' | 'wallClock' }) => {
      if (query.timeBasis === 'wallClock') {
        return []
      }
      return [
        buildCapturedMessage({
          startTimestampUs: query.sortOrder === 'desc' ? 200_000_000n : 0n,
          endTimestampUs: query.sortOrder === 'desc' ? 200_000_000n : 1_000n,
          createdAtMs: query.sortOrder === 'desc' ? 2 : 1,
        }),
      ]
    })
    const deviceState = {
      ...buildDeviceState(queryCapturedMessages),
      drpdDriver: {
        queryCapturedMessages,
        addEventListener: eventTarget.addEventListener.bind(eventTarget),
        removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
      },
    } as unknown as RackDeviceState
    renderTimestrip(deviceState)
    const viewport = screen.getByTestId('drpd-timestrip-viewport')

    await waitFor(() => {
      expect(viewport.scrollLeft).toBe(1750)
    })

    viewport.scrollLeft = 0
    fireEvent.scroll(viewport)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Follow live' })).toBeInTheDocument()
    })

    await act(async () => {
      eventTarget.dispatchEvent(new CustomEvent(DRPDDevice.LOG_ENTRY_ADDED_EVENT, {
        detail: {
          kind: 'message',
          row: buildCapturedMessage({
            startTimestampUs: 300_000_000n,
            endTimestampUs: 300_000_000n,
            createdAtMs: 3,
          }),
        },
      }))
      await new Promise((resolve) => window.requestAnimationFrame(resolve))
    })

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(viewport.scrollLeft).toBe(0)

    fireEvent.click(screen.getByRole('button', { name: 'Follow live' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Following live' })).toBeInTheDocument()
      expect(viewport.scrollLeft).toBeCloseTo(2750, 6)
    })

    fireEvent.scroll(viewport)

    expect(screen.getByRole('button', { name: 'Following live' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Following live' }))
  })

  it('clears the selected message when Follow live resumes live follow', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
    const eventTarget = new EventTarget()
    const selectedRow = buildCapturedMessage({
      startTimestampUs: 60_000_000n,
      endTimestampUs: 60_001_000n,
      createdAtMs: 77,
    })
    const selectedKey = buildCapturedLogSelectionKey(selectedRow)
    let logSelection: DRPDLogSelectionState = {
      selectedKeys: [],
      anchorIndex: null,
      activeIndex: null,
    }
    const queryCapturedMessages = vi.fn(async (query: {
      startTimestampUs: bigint
      endTimestampUs: bigint
      sortOrder?: 'asc' | 'desc'
      timeBasis?: 'device' | 'wallClock'
    }) => {
      if (query.timeBasis === 'wallClock') {
        return []
      }
      if (
        query.startTimestampUs === selectedRow.startTimestampUs &&
        query.endTimestampUs === selectedRow.endTimestampUs
      ) {
        return [selectedRow]
      }
      return [
        buildCapturedMessage({
          startTimestampUs: query.sortOrder === 'desc' ? 200_000_000n : 0n,
          endTimestampUs: query.sortOrder === 'desc' ? 200_000_000n : 1_000n,
          createdAtMs: query.sortOrder === 'desc' ? 2 : 1,
        }),
      ]
    })
    const clearLogSelection = vi.fn(() => {
      logSelection = {
        selectedKeys: [],
        anchorIndex: null,
        activeIndex: null,
      }
      eventTarget.dispatchEvent(new CustomEvent(DRPDDevice.STATE_UPDATED_EVENT, {
        detail: { changed: ['logSelection'] },
      }))
    })
    const deviceState = {
      ...buildDeviceState(queryCapturedMessages),
      drpdDriver: {
        queryCapturedMessages,
        getLogSelectionState: vi.fn(() => logSelection),
        clearLogSelection,
        addEventListener: eventTarget.addEventListener.bind(eventTarget),
        removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
      },
    } as unknown as RackDeviceState
    renderTimestrip(deviceState)
    const viewport = screen.getByTestId('drpd-timestrip-viewport')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Following live' })).toBeInTheDocument()
      expect(viewport.scrollLeft).toBe(1750)
    })

    act(() => {
      logSelection = {
        selectedKeys: [selectedKey],
        anchorIndex: 10,
        activeIndex: 10,
      }
      eventTarget.dispatchEvent(new CustomEvent(DRPDDevice.STATE_UPDATED_EVENT, {
        detail: { changed: ['logSelection'] },
      }))
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Follow live' })).toBeInTheDocument()
      expect(viewport.scrollLeft).toBe(350)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Follow live' }))

    await waitFor(() => {
      expect(clearLogSelection).toHaveBeenCalledTimes(1)
      expect(screen.getByRole('button', { name: 'Following live' })).toBeInTheDocument()
      expect(viewport.scrollLeft).toBe(1750)
    })
  })

  it('disables live follow when zoomed in past 16ms per pixel', async () => {
    window.localStorage.setItem('drpd:timestrip:zoom-denominator', '1000')
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
    const queryCapturedMessages = vi.fn(async (query: { sortOrder?: 'asc' | 'desc'; timeBasis?: 'device' | 'wallClock' }) => {
      if (query.timeBasis === 'wallClock') {
        return []
      }
      return [
        buildCapturedMessage({
          startTimestampUs: query.sortOrder === 'desc' ? 200_000n : 0n,
          endTimestampUs: query.sortOrder === 'desc' ? 200_000n : 1_000n,
          createdAtMs: query.sortOrder === 'desc' ? 2 : 1,
        }),
      ]
    })
    renderTimestrip(buildDeviceState(queryCapturedMessages))
    const viewport = screen.getByTestId('drpd-timestrip-viewport')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Follow unavailable' })).toBeDisabled()
      expect(screen.getByTestId('drpd-timestrip-timeline')).toHaveStyle({
        width: '200000px',
      })
    })
    expect(viewport.scrollLeft).toBe(0)
  })

  it('keeps following when a short empty-start log emits late follow scroll events', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
    const eventTarget = new EventTarget()
    const queryCapturedMessages = vi.fn(async () => [])
    const deviceState = {
      ...buildDeviceState(queryCapturedMessages),
      drpdDriver: {
        queryCapturedMessages,
        addEventListener: eventTarget.addEventListener.bind(eventTarget),
        removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
      },
    } as unknown as RackDeviceState
    renderTimestrip(deviceState)
    const viewport = screen.getByTestId('drpd-timestrip-viewport')

    act(() => {
      eventTarget.dispatchEvent(new CustomEvent(DRPDDevice.LOG_ENTRY_ADDED_EVENT, {
        detail: {
          kind: 'message',
          row: buildCapturedMessage({
            startTimestampUs: 0n,
            endTimestampUs: 100_000_000n,
            createdAtMs: 1,
          }),
        },
      }))
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Following live' })).toBeInTheDocument()
      expect(viewport.scrollLeft).toBe(750)
    })

    act(() => {
      eventTarget.dispatchEvent(new CustomEvent(DRPDDevice.LOG_ENTRY_ADDED_EVENT, {
        detail: {
          kind: 'message',
          row: buildCapturedMessage({
            startTimestampUs: 120_000_000n,
            endTimestampUs: 120_001_000n,
            createdAtMs: 2,
          }),
        },
      }))
    })

    await waitFor(() => {
      expect(viewport.scrollLeft).toBeCloseTo(950, 0)
    })

    viewport.scrollLeft = 750
    fireEvent.scroll(viewport)

    expect(screen.getByRole('button', { name: 'Following live' })).toBeInTheDocument()
  })

  it('sizes the timeline from message-log wall-clock range when available', async () => {
    const queryCapturedMessages = vi.fn(async (query: { sortOrder?: 'asc' | 'desc' }) => [
      {
        wallClockUs:
          query.sortOrder === 'desc'
            ? 1_700_000_004_000_000n
            : 1_700_000_000_000_000n,
        startTimestampUs:
          query.sortOrder === 'desc'
            ? 10_000_000n
            : 6_000_000n,
        endTimestampUs:
          query.sortOrder === 'desc'
            ? 10_000_000n
            : 6_000_000n,
      },
    ])
    renderTimestrip(buildDeviceState(queryCapturedMessages))

    await waitFor(() => {
      expect(screen.getByTestId('drpd-timestrip-timeline')).toHaveStyle({
        width: '40px',
      })
    })
  })

  it('includes analog samples when sizing the timeline range', async () => {
    const queryCapturedMessages = vi.fn(async (query: { sortOrder?: 'asc' | 'desc' }) => [
      buildCapturedMessage({
        wallClockUs:
          query.sortOrder === 'desc'
            ? 1_700_000_004_000_000n
            : 1_700_000_002_000_000n,
        startTimestampUs:
          query.sortOrder === 'desc'
            ? 10_000_000n
            : 8_000_000n,
        endTimestampUs:
          query.sortOrder === 'desc'
            ? 10_000_000n
            : 8_000_000n,
      }),
    ])
    const queryAnalogSamples = vi.fn(async (query: { sortOrder?: 'asc' | 'desc' }) => [
      buildAnalogSample({
        wallClockUs:
          query.sortOrder === 'desc'
            ? 1_700_000_010_000_000n
            : 1_700_000_000_000_000n,
        timestampUs:
          query.sortOrder === 'desc'
            ? 16_000_000n
            : 6_000_000n,
      }),
    ])
    renderTimestrip(buildDeviceState(queryCapturedMessages, queryAnalogSamples))

    await waitFor(() => {
      expect(screen.getByTestId('drpd-timestrip-timeline')).toHaveStyle({
        width: '100px',
      })
    })
    expect(queryAnalogSamples).toHaveBeenCalledWith(expect.objectContaining({
      sortOrder: 'desc',
      limit: 1,
    }))
  })

  it('keeps older device-time rows in range when active capture has newer wall-clock rows', async () => {
    const queryCapturedMessages = vi.fn(
      async (query: { timeBasis?: 'device' | 'wallClock'; sortOrder?: 'asc' | 'desc' }) => {
        if (query.timeBasis === 'wallClock') {
          return [
            buildCapturedMessage({
              wallClockUs:
                query.sortOrder === 'desc'
                  ? 1_700_000_015_000_000n
                  : 1_700_000_010_000_000n,
              startTimestampUs:
                query.sortOrder === 'desc'
                  ? 20_000_000n
                  : 15_000_000n,
              endTimestampUs:
                query.sortOrder === 'desc'
                  ? 20_000_000n
                  : 15_000_000n,
            }),
          ]
        }
        return [
          buildCapturedMessage({
            wallClockUs: null,
            startTimestampUs:
              query.sortOrder === 'desc'
                ? 20_000_000n
                : 1_000_000n,
            endTimestampUs:
              query.sortOrder === 'desc'
                ? 20_000_000n
                : 1_000_000n,
          }),
        ]
      },
    )
    renderTimestrip(buildDeviceState(queryCapturedMessages))

    await waitFor(() => {
      expect(screen.getByTestId('drpd-timestrip-timeline')).toHaveStyle({
        width: '190px',
      })
    })
    expect(queryCapturedMessages).toHaveBeenCalledWith(expect.objectContaining({
      timeBasis: 'wallClock',
      sortOrder: 'asc',
    }))
    expect(queryCapturedMessages).toHaveBeenCalledWith(expect.objectContaining({
      sortOrder: 'asc',
    }))
  })

  it('queries visible digital rows by wall-clock time when wall-clock sync is available', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
    const queryCapturedMessages = vi.fn(async (query: { timeBasis?: 'device' | 'wallClock'; sortOrder?: 'asc' | 'desc' }) => {
      if (query.timeBasis === 'wallClock') {
        return [
          {
            ...buildCapturedMessage({
              wallClockUs:
                query.sortOrder === 'desc'
                  ? 1_700_000_004_000_000n
                  : 1_700_000_000_000_000n,
              startTimestampUs:
                query.sortOrder === 'desc'
                  ? 10_000_000n
                  : 6_000_000n,
              endTimestampUs:
                query.sortOrder === 'desc'
                  ? 10_000_000n
                  : 6_000_000n,
            }),
          },
        ]
      }
      return []
    })
    renderTimestrip(buildDeviceState(queryCapturedMessages))

    await waitFor(() => {
      expect(queryCapturedMessages).toHaveBeenCalledWith(
        expect.objectContaining({
          timeBasis: 'wallClock',
          startTimestampUs: 1_700_000_000_000_000n,
          endTimestampUs: 1_700_000_152_400_000n,
        }),
      )
    })
  })

  it('queries visible analog rows by the same wall-clock basis as the timeline', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
    const queryCapturedMessages = vi.fn(async (query: { sortOrder?: 'asc' | 'desc' }) => [
      buildCapturedMessage({
        wallClockUs:
          query.sortOrder === 'desc'
            ? 1_700_000_004_000_000n
            : 1_700_000_000_000_000n,
        startTimestampUs:
          query.sortOrder === 'desc'
            ? 10_000_000n
            : 6_000_000n,
        endTimestampUs:
          query.sortOrder === 'desc'
            ? 10_000_000n
            : 6_000_000n,
      }),
    ])
    const queryAnalogSamples = vi.fn(async () => [
      buildAnalogSample({
        wallClockUs: 1_700_000_001_000_000n,
        timestampUs: 7_000_000n,
      }),
    ])
    renderTimestrip(buildDeviceState(queryCapturedMessages, queryAnalogSamples))

    await waitFor(() => {
      expect(queryAnalogSamples).toHaveBeenCalledWith(
        expect.objectContaining({
          timeBasis: 'wallClock',
          startTimestampUs: 1_700_000_000_000_000n,
          endTimestampUs: 1_700_000_152_400_000n,
        }),
      )
    })
  })

  it('loads analog samples around the visible range so sparse traces render on initial high zoom', async () => {
    window.localStorage.setItem('drpd:timestrip:zoom-denominator', '32000')
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(240)
    const queryCapturedMessages = vi.fn(async (query: { sortOrder?: 'asc' | 'desc' }) => [
      buildCapturedMessage({
        startTimestampUs: query.sortOrder === 'desc' ? 1_000_000n : 0n,
        endTimestampUs: query.sortOrder === 'desc' ? 1_000_000n : 1_000n,
        createdAtMs: query.sortOrder === 'desc' ? 2 : 1,
      }),
    ])
    const analogRows = [
      buildAnalogSample({ timestampUs: 260_000n, vbusV: 10, ibusA: 1, createdAtMs: 1 }),
      buildAnalogSample({ timestampUs: 400_000n, vbusV: 20, ibusA: 2, createdAtMs: 2 }),
    ]
    const queryAnalogSamples = vi.fn(async (query: {
      startTimestampUs: bigint
      endTimestampUs: bigint
      sortOrder?: 'asc' | 'desc'
      limit?: number
    }) => {
      const rows = analogRows
        .filter((row) => row.timestampUs >= query.startTimestampUs && row.timestampUs <= query.endTimestampUs)
        .sort((left, right) => {
          const cmp = left.timestampUs < right.timestampUs ? -1 : left.timestampUs > right.timestampUs ? 1 : 0
          return query.sortOrder === 'desc' ? -cmp : cmp
        })
      return typeof query.limit === 'number' ? rows.slice(0, query.limit) : rows
    })
    renderTimestrip(buildDeviceState(queryCapturedMessages, queryAnalogSamples))
    const viewport = screen.getByTestId('drpd-timestrip-viewport')
    viewport.getBoundingClientRect = () =>
      ({
        left: 100,
        right: 600,
        top: 10,
        bottom: 250,
        width: 500,
        height: 240,
        x: 100,
        y: 10,
        toJSON: () => ({}),
      }) as DOMRect

    await waitFor(() => {
      expect(screen.getByLabelText('Zoom 32µs per pixel')).toBeInTheDocument()
    })

    viewport.scrollLeft = 10_000
    fireEvent.scroll(viewport)

    await waitFor(() => {
      expect(queryAnalogSamples).toHaveBeenCalledWith(expect.objectContaining({
        endTimestampUs: 287_231n,
        sortOrder: 'desc',
        limit: 1,
      }))
      expect(queryAnalogSamples).toHaveBeenCalledWith(expect.objectContaining({
        startTimestampUs: 368_769n,
        sortOrder: 'asc',
        limit: 1,
      }))
    })

    fireEvent.mouseMove(viewport, { clientX: 350, clientY: 150 })

    const overlay = await screen.findByTestId('drpd-timestrip-analog-hover')
    expect(overlay).toHaveTextContent('14.86V')
    expect(overlay).toHaveTextContent('1.486A')
  })

  it('centers the beginning of the selected message on the timestrip', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
    const eventTarget = new EventTarget()
    const selectedRow = buildCapturedMessage({
      startTimestampUs: 60_000_000n,
      endTimestampUs: 60_001_000n,
      createdAtMs: 77,
    })
    const selectedKey = buildCapturedLogSelectionKey(selectedRow)
    let logSelection: DRPDLogSelectionState = {
      selectedKeys: [],
      anchorIndex: null,
      activeIndex: null,
    }
    const queryCapturedMessages = vi.fn(async (query: {
      startTimestampUs: bigint
      endTimestampUs: bigint
      sortOrder?: 'asc' | 'desc'
      timeBasis?: 'device' | 'wallClock'
    }) => {
      if (query.timeBasis === 'wallClock') {
        return []
      }
      if (
        query.startTimestampUs === selectedRow.startTimestampUs &&
        query.endTimestampUs === selectedRow.endTimestampUs
      ) {
        return [selectedRow]
      }
      return [
        buildCapturedMessage({
          startTimestampUs: query.sortOrder === 'desc' ? 100_000_000n : 0n,
          endTimestampUs: query.sortOrder === 'desc' ? 100_000_000n : 1_000n,
          createdAtMs: query.sortOrder === 'desc' ? 2 : 1,
        }),
      ]
    })
    const deviceState = {
      ...buildDeviceState(queryCapturedMessages),
      drpdDriver: {
        queryCapturedMessages,
        getLogSelectionState: vi.fn(() => logSelection),
        addEventListener: eventTarget.addEventListener.bind(eventTarget),
        removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
      },
    } as unknown as RackDeviceState
    renderTimestrip(deviceState)
    const viewport = screen.getByTestId('drpd-timestrip-viewport')

    await waitFor(() => {
      expect(screen.getByTestId('drpd-timestrip-timeline')).toHaveStyle({
        width: '1250px',
      })
    })

    act(() => {
      logSelection = {
        selectedKeys: [selectedKey],
        anchorIndex: 10,
        activeIndex: 10,
      }
      eventTarget.dispatchEvent(new CustomEvent(DRPDDevice.STATE_UPDATED_EVENT, {
        detail: { changed: ['logSelection'] },
      }))
    })

    await waitFor(() => {
      expect(viewport.scrollLeft).toBe(350)
    })
    expect(queryCapturedMessages).toHaveBeenCalledWith(expect.objectContaining({
      startTimestampUs: 60_000_000n,
      endTimestampUs: 60_001_000n,
      timeBasis: 'device',
      sortOrder: 'asc',
    }))
  })

  it('centers a selected event and pauses live follow', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
    const eventTarget = new EventTarget()
    const selectedRow = buildCapturedMessage({
      entryKind: 'event',
      eventType: 'capture_changed',
      eventText: 'Capture turned off',
      startTimestampUs: 60_000_000n,
      endTimestampUs: 60_000_000n,
      rawSop: new Uint8Array(),
      rawDecodedData: new Uint8Array(),
      createdAtMs: 77,
    })
    const selectedKey = buildCapturedLogSelectionKey(selectedRow)
    let logSelection: DRPDLogSelectionState = {
      selectedKeys: [],
      anchorIndex: null,
      activeIndex: null,
    }
    const queryCapturedMessages = vi.fn(async (query: {
      startTimestampUs: bigint
      endTimestampUs: bigint
      sortOrder?: 'asc' | 'desc'
      timeBasis?: 'device' | 'wallClock'
    }) => {
      if (query.timeBasis === 'wallClock') {
        return []
      }
      if (
        query.startTimestampUs === selectedRow.startTimestampUs &&
        query.endTimestampUs === selectedRow.endTimestampUs
      ) {
        return [selectedRow]
      }
      return [
        buildCapturedMessage({
          startTimestampUs: query.sortOrder === 'desc' ? 200_000_000n : 0n,
          endTimestampUs: query.sortOrder === 'desc' ? 200_000_000n : 1_000n,
          createdAtMs: query.sortOrder === 'desc' ? 2 : 1,
        }),
      ]
    })
    const deviceState = {
      ...buildDeviceState(queryCapturedMessages),
      drpdDriver: {
        queryCapturedMessages,
        getLogSelectionState: vi.fn(() => logSelection),
        addEventListener: eventTarget.addEventListener.bind(eventTarget),
        removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
      },
    } as unknown as RackDeviceState
    renderTimestrip(deviceState)
    const viewport = screen.getByTestId('drpd-timestrip-viewport')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Following live' })).toBeInTheDocument()
      expect(viewport.scrollLeft).toBe(1750)
    })

    act(() => {
      logSelection = {
        selectedKeys: [selectedKey],
        anchorIndex: 10,
        activeIndex: 10,
      }
      eventTarget.dispatchEvent(new CustomEvent(DRPDDevice.STATE_UPDATED_EVENT, {
        detail: { changed: ['logSelection'] },
      }))
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Follow live' })).toBeInTheDocument()
      expect(viewport.scrollLeft).toBe(350)
    })
    expect(queryCapturedMessages).toHaveBeenCalledWith(expect.objectContaining({
      startTimestampUs: 60_000_000n,
      endTimestampUs: 60_000_000n,
      timeBasis: 'device',
      sortOrder: 'asc',
    }))
  })

  it('selects the nearest message-log row when clicking the timestrip', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
    const rows = [
      buildCapturedMessage({
        startTimestampUs: 10_000_000n,
        endTimestampUs: 10_001_000n,
        createdAtMs: 1,
      }),
      buildCapturedMessage({
        entryKind: 'event',
        eventType: 'mark',
        eventText: 'Mark',
        startTimestampUs: 15_000_000n,
        endTimestampUs: 15_000_000n,
        rawSop: new Uint8Array(),
        rawDecodedData: new Uint8Array(),
        createdAtMs: 2,
      }),
      buildCapturedMessage({
        startTimestampUs: 20_000_000n,
        endTimestampUs: 20_001_000n,
        createdAtMs: 3,
      }),
    ]
    const queryCapturedMessages = vi.fn(async (query: {
      startTimestampUs: bigint
      endTimestampUs: bigint
      sortOrder?: 'asc' | 'desc'
      timeBasis?: 'device' | 'wallClock'
      limit?: number
    }) => {
      if (query.timeBasis === 'wallClock') {
        return []
      }
      const matches = rows
        .filter((row) => (
          row.startTimestampUs >= query.startTimestampUs &&
          row.startTimestampUs <= query.endTimestampUs
        ))
        .sort((left, right) => {
          const cmp = left.startTimestampUs < right.startTimestampUs
            ? -1
            : left.startTimestampUs > right.startTimestampUs
              ? 1
              : 0
          return query.sortOrder === 'desc' ? -cmp : cmp
        })
      return typeof query.limit === 'number' ? matches.slice(0, query.limit) : matches
    })
    const setLogSelectionState = vi.fn(async () => undefined)
    const deviceState = {
      ...buildDeviceState(queryCapturedMessages),
      drpdDriver: {
        queryCapturedMessages,
        setLogSelectionState,
      },
    } as unknown as RackDeviceState
    renderTimestrip(deviceState)
    const viewport = screen.getByTestId('drpd-timestrip-viewport')
    viewport.getBoundingClientRect = () =>
      ({
        left: 100,
        right: 600,
        top: 10,
        bottom: 110,
        width: 500,
        height: 100,
        x: 100,
        y: 10,
        toJSON: () => ({}),
      }) as DOMRect

    await waitFor(() => {
      expect(screen.getByTestId('drpd-timestrip-timeline')).toHaveStyle({
        width: '500px',
      })
    })

    fireEvent.click(viewport, { clientX: 152, clientY: 60 })

    await waitFor(() => {
      expect(setLogSelectionState).toHaveBeenCalledWith({
        selectedKeys: [buildCapturedLogSelectionKey(rows[1])],
        anchorIndex: null,
        activeIndex: null,
      })
    })
    expect(queryCapturedMessages).toHaveBeenCalledWith(expect.objectContaining({
      endTimestampUs: 15_200_000n,
      sortOrder: 'desc',
      limit: 1,
    }))
    expect(queryCapturedMessages).toHaveBeenCalledWith(expect.objectContaining({
      startTimestampUs: 15_200_001n,
      sortOrder: 'asc',
      limit: 1,
    }))
  })

  it('uses a scaled scrollbar when the zoomed timeline exceeds browser scrollable width limits', async () => {
    window.localStorage.setItem('drpd:timestrip:zoom-denominator', '500')
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
    const eventTarget = new EventTarget()
    const selectedRow = buildCapturedMessage({
      startTimestampUs: 990_000_000n,
      endTimestampUs: 990_001_000n,
      createdAtMs: 77,
    })
    const selectedKey = buildCapturedLogSelectionKey(selectedRow)
    let logSelection: DRPDLogSelectionState = {
      selectedKeys: [],
      anchorIndex: null,
      activeIndex: null,
    }
    const queryCapturedMessages = vi.fn(async (query: {
      startTimestampUs: bigint
      endTimestampUs: bigint
      sortOrder?: 'asc' | 'desc'
      timeBasis?: 'device' | 'wallClock'
    }) => {
      if (query.timeBasis === 'wallClock') {
        return []
      }
      if (
        query.startTimestampUs === selectedRow.startTimestampUs &&
        query.endTimestampUs === selectedRow.endTimestampUs
      ) {
        return [selectedRow]
      }
      return [
        buildCapturedMessage({
          startTimestampUs: query.sortOrder === 'desc' ? 1_000_000_000n : 0n,
          endTimestampUs: query.sortOrder === 'desc' ? 1_000_000_000n : 1_000n,
          createdAtMs: query.sortOrder === 'desc' ? 2 : 1,
        }),
      ]
    })
    const deviceState = {
      ...buildDeviceState(queryCapturedMessages),
      drpdDriver: {
        queryCapturedMessages,
        getLogSelectionState: vi.fn(() => logSelection),
        addEventListener: eventTarget.addEventListener.bind(eventTarget),
        removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
      },
    } as unknown as RackDeviceState
    renderTimestrip(deviceState)
    const viewport = screen.getByTestId('drpd-timestrip-viewport')

    await waitFor(() => {
      expect(screen.getByTestId('drpd-timestrip-timeline')).toHaveStyle({
        width: '16000000px',
      })
    })

    act(() => {
      logSelection = {
        selectedKeys: [selectedKey],
        anchorIndex: 10,
        activeIndex: 10,
      }
      eventTarget.dispatchEvent(new CustomEvent(DRPDDevice.STATE_UPDATED_EVENT, {
        detail: { changed: ['logSelection'] },
      }))
    })

    await waitFor(() => {
      expect(viewport.scrollLeft).toBeGreaterThan(15_000_000)
    })
    expect(viewport.scrollLeft).toBeLessThan(16_000_000)
  })

  it('shows interpolated analog values when hovering the analog lane', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(240)
    const queryCapturedMessages = vi.fn(async () => [])
    const queryAnalogSamples = vi.fn(async () => [
      buildAnalogSample({
        timestampUs: 0n,
        vbusV: 10,
        ibusA: 1,
      }),
      buildAnalogSample({
        timestampUs: 50_000_000n,
        vbusV: 20,
        ibusA: 2,
      }),
    ])
    renderTimestrip(buildDeviceState(queryCapturedMessages, queryAnalogSamples))
    const viewport = screen.getByTestId('drpd-timestrip-viewport')
    viewport.getBoundingClientRect = () =>
      ({
        left: 100,
        right: 600,
        top: 10,
        bottom: 250,
        width: 500,
        height: 240,
        x: 100,
        y: 10,
        toJSON: () => ({}),
      }) as DOMRect

    await waitFor(() => {
      expect(queryAnalogSamples).toHaveBeenCalledWith(expect.objectContaining({
        sortOrder: 'asc',
        limit: 8000,
      }))
    })

    fireEvent.mouseMove(viewport, { clientX: 350, clientY: 150 })

    const overlay = await screen.findByTestId('drpd-timestrip-analog-hover')
    expect(overlay).toHaveTextContent('15.00V')
    expect(overlay).toHaveTextContent('1.500A')
    expect(overlay).toHaveStyle({
      left: '294px',
      top: '140px',
    })

    fireEvent.mouseLeave(viewport)

    expect(screen.queryByTestId('drpd-timestrip-analog-hover')).toBeNull()
  })

  it('keeps the analog hover overlay under the pointer when scrolling', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(240)
    const queryCapturedMessages = vi.fn(async () => [])
    const queryAnalogSamples = vi.fn(async () => [
      buildAnalogSample({
        timestampUs: 0n,
        vbusV: 10,
        ibusA: 1,
      }),
      buildAnalogSample({
        timestampUs: 100_000_000n,
        vbusV: 30,
        ibusA: 3,
      }),
    ])
    renderTimestrip(buildDeviceState(queryCapturedMessages, queryAnalogSamples))
    const viewport = screen.getByTestId('drpd-timestrip-viewport')
    viewport.getBoundingClientRect = () =>
      ({
        left: 100,
        right: 600,
        top: 10,
        bottom: 250,
        width: 500,
        height: 240,
        x: 100,
        y: 10,
        toJSON: () => ({}),
      }) as DOMRect

    await waitFor(() => {
      expect(queryAnalogSamples).toHaveBeenCalledWith(expect.objectContaining({
        sortOrder: 'asc',
        limit: 8000,
      }))
    })

    fireEvent.mouseMove(viewport, { clientX: 350, clientY: 150 })
    const overlay = await screen.findByTestId('drpd-timestrip-analog-hover')
    expect(overlay).toHaveStyle({
      left: '294px',
      top: '140px',
    })

    viewport.scrollLeft = 200
    fireEvent.scroll(viewport)

    expect(overlay).toHaveStyle({
      left: '294px',
      top: '140px',
    })
    expect(overlay).toHaveTextContent('19.00V')
    expect(overlay).toHaveTextContent('1.900A')
  })

  it('uses the first appended log row as the timeline origin even without wall-clock sync', async () => {
    const eventTarget = new EventTarget()
    const queryCapturedMessages = vi.fn(async () => [])
    const deviceState = {
      ...buildDeviceState(queryCapturedMessages),
      drpdDriver: {
        queryCapturedMessages,
        addEventListener: eventTarget.addEventListener.bind(eventTarget),
        removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
      },
    } as unknown as RackDeviceState
    renderTimestrip(deviceState)

    act(() => {
      eventTarget.dispatchEvent(new CustomEvent(DRPDDevice.LOG_ENTRY_ADDED_EVENT, {
        detail: {
          kind: 'message',
          row: buildCapturedMessage(),
        },
      }))
    })

    await waitFor(() => {
      expect(screen.getByTestId('drpd-timestrip-timeline')).toHaveStyle({
        width: '40px',
      })
    })
  })

  it('resets the timestrip on clear even when no messages were deleted', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
    const eventTarget = new EventTarget()
    const queryCapturedMessages = vi.fn(async () => [])
    const deviceState = {
      ...buildDeviceState(queryCapturedMessages),
      drpdDriver: {
        queryCapturedMessages,
        addEventListener: eventTarget.addEventListener.bind(eventTarget),
        removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
      },
    } as unknown as RackDeviceState
    renderTimestrip(deviceState)
    const viewport = screen.getByTestId('drpd-timestrip-viewport')

    act(() => {
      eventTarget.dispatchEvent(new CustomEvent(DRPDDevice.LOG_ENTRY_ADDED_EVENT, {
        detail: {
          kind: 'message',
          row: buildCapturedMessage({
            startTimestampUs: 0n,
            endTimestampUs: 100_000_000n,
          }),
        },
      }))
    })

    await waitFor(() => {
      expect(screen.getByTestId('drpd-timestrip-timeline')).toHaveStyle({
        width: '1250px',
      })
      expect(viewport.scrollLeft).toBe(750)
    })

    act(() => {
      eventTarget.dispatchEvent(new CustomEvent(DRPDDevice.LOG_ENTRY_DELETED_EVENT, {
        detail: {
          reason: 'clear',
          messagesDeleted: 0,
          analogDeleted: 0,
        },
      }))
    })

    await waitFor(() => {
      expect(screen.getByTestId('drpd-timestrip-timeline')).toHaveStyle({
        width: '500px',
      })
      expect(viewport.scrollLeft).toBe(0)
      expect(screen.getByRole('button', { name: 'Follow live' })).toBeInTheDocument()
    })
  })
})
