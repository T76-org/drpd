/**
 * @file transportProxy.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Worker-backed DRPD transport proxy that preserves USBTMC request serialization.
 */

import USBTMCTransport from '../../../transport/usbtmc'
import type { DRPDSCPIParam, DRPDTransport } from '../transport'
import { DRPDWorkerServiceClient } from './service'

let transportProxyCounter = 1

/**
 * Worker-backed transport proxy that forwards commands through the DRPD worker.
 */
export class DRPDWorkerTransportProxy extends EventTarget implements DRPDTransport {
  protected readonly id: string ///< Worker transport id.
  protected readonly client: DRPDWorkerServiceClient ///< Shared worker client.
  protected closed: boolean ///< True after close().

  /**
   * Create a worker-backed transport proxy.
   *
   * @param id - Worker transport id.
   * @param client - Shared worker client.
   */
  protected constructor(id: string, client: DRPDWorkerServiceClient) {
    super()
    this.id = id
    this.client = client
    this.closed = false
  }

  /**
   * Register a main-thread USBTMC transport with the worker and create a proxy.
   *
   * @param hostTransport - Opened USBTMC transport instance.
   * @returns Worker-backed transport proxy.
   */
  public static async create(hostTransport: USBTMCTransport): Promise<DRPDWorkerTransportProxy> {
    const client = DRPDWorkerServiceClient.getShared()
    const id = `transport-${transportProxyCounter++}`
    const proxy = new DRPDWorkerTransportProxy(id, client)
    await client.registerHostTransport(id, hostTransport, (eventName, detail) => {
      const mappedName =
        eventName === 'interrupt'
          ? USBTMCTransport.INTERRUPT_EVENT
          : USBTMCTransport.INTERRUPT_ERROR_EVENT
      proxy.dispatchEvent(new CustomEvent(mappedName, { detail }))
    })
    return proxy
  }

  /**
   * Send a SCPI command.
   *
   * @param command - SCPI command mnemonic.
   * @param params - SCPI parameters.
   */
  public async sendCommand(command: string, ...params: DRPDSCPIParam[]): Promise<void> {
    this.ensureOpen()
    await this.client.callWorker('transport.call', {
      transportId: this.id,
      op: 'sendCommand',
      command,
      params,
    })
  }

  /**
   * Send a SCPI text query.
   *
   * @param command - SCPI command mnemonic.
   * @param params - SCPI parameters.
   * @returns Parsed response tokens.
   */
  public async queryText(command: string, ...params: DRPDSCPIParam[]): Promise<string[]> {
    this.ensureOpen()
    return await this.client.callWorker<string[]>('transport.call', {
      transportId: this.id,
      op: 'queryText',
      command,
      params,
    })
  }

  /**
   * Send a SCPI binary query.
   *
   * @param command - SCPI command mnemonic.
   * @param params - SCPI parameters.
   * @returns Binary response payload.
   */
  public async queryBinary(command: string, ...params: DRPDSCPIParam[]): Promise<Uint8Array> {
    this.ensureOpen()
    return await this.client.callWorker<Uint8Array>('transport.call', {
      transportId: this.id,
      op: 'queryBinary',
      command,
      params,
    })
  }

  /**
   * Optional parity method with USBTMCTransport for cleanup paths.
   */
  public async close(): Promise<void> {
    if (this.closed) {
      return
    }
    this.closed = true
    try {
      await this.client.callWorker('transport.close', { transportId: this.id })
    } finally {
      await this.client.closeAndUnregisterHostTransport(this.id)
    }
  }

  /**
   * Ensure the proxy has not been closed.
   */
  protected ensureOpen(): void {
    if (this.closed) {
      throw new Error('DRPD worker transport proxy is closed')
    }
  }
}

