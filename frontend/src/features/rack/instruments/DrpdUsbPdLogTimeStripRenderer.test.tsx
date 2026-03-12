import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DrpdUsbPdLogTimeStripRenderer } from './DrpdUsbPdLogTimeStripRenderer'

describe('DrpdUsbPdLogTimeStripRenderer', () => {
  it('renders pulse annotations when a message is wide enough on screen', async () => {
    const { container } = render(
      <DrpdUsbPdLogTimeStripRenderer
        width={640}
        data={{
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
              wallClockMs: 1,
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
              wallClockMs: 1,
              approximate: false,
            },
            {
              timestampUs: 1_000n,
              displayTimestampUs: 1_000n,
              wallClockMs: 2,
              approximate: false,
            },
          ],
        }}
        hoverPosition={null}
        selectedKey={null}
      />,
    )

    expect(await screen.findByText('Preamble')).toBeInTheDocument()
    expect(screen.getByText('SOP')).toBeInTheDocument()
    expect(screen.getByText('Accept')).toBeInTheDocument()

    const baselineSegments = container.querySelectorAll('line[stroke="var(--timestrip-pulse-stroke)"]')
    expect(baselineSegments).toHaveLength(2)
  })
})
