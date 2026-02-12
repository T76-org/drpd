/**
 * @file ccBus.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * DRPD CC bus command group.
 */

import { scpiEnum } from '../../transport/usbtmc'
import type { DRPDTransport } from './transport'
import {
  parseCCBusRoleResponse,
  parseCCBusRoleStatusResponse,
} from './parsers'
import type { CCBusRole, CCBusRoleStatus } from './types'

/**
 * CC bus command group for DRPD devices.
 */
export class DRPDCCBus {
  protected readonly transport: DRPDTransport ///< Transport instance.

  /**
   * Create a CC bus command group.
   *
   * @param transport - Transport instance.
   */
  public constructor(transport: DRPDTransport) {
    this.transport = transport
  }

  /**
   * Query the CC bus controller role.
   *
   * @returns CC bus role.
   */
  public async getRole(): Promise<CCBusRole> {
    const response = await this.transport.queryText('BUS:CC:ROLE?')
    return parseCCBusRoleResponse(response)
  }

  /**
   * Set the CC bus controller role.
   *
   * @param role - Desired role.
   */
  public async setRole(role: CCBusRole): Promise<void> {
    await this.transport.sendCommand('BUS:CC:ROLE', scpiEnum(role))
  }

  /**
   * Query the CC bus controller role status.
   *
   * @returns CC bus role status.
   */
  public async getRoleStatus(): Promise<CCBusRoleStatus> {
    const response = await this.transport.queryText('BUS:CC:ROLE:STAT?')
    return parseCCBusRoleStatusResponse(response)
  }
}
