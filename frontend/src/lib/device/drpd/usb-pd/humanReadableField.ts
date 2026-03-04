/**
 * Types of human-readable metadata fields.
 */
export type HumanReadableFieldType = 'String' | 'Table' | 'ByteData' | 'OrderedDictionary'

/**
 * Table cell category.
 */
export type HumanReadableTableCellKind = 'header' | 'value'

/**
 * Byte element width for binary data.
 */
export type HumanReadableByteWidth = 8 | 16 | 32

/**
 * One table cell in a human-readable table field.
 */
export interface HumanReadableTableCell {
  ///< Cell kind.
  kind: HumanReadableTableCellKind
  ///< Recursive field value for the cell.
  field: HumanReadableField
}

/**
 * Byte data value payload.
 */
export interface HumanReadableByteDataValue {
  ///< Raw bytes.
  data: Uint8Array
  ///< Byte width of each element in bits.
  byteWidth: HumanReadableByteWidth
  ///< Whether each element is signed.
  signed: boolean
}

/**
 * Variant value mapping by field type.
 */
export interface HumanReadableFieldValueMap {
  String: string
  Table: HumanReadableTableCell[]
  ByteData: HumanReadableByteDataValue
  OrderedDictionary: Map<string, HumanReadableField>
}

/**
 * Recursive field used to describe human-readable metadata.
 */
export class HumanReadableField<T extends HumanReadableFieldType = HumanReadableFieldType> {
  ///< Field type discriminator.
  public readonly type: T
  ///< Backing value for the field type.
  public readonly value: HumanReadableFieldValueMap[T]

  /**
   * Create a field with the provided type and value.
   *
   * @param type - Field type.
   * @param value - Value for the type.
   */
  public constructor(type: T, value: HumanReadableFieldValueMap[T]) {
    this.type = type
    this.value = value
  }

  /**
   * Create a scalar/string field.
   *
   * @param value - Display value.
   * @returns String field.
   */
  public static string(value: string): HumanReadableField<'String'> {
    return new HumanReadableField('String', value)
  }

  /**
   * Create a table field.
   *
   * @param cells - Optional initial cells.
   * @returns Table field.
   */
  public static table(cells: HumanReadableTableCell[] = []): HumanReadableField<'Table'> {
    return new HumanReadableField('Table', [...cells])
  }

  /**
   * Create a byte-data field.
   *
   * @param data - Raw byte buffer.
   * @param byteWidth - Element width in bits.
   * @param signed - Signedness of each element.
   * @returns ByteData field.
   */
  public static byteData(
    data: Uint8Array,
    byteWidth: HumanReadableByteWidth,
    signed: boolean,
  ): HumanReadableField<'ByteData'> {
    if (byteWidth !== 8 && byteWidth !== 16 && byteWidth !== 32) {
      throw new Error(`Unsupported byte width: ${byteWidth}`)
    }
    if (typeof signed !== 'boolean') {
      throw new Error('ByteData signed must be specified as a boolean')
    }
    return new HumanReadableField('ByteData', {
      data: Uint8Array.from(data),
      byteWidth,
      signed,
    })
  }

  /**
   * Create an ordered dictionary field.
   *
   * @param entries - Optional initial entries.
   * @returns OrderedDictionary field.
   */
  public static orderedDictionary(
    entries?: Iterable<[string, HumanReadableField]>,
  ): HumanReadableField<'OrderedDictionary'> {
    return new HumanReadableField('OrderedDictionary', new Map(entries))
  }

  /**
   * Set or replace a dictionary entry.
   *
   * @param key - Entry key.
   * @param value - Entry value.
   * @returns This field.
   */
  public setEntry(key: string, value: HumanReadableField): this {
    const dict = this.asOrderedDictionary()
    dict.set(key, value)
    return this
  }

  /**
   * Insert a dictionary entry at an explicit index.
   *
   * @param index - Target insertion index.
   * @param key - Entry key.
   * @param value - Entry value.
   * @returns This field.
   */
  public insertEntryAt(index: number, key: string, value: HumanReadableField): this {
    const dict = this.asOrderedDictionary()
    const entries = Array.from(dict.entries()).filter(([existingKey]) => existingKey !== key)
    if (!Number.isInteger(index) || index < 0 || index > entries.length) {
      throw new Error(`OrderedDictionary index out of range: ${index}`)
    }
    entries.splice(index, 0, [key, value])
    dict.clear()
    entries.forEach(([entryKey, entryValue]) => dict.set(entryKey, entryValue))
    return this
  }

  /**
   * Insert a dictionary entry before an existing key.
   *
   * @param existingKey - Existing key to insert before.
   * @param key - New entry key.
   * @param value - New entry value.
   * @returns This field.
   */
  public insertEntryBefore(existingKey: string, key: string, value: HumanReadableField): this {
    const dict = this.asOrderedDictionary()
    const index = Array.from(dict.keys()).indexOf(existingKey)
    if (index < 0) {
      throw new Error(`OrderedDictionary key not found: ${existingKey}`)
    }
    return this.insertEntryAt(index, key, value)
  }

  /**
   * Insert a dictionary entry after an existing key.
   *
   * @param existingKey - Existing key to insert after.
   * @param key - New entry key.
   * @param value - New entry value.
   * @returns This field.
   */
  public insertEntryAfter(existingKey: string, key: string, value: HumanReadableField): this {
    const dict = this.asOrderedDictionary()
    const index = Array.from(dict.keys()).indexOf(existingKey)
    if (index < 0) {
      throw new Error(`OrderedDictionary key not found: ${existingKey}`)
    }
    return this.insertEntryAt(index + 1, key, value)
  }

  /**
   * Delete a dictionary entry by key.
   *
   * @param key - Entry key.
   * @returns True when the key existed.
   */
  public deleteEntry(key: string): boolean {
    const dict = this.asOrderedDictionary()
    return dict.delete(key)
  }

  /**
   * Read one dictionary entry.
   *
   * @param key - Entry key.
   * @returns Entry value or undefined.
   */
  public getEntry(key: string): HumanReadableField | undefined {
    const dict = this.asOrderedDictionary()
    return dict.get(key)
  }

  /**
   * Iterate dictionary entries in insertion order.
   *
   * @returns Entry iterator.
   */
  public entries(): IterableIterator<[string, HumanReadableField]> {
    const dict = this.asOrderedDictionary()
    return dict.entries()
  }

  /**
   * Iterate dictionary keys in insertion order.
   *
   * @returns Key iterator.
   */
  public keys(): IterableIterator<string> {
    const dict = this.asOrderedDictionary()
    return dict.keys()
  }

  /**
   * Iterate dictionary values in insertion order.
   *
   * @returns Value iterator.
   */
  public values(): IterableIterator<HumanReadableField> {
    const dict = this.asOrderedDictionary()
    return dict.values()
  }

  /**
   * Return ordered dictionary storage or throw for mismatched type.
   *
   * @returns Ordered dictionary map.
   */
  protected asOrderedDictionary(): Map<string, HumanReadableField> {
    if (this.type !== 'OrderedDictionary') {
      throw new Error(
        `HumanReadableField type ${this.type} does not support ordered dictionary operations`,
      )
    }
    return this.value as HumanReadableFieldValueMap['OrderedDictionary']
  }
}
