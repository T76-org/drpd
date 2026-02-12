/**
 * @file test.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * DRPD test command group.
 */

import { scpiEnum } from '../../transport/usbtmc'
import type { DRPDTransport } from './transport'
import {
  parseCcChannelResponse,
  parseOnOffResponse,
  parseTestCcRoleResponse,
} from './parsers'
import type { CcChannel, OnOffState, TestCcRole } from './types'

/**
 * Test command group for DRPD devices.
 */
export class DRPDTest {
  protected readonly transport: DRPDTransport ///< Transport instance.

  /**
   * Create a test command group.
   *
   * @param transport - Transport instance.
   */
  public constructor(transport: DRPDTransport) {
    this.transport = transport
  }

  /**
   * Enable or disable VBUS pass-through.
   *
   * @param state - Desired pass-through state.
   */
  public async setVbusManagerState(state: OnOffState): Promise<void> {
    await this.transport.sendCommand('TEST:VBUSMAN:EN', scpiEnum(state))
  }

  /**
   * Query VBUS pass-through state.
   *
   * @returns Pass-through state.
   */
  public async getVbusManagerState(): Promise<OnOffState> {
    const response = await this.transport.queryText('TEST:VBUSMAN:EN?')
    return parseOnOffResponse(response)
  }

  /**
   * Set CC1 role.
   *
   * @param role - CC role.
   */
  public async setCc1Role(role: TestCcRole): Promise<void> {
    await this.transport.sendCommand('TEST:CCROLE:CC1', scpiEnum(role))
  }

  /**
   * Query CC1 role.
   *
   * @returns CC1 role.
   */
  public async getCc1Role(): Promise<TestCcRole> {
    const response = await this.transport.queryText('TEST:CCROLE:CC1?')
    return parseTestCcRoleResponse(response)
  }

  /**
   * Set CC2 role.
   *
   * @param role - CC role.
   */
  public async setCc2Role(role: TestCcRole): Promise<void> {
    await this.transport.sendCommand('TEST:CCROLE:CC2', scpiEnum(role))
  }

  /**
   * Query CC2 role.
   *
   * @returns CC2 role.
   */
  public async getCc2Role(): Promise<TestCcRole> {
    const response = await this.transport.queryText('TEST:CCROLE:CC2?')
    return parseTestCcRoleResponse(response)
  }

  /**
   * Set DUT CC bus channel.
   *
   * @param channel - Desired channel.
   */
  public async setDutChannel(channel: CcChannel): Promise<void> {
    await this.transport.sendCommand('TEST:CCBUS:DUT:CHANNEL', scpiEnum(channel))
  }

  /**
   * Query DUT CC bus channel.
   *
   * @returns Selected channel.
   */
  public async getDutChannel(): Promise<CcChannel> {
    const response = await this.transport.queryText('TEST:CCBUS:DUT:CHANNEL?')
    return parseCcChannelResponse(response)
  }

  /**
   * Set USDS CC bus channel.
   *
   * @param channel - Desired channel.
   */
  public async setUsdsChannel(channel: CcChannel): Promise<void> {
    await this.transport.sendCommand('TEST:CCBUS:USDS:CHANNEL', scpiEnum(channel))
  }

  /**
   * Query USDS CC bus channel.
   *
   * @returns Selected channel.
   */
  public async getUsdsChannel(): Promise<CcChannel> {
    const response = await this.transport.queryText('TEST:CCBUS:USDS:CHANNEL?')
    return parseCcChannelResponse(response)
  }

  /**
   * Enable or disable DUT CC bus multiplexer.
   *
   * @param state - Desired mux state.
   */
  public async setCcMuxState(state: OnOffState): Promise<void> {
    await this.transport.sendCommand('TEST:CCBUS:MUX', scpiEnum(state))
  }

  /**
   * Query DUT CC bus multiplexer state.
   *
   * @returns Mux state.
   */
  public async getCcMuxState(): Promise<OnOffState> {
    const response = await this.transport.queryText('TEST:CCBUS:MUX?')
    return parseOnOffResponse(response)
  }
}
