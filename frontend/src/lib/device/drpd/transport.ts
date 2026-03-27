/**
 * @file transport.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Minimal transport interface for DRPD device drivers.
 */

/**
 * Supported SCPI parameter payload type.
 */
export type DRPDSCPIParam = string | number | boolean | { raw: string }

/**
 * Shared interrupt event name emitted by DRPD USB transports.
 */
export const DRPD_TRANSPORT_INTERRUPT_EVENT = 'interrupt'

/**
 * Shared interrupt error event name emitted by DRPD USB transports.
 */
export const DRPD_TRANSPORT_INTERRUPT_ERROR_EVENT = 'interrupterror'

/**
 * Transport identity exposed for diagnostics and selection logging.
 */
export type DRPDTransportKind = 'usbtmc' | 'winusb'

/**
 * Transport interface used by DRPD drivers.
 */
export interface DRPDTransport {
  readonly kind: DRPDTransportKind
  readonly claimedInterfaceNumber?: number

  /**
   * Send a SCPI command.
   *
   * @param command - SCPI command mnemonic.
   * @param params - SCPI parameters.
   */
  sendCommand(command: string, ...params: DRPDSCPIParam[]): Promise<void>

  /**
   * Send a SCPI query and return parsed string tokens.
   *
   * @param command - SCPI command mnemonic.
   * @param params - SCPI parameters.
   * @returns Parsed response tokens.
   */
  queryText(command: string, ...params: DRPDSCPIParam[]): Promise<string[]>

  /**
   * Send a SCPI query and return a binary payload.
   *
   * @param command - SCPI command mnemonic.
   * @param params - SCPI parameters.
   * @returns Binary payload bytes.
   */
  queryBinary(command: string, ...params: DRPDSCPIParam[]): Promise<Uint8Array>
}
