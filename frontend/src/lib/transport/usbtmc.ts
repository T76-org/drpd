/**
 * @file usbtmc.ts
 * @copyright Copyright (c) 2026 MTA, Inc. 
 * 
 * The USBTMCTransport class provides connectivity to USBTMC-compliant instruments
 * using the WebUSB API. It supports sending SCPI commands, querying responses,
 * and handling binary data transfers.
 */

/**
 * Payload types accepted by the USBTMC transport.
 */
export type USBTMCPayload = Uint8Array | ArrayBuffer | DataView | string

/** USBTMC interface class code. */
const USBTMC_INTERFACE_CLASS = 0xfe
/** USBTMC interface subclass code. */
const USBTMC_INTERFACE_SUBCLASS = 0x03
/** USBTMC interface protocol code. */
const USBTMC_INTERFACE_PROTOCOL = 0x01

/** USBTMC DEV_DEP_MSG_OUT message ID. */
const USBTMC_MSG_DEV_DEP_OUT = 0x01
/** USBTMC DEV_DEP_MSG_IN message ID. */
const USBTMC_MSG_DEV_DEP_IN = 0x02
/** USBTMC class request: INITIATE_ABORT_BULK_OUT. */
const USBTMC_REQ_INITIATE_ABORT_BULK_OUT = 0x01
/** USBTMC class request: CHECK_ABORT_BULK_OUT_STATUS. */
const USBTMC_REQ_CHECK_ABORT_BULK_OUT_STATUS = 0x02
/** USBTMC class request: INITIATE_ABORT_BULK_IN. */
const USBTMC_REQ_INITIATE_ABORT_BULK_IN = 0x03
/** USBTMC class request: CHECK_ABORT_BULK_IN_STATUS. */
const USBTMC_REQ_CHECK_ABORT_BULK_IN_STATUS = 0x04
/** USBTMC class request: INITIATE_CLEAR. */
const USBTMC_REQ_INITIATE_CLEAR = 0x05
/** USBTMC class request: CHECK_CLEAR_STATUS. */
const USBTMC_REQ_CHECK_CLEAR_STATUS = 0x06
/** USBTMC status: SUCCESS. */
const USBTMC_STATUS_SUCCESS = 0x01
/** USBTMC status: PENDING. */
const USBTMC_STATUS_PENDING = 0x02
/** USBTMC status: FAILED. */
const USBTMC_STATUS_FAILED = 0x80
/** USBTMC status: TRANSFER_NOT_IN_PROGRESS. */
const USBTMC_STATUS_TRANSFER_NOT_IN_PROGRESS = 0x81

/**
 * Supported SCPI parameter types.
 */
export type SCPIParam = string | number | boolean | SCPIEnum

/**
 * Raw SCPI enum wrapper for unescaped tokens.
 */
export type SCPIEnum = {
  raw: string ///< Raw enum token sent without escaping.
}

/**
 * SCPI response field types.
 */
export type SCPIFieldType = 'string' | 'number' | 'int' | 'boolean' | 'enum' | 'custom'

/**
 * SCPI field descriptor used for mapping response values.
 */
export type SCPIFieldDescriptor<T, K extends keyof T> = {
  name: K
  type: SCPIFieldType
  required?: boolean
  default?: T[K]
  enumMap?: Record<string, T[K]>
  parser?: (raw: string) => T[K]
  transform?: (value: T[K]) => T[K]
}

/**
 * SCPI mapping definition for a response type.
 */
export type SCPIMap<T> = readonly SCPIFieldDescriptor<T, keyof T>[]

/**
 * SCPI-mappable class constructor contract.
 */
export interface SCPIMappableConstructor<T> {
  new (): T
  scpiMap: SCPIMap<T>
  fromSCPI?: (values: string[]) => T
}

/**
 * Wrap a raw SCPI enum token so it is sent unescaped.
 *
 * @param value - Raw SCPI token.
 * @returns SCPI enum wrapper.
 */
export const scpiEnum = (value: string): SCPIEnum => ({ raw: value })

/**
 * Configuration options for USBTMC transport.
 */
export interface USBTMCOptions {
  interfaceNumber?: number ///< Interface number to claim; auto-discovered if omitted.
  readTimeoutMs?: number ///< Read timeout in milliseconds.
  writeTimeoutMs?: number ///< Write timeout in milliseconds.
}

/**
 * Resolved USBTMC options after defaults are applied.
 */
type ResolvedUSBTMCOptions = Omit<
  Required<USBTMCOptions>,
  'interfaceNumber'
> & {
  interfaceNumber?: number
}

type USBTMCControlPollSpec = {
  initiateRequest: number
  initiateLength: number
  initiateLabel: string
  checkRequest: number
  checkLength: number
  checkLabel: string
  setup: Pick<USBControlTransferParameters, 'recipient' | 'value' | 'index'>
  allowTransferNotInProgress?: boolean
  drainBeforePolling?: boolean
  drainOnPending?: boolean
  clearHaltDirection?: USBDirection
  clearHaltEndpoint?: number
}

/**
 * Default USBTMC options.
 */
const DEFAULT_OPTIONS: ResolvedUSBTMCOptions = {
  readTimeoutMs: 500,
  writeTimeoutMs: 500,
}

/**
 * Represents the 12-byte USBTMC header.
 */
class USBTMCHeader {
  static readonly SIZE = 12 ///< USBTMC header size in bytes.

  /**
   * Create a parsed USBTMC header instance.
   *
   * @param msgId - Message identifier.
   * @param bTag - Transaction tag.
   * @param transferSize - Transfer size in bytes.
   * @param bmTransferAttributes - Transfer attributes bitfield.
   */
  constructor(
    msgId: number,
    bTag: number,
    transferSize: number,
    bmTransferAttributes = 0,
  ) {
    this.msgId = msgId
    this.bTag = bTag
    this.transferSize = transferSize
    this.bmTransferAttributes = bmTransferAttributes
  }

  public readonly msgId: number ///< Message ID.
  public readonly bTag: number ///< bTag correlating request and response.
  public readonly transferSize: number ///< Transfer size in bytes.
  public readonly bmTransferAttributes: number ///< Transfer attributes bitfield.

  /**
   * Build a raw USBTMC header for transmission.
   *
   * @param msgId - Message identifier.
   * @param bTag - Transaction tag.
   * @param transferSize - Transfer size in bytes.
   * @param bmTransferAttributes - Transfer attributes bitfield.
   * @returns Serialized USBTMC header.
   */
  static build(
    msgId: number,
    bTag: number,
    transferSize: number,
    bmTransferAttributes = 0,
  ): Uint8Array {
    const buffer = new Uint8Array(USBTMCHeader.SIZE)
    const view = new DataView(buffer.buffer)
    buffer[0] = msgId
    buffer[1] = bTag
    buffer[2] = 0xff - bTag
    buffer[3] = 0x00
    view.setUint32(4, transferSize, true)
    buffer[8] = bmTransferAttributes
    buffer[9] = 0x00
    buffer[10] = 0x00
    buffer[11] = 0x00
    return buffer
  }

  /**
   * Parse a USBTMC header from the front of a transfer.
   *
   * @param data - Raw transfer data.
   * @returns Parsed USBTMC header.
   * @throws Error when the header is incomplete or invalid.
   */
  static parse(data: Uint8Array): USBTMCHeader {
    if (data.byteLength < USBTMCHeader.SIZE) {
      throw new Error('USBTMC header is incomplete')
    }
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    const msgId = data[0]
    const bTag = data[1]
    const bTagInverse = data[2]
    if ((bTag ^ bTagInverse) !== 0xff) {
      throw new Error('Invalid USBTMC bTag inverse')
    }
    const transferSize = view.getUint32(4, true)
    const bmTransferAttributes = data[8]
    return new USBTMCHeader(msgId, bTag, transferSize, bmTransferAttributes)
  }
}

/**
 * Timeout error raised by USBTMC operations.
 */
export class USBTMCTimeoutError extends Error {
  public readonly operation: 'read' | 'write' ///< Operation that timed out.
  public readonly timeoutMs: number ///< Timeout duration in milliseconds.
  public readonly command?: string ///< Command associated with the timeout.

  /**
   * Create a timeout error instance.
   *
   * @param operation - Operation that timed out.
   * @param timeoutMs - Timeout duration in milliseconds.
   * @param command - Command that triggered the timeout.
   */
  constructor(operation: 'read' | 'write', timeoutMs: number, command?: string) {
    const suffix = command ? ` (command: ${command})` : ''
    super(`USBTMC ${operation} timed out after ${timeoutMs}ms${suffix}`)
    this.name = 'USBTMCTimeoutError'
    this.operation = operation
    this.timeoutMs = timeoutMs
    this.command = command
  }
}

/**
 * Minimal USBTMC transport scaffold for WebUSB devices.
 *
 * Note: Device-specific USBTMC message framing, status handling,
 * and error mapping still need to be implemented.
 */
export class USBTMCTransport extends EventTarget {
  private readonly device: USBDevice ///< WebUSB device instance.
  private readonly options: ResolvedUSBTMCOptions ///< Resolved transport options.
  private readonly encoder = new TextEncoder() ///< Text encoder for string payloads.
  private readonly decoder = new TextDecoder() ///< Text decoder for string responses.
  private tagCounter = 1 ///< Rolling tag counter for USBTMC transactions.
  private lastOutTag?: number ///< Last transmitted bTag for validation.
  private interruptAbort?: AbortController ///< Abort controller for interrupt polling.
  private interfaceNumber?: number ///< Claimed USBTMC interface number.
  private endpointOut?: number ///< Bulk OUT endpoint number.
  private endpointIn?: number ///< Bulk IN endpoint number.
  private endpointInterrupt?: number ///< Interrupt IN endpoint number.
  private bulkOutPacketSize?: number ///< Bulk OUT packet size.
  private bulkInPacketSize?: number ///< Bulk IN packet size.
  private requestQueue: Promise<void> = Promise.resolve() ///< Serialized request queue.

  /**
   * Event name for interrupt payloads.
   */
  static readonly INTERRUPT_EVENT = 'interrupt'

  /**
   * Event name for interrupt polling errors.
   */
  static readonly INTERRUPT_ERROR_EVENT = 'interrupterror'

  /**
   * Create a new USBTMC transport instance.
   *
   * @param device - WebUSB device instance.
   * @param options - Transport options.
   */
  constructor(device: USBDevice, options: USBTMCOptions = {}) {
    super()
    this.device = device
    this.options = {
      interfaceNumber: options.interfaceNumber,
      readTimeoutMs: options.readTimeoutMs ?? DEFAULT_OPTIONS.readTimeoutMs,
      writeTimeoutMs: options.writeTimeoutMs ?? DEFAULT_OPTIONS.writeTimeoutMs,
    }
  }

  /**
   * Prompt the user to select a USBTMC device via WebUSB.
   *
   * @returns Selected WebUSB device.
   * @throws Error when WebUSB is unavailable.
   */
  static async requestDevice(): Promise<USBDevice> {
    if (!('usb' in navigator)) {
      throw new Error('WebUSB is not available in this environment')
    }

    return navigator.usb.requestDevice({
      filters: [
        {
          classCode: USBTMC_INTERFACE_CLASS,
          subclassCode: USBTMC_INTERFACE_SUBCLASS,
          protocolCode: USBTMC_INTERFACE_PROTOCOL,
        },
      ],
    })
  }

  /**
   * Discover already-authorized USBTMC devices.
   *
   * @returns List of authorized USBTMC devices.
   */
  static async discoverDevices(): Promise<USBDevice[]> {
    if (!('usb' in navigator)) {
      return []
    }

    const devices = await navigator.usb.getDevices()
    return devices.filter((device) => USBTMCTransport._isUSBTMCDevice(device))
  }

  /**
   * Open the device and claim the configured interface.
   *
   * @returns Promise that resolves when the device is ready.
   * @throws Error when the interface or endpoints are not found.
   */
  async open(): Promise<void> {
    if (!this.device.opened) {
      await this.device.open()
    }

    if (this.device.configuration == null && this.device.configurations?.length) {
      const match = this._findUSBTMCInterfaceInConfigurations(this.device.configurations)
      await this.device.selectConfiguration(
        match?.configurationValue ?? this.device.configurations[0].configurationValue,
      )
    }

    const interfaceNumber =
      this.options.interfaceNumber ?? this._findUSBTMCInterfaceInConfiguration()

    if (interfaceNumber == null) {
      throw new Error('USBTMC interface not found on device')
    }

    await this.device.claimInterface(interfaceNumber)
    this.interfaceNumber = interfaceNumber

    const endpoints = this._findUSBTMCEndpoints()

    if (!endpoints) {
      throw new Error('USBTMC endpoints not found on device')
    }

    this.endpointIn = endpoints.endpointIn
    this.endpointOut = endpoints.endpointOut
    this.endpointInterrupt = endpoints.endpointInterrupt
    this.bulkOutPacketSize = endpoints.bulkOutPacketSize
    this.bulkInPacketSize = endpoints.bulkInPacketSize

    await this._abortPendingTransfers()

    this._startInterruptListener(endpoints.interruptPacketSize)
  }

  /**
   * Close the device and stop interrupt polling.
   *
   * @returns Promise that resolves when the device is closed.
   */
  async close(): Promise<void> {
    this._stopInterruptListener()
    if (this.device.opened) {
      await this.device.close()
    }
  }


  /**
   * Write raw data to the device's Bulk OUT endpoint.
   *
   * @param payload - Raw payload to transmit.
   * @returns Promise that resolves when the transfer completes.
   * @throws Error when the OUT endpoint is not initialized.
   */
  protected async _write(payload: USBTMCPayload): Promise<void> {
    if (this.endpointOut == null) {
      throw new Error('USBTMC endpoint OUT not initialized')
    }
    const data = this._normalizePayload(payload)
    const tagged = this._wrapUSBTMCOut(data)
    const packetSize = this.bulkOutPacketSize ?? tagged.byteLength
    for (let offset = 0; offset < tagged.byteLength; offset += packetSize) {
      const chunk = tagged.subarray(offset, offset + packetSize)
      await this.device.transferOut(this.endpointOut, chunk as BufferSource)
    }
    // TODO: add USBTMC status phase handling and optional write timeout logic.
  }

  /**
   * Read from the device's Bulk IN endpoint.
   *
   * @param length - Maximum payload length to request.
   * @returns Payload bytes from the device.
   * @throws Error when the IN endpoint is not initialized or empty.
   */
  protected async _read(length: number): Promise<Uint8Array> {
    if (this.endpointIn == null) {
      throw new Error('USBTMC endpoint IN not initialized')
    }
    const payload = await this._readUSBTMCIn(length)
    if (!payload) {
      throw new Error('USBTMC read returned empty data')
    }

    return payload
  }

  /**
   * Send a SCPI command and check the error queue.
   *
   * @param command - SCPI command mnemonic.
   * @param params - SCPI parameters.
   * @returns Promise that resolves when the command is sent and checked.
   * @throws USBTMCTimeoutError when the device times out.
   * @throws Error when the device reports an error.
   */
  async sendCommand(command: string, ...params: SCPIParam[]): Promise<void> {
    await this._withLock(async () => {
      const line = this._formatSCPI(command, params)
      console.debug(`Command: ${line}`)
      await this._withTimeout(
        this._write(`${line}\n`),
        this.options.writeTimeoutMs,
        'write',
        line,
      )
      await this._checkErrorUnlocked(line)
    })
  }

  /**
   * Send a SCPI query and await the response.
   *
   * @param command - SCPI command mnemonic.
   * @param params - SCPI parameters.
   * @returns Parsed response values with quoted strings unescaped.
   * @throws USBTMCTimeoutError when the device times out.
   * @throws Error when the device returns invalid data.
   */
  async queryText(command: string, ...params: SCPIParam[]): Promise<string[]> {
    return await this._withLock(async () => {
      return await this._queryInternal(command, params, true)
    })
  }

  /**
   * Send a SCPI query and map the response into a typed structure.
   *
   * @param ctor - Response class constructor with mapping metadata.
   * @param command - SCPI command mnemonic.
   * @param params - SCPI parameters.
   * @returns Mapped response instance.
   * @throws USBTMCTimeoutError when the device times out.
   * @throws Error when the device returns invalid data.
   */
  async queryAs<T>(
    ctor: SCPIMappableConstructor<T>,
    command: string,
    ...params: SCPIParam[]
  ): Promise<T> {
    const values = await this.queryText(command, ...params)
    return this._mapSCPIValues(ctor, values)
  }

  /**
   * Send a binary query payload and await a binary response.
   *
   * @param command - SCPI command mnemonic.
   * @param params - SCPI parameters.
   * @returns Parsed ARB payload bytes.
   * @throws USBTMCTimeoutError when the device times out.
   * @throws Error when the device returns invalid data.
   */
  async queryBinary(command: string, ...params: SCPIParam[]): Promise<Uint8Array> {
    return await this._withLock(async () => {
      console.debug(`Binary Query: ${this._formatSCPI(command, params)}`)
      const line = this._formatSCPI(command, params)
      const data = this._normalizePayload(`${line}\n`)
      try {
        await this._withTimeout(this._write(data), this.options.writeTimeoutMs, 'write', line)
        const response = await this._readARBBlockResponse(line)
        return this._parseARBData(response)
      } catch (error) {
        if (error instanceof USBTMCTimeoutError) {
          await this._checkErrorUnlocked(line)
        }
        throw error
      }
    })
  }

  /**
   * Query the instrument error queue and throw if an error is reported.
   *
   * @returns Promise that resolves when no error is reported.
   * @throws Error when the instrument reports a non-zero error code.
   */
  async checkError(command: string): Promise<void> {
    await this._withLock(async () => {
      await this._checkErrorUnlocked(command)
    })
  }

  /**
   * Query the instrument error queue without acquiring the transport lock.
   */
  protected async _checkErrorUnlocked(command: string): Promise<void> {
    this.device.clearHalt("in", this.endpointIn!)
    this.device.clearHalt("out", this.endpointOut!)

    const response = await this._queryInternal('SYST:ERR?', [], false)
    const combined = response.join(' ')
    const match = combined.match(/^\s*([+-]?\d+)\s*,?\s*(.*)$/)
    if (!match) {
      console.warn(`Unrecognized SYST:ERR? response for "${command}": ${combined}`)
      throw new Error(`USBTMC error query returned unrecognized response for "${command}": ${combined}`)
    }

    const code = Number.parseInt(match[1], 10)
    const message = match[2]?.trim() ?? ''
    if (code !== 0) {
      const cleaned = message.replace(/^"|"$/g, '')
      console.warn(`USBTMC device error ${code} for "${command}": ${cleaned || 'Unknown error'}`)
      throw new Error(`USBTMC device error ${code} for "${command}": ${cleaned || 'Unknown error'}`)
    }
  }

  /**
   * Run a request under a serialized transport lock.
   *
   * @param action - Async action to execute.
   * @returns Action result.
   */
  protected async _withLock<T>(action: () => Promise<T>): Promise<T> {
    let release: (() => void) | undefined
    const previous = this.requestQueue
    this.requestQueue = new Promise<void>((resolve) => {
      release = () => {
        resolve()
      }
    })
    await previous
    try {
      return await action()
    } finally {
      release?.()
    }
  }

  /**
   * Execute a SCPI query with optional timeout error handling.
   *
   * @param command - SCPI command mnemonic.
   * @param params - SCPI parameters.
   * @param checkOnTimeout - Whether to call checkError on timeout.
   * @returns Parsed response values with quoted strings unescaped.
   * @throws USBTMCTimeoutError when the device times out.
   * @throws Error when the device returns invalid data.
   */
  protected async _queryInternal(
    command: string,
    params: SCPIParam[],
    checkOnTimeout: boolean,
  ): Promise<string[]> {
    const line = this._formatSCPI(command, params)
    try {
      await this._withTimeout(
        this._write(`${line}\n`),
        this.options.writeTimeoutMs,
        'write',
        line,
      )
      const response = await this._readUntilTerminator(line)
      console.debug(`Query: "${line}" - Response ${response}`)
      return this._parseSCPIResponse(response)
    } catch (error) {
      if (
        checkOnTimeout &&
        error instanceof USBTMCTimeoutError &&
        error.operation === 'read'
      ) {
        try {
          console.warn(`Checking error queue after read timeout for "${line}"`)
          await this._checkErrorUnlocked(line)
        } catch (checkError) {
          console.warn(
            `USBTMC error check failed after timeout for "${line}": ${String(checkError)}`,
          )
        }
      }
      throw error
    }
  }

  /**
   * Normalize payloads into a byte array.
   *
   * @param payload - Raw payload in supported formats.
   * @returns Payload as a Uint8Array.
   */
  protected _normalizePayload(payload: USBTMCPayload): Uint8Array {
    if (typeof payload === 'string') {
      return this.encoder.encode(payload)
    }

    if (payload instanceof Uint8Array) {
      return payload
    }

    if (payload instanceof ArrayBuffer) {
      return new Uint8Array(payload)
    }

    return new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength)
  }

  /**
   * Wrap outgoing payloads in a USBTMC DEV_DEP_MSG_OUT header.
   *
   * @param payload - Raw payload bytes.
   * @returns Full USBTMC transfer buffer.
   */
  protected _wrapUSBTMCOut(payload: Uint8Array): Uint8Array {
    const transferSize = payload.byteLength
    const paddedSize = Math.ceil(transferSize / 4) * 4
    const bTag = this._nextTag()
    this.lastOutTag = bTag
    const header = USBTMCHeader.build(
      USBTMC_MSG_DEV_DEP_OUT,
      bTag,
      transferSize,
      0x01,
    )
    const buffer = new Uint8Array(USBTMCHeader.SIZE + paddedSize)
    buffer.set(header, 0)
    buffer.set(payload, USBTMCHeader.SIZE)
    return buffer
  }

  /**
   * Increment and return the next USBTMC bTag.
   *
   * @returns Next bTag value.
   */
  protected _nextTag(): number {
    const tag = this.tagCounter & 0xff
    this.tagCounter = (this.tagCounter + 1) & 0xff
    return tag === 0 ? 1 : tag
  }

  /**
   * Issue a DEV_DEP_MSG_IN request and read the response payload.
   *
   * @param requestedLength - Maximum response length to request.
   * @returns Response payload bytes.
   * @throws Error when endpoints are missing or response is invalid.
   */
  protected async _readUSBTMCIn(requestedLength: number): Promise<Uint8Array> {
    if (this.endpointIn == null) {
      throw new Error('USBTMC endpoint IN not initialized')
    }
    if (this.endpointOut == null) {
      throw new Error('USBTMC endpoint OUT not initialized')
    }

    const bTag = this._nextTag()
    this.lastOutTag = bTag
    const headerOut = USBTMCHeader.build(
      USBTMC_MSG_DEV_DEP_IN,
      bTag,
      requestedLength,
      0x00,
    )
    await this.device.transferOut(this.endpointOut, headerOut as BufferSource)

    const chunks: Uint8Array[] = []
    let expected = 0
    let received = 0

    while (expected === 0 || received < expected) {
      const minLength = requestedLength + USBTMCHeader.SIZE
      const packetSize = this.bulkInPacketSize ?? minLength
      const transferLength =
        Math.ceil(minLength / packetSize) * packetSize
      const result = await this.device.transferIn(
        this.endpointIn,
        transferLength,
      )

      if (!result.data || result.data.byteLength < USBTMCHeader.SIZE) {
        break
      }

      const data = new Uint8Array(
        result.data.buffer.slice(0, result.data.byteLength),
      )
      const header = USBTMCHeader.parse(data)

      if (header.msgId !== USBTMC_MSG_DEV_DEP_IN) {
        throw new Error(`Unexpected USBTMC message ID: ${header.msgId}`)
      }

      if (this.lastOutTag != null && header.bTag !== this.lastOutTag) {
        throw new Error('USBTMC response bTag does not match request')
      }

      if (expected === 0) {
        expected = header.transferSize
      }

      const payload = data.subarray(USBTMCHeader.SIZE)
      const remaining = expected - received
      const take = Math.min(payload.length, remaining)
      if (take > 0) {
        chunks.push(payload.subarray(0, take))
        received += take
      }

      if (received >= expected) {
        break
      }
    }

    if (chunks.length === 0) {
      return new Uint8Array()
    }

    const merged = new Uint8Array(received)
    let offset = 0
    for (const chunk of chunks) {
      merged.set(chunk, offset)
      offset += chunk.length
    }
    return merged
  }

  /**
   * Best-effort USBTMC bulk resynchronization during open().
   */
  protected async _abortPendingTransfers(): Promise<void> {
    await this._abortBulkOut()
    await this._abortBulkIn()
    await this._clearBuffers()
  }

  /**
   * Abort any in-progress Bulk-OUT transfer and wait for completion.
   */
  protected async _abortBulkOut(): Promise<void> {
    if (this.endpointOut == null) {
      throw new Error('USBTMC endpoint OUT not initialized')
    }

    await this._runControlTransferPoll({
      initiateRequest: USBTMC_REQ_INITIATE_ABORT_BULK_OUT,
      initiateLength: 2,
      initiateLabel: 'INITIATE_ABORT_BULK_OUT',
      checkRequest: USBTMC_REQ_CHECK_ABORT_BULK_OUT_STATUS,
      checkLength: 8,
      checkLabel: 'CHECK_ABORT_BULK_OUT_STATUS',
      setup: {
        recipient: 'endpoint',
        value: this.lastOutTag ?? 0,
        index: this._getEndpointAddress('out', this.endpointOut),
      },
      allowTransferNotInProgress: true,
      clearHaltDirection: 'out',
      clearHaltEndpoint: this.endpointOut,
    })
  }

  /**
   * Abort any in-progress Bulk-IN transfer and wait for completion.
   */
  protected async _abortBulkIn(): Promise<void> {
    if (this.endpointIn == null) {
      throw new Error('USBTMC endpoint IN not initialized')
    }

    await this._runControlTransferPoll({
      initiateRequest: USBTMC_REQ_INITIATE_ABORT_BULK_IN,
      initiateLength: 2,
      initiateLabel: 'INITIATE_ABORT_BULK_IN',
      checkRequest: USBTMC_REQ_CHECK_ABORT_BULK_IN_STATUS,
      checkLength: 8,
      checkLabel: 'CHECK_ABORT_BULK_IN_STATUS',
      setup: {
        recipient: 'endpoint',
        value: this.lastOutTag ?? 0,
        index: this._getEndpointAddress('in', this.endpointIn),
      },
      allowTransferNotInProgress: true,
      drainBeforePolling: true,
      drainOnPending: true,
    })
  }

  /**
   * Issue USBTMC INITIATE_CLEAR and poll until the device reports completion.
   */
  protected async _clearBuffers(): Promise<void> {
    if (this.interfaceNumber == null) {
      throw new Error('USBTMC interface not initialized')
    }
    if (this.endpointOut == null) {
      throw new Error('USBTMC endpoint OUT not initialized')
    }

    await this._runControlTransferPoll({
      initiateRequest: USBTMC_REQ_INITIATE_CLEAR,
      initiateLength: 1,
      initiateLabel: 'INITIATE_CLEAR',
      checkRequest: USBTMC_REQ_CHECK_CLEAR_STATUS,
      checkLength: 2,
      checkLabel: 'CHECK_CLEAR_STATUS',
      setup: {
        recipient: 'interface',
        value: 0,
        index: this.interfaceNumber,
      },
      drainOnPending: true,
      clearHaltDirection: 'out',
      clearHaltEndpoint: this.endpointOut,
    })
  }

  /**
   * Read Bulk-IN packets until the device terminates the transfer with a short packet.
   */
  protected async _drainBulkInToShortPacket(): Promise<void> {
    if (this.endpointIn == null) {
      throw new Error('USBTMC endpoint IN not initialized')
    }

    const packetSize = this.bulkInPacketSize ?? 64
    for (;;) {
      const result = await this.device.transferIn(this.endpointIn, packetSize)
      const received = result.data?.byteLength ?? 0
      if (received < packetSize) {
        return
      }
    }
  }

  /**
   * Issue a USBTMC class-specific control read and validate the response length.
   */
  protected async _controlTransferIn(
    setup: USBControlTransferParameters,
    length: number,
  ): Promise<DataView> {
    const result = await this.device.controlTransferIn(setup, length)
    if (!result.data || result.data.byteLength < length) {
      throw new Error(`USBTMC control transfer returned ${result.data?.byteLength ?? 0} bytes, expected ${length}`)
    }
    return result.data
  }

  /**
   * Run a USBTMC initiate/check control-transfer sequence until the device reports completion.
   */
  protected async _runControlTransferPoll(spec: USBTMCControlPollSpec): Promise<void> {
    const initiate = await this._controlTransferIn(
      {
        requestType: 'class',
        recipient: spec.setup.recipient,
        request: spec.initiateRequest,
        value: spec.setup.value,
        index: spec.setup.index,
      },
      spec.initiateLength,
    )

    const initiateStatus = initiate.getUint8(0)
    if (
      spec.allowTransferNotInProgress &&
      (
        initiateStatus === USBTMC_STATUS_FAILED ||
        initiateStatus === USBTMC_STATUS_TRANSFER_NOT_IN_PROGRESS
      )
    ) {
      return
    }
    if (initiateStatus !== USBTMC_STATUS_SUCCESS) {
      throw new Error(
        `USBTMC ${spec.initiateLabel} failed with status 0x${initiateStatus.toString(16)}`,
      )
    }

    if (spec.drainBeforePolling) {
      await this._drainBulkInToShortPacket()
    }

    for (;;) {
      const check = await this._controlTransferIn(
        {
          requestType: 'class',
          recipient: spec.setup.recipient,
          request: spec.checkRequest,
          value: 0,
          index: spec.setup.index,
        },
        spec.checkLength,
      )
      const checkStatus = check.getUint8(0)
      const bulkInFifoBytes = check.byteLength > 1 && (check.getUint8(1) & 0x01) !== 0

      if (checkStatus === USBTMC_STATUS_PENDING) {
        if (spec.drainOnPending && bulkInFifoBytes) {
          await this._drainBulkInToShortPacket()
        }
        continue
      }
      if (checkStatus !== USBTMC_STATUS_SUCCESS) {
        throw new Error(
          `USBTMC ${spec.checkLabel} failed with status 0x${checkStatus.toString(16)}`,
        )
      }
      if (spec.clearHaltDirection && spec.clearHaltEndpoint != null) {
        await this.device.clearHalt(spec.clearHaltDirection, spec.clearHaltEndpoint)
      }
      return
    }
  }

  /**
   * Convert an endpoint number and direction into the endpoint address used by control requests.
   */
  protected _getEndpointAddress(direction: 'in' | 'out', endpointNumber: number): number {
    return direction === 'in' ? (0x80 | endpointNumber) : endpointNumber
  }

  /**
   * Format a SCPI command with optional parameters.
   *
   * @param command - SCPI command mnemonic.
   * @param params - SCPI parameters.
   * @returns Formatted SCPI line without terminator.
   */
  protected _formatSCPI(command: string, params: SCPIParam[]): string {
    if (params.length === 0) {
      return command
    }

    const formatted = params.map((param) => this._formatSCPIParam(param)).join(' ')
    return `${command} ${formatted}`
  }

  /**
   * Format a single SCPI parameter.
   *
   * @param param - SCPI parameter value.
   * @returns Formatted SCPI parameter string.
   * @throws Error when the parameter is invalid.
   */
  protected _formatSCPIParam(param: SCPIParam): string {
    if (typeof param === 'number') {
      if (!Number.isFinite(param)) {
        throw new Error('SCPI parameter must be a finite number')
      }
      return String(param)
    }

    if (typeof param === 'boolean') {
      return param ? 'ON' : 'OFF'
    }

    if (this._isSCPIEnum(param)) {
      return param.raw
    }

    const escaped = param.replace(/"/g, '""')
    return `"${escaped}"`
  }

  /**
   * Type guard for SCPI enum values.
   *
   * @param param - Candidate SCPI parameter.
   * @returns True if the parameter is a SCPI enum.
   */
  protected _isSCPIEnum(param: SCPIParam): param is SCPIEnum {
    return typeof param === 'object' && param !== null && 'raw' in param
  }

  /**
   * Parse a SCPI response line into values, handling quoted strings.
   *
   * @param response - Raw SCPI response string.
   * @returns Parsed SCPI response values.
   */
  protected _parseSCPIResponse(response: string): string[] {
    const values: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < response.length; i += 1) {
      const char = response[i]
      if (inQuotes) {
        if (char === '"') {
          const next = response[i + 1]
          if (next === '"') {
            current += '"'
            i += 1
          } else {
            inQuotes = false
          }
        } else {
          current += char
        }
        continue
      }

      if (char === '"') {
        inQuotes = true
        continue
      }

      if (char === ' ' || char === '\t' || char === ',') {
        if (current.length > 0) {
          values.push(current)
          current = ''
        }
        continue
      }

      current += char
    }

    if (current.length > 0) {
      values.push(current)
    }

    return values
  }

  /**
   * Map SCPI response values into a typed instance.
   *
   * @param ctor - Response class constructor with mapping metadata.
   * @param values - Parsed SCPI response values.
   * @returns Mapped response instance.
   * @throws Error when a required value is missing or invalid.
   */
  protected _mapSCPIValues<T>(
    ctor: SCPIMappableConstructor<T>,
    values: string[],
  ): T {
    const override = (ctor as { fromSCPI?: (values: string[]) => T }).fromSCPI
    if (typeof override === 'function') {
      return override(values)
    }

    const instance = new ctor()
    const map = ctor.scpiMap

    for (let index = 0; index < map.length; index += 1) {
      const field = map[index]
      const raw = values[index]
      if (raw == null || raw === '') {
        if (field.required && field.default === undefined) {
          throw new Error(`SCPI response missing value for ${String(field.name)}`)
        }
        if (field.default !== undefined) {
          ;(instance as Record<string, unknown>)[field.name as string] = field.default
        }
        continue
      }

      let value = this._coerceSCPIValue(field, raw)
      if (field.transform) {
        value = field.transform(value as never)
      }
      ;(instance as Record<string, unknown>)[field.name as string] = value
    }

    return instance
  }

  /**
   * Coerce a raw SCPI value to a typed field value.
   *
   * @param field - Field descriptor.
   * @param raw - Raw response value.
   * @returns Coerced field value.
   * @throws Error when the value cannot be coerced.
   */
  protected _coerceSCPIValue<T, K extends keyof T>(
    field: SCPIFieldDescriptor<T, K>,
    raw: string,
  ): T[K] {
    if (field.parser) {
      return field.parser(raw)
    }

    switch (field.type) {
      case 'string':
        return raw as T[K]
      case 'number': {
        const value = Number.parseFloat(raw)
        if (!Number.isFinite(value)) {
          throw new Error(`Invalid SCPI number for ${String(field.name)}`)
        }
        return value as T[K]
      }
      case 'int': {
        const value = Number.parseInt(raw, 10)
        if (!Number.isFinite(value)) {
          throw new Error(`Invalid SCPI integer for ${String(field.name)}`)
        }
        return value as T[K]
      }
      case 'boolean': {
        const normalized = raw.trim().toUpperCase()
        if (['1', 'ON', 'TRUE'].includes(normalized)) {
          return true as T[K]
        }
        if (['0', 'OFF', 'FALSE'].includes(normalized)) {
          return false as T[K]
        }
        throw new Error(`Invalid SCPI boolean for ${String(field.name)}`)
      }
      case 'enum': {
        if (!field.enumMap) {
          throw new Error(`Missing enum map for ${String(field.name)}`)
        }
        const mapped = field.enumMap[raw]
        if (mapped === undefined) {
          throw new Error(`Invalid SCPI enum for ${String(field.name)}`)
        }
        return mapped
      }
      case 'custom': {
        throw new Error(`Missing parser for ${String(field.name)}`)
      }
      default:
        throw new Error(`Unsupported SCPI field type for ${String(field.name)}`)
    }
  }

  /**
   * Read until a newline terminator or timeout.
   *
   * @param command - Command associated with the read.
   * @returns Response string without terminator.
   * @throws Error when a timeout occurs.
   */
  protected async _readUntilTerminator(command?: string): Promise<string> {
    const deadline = Date.now() + this.options.readTimeoutMs
    let text = ''

    while (Date.now() < deadline) {
      const remaining = deadline - Date.now()
      const chunk = await this._withTimeout(this._read(1024), remaining, 'read', command)
      if (chunk.length === 0) {
        continue
      }
      text += this.decoder.decode(chunk, { stream: true })
      if (text.includes('\n')) {
        break
      }
    }

    if (!text) {
      throw new Error('USBTMC read timed out')
    }

    text += this.decoder.decode()
    return text.replace(/\r?\n$/, '')
  }

  /**
   * Read and accumulate a SCPI arbitrary block until the full block is available.
   *
   * @param command - Command associated with the read.
   * @returns Raw response bytes that include a complete ARB block.
   * @throws USBTMCTimeoutError when a full block is not received before timeout.
   */
  protected async _readARBBlockResponse(command?: string): Promise<Uint8Array> {
    const deadline = Date.now() + this.options.readTimeoutMs
    const responseLength = 1024
    const chunks: Uint8Array[] = []
    let totalLength = 0

    while (Date.now() < deadline) {
      const remaining = deadline - Date.now()
      const chunk = await this._withTimeout(
        this._readUSBTMCIn(responseLength),
        remaining,
        'read',
        command,
      )

      if (chunk.length === 0) {
        continue
      }

      chunks.push(chunk)
      totalLength += chunk.length

      const merged = new Uint8Array(totalLength)
      let offset = 0
      for (const part of chunks) {
        merged.set(part, offset)
        offset += part.length
      }

      const completion = this._findARBBlockCompletionOffset(merged)
      if (completion != null) {
        return merged.subarray(0, completion)
      }
    }

    throw new USBTMCTimeoutError('read', this.options.readTimeoutMs, command)
  }

  /**
   * Run a promise with a timeout.
   *
   * @param promise - Promise to execute.
   * @param timeoutMs - Timeout in milliseconds.
   * @param label - Operation label for error reporting.
   * @param command - Command associated with the timeout.
   * @returns Promise resolved with the original result.
   * @throws USBTMCTimeoutError when the timeout elapses.
   */
  protected async _withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    label: 'read' | 'write',
    command?: string,
  ): Promise<T> {
    return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new USBTMCTimeoutError(label, timeoutMs, command))
      }, timeoutMs)
      promise
        .then((value) => resolve(value))
        .catch((error) => reject(error))
        .finally(() => clearTimeout(timer))
    })
  }

  /**
   * Locate USBTMC endpoints for the active configuration.
   *
   * @returns Endpoint information or null when not found.
   */
  protected _findUSBTMCEndpoints(): {
    endpointIn: number
    endpointOut: number
    endpointInterrupt: number
    interruptPacketSize: number
    bulkOutPacketSize: number
    bulkInPacketSize: number
  } | null {
    const configuration = this.device.configuration
    if (!configuration) {
      return null
    }

    for (const usbInterface of configuration.interfaces) {
      const alternate = this._findUSBTMCAlternate(usbInterface)
      if (!alternate) {
        continue
      }

      let endpointIn: number | undefined
      let endpointOut: number | undefined
      let endpointInterrupt: number | undefined
      let bulkOutPacketSize = 0
      let bulkInPacketSize = 0
      let interruptPacketSize = 0

      for (const endpoint of alternate.endpoints) {
        if (endpoint.type === 'bulk' && endpoint.direction === 'in') {
          endpointIn = endpoint.endpointNumber
          bulkInPacketSize = endpoint.packetSize
        } else if (endpoint.type === 'bulk' && endpoint.direction === 'out') {
          endpointOut = endpoint.endpointNumber
          bulkOutPacketSize = endpoint.packetSize
        } else if (endpoint.type === 'interrupt' && endpoint.direction === 'in') {
          endpointInterrupt = endpoint.endpointNumber
          interruptPacketSize = endpoint.packetSize
        }
      }

      if (
        endpointIn != null &&
        endpointOut != null &&
        endpointInterrupt != null
      ) {
        return {
          endpointIn,
          endpointOut,
          endpointInterrupt,
          interruptPacketSize,
          bulkOutPacketSize,
          bulkInPacketSize,
        }
      }
    }

    return null
  }

  /**
   * Find the USBTMC interface number in the active configuration.
   *
   * @returns Interface number or null when not found.
   */
  protected _findUSBTMCInterfaceInConfiguration(): number | null {
    const configuration = this.device.configuration
    if (!configuration) {
      return null
    }

    for (const usbInterface of configuration.interfaces) {
      if (this._isUSBTMCInterface(usbInterface)) {
        return usbInterface.interfaceNumber
      }
    }

    return null
  }

  /**
   * Find the first configuration exposing a USBTMC interface.
   *
   * @param configurations - Available configurations.
   * @returns Configuration and interface information or null.
   */
  protected _findUSBTMCInterfaceInConfigurations(
    configurations: readonly USBConfiguration[],
  ): { configurationValue: number; interfaceNumber: number } | null {
    for (const configuration of configurations) {
      for (const usbInterface of configuration.interfaces) {
        if (this._isUSBTMCInterface(usbInterface)) {
          return {
            configurationValue: configuration.configurationValue,
            interfaceNumber: usbInterface.interfaceNumber,
          }
        }
      }
    }

    return null
  }

  /**
   * Determine whether an interface exposes USBTMC alternates.
   *
   * @param usbInterface - Interface to inspect.
   * @returns True when the interface is USBTMC-capable.
   */
  protected _isUSBTMCInterface(usbInterface: USBInterface): boolean {
    for (const alternate of usbInterface.alternates) {
      if (
        alternate.interfaceClass === USBTMC_INTERFACE_CLASS &&
        alternate.interfaceSubclass === USBTMC_INTERFACE_SUBCLASS &&
        alternate.interfaceProtocol === USBTMC_INTERFACE_PROTOCOL
      ) {
        return true
      }
    }

    return false
  }

  /**
   * Find the USBTMC alternate for the given interface.
   *
   * @param usbInterface - Interface to inspect.
   * @returns USBTMC alternate or null.
   */
  protected _findUSBTMCAlternate(usbInterface: USBInterface): USBAlternateInterface | null {
    for (const alternate of usbInterface.alternates) {
      if (
        alternate.interfaceClass === USBTMC_INTERFACE_CLASS &&
        alternate.interfaceSubclass === USBTMC_INTERFACE_SUBCLASS &&
        alternate.interfaceProtocol === USBTMC_INTERFACE_PROTOCOL
      ) {
        return alternate
      }
    }

    return null
  }

  /**
   * Begin polling the interrupt endpoint and emit events for responses.
   *
   * @param packetSize - Interrupt endpoint packet size.
   */
  protected _startInterruptListener(packetSize: number): void {
    if (this.endpointInterrupt == null) {
      return
    }

    this._stopInterruptListener()
    const abortController = new AbortController()
    this.interruptAbort = abortController

    const poll = async () => {
      while (!abortController.signal.aborted) {
        try {
          const result = await this.device.transferIn(
            this.endpointInterrupt!,
            packetSize || 8,
          )
          if (result.data && result.data.byteLength > 0) {
            const payload = new Uint8Array(
              result.data.buffer.slice(0, result.data.byteLength),
            )
            this.dispatchEvent(
              new CustomEvent(USBTMCTransport.INTERRUPT_EVENT, { detail: payload }),
            )
          }
        } catch (error) {
          if (abortController.signal.aborted) {
            return
          }
          this.dispatchEvent(
            new CustomEvent(USBTMCTransport.INTERRUPT_ERROR_EVENT, { detail: error }),
          )
        }
      }
    }

    void poll()
  }

  /**
   * Stop polling the interrupt endpoint.
   */
  protected _stopInterruptListener(): void {
    if (this.interruptAbort) {
      this.interruptAbort.abort()
      this.interruptAbort = undefined
    }
  }

  /**
   * Check whether a device exposes a USBTMC interface.
   *
   * @param device - Device to inspect.
   * @returns True if the device exposes USBTMC.
   */
  protected static _isUSBTMCDevice(device: USBDevice): boolean {
    const configurations = device.configurations ?? []
    for (const configuration of configurations) {
      for (const usbInterface of configuration.interfaces) {
        for (const alternate of usbInterface.alternates) {
          if (
            alternate.interfaceClass === USBTMC_INTERFACE_CLASS &&
            alternate.interfaceSubclass === USBTMC_INTERFACE_SUBCLASS &&
            alternate.interfaceProtocol === USBTMC_INTERFACE_PROTOCOL
          ) {
            return true
          }
        }
      }
    }

    return false
  }

  /**
   * Parse SCPI arbitrary block data (ARB) and return the binary payload.
   *
   * @param response - Raw response bytes containing a SCPI block.
   * @returns Parsed binary payload.
   * @throws Error when the block header is missing or incomplete.
   */
  protected _parseARBData(response: Uint8Array): Uint8Array {
    let offset = 0
    while (offset < response.length && this._isWhitespaceByte(response[offset])) {
      offset += 1
    }

    if (response[offset] !== 0x23) {
      throw new Error('USBTMC response does not start with a SCPI block')
    }

    offset += 1
    if (offset >= response.length) {
      throw new Error('USBTMC SCPI block header is incomplete')
    }

    const digitCount = response[offset] - 0x30
    if (digitCount < 0 || digitCount > 9) {
      throw new Error('USBTMC SCPI block header has an invalid length field')
    }

    offset += 1

    if (digitCount === 0) {
      const start = offset
      let end = response.length
      for (let i = offset; i < response.length; i += 1) {
        if (response[i] === 0x0a) {
          end = i
          break
        }
      }
      return response.subarray(start, end)
    }

    if (offset + digitCount > response.length) {
      throw new Error('USBTMC SCPI block header is incomplete')
    }

    let length = 0
    for (let i = 0; i < digitCount; i += 1) {
      const value = response[offset + i] - 0x30
      if (value < 0 || value > 9) {
        throw new Error('USBTMC SCPI block header has invalid digits')
      }
      length = length * 10 + value
    }

    offset += digitCount

    if (offset + length > response.length) {
      throw new Error('USBTMC SCPI block payload is incomplete')
    }

    return response.subarray(offset, offset + length)
  }

  /**
   * Locate the byte offset where a SCPI arbitrary block is complete.
   *
   * @param response - Raw response bytes that may contain a partial block.
   * @returns End offset (exclusive) when complete, otherwise null.
   * @throws Error when the block framing is invalid.
   */
  protected _findARBBlockCompletionOffset(response: Uint8Array): number | null {
    let offset = 0
    while (offset < response.length && this._isWhitespaceByte(response[offset])) {
      offset += 1
    }

    if (offset >= response.length) {
      return null
    }

    if (response[offset] !== 0x23) {
      throw new Error('USBTMC response does not start with a SCPI block')
    }

    const digitFieldOffset = offset + 1
    if (digitFieldOffset >= response.length) {
      return null
    }

    const digitCount = response[digitFieldOffset] - 0x30
    if (digitCount < 0 || digitCount > 9) {
      throw new Error('USBTMC SCPI block header has an invalid length field')
    }

    const lengthFieldOffset = digitFieldOffset + 1

    if (digitCount === 0) {
      for (let i = lengthFieldOffset; i < response.length; i += 1) {
        if (response[i] === 0x0a) {
          return i + 1
        }
      }
      return null
    }

    const payloadOffset = lengthFieldOffset + digitCount
    if (payloadOffset > response.length) {
      return null
    }

    let payloadLength = 0
    for (let i = 0; i < digitCount; i += 1) {
      const value = response[lengthFieldOffset + i] - 0x30
      if (value < 0 || value > 9) {
        throw new Error('USBTMC SCPI block header has invalid digits')
      }
      payloadLength = payloadLength * 10 + value
    }

    const payloadEnd = payloadOffset + payloadLength
    if (payloadEnd > response.length) {
      return null
    }

    return payloadEnd
  }

  /**
   * Test whether a byte is ASCII whitespace.
   *
   * @param value - Byte value to test.
   * @returns True when the byte is whitespace.
   */
  protected _isWhitespaceByte(value: number): boolean {
    return value === 0x20 || value === 0x09 || value === 0x0a || value === 0x0d
  }
}

export default USBTMCTransport
