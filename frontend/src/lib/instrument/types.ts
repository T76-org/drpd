/**
 * @file types.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Instrument base class definitions and identifier helpers.
 */

import type { DeviceIdentifier } from '../device'

/**
 * Reverse-domain identifier for an instrument (for example, com.vendor.instrument).
 */
export type InstrumentIdentifier = string

/**
 * Supported width modes for instruments.
 */
export type InstrumentWidth =
  | {
      ///< Use a fixed number of horizontal units.
      mode: 'fixed'
      ///< Fixed horizontal width in row units.
      units: number
    }
  | {
      ///< Expand to fill remaining row space.
      mode: 'flex'
    }

/**
 * Initialization data for Instrument subclasses.
 */
export interface InstrumentInit {
  ///< Reverse-domain identifier for the instrument.
  identifier: InstrumentIdentifier
  ///< Human-readable instrument name.
  displayName: string
  ///< Supported device identifiers.
  supportedDeviceIdentifiers: DeviceIdentifier[]
  ///< Default horizontal width behavior.
  defaultWidth: InstrumentWidth
  ///< Default height in units.
  defaultUnits: number
}

/**
 * Validate that a string is a reverse-domain identifier like com.vendor.instrument.
 *
 * @param value - Candidate identifier value.
 * @returns True when the value is a valid identifier.
 */
export const isInstrumentIdentifier = (
  value: string,
): value is InstrumentIdentifier => {
  const trimmed = value.trim()
  if (trimmed !== value) {
    return false
  }

  const pattern =
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/
  return pattern.test(value)
}

/**
 * Base class for Instrument definitions.
 */
export abstract class Instrument {
  public readonly identifier: InstrumentIdentifier ///< Reverse-domain identifier.
  public readonly displayName: string ///< Human-readable instrument name.
  public readonly supportedDeviceIdentifiers: DeviceIdentifier[] ///< Supported device ids.
  public readonly defaultWidth: InstrumentWidth ///< Default width behavior.
  public readonly defaultUnits: number ///< Default units height.

  /**
   * Create an Instrument definition with default sizing details.
   *
   * @param init - Instrument initialization data.
   */
  protected constructor(init: InstrumentInit) {
    if (!isInstrumentIdentifier(init.identifier)) {
      throw new Error(`Invalid instrument identifier: ${init.identifier}`)
    }
    this.identifier = init.identifier
    this.displayName = init.displayName
    this.supportedDeviceIdentifiers = init.supportedDeviceIdentifiers
    this.defaultWidth = init.defaultWidth
    this.defaultUnits = init.defaultUnits
    if (
      this.defaultWidth.mode === 'fixed' &&
      (!Number.isFinite(this.defaultWidth.units) ||
        this.defaultWidth.units <= 0)
    ) {
      throw new Error(
        `Invalid fixed width units for instrument ${this.identifier}: ${this.defaultWidth.units}`,
      )
    }
    if (!Number.isFinite(this.defaultUnits) || this.defaultUnits <= 0) {
      throw new Error(
        `Invalid default units for instrument ${this.identifier}: ${this.defaultUnits}`,
      )
    }
  }
}
