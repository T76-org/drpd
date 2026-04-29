import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DrpdUsbPdLogTimeStripRenderer } from './DrpdUsbPdLogTimeStripRenderer'

const buildTimeStripData = (overrides: Partial<Parameters<typeof DrpdUsbPdLogTimeStripRenderer>[0]['data']> = {}) => ({
  windowStartUs: 0n,
  windowEndUs: 1_000n,
  windowDurationUs: 1_000n,
  earliestTimestampUs: 0n,
  latestTimestampUs: 1_000n,
  earliestDisplayTimestampUs: 0n,
  latestDisplayTimestampUs: 1_000n,
  windowStartDisplayTimestampUs: 0n,
  windowEndDisplayTimestampUs: 1_000n,
  hasMoreBefore: false,
  hasMoreAfter: false,
  pulses: [
    {
      selectionKey: 'message:100:120:1',
      startTimestampUs: 100n,
      endTimestampUs: 120n,
      traceEndTimestampUs: 700n,
      displayStartTimestampUs: 100n,
      displayEndTimestampUs: 120n,
      wallClockUs: 1_000n,
      sopLabel: 'SOP',
      messageLabel: 'Accept',
      pulseWidthsNs: Float64Array.from([1_000, 1_000, 1_000]),
    },
  ],
  analogPoints: [],
  events: [],
  timeAnchors: [
    {
      timestampUs: 0n,
      displayTimestampUs: 0n,
      wallClockUs: 1_000n,
      approximate: false,
    },
    {
      timestampUs: 1_000n,
      displayTimestampUs: 1_000n,
      wallClockUs: 2_000n,
      approximate: false,
    },
  ],
  ...overrides,
})

const getAxisTickTransforms = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll('svg g[transform]'))
    .map((element) => element.getAttribute('transform'))
    .filter((value): value is string => value !== null)

describe('DrpdUsbPdLogTimeStripRenderer', () => {
  it('renders pulse annotations when a message is wide enough on screen', async () => {
    const { container } = render(
      <DrpdUsbPdLogTimeStripRenderer
        width={640}
        data={buildTimeStripData()}
        hoverPosition={null}
        selectedKey={null}
      />,
    )

    expect(await screen.findByText('Preamble')).toBeInTheDocument()
    expect(screen.queryByText('SOP')).not.toBeInTheDocument()
    expect(screen.getByText('Accept')).toBeInTheDocument()

    const baselineSegments = container.querySelectorAll('line[stroke="var(--timestrip-pulse-stroke)"]')
    expect(baselineSegments).toHaveLength(2)
  })

  it('omits ticks beyond the latest available timestamp', () => {
    const { container } = render(
      <DrpdUsbPdLogTimeStripRenderer
        width={640}
        data={buildTimeStripData({
          latestTimestampUs: 400n,
          latestDisplayTimestampUs: 400n,
          windowEndDisplayTimestampUs: 400n,
        })}
        hoverPosition={null}
        selectedKey={null}
      />,
    )

    const tickTransforms = getAxisTickTransforms(container)

    expect(tickTransforms).toEqual([
      'translate(23.4,0)',
      'translate(142.04000000000002,0)',
      'translate(260.68,0)',
    ])
    expect(container.querySelector('title')?.textContent).toBe('0')
    expect(screen.queryByText('00:00:00.001400')).not.toBeInTheDocument()
  })

  it('moves tick positions when the visible time window scrolls', () => {
    const { container, rerender } = render(
      <DrpdUsbPdLogTimeStripRenderer
        width={640}
        data={buildTimeStripData()}
        hoverPosition={null}
        selectedKey={null}
      />,
    )

    const initialTransforms = getAxisTickTransforms(container)

    rerender(
      <DrpdUsbPdLogTimeStripRenderer
        width={640}
        data={buildTimeStripData({
          windowStartUs: 100n,
          windowEndUs: 1_100n,
        })}
        hoverPosition={null}
        selectedKey={null}
      />,
    )

    expect(getAxisTickTransforms(container)).not.toEqual(initialTransforms)
  })

  it('does not render an extra tick at the exact right edge of the strip', () => {
    const { container } = render(
      <DrpdUsbPdLogTimeStripRenderer
        width={640}
        data={buildTimeStripData({
          latestTimestampUs: 1_200n,
          latestDisplayTimestampUs: 1_200n,
        })}
        hoverPosition={null}
        selectedKey={null}
      />,
    )

    const tickTransforms = getAxisTickTransforms(container)

    expect(tickTransforms).toHaveLength(5)
    expect(tickTransforms).not.toContain('translate(622,0)')
  })

  it('exposes clickable hit areas for messages and events', () => {
    const { container } = render(
      <DrpdUsbPdLogTimeStripRenderer
        width={640}
        data={buildTimeStripData({
          events: [
            {
              selectionKey: 'event:300:1:mark',
              eventType: 'mark',
              timestampUs: 300n,
              displayTimestampUs: 300n,
              wallClockUs: 1_300n,
            },
          ],
        })}
        hoverPosition={null}
        selectedKey={null}
        onSelectSelectionKey={() => undefined}
      />,
    )

    expect(container.querySelector('[data-selection-key="message:100:120:1"]')).not.toBeNull()
    expect(container.querySelector('[data-selection-key="event:300:1:mark"]')).not.toBeNull()
  })
})
