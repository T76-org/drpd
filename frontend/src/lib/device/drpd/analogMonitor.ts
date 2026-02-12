/**
 * @file analogMonitor.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * DRPD analog monitor command group.
 */

import type { DRPDTransport } from './transport'
import {
  parseAnalogMonitorChannels,
  parseSingleNumber,
} from './parsers'
import type { AnalogMonitorChannels } from './types'

/**
 * Analog monitor command group for DRPD devices.
 */
export class DRPDAnalogMonitor {
  protected readonly transport: DRPDTransport ///< Transport instance.

  /**
   * Create an analog monitor command group.
   *
   * @param transport - Transport instance.
   */
  public constructor(transport: DRPDTransport) {
    this.transport = transport
  }

  /**
   * Query all analog monitor channels.
   *
   * @returns Analog monitor channel values.
   */
  public async getStatus(): Promise<AnalogMonitorChannels> {
    const response = await this.transport.queryText('MEAS:ALL?')
    return parseAnalogMonitorChannels(response)
  }

  /**
   * Query VBUS voltage.
   *
   * @returns VBUS voltage.
   */
  public async getVBusVoltage(): Promise<number> {
    const response = await this.transport.queryText('MEAS:VOLT:VBUS?')
    return parseSingleNumber(response, 'VBUS voltage')
  }

  /**
   * Query VBUS current.
   *
   * @returns VBUS current.
   */
  public async getVBusCurrent(): Promise<number> {
    const response = await this.transport.queryText('MEAS:CURR:VBUS?')
    return parseSingleNumber(response, 'VBUS current')
  }

  /**
   * Query DUT CC1 voltage.
   *
   * @returns DUT CC1 voltage.
   */
  public async getDutCc1Voltage(): Promise<number> {
    const response = await this.transport.queryText('MEAS:VOLT:CC:DUT1?')
    return parseSingleNumber(response, 'DUT CC1 voltage')
  }

  /**
   * Query DUT CC2 voltage.
   *
   * @returns DUT CC2 voltage.
   */
  public async getDutCc2Voltage(): Promise<number> {
    const response = await this.transport.queryText('MEAS:VOLT:CC:DUT2?')
    return parseSingleNumber(response, 'DUT CC2 voltage')
  }

  /**
   * Query USDS CC1 voltage.
   *
   * @returns USDS CC1 voltage.
   */
  public async getUsdsCc1Voltage(): Promise<number> {
    const response = await this.transport.queryText('MEAS:VOLT:CC:USDS1?')
    return parseSingleNumber(response, 'USDS CC1 voltage')
  }

  /**
   * Query USDS CC2 voltage.
   *
   * @returns USDS CC2 voltage.
   */
  public async getUsdsCc2Voltage(): Promise<number> {
    const response = await this.transport.queryText('MEAS:VOLT:CC:USDS2?')
    return parseSingleNumber(response, 'USDS CC2 voltage')
  }

  /**
   * Query ADC reference voltage.
   *
   * @returns ADC reference voltage.
   */
  public async getAdcVrefVoltage(): Promise<number> {
    const response = await this.transport.queryText('MEAS:VOLT:REF:ADC?')
    return parseSingleNumber(response, 'ADC reference voltage')
  }

  /**
   * Query current reference voltage.
   *
   * @returns Current reference voltage.
   */
  public async getCurrentRefVoltage(): Promise<number> {
    const response = await this.transport.queryText('MEAS:VOLT:REF:CURR?')
    return parseSingleNumber(response, 'current reference voltage')
  }

  /**
   * Query ground reference voltage.
   *
   * @returns Ground reference voltage.
   */
  public async getGroundRefVoltage(): Promise<number> {
    const response = await this.transport.queryText('MEAS:VOLT:REF:GND?')
    return parseSingleNumber(response, 'ground reference voltage')
  }
}
