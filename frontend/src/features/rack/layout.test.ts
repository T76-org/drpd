import { describe, expect, it } from 'vitest'
import type { Instrument } from '../../lib/instrument'
import type { RackInstrument, RackRow } from '../../lib/rack/types'
import {
  allocateRowInstrumentWidths,
  canInsertInstrumentIntoRow,
  MAX_ROW_WIDTH_UNITS
} from './layout'

/**
 * Build a minimal instrument definition-like object for layout tests.
 *
 * @param identifier - Instrument identifier.
 * @param width - Default width config.
 * @returns Lightweight instrument definition object.
 */
const buildInstrumentDefinition = (
  identifier: string,
  width: { mode: 'fixed'; units: number } | { mode: 'flex' },
): Instrument => {
  return {
    identifier,
    displayName: identifier,
    supportedDeviceIdentifiers: [],
    defaultWidth: width,
    defaultUnits: 1,
    defaultHeightMode: 'fixed',
  } as Instrument
}

/**
 * Build a minimal rack instrument instance.
 *
 * @param id - Instrument instance id.
 * @param instrumentIdentifier - Definition identifier.
 * @returns Rack instrument instance.
 */
const buildRackInstrument = (
  id: string,
  instrumentIdentifier: string,
): RackInstrument => {
  return {
    id,
    instrumentIdentifier
  }
}

/**
 * Build a rack row from a list of instruments.
 *
 * @param instruments - Instrument instances.
 * @returns Rack row.
 */
const buildRow = (instruments: RackInstrument[]): RackRow => {
  return {
    id: 'row-1',
    instruments
  }
}

describe('layout width allocation', () => {
  it('splits remaining width equally among flex instruments', () => {
    const instrumentMap = new Map<string, Instrument>([
      ['fixed-30', buildInstrumentDefinition('fixed-30', { mode: 'fixed', units: 30 })],
      ['flex-a', buildInstrumentDefinition('flex-a', { mode: 'flex' })],
      ['flex-b', buildInstrumentDefinition('flex-b', { mode: 'flex' })]
    ])
    const row = buildRow([
      buildRackInstrument('inst-fixed', 'fixed-30'),
      buildRackInstrument('inst-flex-a', 'flex-a'),
      buildRackInstrument('inst-flex-b', 'flex-b')
    ])

    const allocations = allocateRowInstrumentWidths(row, instrumentMap, MAX_ROW_WIDTH_UNITS)

    expect(allocations).toEqual([
      { instrumentId: 'inst-fixed', widthUnits: 30 },
      { instrumentId: 'inst-flex-a', widthUnits: 15 },
      { instrumentId: 'inst-flex-b', widthUnits: 15 }
    ])
  })

  it('rejects rows where fixed widths exceed max row capacity', () => {
    const instrumentMap = new Map<string, Instrument>([
      ['fixed-40', buildInstrumentDefinition('fixed-40', { mode: 'fixed', units: 40 })],
      ['fixed-25', buildInstrumentDefinition('fixed-25', { mode: 'fixed', units: 25 })]
    ])
    const row = buildRow([
      buildRackInstrument('inst-a', 'fixed-40'),
      buildRackInstrument('inst-b', 'fixed-25')
    ])

    const allocations = allocateRowInstrumentWidths(row, instrumentMap, MAX_ROW_WIDTH_UNITS)

    expect(allocations).toBeNull()
  })

  it('blocks insertion when row width would overflow', () => {
    const instrumentMap = new Map<string, Instrument>([
      ['fixed-30', buildInstrumentDefinition('fixed-30', { mode: 'fixed', units: 30 })]
    ])
    const targetRow = buildRow([
      buildRackInstrument('inst-a', 'fixed-30'),
      buildRackInstrument('inst-b', 'fixed-30')
    ])
    const candidate = buildRackInstrument('inst-c', 'fixed-30')

    const canInsert = canInsertInstrumentIntoRow(
      targetRow,
      candidate,
      1,
      instrumentMap,
      MAX_ROW_WIDTH_UNITS,
    )

    expect(canInsert).toBe(false)
  })
})
