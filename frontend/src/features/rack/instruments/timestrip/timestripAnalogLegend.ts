import { ticks } from 'd3-array'
import { buildTimestripLaneLayout } from './timestripLaneLayout'
import {
  TIMESTRIP_ANALOG_CURRENT_MAX_A,
  TIMESTRIP_ANALOG_VOLTAGE_MAX_V,
} from './timestripAnalogModel'

export interface TimestripAnalogLegendTick {
  value: number
  y: number
  label: string
}

export interface TimestripAnalogLegendTicks {
  voltage: TimestripAnalogLegendTick[]
  current: TimestripAnalogLegendTick[]
}

export const ANALOG_TRACE_PADDING_PX = 4
const ANALOG_TICK_COUNT = 4

const formatLegendTick = (value: number, unit: 'V' | 'A'): string => `${Number.isInteger(value) ? value : value.toFixed(1)}${unit}`

const buildLegendTicks = (
  maxValue: number,
  unit: 'V' | 'A',
  viewportHeightPx: number,
): TimestripAnalogLegendTick[] => {
  const layout = buildTimestripLaneLayout(viewportHeightPx)
  const top = layout.analog.y + ANALOG_TRACE_PADDING_PX
  const bottom = layout.analog.y + layout.analog.height - ANALOG_TRACE_PADDING_PX
  const height = Math.max(1, bottom - top)

  return ticks(0, maxValue, ANALOG_TICK_COUNT).map((value) => ({
    value,
    y: bottom - (value / maxValue) * height,
    label: formatLegendTick(value, unit),
  }))
}

export const buildTimestripAnalogLegendTicks = (
  viewportHeightPx: number,
): TimestripAnalogLegendTicks => ({
  voltage: buildLegendTicks(TIMESTRIP_ANALOG_VOLTAGE_MAX_V, 'V', viewportHeightPx),
  current: buildLegendTicks(TIMESTRIP_ANALOG_CURRENT_MAX_A, 'A', viewportHeightPx),
})
