/**
 * @file capture.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * DRPD capture command group.
 */

import { scpiEnum } from '../../transport/usbtmc'
import type { DRPDTransport } from './transport'
import {
  parseCapturedMessage,
  parseOnOffResponse,
  parseSingleInt,
  parseSingleNumber,
} from './parsers'
import type { CapturedMessage, OnOffState } from './types'

/**
 * Capture command group for DRPD devices.
 */
export class DRPDCapture {
  protected readonly transport: DRPDTransport ///< Transport instance.

  /**
   * Create a capture command group.
   *
   * @param transport - Transport instance.
   */
  public constructor(transport: DRPDTransport) {
    this.transport = transport
  }

  /**
   * Query capture cycle time in nanoseconds.
   *
   * @returns Capture cycle time in nanoseconds.
   */
  public async getCycleTimeNs(): Promise<number> {
    const response = await this.transport.queryText('BUS:CC:CAP:CYCLETIME?')
    return parseSingleNumber(response, 'capture cycle time')
  }

  /**
   * Query number of captured messages.
   *
   * @returns Number of captured messages.
   */
  public async getCapturedMessageCount(): Promise<number> {
    const response = await this.transport.queryText('BUS:CC:CAP:COUNT?')
    return parseSingleInt(response, 'capture count')
  }

  /**
   * Query the next captured message.
   *
   * @returns Captured message or null if none are available.
   */
  public async getNextCapturedMessage(): Promise<CapturedMessage> {
    const response = await this.transport.queryBinary('BUS:CC:CAP:DATA?')
    if (!response.byteLength) {
      throw new Error('No captured messages available')
    }
    return parseCapturedMessage(response)
  }

  /**
   * Enable or disable capture.
   *
   * @param state - Desired capture state.
   */
  public async setCaptureEnabled(state: OnOffState): Promise<void> {
    await this.transport.sendCommand('BUS:CC:CAP:EN', scpiEnum(state))
  }

  /**
   * Query capture enable state.
   *
   * @returns Capture enable state.
   */
  public async getCaptureEnabled(): Promise<OnOffState> {
    const response = await this.transport.queryText('BUS:CC:CAP:EN?')
    return parseOnOffResponse(response)
  }

  /**
   * Clear captured messages.
   */
  public async clearCapturedMessages(): Promise<void> {
    await this.transport.sendCommand('BUS:CC:CAP:CLEAR')
  }
}
