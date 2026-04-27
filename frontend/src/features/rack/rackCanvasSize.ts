import type { Instrument } from '../../lib/instrument'
import type { RackDefinition } from '../../lib/rack/types'
import { DEFAULT_RACK_SIZING, type RackSizingConfig } from './rackSizing'

export const RACK_UNIT_HEIGHT_PX = DEFAULT_RACK_SIZING.unitHeightPx

/**
 * Compute the rack reference size used for header alignment.
 *
 * @param rack - Rack definition to size.
 * @param instruments - Instrument definitions available to the rack.
 * @returns Rack canvas dimensions.
 */
export const getRackCanvasSize = (
  rack: RackDefinition,
  instruments: Instrument[],
  sizing: RackSizingConfig = DEFAULT_RACK_SIZING,
): { rackHeightPx: number; rackWidthPx: number } => {
  void rack
  void instruments
  const rackHeightPx = sizing.minDisplayUnits * sizing.unitHeightPx
  const rackWidthPx = sizing.maxRowWidthUnits * sizing.horizontalUnitPx
  return { rackHeightPx, rackWidthPx }
}
