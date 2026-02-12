/**
 * @file status.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * DRPD status command group.
 */

import type { DRPDTransport } from './transport'
import { parseDeviceStatus, parseSingleInt } from './parsers'
import type { DeviceStatusFlags } from './types'

/**
 * Status command group for DRPD devices.
 */
export class DRPDStatus {
  protected readonly transport: DRPDTransport ///< Transport instance.

  /**
   * Create a status command group.
   *
   * @param transport - Transport instance.
   */
  public constructor(transport: DRPDTransport) {
    this.transport = transport
  }

  /**
   * Read the device status register. Reading clears the register.
   *
   * @returns Parsed device status flags.
   */
  public async readDeviceStatus(): Promise<DeviceStatusFlags> {
    const response = await this.transport.queryText('STAT:DEV?')
    const value = parseSingleInt(response, 'device status')
    return parseDeviceStatus(value)
  }
}
