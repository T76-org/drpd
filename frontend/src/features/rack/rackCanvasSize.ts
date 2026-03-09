import type { Instrument } from '../../lib/instrument'
import type { RackDefinition } from '../../lib/rack/types'

export const RACK_UNIT_HEIGHT_PX = 100
const RACK_ASPECT_RATIO = 16 / 10
const MIN_DISPLAY_UNITS = 6

/**
 * Compute the rendered rack canvas size in CSS pixels.
 *
 * @param rack - Rack definition to size.
 * @param instruments - Instrument definitions available to the rack.
 * @returns Rack canvas dimensions.
 */
export const getRackCanvasSize = (
  rack: RackDefinition,
  instruments: Instrument[],
): { rackHeightPx: number; rackWidthPx: number } => {
  const instrumentMap = new Map(
    instruments.map((instrument) => [instrument.identifier, instrument]),
  )
  const displayUnits = getDisplayUnits(rack, instrumentMap)
  const rackHeightPx = displayUnits * RACK_UNIT_HEIGHT_PX
  const rackWidthPx = rackHeightPx * RACK_ASPECT_RATIO
  return { rackHeightPx, rackWidthPx }
}

/**
 * Determine how many rack units should be visible for scaling.
 * @param rack - Rack definition.
 * @param instrumentMap - Map of instrument definitions by identifier.
 * @returns Units used to size the rack canvas.
 */
const getDisplayUnits = (
  rack: RackDefinition,
  instrumentMap: Map<string, Instrument>,
): number => {
  if (rack.rows.length === 0) {
    return Math.min(rack.totalUnits, MIN_DISPLAY_UNITS)
  }
  const contentUnits = getRackContentUnits(rack, instrumentMap)
  return Math.min(rack.totalUnits, Math.max(contentUnits, MIN_DISPLAY_UNITS))
}

/**
 * Compute the total rack units occupied by instruments.
 * @param rack - Rack definition.
 * @param instrumentMap - Map of instrument definitions by identifier.
 * @returns Total content height in units.
 */
const getRackContentUnits = (
  rack: RackDefinition,
  instrumentMap: Map<string, Instrument>,
): number => {
  return rack.rows.reduce((total, row) => {
    const rowUnits = getRowUnits(row, instrumentMap)
    return total + rowUnits
  }, 0)
}

/**
 * Compute the maximum units needed for a row.
 * @param row - Rack row.
 * @param instrumentMap - Map of instrument definitions by identifier.
 * @returns Height of the row in units.
 */
const getRowUnits = (
  row: RackDefinition['rows'][number],
  instrumentMap: Map<string, Instrument>,
): number => {
  if (row.instruments.length === 0) {
    return 0
  }
  return row.instruments.reduce((maxUnits, instrument) => {
    const definition = instrumentMap.get(instrument.instrumentIdentifier)
    const units = definition?.defaultUnits ?? 1
    return Math.max(maxUnits, units)
  }, 1)
}