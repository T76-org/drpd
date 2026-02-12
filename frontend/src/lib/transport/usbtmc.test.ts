import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import USBTMCTransport, {
  scpiEnum,
  USBTMCTimeoutError,
  type SCPIParam,
  type SCPIMap,
  type USBTMCPayload,
} from './usbtmc'

type MockDevice = USBDevice & {
  __written: Uint8Array[]
  __payloads: Uint8Array[]
  __setPayloads: (payloads: Uint8Array[]) => void
}

const encoder = new TextEncoder()

const USBTMC_MSG_DEV_DEP_OUT = 0x01
const USBTMC_MSG_DEV_DEP_IN = 0x02

const createUsbTmcConfig = (options?: { interfaceNumber?: number }) => {
  const interfaceNumber = options?.interfaceNumber ?? 0
  return {
    configurationValue: 1,
    interfaces: [
      {
        interfaceNumber,
        alternates: [
          {
            interfaceClass: 0xfe,
            interfaceSubclass: 0x03,
            interfaceProtocol: 0x01,
            endpoints: [
              { type: 'bulk', direction: 'out', endpointNumber: 1, packetSize: 64 },
              { type: 'bulk', direction: 'in', endpointNumber: 2, packetSize: 64 },
              { type: 'interrupt', direction: 'in', endpointNumber: 3, packetSize: 8 },
            ],
          },
        ],
      },
    ],
  }
}

const buildInResponse = (payload: Uint8Array, bTag: number): Uint8Array => {
  const headerSize = 12
  const buffer = new Uint8Array(headerSize + payload.length)
  const view = new DataView(buffer.buffer)
  buffer[0] = USBTMC_MSG_DEV_DEP_IN
  buffer[1] = bTag
  buffer[2] = 0xff - bTag
  buffer[3] = 0x00
  view.setUint32(4, payload.length, true)
  buffer[8] = 0x00
  buffer[9] = 0x00
  buffer[10] = 0x00
  buffer[11] = 0x00
  buffer.set(payload, headerSize)
  return buffer
}

const createMockDevice = (): MockDevice => {
  const config = createUsbTmcConfig()
  let opened = false
  let currentConfig: USBConfiguration | null = null
  let lastInTag = 1
  const written: Uint8Array[] = []
  let payloadQueue: Uint8Array[] = []

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
    clearHalt: vi.fn(async () => undefined),
    transferOut: vi.fn(async (_endpoint: number, data: BufferSource) => {
      const view =
        data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      written.push(view)
      const msgId = view[0]
      if (msgId === USBTMC_MSG_DEV_DEP_IN) {
        lastInTag = view[1]
      }
      return { status: 'ok', bytesWritten: view.byteLength }
    }),
    transferIn: vi.fn(async () => {
      const payload = payloadQueue.shift() ?? new Uint8Array()
      const response = buildInResponse(payload, lastInTag)
      return { data: new DataView(response.buffer) }
    }),
    __written: written,
    __payloads: payloadQueue,
    __setPayloads: (payloads: Uint8Array[]) => {
      payloadQueue = payloads
      device.__payloads = payloadQueue
    },
  } as unknown as MockDevice

  return device
}

class TestTransport extends USBTMCTransport {
  protected _startInterruptListener(): void {
    // No-op in tests to avoid infinite polling.
  }

  protected _stopInterruptListener(): void {
    // No-op in tests.
  }

  protected async _drainOutput(): Promise<void> {
    // Skip draining in tests to avoid consuming queued payloads.
  }

  public exposeFormatSCPI(command: string, ...params: SCPIParam[]) {
    return this._formatSCPI(command, params)
  }

  public exposeParseSCPIResponse(response: string) {
    return this._parseSCPIResponse(response)
  }

  public exposeParseARBData(response: Uint8Array) {
    return this._parseARBData(response)
  }

  public async exposeWrite(payload: USBTMCPayload) {
    return this._write(payload)
  }

  public async exposeRead(length: number) {
    return this._read(length)
  }
}

const setNavigatorUsb = (value?: { requestDevice?: unknown; getDevices?: unknown }) => {
  Object.defineProperty(navigator, 'usb', {
    value,
    configurable: true,
    writable: true,
  })
}

const clearNavigatorUsb = () => {
  try {
    delete (navigator as unknown as { usb?: unknown }).usb
  } catch {
    Object.defineProperty(navigator, 'usb', {
      value: undefined,
      configurable: true,
      writable: true,
    })
  }
}

describe('USBTMCTransport', () => {
  const originalUsbDescriptor = Object.getOwnPropertyDescriptor(navigator, 'usb')

  beforeEach(() => {
    clearNavigatorUsb()
  })

  afterEach(() => {
    if (originalUsbDescriptor) {
      Object.defineProperty(navigator, 'usb', originalUsbDescriptor)
    } else {
      try {
        delete (navigator as unknown as { usb?: unknown }).usb
      } catch {
        // Ignore.
      }
    }
    vi.restoreAllMocks()
  })

  it('formats SCPI parameters correctly', () => {
    const device = createMockDevice()
    const transport = new TestTransport(device)
    const formatted = transport.exposeFormatSCPI('MEAS:VOLT', 1, true, 'a"b', scpiEnum('NORM'))
    expect(formatted).toBe('MEAS:VOLT 1, ON, "a""b", NORM')
  })

  it('parses SCPI response values with quoted strings', () => {
    const device = createMockDevice()
    const transport = new TestTransport(device)
    const values = transport.exposeParseSCPIResponse('"a ""b""" 12 OFF')
    expect(values).toEqual(['a "b"', '12', 'OFF'])
  })

  it('parses ARB block data with definite length', () => {
    const device = createMockDevice()
    const transport = new TestTransport(device)
    const payload = new Uint8Array([1, 2, 3, 4])
    const response = new Uint8Array([0x23, 0x31, 0x34, ...payload])
    expect(transport.exposeParseARBData(response)).toEqual(payload)
  })

  it('parses ARB block data with indefinite length', () => {
    const device = createMockDevice()
    const transport = new TestTransport(device)
    const payload = new Uint8Array([9, 8, 7])
    const response = new Uint8Array([0x23, 0x30, ...payload, 0x0a])
    expect(transport.exposeParseARBData(response)).toEqual(payload)
  })

  it('writes USBTMC header and payload', async () => {
    const device = createMockDevice()
    const transport = new TestTransport(device)
    await transport.open()

    await transport.exposeWrite('AB')

    const writeBuffer = device.__written[device.__written.length - 1]
    expect(writeBuffer[0]).toBe(USBTMC_MSG_DEV_DEP_OUT)
    expect(Array.from(writeBuffer.subarray(12, 14))).toEqual([65, 66])
  })

  it('queryText sends SCPI and parses response', async () => {
    const device = createMockDevice()
    device.__setPayloads([encoder.encode('IDN,MODEL\n')])

    const transport = new TestTransport(device)
    await transport.open()

    const response = await transport.queryText('*IDN?')
    expect(response).toEqual(['IDN', 'MODEL'])

    const writeBuffer = device.__written.find((buf) => buf[0] === USBTMC_MSG_DEV_DEP_OUT)
    expect(writeBuffer).toBeDefined()
    if (!writeBuffer) {
      throw new Error('Missing DEV_DEP_MSG_OUT write')
    }
    const payload = writeBuffer.subarray(12, 12 + 6)
    expect(Array.from(payload)).toEqual([42, 73, 68, 78, 63, 10])
  })

  it('queryAs maps values using a static SCPI map', async () => {
    class SimpleResponse {
      value = 0
      static scpiMap = [
        { name: 'value', type: 'number', required: true },
      ] as const satisfies SCPIMap<SimpleResponse>
    }

    const device = createMockDevice()
    device.__setPayloads([encoder.encode('12.5\n')])

    const transport = new TestTransport(device)
    await transport.open()

    const response = await transport.queryAs(SimpleResponse, 'MEAS?')
    expect(response.value).toBeCloseTo(12.5)
  })

  it('queryAs uses fromSCPI override when provided', async () => {
    class OverrideResponse {
      summary = ''
      static scpiMap = [] as const satisfies SCPIMap<OverrideResponse>
      static fromSCPI(values: string[]) {
        const instance = new OverrideResponse()
        instance.summary = values.join('|')
        return instance
      }
    }

    const device = createMockDevice()
    device.__setPayloads([encoder.encode('A B\n')])

    const transport = new TestTransport(device)
    await transport.open()

    const response = await transport.queryAs(OverrideResponse, 'STAT?')
    expect(response.summary).toBe('A|B')
  })

  it('queryBinary parses ARB response', async () => {
    const device = createMockDevice()
    const arbPayload = new Uint8Array([0x23, 0x31, 0x34, 1, 2, 3, 4])
    device.__setPayloads([arbPayload])

    const transport = new TestTransport(device)
    await transport.open()

    const response = await transport.queryBinary('DATA:READ?')
    expect(response).toEqual(new Uint8Array([1, 2, 3, 4]))
  })

  it('checkError throws when device reports an error', async () => {
    const device = createMockDevice()
    device.__setPayloads([encoder.encode('5,"Oops"\n')])

    const transport = new TestTransport(device)
    await transport.open()

    await expect(transport.checkError()).rejects.toThrow('USBTMC device error 5')
  })

  it('requestDevice requires WebUSB', async () => {
    clearNavigatorUsb()
    await expect(USBTMCTransport.requestDevice()).rejects.toThrow('WebUSB is not available')
  })

  it('requestDevice forwards the correct filter', async () => {
    const requestDevice = vi.fn().mockResolvedValue(createMockDevice())
    setNavigatorUsb({ requestDevice })

    await USBTMCTransport.requestDevice()
    expect(requestDevice).toHaveBeenCalledWith({
      filters: [
        {
          classCode: 0xfe,
          subclassCode: 0x03,
          protocolCode: 0x01,
        },
      ],
    })
  })

  it('discoverDevices filters for USBTMC devices', async () => {
    const usbTmcDevice = createMockDevice()
    const nonUsbTmcDevice = createMockDevice()
    ;(nonUsbTmcDevice as unknown as { configurations: USBConfiguration[] }).configurations = [
      {
        configurationValue: 1,
        interfaces: [
          {
            interfaceNumber: 0,
            alternates: [
              {
                interfaceClass: 0xff,
                interfaceSubclass: 0x00,
                interfaceProtocol: 0x00,
                endpoints: [],
              },
            ],
          },
        ],
      },
    ] as unknown as USBConfiguration[]

    const getDevices = vi.fn().mockResolvedValue([usbTmcDevice, nonUsbTmcDevice])
    setNavigatorUsb({ getDevices })

    const devices = await USBTMCTransport.discoverDevices()
    expect(devices).toEqual([usbTmcDevice])
  })

  it('queryText attempts a best-effort error check on timeout', async () => {
    const device = createMockDevice()
    const transport = new TestTransport(device)
    await transport.open()
    const checkErrorSpy = vi
      .spyOn(
        transport as unknown as { _checkErrorUnlocked: () => Promise<void> },
        '_checkErrorUnlocked',
      )
      .mockResolvedValue()
    ;(transport as unknown as { _withTimeout: unknown })._withTimeout = vi
      .fn()
      .mockRejectedValue(new USBTMCTimeoutError('read', 1))
    await expect(transport.queryText('*IDN?')).rejects.toBeInstanceOf(USBTMCTimeoutError)
    expect(checkErrorSpy).toHaveBeenCalled()
  })
})
