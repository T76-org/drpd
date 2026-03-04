import { describe, expect, it } from 'vitest'
import { HumanReadableField } from './humanReadableField'

describe('HumanReadableField', () => {
  it('creates each variant', () => {
    const scalar = HumanReadableField.string('42')
    const table = HumanReadableField.table()
    const bytes = HumanReadableField.byteData(Uint8Array.from([1, 2, 3]), 8, false)
    const dict = HumanReadableField.orderedDictionary()

    expect(scalar.type).toBe('String')
    expect(table.type).toBe('Table')
    expect(bytes.type).toBe('ByteData')
    expect(dict.type).toBe('OrderedDictionary')
  })

  it('stores tagged table cells for header and value', () => {
    const table = HumanReadableField.table([
      { kind: 'header', field: HumanReadableField.string('Byte') },
      { kind: 'value', field: HumanReadableField.string('0x2A') },
    ])

    expect(table.value[0]?.kind).toBe('header')
    expect(table.value[1]?.kind).toBe('value')
  })

  it('preserves insertion order for ordered dictionary entries', () => {
    const dict = HumanReadableField.orderedDictionary()
    dict.setEntry('a', HumanReadableField.string('1'))
    dict.setEntry('b', HumanReadableField.string('2'))
    dict.setEntry('c', HumanReadableField.string('3'))

    expect(Array.from(dict.keys())).toEqual(['a', 'b', 'c'])
  })

  it('inserts entries at arbitrary index', () => {
    const dict = HumanReadableField.orderedDictionary()
    dict.setEntry('a', HumanReadableField.string('1'))
    dict.setEntry('c', HumanReadableField.string('3'))
    dict.insertEntryAt(1, 'b', HumanReadableField.string('2'))

    expect(Array.from(dict.keys())).toEqual(['a', 'b', 'c'])
  })

  it('inserts entries before and after specific keys', () => {
    const dict = HumanReadableField.orderedDictionary()
    dict.setEntry('a', HumanReadableField.string('1'))
    dict.setEntry('c', HumanReadableField.string('3'))
    dict.insertEntryBefore('c', 'b', HumanReadableField.string('2'))
    dict.insertEntryAfter('c', 'd', HumanReadableField.string('4'))

    expect(Array.from(dict.keys())).toEqual(['a', 'b', 'c', 'd'])
  })

  it('throws for variant-incompatible dictionary operations', () => {
    const scalar = HumanReadableField.string('value')

    expect(() => scalar.entries()).toThrow(
      'does not support ordered dictionary operations',
    )
  })

  it('validates byte data metadata', () => {
    expect(() =>
      HumanReadableField.byteData(
        Uint8Array.from([1, 2]),
        64 as unknown as 8 | 16 | 32,
        false,
      ),
    ).toThrow('Unsupported byte width')
    expect(() =>
      HumanReadableField.byteData(
        Uint8Array.from([1, 2]),
        8,
        undefined as unknown as boolean,
      ),
    ).toThrow('signed must be specified')
  })
})
