import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DRPDDevice, type LoggedAnalogSample, type LoggedCapturedMessage } from '../../../lib/device'
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

  it('renders a viewport, timeline spacer, and tile canvas layer without svg', () => {
    const { container } = renderTimestrip()

    expect(screen.getByTestId('drpd-timestrip-frame')).toBeInTheDocument()
    expect(screen.getByTestId('drpd-timestrip-viewport')).toBeInTheDocument()
    expect(screen.getByTestId('drpd-timestrip-timeline')).toHaveStyle({
      width: '100px',
    })
    expect(screen.getByTestId('drpd-timestrip-tile-layer')).toBeInTheDocument()
    expect(screen.queryByTestId('drpd-timestrip-tick-canvas')).toBeNull()
    expect(screen.getByTestId('drpd-timestrip-tile-layer').querySelectorAll('canvas')).toHaveLength(3)
    expect(container.querySelectorAll('canvas')).toHaveLength(3)
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

  it('maps mouse wheel movement to horizontal viewport scroll', () => {
    renderTimestrip()
    const viewport = screen.getByTestId('drpd-timestrip-viewport')
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 500 })
    Object.defineProperty(viewport, 'scrollWidth', { configurable: true, value: 10_000 })

    fireEvent.wheel(viewport, { deltaY: 240 })

    expect(viewport.scrollLeft).toBe(240)
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

  it('keeps the timestamp under the pointer stable during ctrl wheel zoom', () => {
    renderTimestrip()
    const viewport = screen.getByTestId('drpd-timestrip-viewport')
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 500 })
    Object.defineProperty(viewport, 'scrollWidth', { configurable: true, value: 10_000 })
    viewport.scrollLeft = 5000
    viewport.getBoundingClientRect = () =>
      ({
        left: 100,
        right: 600,
        top: 0,
        bottom: 100,
        width: 500,
        height: 100,
        x: 100,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect

    fireEvent.wheel(viewport, { ctrlKey: true, clientX: 250, deltaY: -240 })

    expect(screen.getByLabelText('Zoom 50ms per pixel')).toBeInTheDocument()
    expect(viewport.scrollLeft).toBeCloseTo(10150, 2)
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
})
