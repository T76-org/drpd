import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Instrument } from '../../lib/instrument'
import type { RackDefinition } from '../../lib/rack/types'
import { RackRenderer } from './RackRenderer'

class TestPanelInstrument extends Instrument {
  public constructor() {
    super({
      identifier: 'com.example.test-panel',
      displayName: 'Test Panel',
      supportedDeviceIdentifiers: [],
      defaultWidth: { mode: 'fixed', units: 30 },
      defaultUnits: 2,
      defaultFlex: 1,
      minWidth: '10rem',
      minHeight: '6rem',
    })
  }
}

class FlexInstrument extends Instrument {
  public constructor() {
    super({
      identifier: 'com.mta.drpd.flex',
      displayName: 'Flex',
      supportedDeviceIdentifiers: ['com.mta.drpd'],
      defaultWidth: { mode: 'flex' },
      defaultUnits: 1,
      defaultHeightMode: 'flex',
      defaultFlex: 2,
      minWidth: '12rem',
      minHeight: '8rem',
    })
  }
}

describe('RackRenderer', () => {
  it('renders the rack as a CSS flex canvas without scale transforms', () => {
    const rack: RackDefinition = {
      id: 'rack-a',
      name: 'Rack A',
      totalUnits: 8,
      rows: [
        {
          id: 'row-1',
          flex: 1,
          instruments: [
            {
              id: 'inst-1',
              instrumentIdentifier: 'com.example.test-panel',
              flex: 1,
            },
          ],
        },
      ],
    }

    const { container } = render(
      <RackRenderer
        rack={rack}
        instruments={[new TestPanelInstrument()]}
        deviceStates={[]}
      />,
    )

    const rackCanvas = container.querySelector('[data-rack-canvas="true"]')
    expect(rackCanvas).not.toBeNull()
    expect(rackCanvas).not.toHaveStyle({ transform: 'scale(1)' })
    expect(screen.getByTestId('rack-rows')).toBeInTheDocument()
  })

  it('uses row and instrument flex weights', () => {
    const rack: RackDefinition = {
      id: 'rack-a',
      name: 'Rack A',
      totalUnits: 8,
      rows: [
        {
          id: 'row-1',
          flex: 2,
          instruments: [
            {
              id: 'inst-1',
              instrumentIdentifier: 'com.mta.drpd.flex',
              flex: 3,
            },
          ],
        },
      ],
    }

    render(
      <RackRenderer
        rack={rack}
        instruments={[new FlexInstrument()]}
        deviceStates={[]}
      />,
    )

    expect(screen.getByTestId('rack-row-row-1')).toHaveStyle({ flex: '2 1 0px' })
    expect(screen.getByTestId('rack-row-row-1')).toHaveStyle({ minHeight: '8rem' })
    expect(screen.getByTestId('rack-instrument-inst-1')).toHaveStyle({
      flex: '3 1 0px',
      minWidth: '12rem',
      minHeight: '8rem',
    })
  })
})
