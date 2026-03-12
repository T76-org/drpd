import { describe, expect, it } from 'vitest'
import {
  clampWindowStartUs,
  computePulseTraceEndTimestampUs,
  findAnalogPointAtStepTimestamp,
  formatDeviceTimestampUs,
  formatWallClock,
  interpolateDisplayTimestampUs,
  interpolateWallClockMs,
  parseLogSelectionKey,
  parseMessageSelectionKey,
  zoomWindowAroundFocusUs,
  zoomWindowDurationUs,
} from './DrpdUsbPdLogTimeStrip.utils'

describe('DrpdUsbPdLogTimeStrip utils', () => {
  it('parses message selection keys', () => {
    expect(parseMessageSelectionKey('message:1000:1100:42')).toEqual({
      startTimestampUs: 1000n,
      endTimestampUs: 1100n,
      createdAtMs: 42,
    })
    expect(parseMessageSelectionKey('event:1000:42:capture_changed')).toBeNull()
    expect(parseLogSelectionKey('message:1000:1100:42')).toEqual({
      startTimestampUs: 1000n,
      endTimestampUs: 1100n,
      createdAtMs: 42,
    })
    expect(parseLogSelectionKey('event:2000:52:capture_changed')).toEqual({
      startTimestampUs: 2000n,
      endTimestampUs: 2000n,
      createdAtMs: 52,
    })
  })

  it('clamps and zooms windows inside configured bounds', () => {
    expect(clampWindowStartUs(-50n, 100n, 0n, 1_000n)).toBe(0n)
    expect(clampWindowStartUs(980n, 100n, 0n, 1_000n)).toBe(900n)
    expect(zoomWindowDurationUs(10_000n, 'in')).toBe(5_000n)
    expect(zoomWindowDurationUs(250n, 'in')).toBe(250n)
  })

  it('keeps the cursor focus timestamp fixed while zooming', () => {
    expect(zoomWindowAroundFocusUs(1_000n, 10_000n, 'in', 0.25, 0n, 50_000n)).toEqual({
      windowStartUs: 2_250n,
      windowDurationUs: 5_000n,
    })
    expect(zoomWindowAroundFocusUs(1_000n, 10_000n, 'out', 0.25, 0n, 50_000n)).toEqual({
      windowStartUs: 0n,
      windowDurationUs: 20_000n,
    })
  })

  it('clamps cursor-focused zoom to the available edges', () => {
    expect(zoomWindowAroundFocusUs(100n, 1_000n, 'out', 0.1, 0n, 5_000n)).toEqual({
      windowStartUs: 0n,
      windowDurationUs: 2_000n,
    })
    expect(zoomWindowAroundFocusUs(4_500n, 1_000n, 'out', 0.9, 0n, 5_000n)).toEqual({
      windowStartUs: 3_000n,
      windowDurationUs: 2_000n,
    })
  })

  it('interpolates device-relative and wall-clock axes from anchors', () => {
    const anchors = [
      {
        timestampUs: 1_000n,
        displayTimestampUs: 100n,
        wallClockMs: 1_700_000_000_000,
        approximate: false,
      },
      {
        timestampUs: 2_000n,
        displayTimestampUs: 1_100n,
        wallClockMs: 1_700_000_001_000,
        approximate: true,
      },
    ]

    expect(interpolateDisplayTimestampUs(1_500n, anchors)).toBe(600n)
    expect(interpolateWallClockMs(1_500n, anchors)).toBe(1_700_000_000_500)
  })

  it('formats axis labels for display and wall clock', () => {
    expect(formatDeviceTimestampUs(1_500n)).toBe('1500')
    expect(formatWallClock(1_700_000_000_123)).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3}/)
  })

  it('extends the waveform end to the end of the last pulse', () => {
    expect(
      computePulseTraceEndTimestampUs(1_000n, Float64Array.from([1_200, 1_300, 1_400]), 1_001n),
    ).toBe(1_004n)
    expect(
      computePulseTraceEndTimestampUs(1_000n, Float64Array.from([100, 200]), 1_005n),
    ).toBe(1_005n)
  })

  it('uses the previous sample value for step-trace hover lookups', () => {
    const analogPoints = [
      {
        timestampUs: 1_000n,
        displayTimestampUs: 10n,
        wallClockMs: 1,
        vbusV: 0.5,
        ibusA: 0.02,
      },
      {
        timestampUs: 2_000n,
        displayTimestampUs: 20n,
        wallClockMs: 2,
        vbusV: 5,
        ibusA: 0.2,
      },
    ]

    expect(findAnalogPointAtStepTimestamp(analogPoints, 999n)?.vbusV).toBe(0.5)
    expect(findAnalogPointAtStepTimestamp(analogPoints, 1_500n)?.vbusV).toBe(0.5)
    expect(findAnalogPointAtStepTimestamp(analogPoints, 2_000n)?.vbusV).toBe(5)
    expect(findAnalogPointAtStepTimestamp(analogPoints, 2_500n)?.vbusV).toBe(5)
  })
})
