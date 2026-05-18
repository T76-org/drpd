/**
 * @file sink.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * DRPD sink command group.
 */

import { scpiEnum } from '../../transport/usbtmc'
import type { DRPDTransport } from './transport'
import {
  buildSinkInfo,
  parseOnOffResponse,
  parseSingleInt,
  parseSingleScaledMilliInt,
  parseSinkPdo,
  parseSinkStateResponse,
} from './parsers'
import { OnOffState } from './types'
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
   * Enable or disable EPR entry policy.
   *
   * @param enabled - True to allow EPR entry during future negotiation.
   */
  public async setEprEnabled(enabled: boolean): Promise<void> {
    await this.transport.sendCommand(
      'SINK:EPR:EN',
      scpiEnum(enabled ? OnOffState.ON : OnOffState.OFF),
    )
  }

  /**
   * Query whether EPR entry policy is enabled.
   *
   * @returns True when EPR entry is enabled.
   */
  public async getEprEnabled(): Promise<boolean> {
    const response = await this.transport.queryText('SINK:EPR:EN?')
    return parseOnOffResponse(response) === OnOffState.ON
  }

  /**
   * Enable or disable Get_PPS_Status queries after SPR PPS transitions.
   *
   * @param enabled - True to send Get_PPS_Status after SPR PPS transitions.
   */
  public async setPpsStatusQueryEnabled(enabled: boolean): Promise<void> {
    await this.transport.sendCommand(
      'SINK:PPS:STATUS:EN',
      scpiEnum(enabled ? OnOffState.ON : OnOffState.OFF),
    )
  }

  /**
   * Query whether Get_PPS_Status queries are enabled after SPR PPS transitions.
   *
   * @returns True when PPS status queries are enabled.
   */
  public async getPpsStatusQueryEnabled(): Promise<boolean> {
    const response = await this.transport.queryText('SINK:PPS:STATUS:EN?')
    return parseOnOffResponse(response) === OnOffState.ON
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
    return parseSingleScaledMilliInt(response, 'negotiated voltage', 100)
  }

  /**
   * Query the negotiated current in milliamps.
   *
   * @returns Negotiated current in milliamps.
   */
  public async getNegotiatedCurrentMa(): Promise<number> {
    const response = await this.transport.queryText('SINK:STATUS:CURRENT?')
    return parseSingleScaledMilliInt(response, 'negotiated current', 20)
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
