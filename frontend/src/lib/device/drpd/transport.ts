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
 * Transport interface used by DRPD drivers.
 */
export interface DRPDTransport {
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
