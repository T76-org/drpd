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
 * Browser firmware-update write chunk.
 */
export interface DRPDFirmwareUpdateChunk {
  offset: number
  data: Uint8Array
}

/**
 * Firmware-update request consumed by WinUSB-capable transports.
 */
export interface DRPDFirmwareUpdateRequest {
  baseOffset: number
  totalLength: number
  crc32: number
  chunks: DRPDFirmwareUpdateChunk[]
  onProgress?: (progress: DRPDFirmwareUpdateProgress) => void
}

/**
 * Firmware-update progress snapshot.
 */
export interface DRPDFirmwareUpdateProgress {
  bytesWritten: number
  totalLength: number
}

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

  /**
   * Stream an application-region firmware image to the resident updater.
   *
   * Only WinUSB transports implement this in v1.
   *
   * @param request - Parsed update image and progress callback.
   */
  updateFirmware?(request: DRPDFirmwareUpdateRequest): Promise<void>
}
