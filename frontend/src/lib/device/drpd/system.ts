/**
 * @file system.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * DRPD system command group.
 */

import type { DRPDTransport } from './transport'
import { parseDeviceIdentity, parseErrorResponse, parseSingleBigInt, parseSingleInt } from './parsers'
import type { DeviceIdentity, MemoryUsage } from './types'

/**
 * System command group for DRPD devices.
 */
export class DRPDSystem {
  protected readonly transport: DRPDTransport ///< Transport instance.

  /**
   * Create a system command group.
   *
   * @param transport - Transport instance.
   */
  public constructor(transport: DRPDTransport) {
    this.transport = transport
  }

  /**
   * Query the device identification string.
   *
   * @returns Device identity fields.
   */
  public async identify(): Promise<DeviceIdentity> {
    const response = await this.transport.queryText('*IDN?')
    return parseDeviceIdentity(response)
  }

  /**
   * Reset the device.
   */
  public async reset(): Promise<void> {
    await this.transport.sendCommand('*RST')
  }

  /**
   * Query the system error queue.
   *
   * @returns Error code and message.
   */
  public async getError(): Promise<{ code: number; message: string }> {
    const response = await this.transport.queryText('SYST:ERR?')
    return parseErrorResponse(response)
  }

  /**
   * Query system memory usage.
   *
   * @returns Memory usage fields.
   */
  public async getMemoryUsage(): Promise<MemoryUsage> {
    const response = await this.transport.queryText('SYST:MEM?')
    if (!response.length) {
      throw new Error('Missing memory usage response')
    }
    if (response.length === 1) {
      return { freeBytes: parseSingleInt(response, 'free memory') }
    }
    return {
      totalBytes: parseSingleInt([response[0]], 'total memory'),
      freeBytes: parseSingleInt([response[1]], 'free memory'),
    }
  }

  /**
   * Query the device clock frequency in Hz.
   *
   * @returns Clock frequency in Hz.
   */
  public async getClockFrequencyHz(): Promise<number> {
    const response = await this.transport.queryText('SYST:SP?')
    return parseSingleInt(response, 'clock frequency')
  }

  /**
   * Query device uptime in microseconds.
   *
   * @returns Uptime in microseconds.
   */
  public async getUptimeUs(): Promise<bigint> {
    const response = await this.transport.queryText('SYST:UPT?')
    return parseSingleBigInt(response, 'uptime')
  }

  /**
   * Query the device timestamp in microseconds.
   *
   * @returns Timestamp in microseconds.
   */
  public async getTimestampUs(): Promise<bigint> {
    const response = await this.transport.queryText('SYST:TIME?')
    return parseSingleBigInt(response, 'timestamp')
  }
}
