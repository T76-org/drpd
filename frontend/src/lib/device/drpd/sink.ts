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
  parseSinkRequestStatus,
  parseSinkInquiryStatus,
  parseSinkPdo,
  parseSinkStateResponse,
} from './parsers'
import { OnOffState, SinkInquiryType } from './types'
import type {
  SinkInfo,
  SinkInquiryStatus,
  SinkInquiryRequest,
  SinkPdo,
  SinkRequestStatus,
  SinkState,
} from './types'

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
   * Query the most recent Sink PDO request outcome.
   *
   * @returns Sink request status.
   */
  public async getRequestStatus(): Promise<SinkRequestStatus> {
    const response = await this.transport.queryText('SINK:REQUEST:STATUS?')
    return parseSinkRequestStatus(response)
  }

  /** Start a supported Sink-to-Source inquiry. */
  public async sendInquiry(type: SinkInquiryType): Promise<void> {
    await this.transport.sendCommand('SINK:INQ', scpiEnum(type))
  }

  /** Send a semantic inquiry request; the library owns PD and SCPI encoding. */
  public async sendInquiryRequest(request: SinkInquiryRequest): Promise<void> {
    if (request.type === SinkInquiryType.GET_MANUFACTURER_INFO) {
      if (request.target !== 'PORT' && request.target !== 'BATTERY') throw new Error('Manufacturer target must be PORT or BATTERY')
      if (request.target === 'BATTERY') {
        if (!Number.isInteger(request.batteryReference) || request.batteryReference < 0 || request.batteryReference > 7) throw new Error('Battery reference must be an integer from 0 to 7')
        await this.transport.sendCommand('SINK:INQ', scpiEnum(request.type), request.target, request.batteryReference)
      } else {
        if ('batteryReference' in request) throw new Error('PORT manufacturer inquiry must not include a battery reference')
        await this.transport.sendCommand('SINK:INQ', scpiEnum(request.type), request.target)
      }
      return
    }
    if (request.type === SinkInquiryType.GET_COUNTRY_INFO) {
      if (typeof request.countryCode !== 'string') throw new Error('Country code must be ISO alpha-2')
      const countryCode = request.countryCode.toUpperCase()
      if (!/^[A-Z]{2}$/.test(countryCode)) throw new Error('Country code must be ISO alpha-2')
      await this.transport.sendCommand('SINK:INQ', scpiEnum(request.type), countryCode)
      return
    }
    await this.sendInquiry(request.type)
  }

  /** Query the most recent Sink-to-Source inquiry status. */
  public async getInquiryStatus(): Promise<SinkInquiryStatus> {
    const response = await this.transport.queryText('SINK:INQ:STAT?')
    return parseSinkInquiryStatus(response)
  }

  /** Fetch the raw response bytes for the most recent inquiry. */
  public async getInquiryResponse(): Promise<Uint8Array> {
    return await this.transport.queryBinary('SINK:INQ:RESP?')
  }

  /**
   * Query the number of configured local SPR Sink capability PDOs.
   *
   * @returns SPR Sink capability slot count.
   */
  public async getSprCapabilityCount(): Promise<number> {
    const response = await this.transport.queryText('SINK:CAP:SPR:COUNT?')
    return parseSingleInt(response, 'SPR Sink capability count')
  }

  /**
   * Query a configured local SPR Sink capability raw PDO.
   *
   * @param index - Local SPR Sink capability slot index.
   * @returns Raw 32-bit PDO value.
   */
  public async getSprCapabilityPdo(index: number): Promise<number> {
    const response = await this.transport.queryText('SINK:CAP:SPR?', index)
    return parseSingleInt(response, 'SPR Sink capability PDO')
  }

  /**
   * Set a configured local SPR Sink capability raw PDO.
   *
   * @param index - Local SPR Sink capability slot index.
   * @param rawPdo - Raw 32-bit PDO value; 0 clears the slot.
   */
  public async setSprCapabilityPdo(index: number, rawPdo: number): Promise<void> {
    await this.transport.sendCommand('SINK:CAP:SPR', index, rawPdo)
  }

  /**
   * Query the number of configured local EPR-only Sink capability PDOs.
   *
   * @returns EPR Sink capability slot count.
   */
  public async getEprCapabilityCount(): Promise<number> {
    const response = await this.transport.queryText('SINK:CAP:EPR:COUNT?')
    return parseSingleInt(response, 'EPR Sink capability count')
  }

  /**
   * Query a configured local EPR-only Sink capability raw PDO.
   *
   * @param index - Local EPR Sink capability slot index.
   * @returns Raw 32-bit PDO value.
   */
  public async getEprCapabilityPdo(index: number): Promise<number> {
    const response = await this.transport.queryText('SINK:CAP:EPR?', index)
    return parseSingleInt(response, 'EPR Sink capability PDO')
  }

  /**
   * Set a configured local EPR-only Sink capability raw PDO.
   *
   * @param index - Local EPR Sink capability slot index.
   * @param rawPdo - Raw 32-bit PDO value; 0 clears the slot.
   */
  public async setEprCapabilityPdo(index: number, rawPdo: number): Promise<void> {
    await this.transport.sendCommand('SINK:CAP:EPR', index, rawPdo)
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
