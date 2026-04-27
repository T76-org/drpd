import type { Instrument, InstrumentWidth } from '../../lib/instrument'
import type { RackInstrument, RackRow } from '../../lib/rack/types'
import { DEFAULT_RACK_SIZING } from './rackSizing'

/**
 * Horizontal unit size used for rack width allocation math.
 */
export const HORIZONTAL_UNIT_PX = DEFAULT_RACK_SIZING.horizontalUnitPx

/**
 * Maximum horizontal width available per row in width units.
 *
 * This was historically 12 units at 100 px per unit. The unit size is now
 * 20 px, so capacity is scaled to preserve the same effective row width.
 */
export const MAX_ROW_WIDTH_UNITS = DEFAULT_RACK_SIZING.maxRowWidthUnits

/**
 * Width allocation for an instrument in a row.
 */
export interface RowInstrumentWidthAllocation {
  ///< Instrument instance id.
  instrumentId: string
  ///< Allocated row width in units.
  widthUnits: number
}

/**
 * Build width allocations for a row of instruments.
 *
 * @param row - Rack row to evaluate.
 * @param instrumentMap - Instrument definition map.
 * @param maxRowWidthUnits - Maximum row width in units.
 * @returns Width allocations in row order, or null when row overflows.
 */
export const allocateRowInstrumentWidths = (
  row: RackRow,
  instrumentMap: Map<string, Instrument>,
  maxRowWidthUnits: number = MAX_ROW_WIDTH_UNITS,
): RowInstrumentWidthAllocation[] | null => {
  const descriptors = row.instruments.map((instrument) => ({
    instrument,
    width: resolveInstrumentWidth(instrument, instrumentMap, maxRowWidthUnits)
  }))
  const fixedWidthSum = descriptors.reduce((sum, descriptor) => {
    if (descriptor.width.mode !== 'fixed') {
      return sum
    }
    return sum + sanitizeFixedWidthUnits(descriptor.width.units)
  }, 0)
  if (fixedWidthSum > maxRowWidthUnits) {
    return null
  }
  const flexCount = descriptors.filter(
    (descriptor) => descriptor.width.mode === 'flex',
  ).length
  const remainingWidthUnits = maxRowWidthUnits - fixedWidthSum
  if (flexCount > 0 && remainingWidthUnits <= 0) {
    return null
  }
  const flexWidthUnits = flexCount > 0 ? remainingWidthUnits / flexCount : 0

  return descriptors.map((descriptor) => {
    if (descriptor.width.mode === 'fixed') {
      return {
        instrumentId: descriptor.instrument.id,
        widthUnits: sanitizeFixedWidthUnits(descriptor.width.units)
      }
    }
    return {
      instrumentId: descriptor.instrument.id,
      widthUnits: flexWidthUnits
    }
  })
}

/**
 * Determine if an instrument can be inserted into a row at an index.
 *
 * @param row - Target row.
 * @param instrument - Instrument to insert.
 * @param insertIndex - Index where the instrument should be inserted.
 * @param instrumentMap - Instrument definition map.
 * @param maxRowWidthUnits - Maximum row width in units.
 * @returns True when insertion is valid.
 */
export const canInsertInstrumentIntoRow = (
  row: RackRow,
  instrument: RackInstrument,
  insertIndex: number,
  instrumentMap: Map<string, Instrument>,
  maxRowWidthUnits: number = MAX_ROW_WIDTH_UNITS,
): boolean => {
  const nextRow = insertInstrumentIntoRowAtIndex(row, instrument, insertIndex)
  return (
    allocateRowInstrumentWidths(nextRow, instrumentMap, maxRowWidthUnits) !== null
  )
}

/**
 * Insert an instrument in a row at a clamped index.
 *
 * @param row - Row to update.
 * @param instrument - Instrument to insert.
 * @param insertIndex - Requested insertion index.
 * @returns Updated row.
 */
export const insertInstrumentIntoRowAtIndex = (
  row: RackRow,
  instrument: RackInstrument,
  insertIndex: number,
): RackRow => {
  const clampedIndex = Math.max(0, Math.min(insertIndex, row.instruments.length))
  return {
    ...row,
    instruments: [
      ...row.instruments.slice(0, clampedIndex),
      instrument,
      ...row.instruments.slice(clampedIndex)
    ]
  }
}

/**
 * Resolve the default width definition for a rack instrument.
 *
 * @param instrument - Rack instrument instance.
 * @param instrumentMap - Instrument definition map.
 * @param maxRowWidthUnits - Maximum row width in units.
 * @returns Width descriptor for this instrument.
 */
export const resolveInstrumentWidth = (
  instrument: RackInstrument,
  instrumentMap: Map<string, Instrument>,
  maxRowWidthUnits: number = MAX_ROW_WIDTH_UNITS,
): InstrumentWidth => {
  const width = instrumentMap.get(instrument.instrumentIdentifier)?.defaultWidth
  if (!width) {
    return {
      mode: 'fixed',
      units: maxRowWidthUnits
    }
  }
  if (width.mode === 'fixed') {
    return {
      mode: 'fixed',
      units: sanitizeFixedWidthUnits(width.units)
    }
  }
  return width
}

export interface RackInstrumentMinimumSize {
  minWidth: string
  minHeight: string
}

export const resolveInstrumentFlex = (
  instrument: RackInstrument,
  instrumentMap: Map<string, Instrument>,
): number => {
  const definition = instrumentMap.get(instrument.instrumentIdentifier)
  return sanitizeFlex(instrument.flex) ?? definition?.defaultFlex ?? 1
}

export const resolveInstrumentMinimumSize = (
  instrument: RackInstrument,
  instrumentMap: Map<string, Instrument>,
): RackInstrumentMinimumSize => {
  const definition = instrumentMap.get(instrument.instrumentIdentifier)
  return {
    minWidth: instrument.resizable?.minWidth ?? definition?.minWidth ?? '10rem',
    minHeight: instrument.resizable?.minHeight ?? definition?.minHeight ?? '6rem',
  }
}

export const resolveRowFlex = (row: RackRow): number => sanitizeFlex(row.flex) ?? 1

const sanitizeFlex = (value: number | undefined): number | undefined => (
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
)

/**
 * Normalize fixed width units to a safe positive value.
 *
 * @param units - Requested width units.
 * @returns Safe fixed width units.
 */
const sanitizeFixedWidthUnits = (units: number): number => {
  if (!Number.isFinite(units) || units <= 0) {
    return 1
  }
  return units
}
