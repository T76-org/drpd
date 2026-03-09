import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

let resizeObserverCallback: ResizeObserverCallback | null = null

class ResizeObserverMock {
  public constructor(callback: ResizeObserverCallback) {
    resizeObserverCallback = callback
  }

  public observe(): void {}

  public disconnect(): void {}
}

beforeEach(() => {
  resizeObserverCallback = null
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

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
    const rackScroll = container.querySelector('[class*="rackScroll"]')
    expect(rackCanvas).not.toBeNull()
    expect(rackScroll).not.toBeNull()
    expect(rackCanvas).toHaveAttribute('data-rack-width', '960')
    expect(rackCanvas).toHaveAttribute('data-rack-height', '600')
    expect(rackCanvas).toHaveStyle({ width: '960px', minHeight: '600px', height: '100%' })
    expect(rackScroll).toHaveStyle({ width: '960px', minHeight: '600px', height: '100%' })
    expect(rackCanvas).not.toHaveStyle({ transform: 'scale(1)' })

    expect(screen.getByTestId('rack-rows')).toHaveStyle({
      minHeight: '600px',
      height: '100%'
    })
  })

  it('scales the rack down to fit the viewport height when enough equivalent height is available', () => {
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

    const rackViewport = container.querySelector('[class*="rackViewport"]')
    const rackCanvas = container.querySelector('[data-rack-width]')
    const rackScroll = container.querySelector('[class*="rackScroll"]')
    expect(rackViewport).not.toBeNull()
    expect(rackCanvas).not.toBeNull()
    expect(rackScroll).not.toBeNull()

    Object.defineProperty(rackViewport as HTMLDivElement, 'clientHeight', {
      configurable: true,
      value: 500,
    })

    act(() => {
      resizeObserverCallback?.(
        [
          {
            target: rackViewport as HTMLDivElement,
            contentRect: {
              height: 500,
            } as DOMRectReadOnly,
          } as ResizeObserverEntry,
        ],
        {} as ResizeObserver,
      )
    })

    expect(rackViewport).toHaveAttribute('data-scroll-mode', 'fit')
    expect(rackScroll).toHaveStyle({ width: '800px', minHeight: '500px', height: '100%' })
    expect(rackCanvas).toHaveStyle({
      width: '960px',
      minHeight: '600px',
      height: '100%',
      transform: 'scale(0.8333333333333334)',
    })
  })

  it('keeps native rack size and allows scrolling when the equivalent viewport height is below the threshold', () => {
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

    const rackViewport = container.querySelector('[class*="rackViewport"]')
    const rackCanvas = container.querySelector('[data-rack-width]')
    const rackScroll = container.querySelector('[class*="rackScroll"]')
    expect(rackViewport).not.toBeNull()
    expect(rackCanvas).not.toBeNull()
    expect(rackScroll).not.toBeNull()

    Object.defineProperty(rackViewport as HTMLDivElement, 'clientHeight', {
      configurable: true,
      value: 350,
    })

    act(() => {
      resizeObserverCallback?.(
        [
          {
            target: rackViewport as HTMLDivElement,
            contentRect: {
              height: 350,
            } as DOMRectReadOnly,
          } as ResizeObserverEntry,
        ],
        {} as ResizeObserver,
      )
    })

    expect(rackViewport).toHaveAttribute('data-scroll-mode', 'scroll')
    expect(rackScroll).toHaveStyle({ width: '960px', minHeight: '600px', height: '100%' })
    expect(rackCanvas).not.toHaveStyle({ transform: 'scale(0.5833333333333334)' })
  })
})
