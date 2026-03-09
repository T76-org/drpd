import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Instrument } from '../../lib/instrument'
import type { RackDefinition } from '../../lib/rack/types'
import { RackRenderer } from './RackRenderer'

class PlaceholderInstrument extends Instrument {
  public constructor() {
    super({
      identifier: 'com.mta.drpd.placeholder',
      displayName: 'Placeholder',
      supportedDeviceIdentifiers: ['com.mta.drpd'],
      defaultWidth: { mode: 'fixed', units: 30 },
      defaultUnits: 2
    })
  }
}

describe('RackRenderer', () => {
  it('renders the rack at its native size without applying a scale transform', () => {
    const rack: RackDefinition = {
      id: 'rack-a',
      name: 'Rack A',
      totalUnits: 8,
      devices: [],
      rows: [
        {
          id: 'row-1',
          instruments: [
            {
              id: 'inst-1',
              instrumentIdentifier: 'com.mta.drpd.placeholder'
            }
          ]
        }
      ]
    }

    const { container } = render(
      <RackRenderer
        rack={rack}
        instruments={[new PlaceholderInstrument()]}
        deviceStates={[]}
      />,
    )

    const rackCanvas = container.querySelector('[data-rack-width]')
    expect(rackCanvas).not.toBeNull()
    expect(rackCanvas).toHaveAttribute('data-rack-width', '960')
    expect(rackCanvas).toHaveAttribute('data-rack-height', '600')
    expect(rackCanvas).toHaveStyle({ width: '960px', height: '600px' })
    expect(rackCanvas).not.toHaveStyle({ transform: 'scale(1)' })

    expect(screen.getByTestId('rack-rows')).toHaveStyle({ height: '600px' })
  })
})
