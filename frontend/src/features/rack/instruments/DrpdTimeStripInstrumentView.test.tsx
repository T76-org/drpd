import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('updates the zoom label and timeline width from the zoom control', async () => {
    const user = userEvent.setup()
    renderTimestrip()

    expect(screen.getByRole('button', { name: 'Zoom 1:1000' })).toBeInTheDocument()
    expect(screen.getByTestId('drpd-timestrip-timeline')).toHaveStyle({
      width: '10000px',
    })

    await user.click(screen.getByRole('button', { name: 'Zoom 1:1000' }))
    const zoomInput = screen.getByRole('spinbutton')
    await user.clear(zoomInput)
    await user.type(zoomInput, '1')

    expect(screen.getByRole('button', { name: 'Zoom 1:1' })).toBeInTheDocument()
    expect(screen.getByTestId('drpd-timestrip-timeline')).toHaveStyle({
      width: '10000000px',
    })
  })
})
