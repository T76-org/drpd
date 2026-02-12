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
    defaultUnits: 1
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
      ['fixed-6', buildInstrumentDefinition('fixed-6', { mode: 'fixed', units: 6 })],
      ['flex-a', buildInstrumentDefinition('flex-a', { mode: 'flex' })],
      ['flex-b', buildInstrumentDefinition('flex-b', { mode: 'flex' })]
    ])
    const row = buildRow([
      buildRackInstrument('inst-fixed', 'fixed-6'),
      buildRackInstrument('inst-flex-a', 'flex-a'),
      buildRackInstrument('inst-flex-b', 'flex-b')
    ])

    const allocations = allocateRowInstrumentWidths(row, instrumentMap, MAX_ROW_WIDTH_UNITS)

    expect(allocations).toEqual([
      { instrumentId: 'inst-fixed', widthUnits: 6 },
      { instrumentId: 'inst-flex-a', widthUnits: 3 },
      { instrumentId: 'inst-flex-b', widthUnits: 3 }
    ])
  })

  it('rejects rows where fixed widths exceed max row capacity', () => {
    const instrumentMap = new Map<string, Instrument>([
      ['fixed-8', buildInstrumentDefinition('fixed-8', { mode: 'fixed', units: 8 })],
      ['fixed-5', buildInstrumentDefinition('fixed-5', { mode: 'fixed', units: 5 })]
    ])
    const row = buildRow([
      buildRackInstrument('inst-a', 'fixed-8'),
      buildRackInstrument('inst-b', 'fixed-5')
    ])

    const allocations = allocateRowInstrumentWidths(row, instrumentMap, MAX_ROW_WIDTH_UNITS)

    expect(allocations).toBeNull()
  })

  it('blocks insertion when row width would overflow', () => {
    const instrumentMap = new Map<string, Instrument>([
      ['fixed-6', buildInstrumentDefinition('fixed-6', { mode: 'fixed', units: 6 })]
    ])
    const targetRow = buildRow([
      buildRackInstrument('inst-a', 'fixed-6'),
      buildRackInstrument('inst-b', 'fixed-6')
    ])
    const candidate = buildRackInstrument('inst-c', 'fixed-6')

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
