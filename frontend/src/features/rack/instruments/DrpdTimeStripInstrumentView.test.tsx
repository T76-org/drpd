import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

const buildDeviceState = (queryCapturedMessages: ReturnType<typeof vi.fn>): RackDeviceState =>
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
    },
  }) as unknown as RackDeviceState

describe('DrpdTimeStripInstrumentView', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      buildCanvasContext() as unknown as CanvasRenderingContext2D,
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders a viewport, timeline spacer, and one viewport canvas without svg', () => {
    const { container } = renderTimestrip()

    expect(screen.getByTestId('drpd-timestrip-viewport')).toBeInTheDocument()
    expect(screen.getByTestId('drpd-timestrip-timeline')).toHaveStyle({
      width: '10000px',
    })
    expect(screen.getByTestId('drpd-timestrip-canvas')).toBeInstanceOf(HTMLCanvasElement)
    expect(container.querySelectorAll('canvas')).toHaveLength(1)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('renders zoom as passive header text without button or popover controls', () => {
    renderTimestrip()

    expect(screen.getByLabelText('Zoom 1:1000')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /zoom/i })).toBeNull()
    expect(screen.queryByRole('slider')).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()
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

    expect(screen.getByLabelText('Zoom 1:909')).toBeInTheDocument()
    expect(viewport.scrollLeft).toBe(0)

    fireEvent.wheel(viewport, { ctrlKey: true, deltaY: 240 })

    expect(screen.getByLabelText('Zoom 1:1000')).toBeInTheDocument()
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

    expect(screen.getByLabelText('Zoom 1:909')).toBeInTheDocument()
    expect(viewport.scrollLeft).toBeCloseTo(5515.57, 2)
  })

  it('sizes the timeline from message-log wall-clock range when available', async () => {
    const queryCapturedMessages = vi.fn(async (query: { sortOrder?: 'asc' | 'desc' }) => [
      {
        wallClockUs:
          query.sortOrder === 'desc'
            ? 1_700_000_004_000_000n
            : 1_700_000_000_000_000n,
      },
    ])
    renderTimestrip(buildDeviceState(queryCapturedMessages))

    await waitFor(() => {
      expect(screen.getByTestId('drpd-timestrip-timeline')).toHaveStyle({
        width: '4000px',
      })
    })
  })
})
