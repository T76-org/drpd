/**
 * @file vbus.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * DRPD VBUS command group.
 */

import type { DRPDTransport } from './transport'
import {
  buildVBusInfo,
  parseSingleInt,
  parseVBusStatusResponse,
} from './parsers'
import type { VBusInfo, VBusStatus } from './types'

/**
 * VBUS command group for DRPD devices.
 */
export class DRPDVBus {
  protected readonly transport: DRPDTransport ///< Transport instance.

  /**
   * Create a VBUS command group.
   *
   * @param transport - Transport instance.
   */
  public constructor(transport: DRPDTransport) {
    this.transport = transport
  }

  /**
   * Query VBUS status.
   *
   * @returns VBUS status.
   */
  public async getStatus(): Promise<VBusStatus> {
    const response = await this.transport.queryText('BUS:VBUS:STAT?')
    return parseVBusStatusResponse(response)
  }

  /**
   * Reset VBUS controller from fault state.
   */
  public async resetFault(): Promise<void> {
    await this.transport.sendCommand('BUS:VBUS:RESET')
  }

  /**
   * Set VBUS overvoltage threshold in millivolts.
   *
   * @param thresholdMv - Threshold in millivolts.
   */
  public async setOvpThresholdMv(thresholdMv: number): Promise<void> {
    await this.transport.sendCommand('BUS:VBUS:OVPThreshold', thresholdMv)
  }

  /**
   * Query VBUS overvoltage threshold in millivolts.
   *
   * @returns OVP threshold in millivolts.
   */
  public async getOvpThresholdMv(): Promise<number> {
    const response = await this.transport.queryText('BUS:VBUS:OVPThreshold?')
    return parseSingleInt(response, 'OVP threshold')
  }

  /**
   * Set VBUS overcurrent threshold in milliamps.
   *
   * @param thresholdMa - Threshold in milliamps.
   */
  public async setOcpThresholdMa(thresholdMa: number): Promise<void> {
    await this.transport.sendCommand('BUS:VBUS:OCPThreshold', thresholdMa)
  }

  /**
   * Query VBUS overcurrent threshold in milliamps.
   *
   * @returns OCP threshold in milliamps.
   */
  public async getOcpThresholdMa(): Promise<number> {
    const response = await this.transport.queryText('BUS:VBUS:OCPThreshold?')
    return parseSingleInt(response, 'OCP threshold')
  }

  /**
   * Query composite VBUS information.
   *
   * @returns VBUS info structure.
   */
  public async getInfo(): Promise<VBusInfo> {
    const [status, ovpThresholdMv, ocpThresholdMa] = await Promise.all([
      this.getStatus(),
      this.getOvpThresholdMv(),
      this.getOcpThresholdMa(),
    ])
    return buildVBusInfo(status, ovpThresholdMv, ocpThresholdMa)
  }
}
