/**
 * @file types.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Rack type definitions.
 */

import type { InstrumentIdentifier } from '../instrument'

/**
 * Defines resizable behavior for an instrument.
 */
export interface InstrumentResizableConfig {
  ///< Minimum height in units when resizing is allowed.
  minUnits: number
}

/**
 * Describes a single instrument in a rack row.
 */
export interface RackInstrument {
  ///< Stable identifier for rendering and tracking.
  id: string
  ///< Instrument definition identifier.
  instrumentIdentifier: InstrumentIdentifier
  ///< Render this instrument as a full-screen overlay when true.
  fullScreen?: boolean
  ///< Resizable configuration for future UI.
  resizable?: InstrumentResizableConfig
  ///< Optional instrument-specific persisted configuration.
  config?: Record<string, unknown>
}

/**
 * Describes a stored device associated with a rack.
 */
export interface RackDeviceRecord {
  ///< Stable identifier for the rack device entry.
  id: string
  ///< Device definition identifier.
  identifier: string
  ///< Human-friendly device name.
  displayName: string
  ///< USB vendor ID.
  vendorId: number
  ///< USB product ID.
  productId: number
  ///< Optional USB serial number.
  serialNumber?: string
  ///< Optional device identity serial number shown in the UI.
  deviceSerialNumber?: string
  ///< Optional firmware version reported by the device.
  firmwareVersion?: string
  ///< Optional USB product name.
  productName?: string
  ///< Unix timestamp in milliseconds for the most recent successful connection.
  lastConnectedAtMs?: number
  ///< Optional device-specific persisted configuration.
  config?: Record<string, unknown>
}

/**
 * Describes a row in the rack layout.
 */
export interface RackRow {
  ///< Stable identifier for the row.
  id: string
  ///< Instruments in this row.
  instruments: RackInstrument[]
}

/**
 * Describes a rack definition and its rows.
 */
export interface RackDefinition {
  ///< Stable identifier for the rack.
  id: string
  ///< Display name for the rack.
  name: string
  ///< Toggle to hide the header for this rack.
  hideHeader?: boolean
  ///< Total vertical units available in the rack.
  totalUnits: number
  ///< Rows in the rack.
  rows: RackRow[]
}

/**
 * Root document containing one or more racks.
 */
export interface RackDocument {
  ///< Full document of racks.
  racks: RackDefinition[]
  ///< Globally paired devices known to the system.
  pairedDevices?: RackDeviceRecord[]
}
