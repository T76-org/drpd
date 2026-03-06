import { describe, expect, it } from 'vitest'
import { HumanReadableField } from './humanReadableField'

describe('HumanReadableField', () => {
  it('creates each variant', () => {
    const scalar = HumanReadableField.string('42', 'Example Scalar', 'Example scalar value.')
    const table = HumanReadableField.table('Example Table', 'Example table field.')
    const bytes = HumanReadableField.byteData(
      Uint8Array.from([1, 2, 3]),
      8,
      false,
      'Example Byte Data',
      'Example raw byte data.',
    )
    const dict = HumanReadableField.orderedDictionary(
      'Example Dictionary',
      'Example ordered dictionary.',
    )

    expect(scalar.type).toBe('String')
    expect(table.type).toBe('Table')
    expect(bytes.type).toBe('ByteData')
    expect(dict.type).toBe('OrderedDictionary')
    expect(scalar.Label).toBe('Example Scalar')
    expect(scalar.explanation).toBe('Example scalar value.')
  })

  it('stores tagged table cells for header and value', () => {
    const table = HumanReadableField.table('Example Table', 'Table with header and value cells.', [
      {
        kind: 'header',
        field: HumanReadableField.string('Byte', 'Byte Header', 'Header label for one column.'),
      },
      {
        kind: 'value',
        field: HumanReadableField.string('0x2A', 'Hex Value', 'Cell value in hex notation.'),
      },
    ])

    expect(table.value[0]?.kind).toBe('header')
    expect(table.value[1]?.kind).toBe('value')
  })

  it('preserves insertion order for ordered dictionary entries', () => {
    const dict = HumanReadableField.orderedDictionary(
      'Test Dictionary',
      'Ordered dictionary for insertion testing.',
    )
    dict.setEntry('a', HumanReadableField.string('1', 'A Value', 'Value for key a.'))
    dict.setEntry('b', HumanReadableField.string('2', 'B Value', 'Value for key b.'))
    dict.setEntry('c', HumanReadableField.string('3', 'C Value', 'Value for key c.'))

    expect(Array.from(dict.keys())).toEqual(['a', 'b', 'c'])
  })

  it('inserts entries at arbitrary index', () => {
    const dict = HumanReadableField.orderedDictionary(
      'Test Dictionary',
      'Ordered dictionary for indexed insertion.',
    )
    dict.setEntry('a', HumanReadableField.string('1', 'A Value', 'Value for key a.'))
    dict.setEntry('c', HumanReadableField.string('3', 'C Value', 'Value for key c.'))
    dict.insertEntryAt(1, 'b', HumanReadableField.string('2', 'B Value', 'Value for key b.'))

    expect(Array.from(dict.keys())).toEqual(['a', 'b', 'c'])
  })

  it('inserts entries before and after specific keys', () => {
    const dict = HumanReadableField.orderedDictionary(
      'Test Dictionary',
      'Ordered dictionary for relative insertion.',
    )
    dict.setEntry('a', HumanReadableField.string('1', 'A Value', 'Value for key a.'))
    dict.setEntry('c', HumanReadableField.string('3', 'C Value', 'Value for key c.'))
    dict.insertEntryBefore('c', 'b', HumanReadableField.string('2', 'B Value', 'Value for key b.'))
    dict.insertEntryAfter('c', 'd', HumanReadableField.string('4', 'D Value', 'Value for key d.'))

    expect(Array.from(dict.keys())).toEqual(['a', 'b', 'c', 'd'])
  })

  it('throws for variant-incompatible dictionary operations', () => {
    const scalar = HumanReadableField.string(
      'value',
      'Scalar Value',
      'Scalar field for operation mismatch test.',
    )

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
        'Invalid Byte Data',
        'Invalid width byte data.',
      ),
    ).toThrow('Unsupported byte width')
    expect(() =>
      HumanReadableField.byteData(
        Uint8Array.from([1, 2]),
        8,
        undefined as unknown as boolean,
        'Missing Signed Flag',
        'Missing signed flag byte data.',
      ),
    ).toThrow('signed must be specified')
  })

  it('requires a non-empty label', () => {
    expect(() => HumanReadableField.string('value', '   ', 'Valid explanation.')).toThrow(
      'Label must be a non-empty string',
    )
  })

  it('requires a non-empty explanation', () => {
    expect(() => HumanReadableField.string('value', 'Value Label', '   ')).toThrow(
      'explanation must be a non-empty string',
    )
  })
})
