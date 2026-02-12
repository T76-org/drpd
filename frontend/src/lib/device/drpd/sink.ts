/**
 * @file sink.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * DRPD sink command group.
 */

import type { DRPDTransport } from './transport'
import {
  buildSinkInfo,
  parseSingleInt,
  parseSinkPdo,
  parseSinkStateResponse,
} from './parsers'
import type { SinkInfo, SinkPdo, SinkState } from './types'

/**
 * Sink command group for DRPD devices.
 */
export class DRPDSink {
  protected readonly transport: DRPDTransport ///< Transport instance.

  /**
   * Create a sink command group.
   *
   * @param transport - Transport instance.
   */
  public constructor(transport: DRPDTransport) {
    this.transport = transport
  }

  /**
   * Query the number of available PDOs.
   *
   * @returns PDO count.
   */
  public async getAvailablePdoCount(): Promise<number> {
    const response = await this.transport.queryText('SINK:PDO:COUNT?')
    return parseSingleInt(response, 'PDO count')
  }

  /**
   * Query a PDO at the specified index.
   *
   * @param index - PDO index (0-based).
   * @returns Parsed PDO information.
   */
  public async getPdoAtIndex(index: number): Promise<SinkPdo> {
    const response = await this.transport.queryText('SINK:PDO?', index)
    return parseSinkPdo(response)
  }

  /**
   * Request a PDO at the specified index.
   *
   * @param index - PDO index (0-based).
   * @param voltageMv - Desired voltage in millivolts.
   * @param currentMa - Desired current in milliamps.
   */
  public async requestPdo(index: number, voltageMv: number, currentMa: number): Promise<void> {
    await this.transport.sendCommand('SINK:PDO', index, voltageMv, currentMa)
  }

  /**
   * Query the sink state.
   *
   * @returns Sink state.
   */
  public async getStatus(): Promise<SinkState> {
    const response = await this.transport.queryText('SINK:STATUS?')
    return parseSinkStateResponse(response)
  }

  /**
   * Query the negotiated PDO.
   *
   * @returns Negotiated PDO data.
   */
  public async getNegotiatedPdo(): Promise<SinkPdo> {
    const response = await this.transport.queryText('SINK:STATUS:PDO?')
    return parseSinkPdo(response)
  }

  /**
   * Query the negotiated voltage in millivolts.
   *
   * @returns Negotiated voltage in millivolts.
   */
  public async getNegotiatedVoltageMv(): Promise<number> {
    const response = await this.transport.queryText('SINK:STATUS:VOLTAGE?')
    return parseSingleInt(response, 'negotiated voltage')
  }

  /**
   * Query the negotiated current in milliamps.
   *
   * @returns Negotiated current in milliamps.
   */
  public async getNegotiatedCurrentMa(): Promise<number> {
    const response = await this.transport.queryText('SINK:STATUS:CURRENT?')
    return parseSingleInt(response, 'negotiated current')
  }

  /**
   * Query sink error status.
   *
   * @returns True when sink is in error state.
   */
  public async getErrorStatus(): Promise<boolean> {
    const response = await this.transport.queryText('SINK:STATUS:ERROR?')
    const parsed = parseSingleInt(response, 'sink error status')
    return parsed === 1
  }

  /**
   * Query composite sink information.
   *
   * @returns Sink info structure.
   */
  public async getSinkInfo(): Promise<SinkInfo> {
    const status = await this.getStatus()
    const negotiatedPdo = await this.getNegotiatedPdo()
    const negotiatedVoltageMv = await this.getNegotiatedVoltageMv()
    const negotiatedCurrentMa = await this.getNegotiatedCurrentMa()
    const error = await this.getErrorStatus()
    return buildSinkInfo(
      status,
      negotiatedPdo,
      negotiatedVoltageMv,
      negotiatedCurrentMa,
      error,
    )
  }

}
