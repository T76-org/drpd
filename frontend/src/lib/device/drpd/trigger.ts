/**
 * @file trigger.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * DRPD trigger command group.
 */

import { scpiEnum } from '../../transport/usbtmc'
import type { DRPDTransport } from './transport'
import {
  parseTriggerMessageTypeFiltersResponse,
  parseOnOffResponse,
  parseSingleInt,
  parseTriggerEventTypeResponse,
  parseTriggerStatusResponse,
  parseTriggerSyncModeResponse,
} from './parsers'
import type {
  OnOffState,
  TriggerEventType,
  TriggerInfo,
  TriggerMessageTypeFilter,
  TriggerStatus,
  TriggerSyncMode,
} from './types'

/**
 * Trigger command group for DRPD devices.
 */
export class DRPDTrigger {
  protected readonly transport: DRPDTransport ///< Transport instance.

  /**
   * Create a trigger command group.
   *
   * @param transport - Transport instance.
   */
  public constructor(transport: DRPDTransport) {
    this.transport = transport
  }

  /**
   * Reset the trigger controller.
   */
  public async reset(): Promise<void> {
    await this.transport.sendCommand('TRIG:RESET')
  }

  /**
   * Query trigger status.
   *
   * @returns Trigger status.
   */
  public async getStatus(): Promise<TriggerStatus> {
    const response = await this.transport.queryText('TRIG:STAT?')
    return parseTriggerStatusResponse(response)
  }

  /**
   * Set trigger event type.
   *
   * @param type - Trigger event type.
   */
  public async setEventType(type: TriggerEventType): Promise<void> {
    await this.transport.sendCommand('TRIG:EV:TYPE', scpiEnum(type))
  }

  /**
   * Query trigger event type.
   *
   * @returns Trigger event type.
   */
  public async getEventType(): Promise<TriggerEventType> {
    const response = await this.transport.queryText('TRIG:EV:TYPE?')
    return parseTriggerEventTypeResponse(response)
  }

  /**
   * Set trigger event threshold.
   *
   * @param count - Event threshold count.
   */
  public async setEventThreshold(count: number): Promise<void> {
    await this.transport.sendCommand('TRIG:EV:THRESH', count)
  }

  /**
   * Query trigger event threshold.
   *
   * @returns Event threshold count.
   */
  public async getEventThreshold(): Promise<number> {
    const response = await this.transport.queryText('TRIG:EV:THRESH?')
    return parseSingleInt(response, 'trigger event threshold')
  }

  /**
   * Set trigger auto-repeat state.
   *
   * @param state - Auto-repeat state.
   */
  public async setAutoRepeat(state: OnOffState): Promise<void> {
    await this.transport.sendCommand('TRIG:EV:AUTOREPEAT', scpiEnum(state))
  }

  /**
   * Query trigger auto-repeat state.
   *
   * @returns Auto-repeat state.
   */
  public async getAutoRepeat(): Promise<OnOffState> {
    const response = await this.transport.queryText('TRIG:EV:AUTOREPEAT?')
    return parseOnOffResponse(response)
  }

  /**
   * Query trigger event count.
   *
   * @returns Trigger event count.
   */
  public async getEventCount(): Promise<number> {
    const response = await this.transport.queryText('TRIG:EV:COUNT?')
    return parseSingleInt(response, 'trigger event count')
  }

  /**
   * Replace the full trigger message-type filter list.
   *
   * @param filters - Trigger message-type filters.
   */
  public async setMessageTypeFilters(filters: TriggerMessageTypeFilter[]): Promise<void> {
    await this.clearMessageTypeFilters()

    if (filters.length === 0) {
      return
    }

    for (let slot = 0; slot < filters.length; slot += 1) {
      const filter = filters[slot]
      await this.transport.sendCommand(
        'TRIG:EV:MSGTYPE:FILTER',
        slot,
        `${filter.class}:${filter.messageTypeNumber}`,
      )
    }
  }

  /**
   * Query the trigger message-type filter list.
   *
   * @returns Trigger message-type filters.
   */
  public async getMessageTypeFilters(): Promise<TriggerMessageTypeFilter[]> {
    const response = await this.transport.queryText('TRIG:EV:MSGTYPE:FILTER?')
    return parseTriggerMessageTypeFiltersResponse(response)
  }

  /**
   * Clear all trigger message-type filters.
   */
  public async clearMessageTypeFilters(): Promise<void> {
    await this.transport.sendCommand('TRIG:EV:MSGTYPE:FILTER:CLEAR')
  }

  /**
   * Set sync output mode.
   *
   * @param mode - Sync output mode.
   */
  public async setSyncMode(mode: TriggerSyncMode): Promise<void> {
    await this.transport.sendCommand('TRIG:SYNC:MODE', scpiEnum(mode))
  }

  /**
   * Query sync output mode.
   *
   * @returns Sync output mode.
   */
  public async getSyncMode(): Promise<TriggerSyncMode> {
    const response = await this.transport.queryText('TRIG:SYNC:MODE?')
    return parseTriggerSyncModeResponse(response)
  }

  /**
   * Set sync pulse width in microseconds.
   *
   * @param widthUs - Pulse width in microseconds.
   */
  public async setSyncPulseWidthUs(widthUs: number): Promise<void> {
    await this.transport.sendCommand('TRIG:SYNC:PULSEWIDTH', widthUs)
  }

  /**
   * Query sync pulse width in microseconds.
   *
   * @returns Pulse width in microseconds.
   */
  public async getSyncPulseWidthUs(): Promise<number> {
    const response = await this.transport.queryText('TRIG:SYNC:PULSEWIDTH?')
    return parseSingleInt(response, 'sync pulse width')
  }

  /**
   * Query composite trigger information.
   *
   * @returns Trigger information structure.
   */
  public async getInfo(): Promise<TriggerInfo> {
    const [status, type, eventThreshold, autorepeat, eventCount, syncMode, syncPulseWidthUs, messageTypeFilters] =
      await Promise.all([
        this.getStatus(),
        this.getEventType(),
        this.getEventThreshold(),
        this.getAutoRepeat(),
        this.getEventCount(),
        this.getSyncMode(),
        this.getSyncPulseWidthUs(),
        this.getMessageTypeFilters(),
      ])

    return {
      status,
      type,
      eventThreshold,
      autorepeat,
      eventCount,
      syncMode,
      syncPulseWidthUs,
      messageTypeFilters,
    }
  }
}
