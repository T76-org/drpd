import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import WinUSBTransport from './winusb'
import { DRPD_TRANSPORT_INTERRUPT_EVENT } from '../device/drpd/transport'

type MockDevice = USBDevice & {
  __written: Uint8Array[]
  __setResponses: (responses: Uint8Array[]) => void
}

const encoder = new TextEncoder()

const WINUSB_FRAME_MAGIC0 = 0x57
const WINUSB_FRAME_MAGIC1 = 0x55
const WINUSB_FRAME_VERSION = 0x01
const WINUSB_FRAME_HEADER_SIZE = 12
const WINUSB_COMMAND_REQUEST = 0x01
const WINUSB_QUERY_REQUEST = 0x03
const WINUSB_COMMAND_ACK = 0x80
const WINUSB_TEXT_RESPONSE = 0x81
const WINUSB_BINARY_RESPONSE = 0x82
const WINUSB_ERROR_RESPONSE = 0x83
const WINUSB_SESSION_RESET_ACK = 0x84

const createWinUSBConfig = (options?: { interfaceNumber?: number; packetSize?: number }) => {
  const interfaceNumber = options?.interfaceNumber ?? 5
  const packetSize = options?.packetSize ?? 64

  return {
    configurationValue: 1,
    interfaces: [
      {
        interfaceNumber,
        alternates: [
          {
            interfaceClass: 0xff,
            interfaceSubclass: 0x01,
            interfaceProtocol: 0x02,
            endpoints: [
              { type: 'bulk', direction: 'out', endpointNumber: 6, packetSize },
              { type: 'bulk', direction: 'in', endpointNumber: 6, packetSize },
            ],
          },
        ],
      },
    ],
  }
}

const buildFrame = (
  type: number,
  tag: number,
  payload: Uint8Array,
  statusFlags = 0,
): Uint8Array => {
  const frame = new Uint8Array(WINUSB_FRAME_HEADER_SIZE + payload.length)
  frame[0] = WINUSB_FRAME_MAGIC0
  frame[1] = WINUSB_FRAME_MAGIC1
  frame[2] = WINUSB_FRAME_VERSION
  frame[3] = type
  frame[4] = tag
  frame[5] = statusFlags
  frame[8] = payload.length & 0xff
  frame[9] = (payload.length >> 8) & 0xff
  frame[10] = (payload.length >> 16) & 0xff
  frame[11] = (payload.length >> 24) & 0xff
  frame.set(payload, WINUSB_FRAME_HEADER_SIZE)
  return frame
}

const createMockDevice = (): MockDevice => {
  const config = createWinUSBConfig()
  let opened = false
  let currentConfig: USBConfiguration | null = null
  const written: Uint8Array[] = []
  let responses: Uint8Array[] = []

  const device = {
    opened,
    configurations: [config],
    configuration: currentConfig,
    open: vi.fn(async () => {
      opened = true
      ;(device as unknown as { opened: boolean }).opened = true
    }),
    close: vi.fn(async () => {
      opened = false
      ;(device as unknown as { opened: boolean }).opened = false
    }),
    selectConfiguration: vi.fn(async () => {
      currentConfig = config as unknown as USBConfiguration
      ;(device as unknown as { configuration: USBConfiguration | null }).configuration =
        currentConfig
    }),
    claimInterface: vi.fn(async () => undefined),
    transferOut: vi.fn(async (_endpoint: number, data: BufferSource) => {
      const view =
        data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      written.push(view)
      return { status: 'ok', bytesWritten: view.byteLength }
    }),
    transferIn: vi.fn(async () => {
      const response = responses.shift() ?? new Uint8Array()
      return {
        data: new DataView(
          response.buffer.slice(response.byteOffset, response.byteOffset + response.byteLength),
        ),
      }
    }),
    __written: written,
    __setResponses: (nextResponses: Uint8Array[]) => {
      responses = [...nextResponses]
    },
  } as unknown as MockDevice

  return device
}

class TestTransport extends WinUSBTransport {}

describe('WinUSBTransport', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sendCommand completes on ack frame without issuing SYST:ERR?', async () => {
    const device = createMockDevice()
    device.__setResponses([
      buildFrame(WINUSB_SESSION_RESET_ACK, 1, new Uint8Array()),
      buildFrame(WINUSB_COMMAND_ACK, 2, new Uint8Array()),
    ])

    const transport = new TestTransport(device)
    await transport.open()
    await transport.sendCommand('CONF:TEST', 1)

    const requestFrames = device.__written.filter((frame) => frame[3] === WINUSB_COMMAND_REQUEST)
    expect(requestFrames).toHaveLength(1)
    const payload = requestFrames[0].subarray(WINUSB_FRAME_HEADER_SIZE)
    expect(new TextDecoder().decode(payload)).toBe('CONF:TEST 1')
  })

  it('sendCommand throws when the device returns an error frame', async () => {
    const device = createMockDevice()
    device.__setResponses([
      buildFrame(WINUSB_SESSION_RESET_ACK, 1, new Uint8Array()),
      buildFrame(WINUSB_ERROR_RESPONSE, 2, encoder.encode('-100,"Oops"')),
    ])

    const transport = new TestTransport(device)
    await transport.open()

    await expect(transport.sendCommand('CONF:TEST')).rejects.toThrow('WinUSB device error')
  })

  it('queryText returns text without issuing a follow-up error query', async () => {
    const device = createMockDevice()
    device.__setResponses([
      buildFrame(WINUSB_SESSION_RESET_ACK, 1, new Uint8Array()),
      buildFrame(WINUSB_TEXT_RESPONSE, 2, encoder.encode('IDN,MODEL\n')),
    ])

    const transport = new TestTransport(device)
    await transport.open()

    const response = await transport.queryText('*IDN?')
    expect(response).toEqual(['IDN', 'MODEL'])

    const requestFrames = device.__written.filter((frame) => frame[3] === WINUSB_QUERY_REQUEST)
    expect(requestFrames).toHaveLength(1)
  })

  it('queryBinary writes a query request frame', async () => {
    const device = createMockDevice()
    device.__setResponses([
      buildFrame(WINUSB_SESSION_RESET_ACK, 1, new Uint8Array()),
      buildFrame(WINUSB_BINARY_RESPONSE, 2, encoder.encode('#14TEST')),
    ])

    const transport = new TestTransport(device)
    await transport.open()

    const response = await transport.queryBinary('READ:BIN?')
    expect(Array.from(response)).toEqual(Array.from(encoder.encode('TEST')))

    const requestFrames = device.__written.filter((frame) => frame[3] === WINUSB_QUERY_REQUEST)
    expect(requestFrames).toHaveLength(1)
  })

  it('uses a larger bulk-IN read size than the endpoint packet size', async () => {
    const device = createMockDevice()
    const splitResponse = buildFrame(WINUSB_TEXT_RESPONSE, 2, encoder.encode('OK\n'))
    device.__setResponses([
      buildFrame(WINUSB_SESSION_RESET_ACK, 1, new Uint8Array()),
      splitResponse.subarray(0, 5),
      splitResponse.subarray(5),
    ])

    const transport = new TestTransport(device)
    await transport.open()
    const response = await transport.queryText('SYST:ERR?')

    expect(response).toEqual(['OK'])
    expect(device.transferIn).toHaveBeenNthCalledWith(1, 6, 4096)
    expect(device.transferIn).toHaveBeenNthCalledWith(2, 6, 4096)
    expect(device.transferIn).toHaveBeenNthCalledWith(3, 6, 4096)
  })

  it('queryText propagates error frames directly', async () => {
    const device = createMockDevice()
    device.__setResponses([
      buildFrame(WINUSB_SESSION_RESET_ACK, 1, new Uint8Array()),
      buildFrame(WINUSB_ERROR_RESPONSE, 2, encoder.encode('5,"Oops"')),
    ])

    const transport = new TestTransport(device)
    await transport.open()

    await expect(transport.queryText('*IDN?')).rejects.toThrow('WinUSB device error')
  })

  it('emits one synthetic interrupt when srqPending is set on a response frame', async () => {
    const device = createMockDevice()
    device.__setResponses([
      buildFrame(WINUSB_SESSION_RESET_ACK, 1, new Uint8Array()),
      buildFrame(WINUSB_TEXT_RESPONSE, 2, encoder.encode('IDN,MODEL\n'), 0x01),
      buildFrame(WINUSB_TEXT_RESPONSE, 3, encoder.encode('IDN,MODEL\n'), 0x01),
    ])

    const transport = new TestTransport(device)
    const interruptSpy = vi.fn()
    transport.addEventListener(DRPD_TRANSPORT_INTERRUPT_EVENT, interruptSpy)
    await transport.open()

    await transport.queryText('*IDN?')
    await transport.queryText('*IDN?')

    expect(interruptSpy).toHaveBeenCalledTimes(1)
  })

  it('re-arms synthetic interrupt emission after STAT:DEV?', async () => {
    const device = createMockDevice()
    device.__setResponses([
      buildFrame(WINUSB_SESSION_RESET_ACK, 1, new Uint8Array()),
      buildFrame(WINUSB_TEXT_RESPONSE, 2, encoder.encode('IDN,MODEL\n'), 0x01),
      buildFrame(WINUSB_TEXT_RESPONSE, 3, encoder.encode('0\n')),
      buildFrame(WINUSB_TEXT_RESPONSE, 4, encoder.encode('IDN,MODEL\n'), 0x01),
    ])

    const transport = new TestTransport(device)
    const interruptSpy = vi.fn()
    transport.addEventListener(DRPD_TRANSPORT_INTERRUPT_EVENT, interruptSpy)
    await transport.open()

    await transport.queryText('*IDN?')
    await transport.queryText('STAT:DEV?')
    await transport.queryText('*IDN?')

    expect(interruptSpy).toHaveBeenCalledTimes(2)
  })
})
