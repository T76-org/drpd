import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
      defaultUnits: 2
    })
  }
}

class FlexInstrument extends Instrument {
  public constructor() {
    super({
      identifier: 'com.mta.drpd.flex',
      displayName: 'Flex',
      supportedDeviceIdentifiers: ['com.mta.drpd'],
      defaultWidth: { mode: 'fixed', units: 30 },
      defaultUnits: 1,
      defaultHeightMode: 'flex',
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
              instrumentIdentifier: 'com.example.test-panel'
            }
          ]
        }
      ]
    }

    const { container } = render(
      <RackRenderer
        rack={rack}
        instruments={[new TestPanelInstrument()]}
        deviceStates={[]}
      />,
    )

    const rackCanvas = container.querySelector('[data-rack-width]')
    const rackScroll = container.querySelector('[class*="rackScroll"]')
    expect(rackCanvas).not.toBeNull()
    expect(rackScroll).not.toBeNull()
    expect(rackCanvas).toHaveAttribute('data-rack-width', '1200')
    expect(rackCanvas).toHaveAttribute('data-rack-height', '600')
    expect(rackCanvas).toHaveStyle({ width: '1200px', minHeight: '600px', height: '600px' })
    expect(rackScroll).toHaveStyle({ width: '1200px', minHeight: '600px', height: '600px' })
    expect(rackCanvas).not.toHaveStyle({ transform: 'scale(1)' })

    expect(screen.getByTestId('rack-rows')).toHaveStyle({ height: '600px' })
  })

  it('keeps the native rack width when the viewport height shrinks', () => {
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
              instrumentIdentifier: 'com.example.test-panel'
            }
          ]
        }
      ]
    }

    const { container } = render(
      <RackRenderer
        rack={rack}
        instruments={[new TestPanelInstrument()]}
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

    expect(rackViewport).toHaveAttribute('data-scroll-mode', 'scroll')
    expect(rackScroll).toHaveStyle({ width: '1200px', minHeight: '500px', height: '500px' })
    expect(rackCanvas).toHaveStyle({ width: '1200px', minHeight: '500px', height: '500px' })
    expect(screen.getByTestId('rack-rows')).toHaveStyle({ height: '500px' })
    expect(rackCanvas).not.toHaveStyle({ transform: 'scale(0.8333333333333334)' })
  })

  it('allows vertical scrolling when the viewport is shorter than the rack', () => {
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
              instrumentIdentifier: 'com.example.test-panel'
            }
          ]
        }
      ]
    }

    const { container } = render(
      <RackRenderer
        rack={rack}
        instruments={[new TestPanelInstrument()]}
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
    expect(rackScroll).toHaveStyle({ width: '1200px', minHeight: '350px', height: '350px' })
    expect(rackCanvas).toHaveStyle({ width: '1200px', minHeight: '350px', height: '350px' })
    expect(rackCanvas).not.toHaveStyle({ transform: 'scale(0.5833333333333334)' })
  })

  it('lets flex-height rows and instrument slots follow the clamped rack height', () => {
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
              instrumentIdentifier: 'com.mta.drpd.flex',
            },
          ],
        },
      ],
    }

    const { container } = render(
      <RackRenderer
        rack={rack}
        instruments={[new FlexInstrument()]}
        deviceStates={[]}
      />,
    )

    const rackViewport = container.querySelector('[class*="rackViewport"]')
    expect(rackViewport).not.toBeNull()

    Object.defineProperty(rackViewport as HTMLDivElement, 'clientHeight', {
      configurable: true,
      value: 320,
    })

    act(() => {
      resizeObserverCallback?.(
        [
          {
            target: rackViewport as HTMLDivElement,
            contentRect: {
              height: 320,
            } as DOMRectReadOnly,
          } as ResizeObserverEntry,
        ],
        {} as ResizeObserver,
      )
    })

    expect(screen.getByTestId('rack-rows')).toHaveStyle({ height: '320px' })
    expect(screen.getByTestId('rack-row-row-1')).toHaveStyle({ flex: '1 1 0' })
    expect(screen.getByTestId('rack-instrument-inst-1')).toHaveStyle({ height: '100%' })
  })
})
