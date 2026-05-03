import { scaleLinear } from 'd3-scale'
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

const ANALOG_TRACE_PADDING_PX = 4
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
  const scale = scaleLinear()
    .domain([0, maxValue])
    .range([bottom, top])

  return scale.ticks(ANALOG_TICK_COUNT).map((value) => ({
    value,
    y: scale(value),
    label: formatLegendTick(value, unit),
  }))
}

export const buildTimestripAnalogLegendTicks = (
  viewportHeightPx: number,
): TimestripAnalogLegendTicks => ({
  voltage: buildLegendTicks(TIMESTRIP_ANALOG_VOLTAGE_MAX_V, 'V', viewportHeightPx),
  current: buildLegendTicks(TIMESTRIP_ANALOG_CURRENT_MAX_A, 'A', viewportHeightPx),
})
