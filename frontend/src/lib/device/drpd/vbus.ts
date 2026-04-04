/**
 * @file vbus.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * DRPD VBUS command group.
 */

import type { DRPDTransport } from './transport'
import {
  buildVBusInfo,
  parseVBusStatusFields,
  parseSingleScaledMilliInt,
  parseVBusStatusResponse,
} from './parsers'
import type { VBusInfo, VBusStatus } from './types'

/**
 * VBUS command group for DRPD devices.
 */
export class DRPDVBus {
  protected readonly transport: DRPDTransport ///< Transport instance.

  protected async getStatusFields(): Promise<{
    status: VBusStatus
    ovpEventTimestampUs: bigint | null
    ocpEventTimestampUs: bigint | null
  }> {
    const response = await this.transport.queryText('BUS:VBUS:STAT?')
    return parseVBusStatusFields(response)
  }

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
    await this.transport.sendCommand('BUS:VBUS:OVPT', thresholdMv / 1000)
  }

  /**
   * Query VBUS overvoltage threshold in millivolts.
   *
   * @returns OVP threshold in millivolts.
   */
  public async getOvpThresholdMv(): Promise<number> {
    const response = await this.transport.queryText('BUS:VBUS:OVPT?')
    return parseSingleScaledMilliInt(response, 'OVP threshold', 100)
  }

  /**
   * Set VBUS overcurrent threshold in milliamps.
   *
   * @param thresholdMa - Threshold in milliamps.
   */
  public async setOcpThresholdMa(thresholdMa: number): Promise<void> {
    await this.transport.sendCommand('BUS:VBUS:OCPT', thresholdMa / 1000)
  }

  /**
   * Query VBUS overcurrent threshold in milliamps.
   *
   * @returns OCP threshold in milliamps.
   */
  public async getOcpThresholdMa(): Promise<number> {
    const response = await this.transport.queryText('BUS:VBUS:OCPT?')
    return parseSingleScaledMilliInt(response, 'OCP threshold', 10)
  }

  /**
   * Query composite VBUS information.
   *
   * @returns VBUS info structure.
   */
  public async getInfo(): Promise<VBusInfo> {
    const [{ status, ovpEventTimestampUs, ocpEventTimestampUs }, ovpThresholdMv, ocpThresholdMa] = await Promise.all([
      this.getStatusFields(),
      this.getOvpThresholdMv(),
      this.getOcpThresholdMa(),
    ])
    return buildVBusInfo(
      status,
      ovpThresholdMv,
      ocpThresholdMa,
      ovpEventTimestampUs,
      ocpEventTimestampUs,
    )
  }
}
