import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { RackInstrument } from '../../../lib/rack/types'
import { DrpdTimeStripInstrumentView } from './DrpdTimeStripInstrumentView'

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
const renderTimestrip = () => {
  return render(
    <DrpdTimeStripInstrumentView
      instrument={buildInstrument()}
      displayName="Timestrip"
      isEditMode={false}
    />,
  )
}

describe('DrpdTimeStripInstrumentView', () => {
  it('renders a viewport and timeline container without canvas or svg', () => {
    const { container } = renderTimestrip()

    expect(screen.getByTestId('drpd-timestrip-viewport')).toBeInTheDocument()
    expect(screen.getByTestId('drpd-timestrip-timeline')).toHaveStyle({
      width: '10000px',
    })
    expect(container.querySelector('canvas')).toBeNull()
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
})
