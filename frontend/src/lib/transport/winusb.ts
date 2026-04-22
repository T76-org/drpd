/**
 * @file winusb.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Vendor-specific WinUSB transport used by DRPD on Windows-capable hosts.
 */

import { DebugLogRegistry, DebugLogger } from '../debugLogger'
import {
  DRPD_TRANSPORT_INTERRUPT_EVENT,
  type DRPDFirmwareUpdateRequest,
  type DRPDSCPIParam,
} from '../device/drpd/transport'

type WinUSBPayload = Uint8Array | ArrayBuffer | DataView | string
const WINUSB_INTERFACE_CLASS = 0xff
const WINUSB_INTERFACE_SUBCLASS = 0x01
const WINUSB_INTERFACE_PROTOCOL = 0x02

const WINUSB_FRAME_MAGIC0 = 0x57
const WINUSB_FRAME_MAGIC1 = 0x55
const WINUSB_FRAME_VERSION = 0x01
const WINUSB_FRAME_HEADER_SIZE = 12

const WINUSB_COMMAND_REQUEST = 0x01
const WINUSB_SESSION_RESET_REQUEST = 0x02
const WINUSB_QUERY_REQUEST = 0x03
const WINUSB_UPDATE_BEGIN = 0x10
const WINUSB_UPDATE_WRITE = 0x11
const WINUSB_UPDATE_FINISH = 0x12
const WINUSB_UPDATE_ABORT = 0x13
const WINUSB_UPDATE_STATUS = 0x14
const WINUSB_COMMAND_ACK = 0x80
const WINUSB_TEXT_RESPONSE = 0x81
const WINUSB_BINARY_RESPONSE = 0x82
const WINUSB_ERROR_RESPONSE = 0x83
const WINUSB_SESSION_RESET_ACK = 0x84
const WINUSB_UPDATE_ACK = 0x85
const WINUSB_UPDATE_STATUS_RESPONSE = 0x86
const WINUSB_READ_TRANSFER_SIZE = 4096
const WINUSB_STATUS_FLAG_SRQ_PENDING = 0x01

export interface WinUSBTransportOptions {
  interfaceNumber?: number
  readTimeoutMs?: number
  writeTimeoutMs?: number
  debugLogRegistry?: DebugLogRegistry
}

type ResolvedWinUSBTransportOptions = Omit<
  Required<WinUSBTransportOptions>,
  'interfaceNumber' | 'debugLogRegistry'
> & {
  interfaceNumber?: number
}

const DEFAULT_OPTIONS: ResolvedWinUSBTransportOptions = {
  readTimeoutMs: 500,
  writeTimeoutMs: 500,
}

type ParsedWinUSBFrame = {
  type: number
  tag: number
  srqPending: boolean
  payload: Uint8Array
}

export type WinUSBFirmwareUpdateStatus = {
  state: number
  baseOffset: number
  totalLength: number
  bytesWritten: number
}

/**
 * WinUSB transport for DRPD request/response traffic.
 */
export class WinUSBTransport extends EventTarget {
  public readonly kind = 'winusb' as const

  protected readonly device: USBDevice
  protected readonly options: ResolvedWinUSBTransportOptions
  public readonly debugLogs: DebugLogRegistry
  protected readonly debugLogger: DebugLogger
  protected readonly encoder = new TextEncoder()
  protected readonly decoder = new TextDecoder()
  protected interfaceNumber?: number
  protected endpointOut?: number
  protected endpointIn?: number
  protected bulkOutPacketSize = 64
  protected bulkInPacketSize = 64
  protected bulkInReadSize = WINUSB_READ_TRANSFER_SIZE
  protected tagCounter = 1
  protected requestQueue: Promise<void> = Promise.resolve()
  protected rxBuffer = new Uint8Array(0)
  protected pendingFrames: ParsedWinUSBFrame[] = []
  protected winusbInterruptLatched = false

  public static readonly INTERRUPT_EVENT = DRPD_TRANSPORT_INTERRUPT_EVENT

  public constructor(device: USBDevice, options: WinUSBTransportOptions = {}) {
    super()
    this.device = device
    this.debugLogs = options.debugLogRegistry ?? new DebugLogRegistry()
    this.debugLogger = this.debugLogs.getLogger('drpd.transport.winusb')
    this.options = {
      interfaceNumber: options.interfaceNumber,
      readTimeoutMs: options.readTimeoutMs ?? DEFAULT_OPTIONS.readTimeoutMs,
      writeTimeoutMs: options.writeTimeoutMs ?? DEFAULT_OPTIONS.writeTimeoutMs,
    }
  }

  public get claimedInterfaceNumber(): number | undefined {
    return this.interfaceNumber
  }

  public static async discoverDevices(): Promise<USBDevice[]> {
    if (!('usb' in navigator)) {
      return []
    }
    const devices = await navigator.usb.getDevices()
    return devices.filter((device) => WinUSBTransport.isWinUSBDevice(device))
  }

  public static isWinUSBDevice(device: USBDevice): boolean {
    const configurations = device.configurations ?? []
    for (const configuration of configurations) {
      for (const usbInterface of configuration.interfaces) {
        for (const alternate of usbInterface.alternates) {
          if (
            alternate.interfaceClass === WINUSB_INTERFACE_CLASS &&
            alternate.interfaceSubclass === WINUSB_INTERFACE_SUBCLASS &&
            alternate.interfaceProtocol === WINUSB_INTERFACE_PROTOCOL
          ) {
            return true
          }
        }
      }
    }
    return false
  }

  public async open(): Promise<void> {
    if (!this.device.opened) {
      await this.device.open()
    }

    if (this.device.configuration == null && this.device.configurations?.length) {
      const match = this.findWinUSBInterfaceInConfigurations(this.device.configurations)
      await this.device.selectConfiguration(
        match?.configurationValue ?? this.device.configurations[0].configurationValue,
      )
    }

    const interfaceNumber =
      this.options.interfaceNumber ?? this.findWinUSBInterfaceInConfiguration()
    if (interfaceNumber == null) {
      throw new Error('WinUSB interface not found on device')
    }

    await this.device.claimInterface(interfaceNumber)
    this.interfaceNumber = interfaceNumber

    const endpoints = this.findWinUSBEndpoints()
    if (!endpoints) {
      throw new Error('WinUSB endpoints not found on device')
    }

    this.endpointIn = endpoints.endpointIn
    this.endpointOut = endpoints.endpointOut
    this.bulkInPacketSize = endpoints.bulkInPacketSize
    this.bulkInReadSize = Math.max(endpoints.bulkInPacketSize, WINUSB_READ_TRANSFER_SIZE)
    this.bulkOutPacketSize = endpoints.bulkOutPacketSize
    this.rxBuffer = new Uint8Array(0)
    this.pendingFrames = []
    this.winusbInterruptLatched = false
    await this.withLock(async () => {
      const tag = await this.withTimeout(
        this.writeFrame(WINUSB_SESSION_RESET_REQUEST, new Uint8Array(0)),
        this.options.writeTimeoutMs,
        'write',
        'SESSION_RESET',
      )
      const response = await this.awaitResponseFrame(tag, 'SESSION_RESET')
      if (response.type !== WINUSB_SESSION_RESET_ACK) {
        throw new Error(`Unexpected WinUSB reset response type 0x${response.type.toString(16)}`)
      }
    })
  }

  public async close(): Promise<void> {
    this.winusbInterruptLatched = false
    if (this.device.opened) {
      await this.device.close()
    }
  }

  public async sendCommand(command: string, ...params: DRPDSCPIParam[]): Promise<void> {
    await this.withLock(async () => {
      const line = this.formatSCPI(command, params)
      this.debugLogger.debug(`Command: ${line}`)
      const tag = await this.withTimeout(
        this.writeFrame(WINUSB_COMMAND_REQUEST, this.normalizePayload(line)),
        this.options.writeTimeoutMs,
        'write',
        line,
      )
      const response = await this.awaitResponseFrame(tag, line)
      if (response.type === WINUSB_COMMAND_ACK) {
        return
      }
      if (response.type === WINUSB_ERROR_RESPONSE) {
        throw new Error(`WinUSB device error: ${this.decoder.decode(response.payload)}`)
      }
      throw new Error(`Unexpected WinUSB command response type 0x${response.type.toString(16)}`)
    })
  }

  public async queryText(command: string, ...params: DRPDSCPIParam[]): Promise<string[]> {
    return await this.withLock(async () => {
      const line = this.formatSCPI(command, params)
      return this.queryTextFrame(line)
    })
  }

  public async queryBinary(command: string, ...params: DRPDSCPIParam[]): Promise<Uint8Array> {
    return await this.withLock(async () => {
      const line = this.formatSCPI(command, params)
      this.debugLogger.debug(`Binary Query: ${line}`)
      const tag = await this.withTimeout(
        this.writeFrame(WINUSB_QUERY_REQUEST, this.normalizePayload(line)),
        this.options.writeTimeoutMs,
        'write',
        line,
      )
      const response = await this.awaitResponseFrame(tag, line)
      if (response.type === WINUSB_ERROR_RESPONSE) {
        throw new Error(`WinUSB device error: ${this.decoder.decode(response.payload)}`)
      }
      if (response.type !== WINUSB_BINARY_RESPONSE) {
        throw new Error(`Unexpected WinUSB binary response type 0x${response.type.toString(16)}`)
      }
      return this.parseARBData(response.payload)
    })
  }

  public async checkError(command: string): Promise<void> {
    await this.withLock(async () => {
      await this.checkErrorUnlocked(command)
    })
  }

  public async updateFirmware(request: DRPDFirmwareUpdateRequest): Promise<void> {
    await this.withLock(async () => {
      let bytesWritten = 0
      const beginPayload = new Uint8Array(12)
      this.writeU32LE(beginPayload, 0, request.baseOffset)
      this.writeU32LE(beginPayload, 4, request.totalLength)
      this.writeU32LE(beginPayload, 8, request.crc32)
      await this.sendUpdaterFrame(WINUSB_UPDATE_BEGIN, beginPayload, 'UPDATE_BEGIN')

      try {
        for (const chunk of request.chunks) {
          const payload = new Uint8Array(4 + chunk.data.byteLength)
          this.writeU32LE(payload, 0, chunk.offset)
          payload.set(chunk.data, 4)
          await this.sendUpdaterFrame(WINUSB_UPDATE_WRITE, payload, `UPDATE_WRITE 0x${chunk.offset.toString(16)}`)
          bytesWritten += chunk.data.byteLength
          request.onProgress?.({ bytesWritten, totalLength: request.totalLength })
        }
        await this.sendUpdaterFrame(WINUSB_UPDATE_FINISH, new Uint8Array(0), 'UPDATE_FINISH')
      } catch (error) {
        try {
          await this.sendUpdaterFrame(WINUSB_UPDATE_ABORT, new Uint8Array(0), 'UPDATE_ABORT')
        } catch {
          // Preserve the original update error.
        }
        throw error
      }
    })
  }

  public async getFirmwareUpdateStatus(): Promise<WinUSBFirmwareUpdateStatus> {
    return await this.withLock(async () => {
      const payload = await this.sendUpdaterFrame(WINUSB_UPDATE_STATUS, new Uint8Array(0), 'UPDATE_STATUS')
      if (payload.byteLength !== 16) {
        throw new Error(`Invalid WinUSB updater status payload length ${payload.byteLength}`)
      }
      return {
        state: this.readU32LE(payload, 0),
        baseOffset: this.readU32LE(payload, 4),
        totalLength: this.readU32LE(payload, 8),
        bytesWritten: this.readU32LE(payload, 12),
      }
    })
  }

  protected async checkErrorUnlocked(command: string): Promise<void> {
    const response = await this.queryTextFrame('SYST:ERR?')
    const combined = response.join(' ')
    const match = combined.match(/^\s*([+-]?\d+)\s*,?\s*(.*)$/)
    if (!match) {
      throw new Error(`WinUSB error query returned unrecognized response for "${command}": ${combined}`)
    }

    const code = Number.parseInt(match[1], 10)
    const message = match[2]?.trim() ?? ''
    if (code !== 0) {
      const cleaned = message.replace(/^"|"$/g, '')
      throw new Error(`WinUSB device error ${code} for "${command}": ${cleaned || 'Unknown error'}`)
    }
  }

  protected async queryTextFrame(line: string): Promise<string[]> {
    if (this.isStatusQuery(line)) {
      this.winusbInterruptLatched = false
    }
    const tag = await this.withTimeout(
      this.writeFrame(WINUSB_QUERY_REQUEST, this.normalizePayload(line)),
      this.options.writeTimeoutMs,
      'write',
      line,
    )
    const response = await this.awaitResponseFrame(tag, line)
    if (response.type === WINUSB_ERROR_RESPONSE) {
      throw new Error(`WinUSB device error: ${this.decoder.decode(response.payload)}`)
    }
    if (response.type !== WINUSB_TEXT_RESPONSE) {
      throw new Error(`Unexpected WinUSB response type 0x${response.type.toString(16)}`)
    }
    return this.parseSCPIResponse(this.decoder.decode(response.payload).replace(/\r?\n$/, ''))
  }

  protected async sendUpdaterFrame(type: number, payload: Uint8Array, label: string): Promise<Uint8Array> {
    const tag = await this.withTimeout(
      this.writeFrame(type, payload),
      this.options.writeTimeoutMs,
      'write',
      label,
    )
    const response = await this.awaitResponseFrame(tag, label)
    if (response.type === WINUSB_ERROR_RESPONSE) {
      throw new Error(`WinUSB firmware update error: ${this.decoder.decode(response.payload)}`)
    }
    if (response.type !== WINUSB_UPDATE_ACK && response.type !== WINUSB_UPDATE_STATUS_RESPONSE) {
      throw new Error(`Unexpected WinUSB updater response type 0x${response.type.toString(16)}`)
    }
    return response.payload
  }

  protected async writeFrame(type: number, payload: Uint8Array): Promise<number> {
    if (this.endpointOut == null) {
      throw new Error('WinUSB endpoint OUT not initialized')
    }

    const tag = this.nextTag()
    const frame = this.buildFrame(type, tag, payload)
    for (let offset = 0; offset < frame.byteLength; offset += this.bulkOutPacketSize) {
      const chunk = frame.subarray(offset, offset + this.bulkOutPacketSize)
      await this.device.transferOut(this.endpointOut, chunk as BufferSource)
    }
    return tag
  }

  protected async awaitResponseFrame(tag?: number, command?: string): Promise<ParsedWinUSBFrame> {
    const deadline = Date.now() + this.options.readTimeoutMs

    while (Date.now() < deadline) {
      const pendingIndex = this.pendingFrames.findIndex((frame) => tag == null || frame.tag === tag)
      if (pendingIndex >= 0) {
        const [frame] = this.pendingFrames.splice(pendingIndex, 1)
        return frame
      }

      const remaining = deadline - Date.now()
      const result = await this.withTimeout(
        this.device.transferIn(this.endpointIn!, this.bulkInReadSize),
        remaining,
        'read',
        command,
      )
      if (!result.data || result.data.byteLength === 0) {
        continue
      }
      const incoming = new Uint8Array(result.data.buffer.slice(0, result.data.byteLength))
      this.appendRxBytes(incoming)
    }

    throw new Error('WinUSB read timed out')
  }

  protected appendRxBytes(incoming: Uint8Array): void {
    const merged = new Uint8Array(this.rxBuffer.length + incoming.length)
    merged.set(this.rxBuffer, 0)
    merged.set(incoming, this.rxBuffer.length)
    this.rxBuffer = merged

    while (this.rxBuffer.length >= WINUSB_FRAME_HEADER_SIZE) {
      if (
        this.rxBuffer[0] !== WINUSB_FRAME_MAGIC0 ||
        this.rxBuffer[1] !== WINUSB_FRAME_MAGIC1 ||
        this.rxBuffer[2] !== WINUSB_FRAME_VERSION
      ) {
        throw new Error('Invalid WinUSB frame header')
      }

      const payloadLength =
        this.rxBuffer[8] |
        (this.rxBuffer[9] << 8) |
        (this.rxBuffer[10] << 16) |
        (this.rxBuffer[11] << 24)
      const frameLength = WINUSB_FRAME_HEADER_SIZE + payloadLength
      if (this.rxBuffer.length < frameLength) {
        return
      }

      const frame: ParsedWinUSBFrame = {
        type: this.rxBuffer[3],
        tag: this.rxBuffer[4],
        srqPending: (this.rxBuffer[5] & WINUSB_STATUS_FLAG_SRQ_PENDING) !== 0,
        payload: this.rxBuffer.slice(WINUSB_FRAME_HEADER_SIZE, frameLength),
      }
      this.maybeDispatchSyntheticInterrupt(frame)
      this.pendingFrames.push(frame)
      this.rxBuffer = this.rxBuffer.slice(frameLength)
    }
  }

  protected buildFrame(type: number, tag: number, payload: Uint8Array): Uint8Array {
    const frame = new Uint8Array(WINUSB_FRAME_HEADER_SIZE + payload.length)
    frame[0] = WINUSB_FRAME_MAGIC0
    frame[1] = WINUSB_FRAME_MAGIC1
    frame[2] = WINUSB_FRAME_VERSION
    frame[3] = type
    frame[4] = tag
    frame[5] = 0
    frame[6] = 0
    frame[7] = 0
    const payloadLength = payload.length >>> 0
    frame[8] = payloadLength & 0xff
    frame[9] = (payloadLength >> 8) & 0xff
    frame[10] = (payloadLength >> 16) & 0xff
    frame[11] = (payloadLength >> 24) & 0xff
    frame.set(payload, WINUSB_FRAME_HEADER_SIZE)
    return frame
  }

  protected writeU32LE(target: Uint8Array, offset: number, value: number): void {
    const normalized = value >>> 0
    target[offset] = normalized & 0xff
    target[offset + 1] = (normalized >> 8) & 0xff
    target[offset + 2] = (normalized >> 16) & 0xff
    target[offset + 3] = (normalized >> 24) & 0xff
  }

  protected readU32LE(source: Uint8Array, offset: number): number {
    return (
      source[offset] |
      (source[offset + 1] << 8) |
      (source[offset + 2] << 16) |
      (source[offset + 3] << 24)
    ) >>> 0
  }

  protected nextTag(): number {
    const tag = this.tagCounter & 0xff
    this.tagCounter = (this.tagCounter + 1) & 0xff
    return tag === 0 ? 1 : tag
  }

  protected normalizePayload(payload: WinUSBPayload): Uint8Array {
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

  protected maybeDispatchSyntheticInterrupt(frame: ParsedWinUSBFrame): void {
    if (!frame.srqPending || this.winusbInterruptLatched) {
      return
    }
    this.winusbInterruptLatched = true
    this.dispatchEvent(new CustomEvent(DRPD_TRANSPORT_INTERRUPT_EVENT, { detail: new Uint8Array() }))
  }

  protected isStatusQuery(commandLine: string): boolean {
    return commandLine.trim().toUpperCase() === 'STAT:DEV?'
  }

  protected async withLock<T>(action: () => Promise<T>): Promise<T> {
    let release: (() => void) | undefined
    const previous = this.requestQueue
    this.requestQueue = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      return await action()
    } finally {
      release?.()
    }
  }

  protected async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    label: 'read' | 'write',
    command?: string,
  ): Promise<T> {
    return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`WinUSB ${label} timed out after ${timeoutMs}ms${command ? ` (command: ${command})` : ''}`))
      }, timeoutMs)
      promise.then(resolve).catch(reject).finally(() => clearTimeout(timer))
    })
  }

  protected formatSCPI(command: string, params: DRPDSCPIParam[]): string {
    if (params.length === 0) {
      return command
    }
    return `${command} ${params.map((param) => this.formatSCPIParam(param)).join(' ')}`
  }

  protected formatSCPIParam(param: DRPDSCPIParam): string {
    if (typeof param === 'number') {
      if (!Number.isFinite(param)) {
        throw new Error('SCPI parameter must be a finite number')
      }
      return String(param)
    }
    if (typeof param === 'boolean') {
      return param ? 'ON' : 'OFF'
    }
    if (typeof param === 'object' && param !== null && 'raw' in param) {
      return param.raw
    }
    return `"${param.replace(/"/g, '""')}"`
  }

  protected parseSCPIResponse(response: string): string[] {
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

  protected parseARBData(response: Uint8Array): Uint8Array {
    let offset = 0
    while (offset < response.length && this.isWhitespaceByte(response[offset])) {
      offset += 1
    }
    if (response[offset] !== 0x23) {
      throw new Error('WinUSB response does not start with a SCPI block')
    }
    offset += 1
    if (offset >= response.length) {
      throw new Error('WinUSB SCPI block header is incomplete')
    }
    const digitCount = response[offset] - 0x30
    if (digitCount < 0 || digitCount > 9) {
      throw new Error('WinUSB SCPI block header has an invalid length field')
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
      throw new Error('WinUSB SCPI block header is incomplete')
    }
    let length = 0
    for (let i = 0; i < digitCount; i += 1) {
      const value = response[offset + i] - 0x30
      if (value < 0 || value > 9) {
        throw new Error('WinUSB SCPI block header has invalid digits')
      }
      length = length * 10 + value
    }
    offset += digitCount
    if (offset + length > response.length) {
      throw new Error('WinUSB SCPI block payload is incomplete')
    }
    return response.subarray(offset, offset + length)
  }

  protected isWhitespaceByte(value: number): boolean {
    return value === 0x20 || value === 0x09 || value === 0x0a || value === 0x0d
  }

  protected findWinUSBEndpoints(): {
    endpointIn: number
    endpointOut: number
    bulkInPacketSize: number
    bulkOutPacketSize: number
  } | null {
    const configuration = this.device.configuration
    if (!configuration) {
      return null
    }

    for (const usbInterface of configuration.interfaces) {
      if (this.interfaceNumber != null && usbInterface.interfaceNumber !== this.interfaceNumber) {
        continue
      }
      const alternate = this.findWinUSBAlternate(usbInterface)
      if (!alternate) {
        continue
      }

      let endpointIn: number | undefined
      let endpointOut: number | undefined
      let bulkInPacketSize = 64
      let bulkOutPacketSize = 64

      for (const endpoint of alternate.endpoints) {
        if (endpoint.type === 'bulk' && endpoint.direction === 'in') {
          endpointIn = endpoint.endpointNumber
          bulkInPacketSize = endpoint.packetSize
        } else if (endpoint.type === 'bulk' && endpoint.direction === 'out') {
          endpointOut = endpoint.endpointNumber
          bulkOutPacketSize = endpoint.packetSize
        }
      }

      if (endpointIn != null && endpointOut != null) {
        return {
          endpointIn,
          endpointOut,
          bulkInPacketSize,
          bulkOutPacketSize,
        }
      }
    }

    return null
  }

  protected findWinUSBInterfaceInConfiguration(): number | null {
    const configuration = this.device.configuration
    if (!configuration) {
      return null
    }
    for (const usbInterface of configuration.interfaces) {
      if (this.isWinUSBInterface(usbInterface)) {
        return usbInterface.interfaceNumber
      }
    }
    return null
  }

  protected findWinUSBInterfaceInConfigurations(
    configurations: readonly USBConfiguration[],
  ): { configurationValue: number; interfaceNumber: number } | null {
    for (const configuration of configurations) {
      for (const usbInterface of configuration.interfaces) {
        if (this.isWinUSBInterface(usbInterface)) {
          return {
            configurationValue: configuration.configurationValue,
            interfaceNumber: usbInterface.interfaceNumber,
          }
        }
      }
    }
    return null
  }

  protected isWinUSBInterface(usbInterface: USBInterface): boolean {
    return this.findWinUSBAlternate(usbInterface) != null
  }

  protected findWinUSBAlternate(usbInterface: USBInterface): USBAlternateInterface | null {
    for (const alternate of usbInterface.alternates) {
      if (
        alternate.interfaceClass === WINUSB_INTERFACE_CLASS &&
        alternate.interfaceSubclass === WINUSB_INTERFACE_SUBCLASS &&
        alternate.interfaceProtocol === WINUSB_INTERFACE_PROTOCOL
      ) {
        return alternate
      }
    }
    return null
  }

}

export default WinUSBTransport
