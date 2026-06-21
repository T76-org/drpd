import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DRPDDevice, DRPDDeviceDefinition, type LoggedCapturedMessage } from '../../../lib/device'
import type { BeforeInstallPromptEvent } from '../../../lib/pwa/usePWAInstallPrompt'
import { saveRackDocument } from '../../../lib/rack/loadRack'
import type { RackDocument } from '../../../lib/rack/types'
import { InstrumentBase } from '../InstrumentBase'
import { serializeMessageLogRow } from '../messageLogImport'
import { RackView } from '../RackView'

const mockTransportState = vi.hoisted(() => ({
  ///< Force the mock transport to fail on open.
  shouldFailOpen: false,
  statusRegisterResponse: ['0'],
  analogResponse: [
    '1000',
    '5.00',
    '0.12',
    '0.33',
    '0.00',
    '0.33',
    '0.00',
    '1.20',
    '0.00',
    '0.60',
    '2500',
    '12',
    '34',
  ],
  vbusVoltageResponse: ['5.00'],
  rawVbusCurrentResponse: ['0.50'],
  vbusCalibrationResponse: Array.from({ length: 61 }, () => '0'),
  vbusCurrentCalibrationResponse: Array.from({ length: 13 }, (_, index) => (index / 2).toString()),
  roleResponse: ['SINK'],
  roleStatusResponse: ['ATTACHED'],
  vbusStatusResponse: ['ENABLED', 'NONE', 'NONE'],
  ovpThresholdResponse: ['21'],
  ocpThresholdResponse: ['3.5'],
  captureEnabledResponse: ['ON'],
  captureCycleTimeResponse: ['10'],
  triggerStatusResponse: ['ARMED'],
  triggerEventTypeResponse: ['MESSAGE_COMPLETE'],
  triggerEventThresholdResponse: ['2'],
  triggerSenderFilterResponse: ['ANY'],
  triggerAutoRepeatResponse: ['ON'],
  triggerEventCountResponse: ['7'],
  triggerMessageTypeFiltersResponse: [''],
  triggerSyncModeResponse: ['TOGGLE'],
  triggerSyncPulseWidthResponse: ['25'],
  sinkPdoCountResponse: ['1'],
  sinkPdoResponse: ['FIXED,5.00,3.00'],
  sinkStatusResponse: ['PE_SNK_READY'],
  sinkNegotiatedPdoResponse: ['FIXED,5.00,3.00'],
  sinkVoltageResponse: ['5'],
  sinkCurrentResponse: ['2'],
  sinkErrorResponse: ['0'],
  sinkEprEnabledResponse: ['OFF'],
  sinkPpsStatusQueryEnabledResponse: ['OFF'],
  timestampResponse: ['1000'],
  idnResponse: ['MTA Inc.,Dr. PD,ABC,1.0'],
  hardwareRevisionResponse: ['R2605-A'],
  captureCountResponse: ['0'],
  sentCommands: [] as string[],
}))

const mockFirmwareUpdaterState = vi.hoisted(() => ({
  openCount: 0,
  closeCount: 0,
  updateCount: 0,
  interfaceNumber: null as number | null,
  shouldFailUpdate: false,
}))

vi.mock('../../../lib/transport/drpdUsb', () => {
  /**
   * Mock preferred DRPD transport for RackView tests.
   */
  class MockDRPDTransport {
    public readonly kind = 'winusb' as const
    ///< Track open/close state for verification.
    public opened = false

    /**
     * Create the mock transport.
     *
     * @param device - USB device instance.
     */
    public constructor(device: USBDevice, options?: { interfaceNumber?: number }) {
      void device
      mockFirmwareUpdaterState.interfaceNumber = options?.interfaceNumber ?? null
    }

    /**
     * Open the mock transport.
     */
    public async open(): Promise<void> {
      if (mockTransportState.shouldFailOpen) {
        throw new Error('Transport failed to open')
      }
      this.opened = true
    }

    /**
     * Close the mock transport.
     */
    public async close(): Promise<void> {
      this.opened = false
    }

    /**
     * Return a mock SCPI response list.
     *
     * @param command - SCPI command string.
     * @returns Response list.
     */
    public async queryText(command: string): Promise<string[]> {
      if (command === '*IDN?') {
        return mockTransportState.idnResponse.length === 1
          ? mockTransportState.idnResponse[0].split(',').map((part) => part.trim())
          : mockTransportState.idnResponse
      }
      if (command === 'SYST:HW:REV?') {
        return mockTransportState.hardwareRevisionResponse
      }
      if (command === 'SYST:TIME?') {
        return mockTransportState.timestampResponse
      }
      if (command === 'STAT:DEV?') {
        return mockTransportState.statusRegisterResponse
      }
      if (command === 'MEAS:ALL?') {
        return mockTransportState.analogResponse
      }
      if (command === 'MEAS:VOLT:VBUS?') {
        return mockTransportState.vbusVoltageResponse
      }
      if (command === 'MEAS:CURR:VBUS:RAW?') {
        return mockTransportState.rawVbusCurrentResponse
      }
      if (command === 'BUS:VBUS:CAL?') {
        return mockTransportState.vbusCalibrationResponse
      }
      if (command === 'BUS:VBUS:CAL:CURR?') {
        return mockTransportState.vbusCurrentCalibrationResponse
      }
      if (command === 'BUS:CC:ROLE?') {
        return mockTransportState.roleResponse
      }
      if (command === 'BUS:CC:ROLE:STAT?') {
        return mockTransportState.roleStatusResponse
      }
      if (command === 'BUS:VBUS:STAT?') {
        return mockTransportState.vbusStatusResponse
      }
      if (command === 'BUS:VBUS:OVPT?') {
        return mockTransportState.ovpThresholdResponse
      }
      if (command === 'BUS:VBUS:OCPT?') {
        return mockTransportState.ocpThresholdResponse
      }
      if (command === 'BUS:CC:CAP:EN?') {
        return mockTransportState.captureEnabledResponse
      }
      if (command === 'BUS:CC:CAP:CYCLETIME?') {
        return mockTransportState.captureCycleTimeResponse
      }
      if (command === 'BUS:CC:CAP:COUNT?') {
        return mockTransportState.captureCountResponse
      }
      if (command === 'TRIG:STAT?') {
        return mockTransportState.triggerStatusResponse
      }
      if (command === 'TRIG:EV:TYPE?') {
        return mockTransportState.triggerEventTypeResponse
      }
      if (command === 'TRIG:EV:THRESH?') {
        return mockTransportState.triggerEventThresholdResponse
      }
      if (command === 'TRIG:EV:SENDER?') {
        return mockTransportState.triggerSenderFilterResponse
      }
      if (command === 'TRIG:EV:AUTOREPEAT?') {
        return mockTransportState.triggerAutoRepeatResponse
      }
      if (command === 'TRIG:EV:COUNT?') {
        return mockTransportState.triggerEventCountResponse
      }
      if (command === 'TRIG:EV:MSGTYPE:FILTER?') {
        return mockTransportState.triggerMessageTypeFiltersResponse
      }
      if (command === 'TRIG:SYNC:MODE?') {
        return mockTransportState.triggerSyncModeResponse
      }
      if (command === 'TRIG:SYNC:PULSEWIDTH?') {
        return mockTransportState.triggerSyncPulseWidthResponse
      }
      if (command === 'SINK:PDO:COUNT?') {
        return mockTransportState.sinkPdoCountResponse
      }
      if (command === 'SINK:PDO?') {
        return mockTransportState.sinkPdoResponse
      }
      if (command === 'SINK:STATUS?') {
        return mockTransportState.sinkStatusResponse
      }
      if (command === 'SINK:STATUS:PDO?') {
        return mockTransportState.sinkNegotiatedPdoResponse
      }
      if (command === 'SINK:STATUS:VOLTAGE?') {
        return mockTransportState.sinkVoltageResponse
      }
      if (command === 'SINK:STATUS:CURRENT?') {
        return mockTransportState.sinkCurrentResponse
      }
      if (command === 'SINK:STATUS:ERROR?') {
        return mockTransportState.sinkErrorResponse
      }
      if (command === 'SINK:EPR:EN?') {
        return mockTransportState.sinkEprEnabledResponse
      }
      if (command === 'SINK:PPS:STATUS:EN?') {
        return mockTransportState.sinkPpsStatusQueryEnabledResponse
      }
      return []
    }

    /**
     * Stub a binary response.
     *
     * @returns Empty payload.
     */
    public async queryBinary(): Promise<Uint8Array> {
      return new Uint8Array()
    }

    /**
     * Stub SCPI command send.
     */
    public async sendCommand(command: string, ...values: Array<string | number | { raw?: string }>): Promise<void> {
      const normalizedValues = values.map((value) =>
        value && typeof value === 'object' && 'raw' in value ? value.raw : value,
      )
      mockTransportState.sentCommands.push(
        normalizedValues.length === 0 ? command : `${command} ${normalizedValues.join(' ')}`,
      )
      return undefined
    }
  }

  return {
    openPreferredDRPDTransport: async (device: USBDevice) => {
      const transport = new MockDRPDTransport(device)
      await transport.open()
      return transport
    },
  }
})

vi.mock('../../../lib/transport/winusb', () => {
  class MockWinUSBTransport {
    public readonly kind = 'winusb' as const
    public readonly claimedInterfaceNumber = 1
    private readonly interfaceNumber: number | null

    public constructor(device: USBDevice, options?: { interfaceNumber?: number }) {
      void device
      this.interfaceNumber = options?.interfaceNumber ?? null
    }

    public async open(): Promise<void> {
      mockFirmwareUpdaterState.openCount += 1
      mockFirmwareUpdaterState.interfaceNumber = this.interfaceNumber
    }

    public async close(): Promise<void> {
      mockFirmwareUpdaterState.closeCount += 1
    }

    public async getFirmwareUpdateStatus(): Promise<{
      state: number
      baseOffset: number
      totalLength: number
      bytesWritten: number
    }> {
      return {
        state: 0,
        baseOffset: 0x8000,
        totalLength: 0,
        bytesWritten: 0,
      }
    }

    public async updateFirmware(request: {
      totalLength: number
      onProgress?: (progress: { bytesWritten: number; totalLength: number }) => void
    }): Promise<void> {
      mockFirmwareUpdaterState.updateCount += 1
      if (mockFirmwareUpdaterState.shouldFailUpdate) {
        throw new Error('mock update failed')
      }
      request.onProgress?.({ bytesWritten: request.totalLength, totalLength: request.totalLength })
    }
  }

  return {
    default: MockWinUSBTransport,
  }
})

/**
 * Build a sample rack document for tests.
 */
const buildRackDocument = (overrides?: Partial<RackDocument> & { racks?: unknown[] }): RackDocument => {
  const base: RackDocument = {
    pairedDevices: [],
    racks: [
      {
        id: 'bench-rack-a',
        name: 'Bench Rack A',
        totalUnits: 9,
        rows: [
          {
            id: 'row-1',
            instruments: [
              {
                id: 'inst-1',
                instrumentIdentifier: 'com.mta.drpd.device-status-panel'
              }
            ]
          },
          {
            id: 'row-2',
            instruments: [
              {
                id: 'inst-2',
                instrumentIdentifier: 'com.mta.drpd.device-status-panel'
              }
            ]
          }
        ]
      }
    ]
  }

  return {
    ...base,
    ...overrides,
    racks: (overrides?.racks ?? base.racks) as RackDocument['racks']
  }
}

/**
 * Create a minimal in-memory localStorage mock.
 */
const createStorage = (): Storage => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length
    }
  } as Storage
}

/**
 * Create a minimal USBDevice stub.
 */
const createUSBDevice = (serialNumber = 'DRPD-TEST-001', productName = 'Dr. PD'): USBDevice =>
  {
    const configuration = {
      configurationName: 'default',
      configurationValue: 1,
      interfaces: [
        {
          interfaceNumber: 0,
          alternates: [
            {
              alternateSetting: 0,
              interfaceClass: 0xff,
              interfaceSubclass: 0x01,
              interfaceProtocol: 0x02,
              interfaceName: 'WinUSB',
            },
          ],
        },
      ],
    } as USBConfiguration
    return {
      vendorId: 0x2e8a,
      productId: 0x000a,
      serialNumber,
      productName,
      configuration,
      configurations: [configuration],
      opened: false,
      open: vi.fn(async function open(this: USBDevice & { opened?: boolean }) {
        this.opened = true
      }),
      close: vi.fn(async function close(this: USBDevice & { opened?: boolean }) {
        this.opened = false
      }),
    } as unknown as USBDevice
  }

const buildFetchResponse = (body: unknown, bytes?: Uint8Array): Response =>
  ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    arrayBuffer: async () =>
      (bytes ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : new ArrayBuffer(0)),
  }) as Response

const buildFirmwareRelease = (tagName: string, prerelease = tagName.includes('-beta.')) => ({
  tag_name: tagName,
  draft: false,
  prerelease,
  assets: [
    {
      id: 42,
      url: `https://api.github.com/repos/T76-org/drpd/releases/assets/${tagName}`,
      name: 'drpd-firmware-combined.uf2',
      browser_download_url: `https://example.test/${tagName}/drpd-firmware-combined.uf2`,
    },
  ],
})

const buildMinimalFirmwareUf2 = (): Uint8Array => {
  const block = new Uint8Array(512)
  const view = new DataView(block.buffer)
  view.setUint32(0, 0x0a324655, true)
  view.setUint32(4, 0x9e5d5157, true)
  view.setUint32(8, 0, true)
  view.setUint32(12, 0x10008000, true)
  view.setUint32(16, 4, true)
  view.setUint32(20, 0, true)
  view.setUint32(24, 1, true)
  view.setUint32(28, 0, true)
  block.set([1, 2, 3, 4], 32)
  view.setUint32(508, 0x0ab16f30, true)
  return block
}

const buildLoggedMessage = (index: number, messageType = 3): LoggedCapturedMessage => ({
  entryKind: 'message',
  eventType: null,
  eventText: null,
  eventWallClockMs: null,
  wallClockUs: BigInt(1_700_000_000_000_000 + index * 10),
  startTimestampUs: BigInt(1000 + index * 10),
  endTimestampUs: BigInt(1005 + index * 10),
  displayTimestampUs: BigInt(index * 10),
  decodeResult: 0,
  sopKind: 'SOP',
  messageKind: 'CONTROL',
  messageType,
  messageId: index,
  senderPowerRole: 'SOURCE',
  senderDataRole: 'DFP',
  pulseCount: 3,
  rawPulseWidths: Float64Array.from([1, 2, 3]),
  rawSop: Uint8Array.from([0x12, 0x34, 0x56, 0x78]),
  rawDecodedData: Uint8Array.from([0xaa, 0xbb]),
  parseError: null,
  createdAtMs: 1_700_000_000_000 + index,
})

const DRPD_DEVICE_LABEL = 'Dr. PD 1.0 #ABC'

const buildHydratedRackDocument = (): RackDocument =>
  buildRackDocument({
    pairedDevices: [],
    racks: [
      {
        id: 'bench-rack-a',
        name: 'Bench Rack A',
        totalUnits: 9,
        rows: [
          {
            id: 'row-1',
            instruments: [
              {
                id: 'inst-status',
                instrumentIdentifier: 'com.mta.drpd.device-status-panel',
              },
            ],
          },
          {
            id: 'row-2',
            instruments: [
              {
                id: 'inst-vbus',
                instrumentIdentifier: 'com.mta.drpd.vbus',
              },
            ],
          },
          {
            id: 'row-3',
            instruments: [
              {
                id: 'inst-trigger',
                instrumentIdentifier: 'com.mta.drpd.trigger',
              },
            ],
          },
          {
            id: 'row-4',
            instruments: [
              {
                id: 'inst-sink',
                instrumentIdentifier: 'com.mta.drpd.sink-control',
              },
            ],
          },
        ],
      },
    ],
  })

const buildBoundHydratedRackDocument = (): RackDocument => ({
  pairedDevices: [
    {
      id: 'device-1',
      identifier: 'com.mta.drpd',
      displayName: 'Dr. PD',
      vendorId: 0x2e8a,
      productId: 0x000a,
      serialNumber: 'DRPD-TEST-001',
      productName: 'Dr. PD',
    },
  ],
  racks: [
    {
      id: 'bench-rack-a',
      name: 'Bench Rack A',
      totalUnits: 9,
      rows: [
        {
          id: 'row-1',
          instruments: [
            {
              id: 'inst-status',
              instrumentIdentifier: 'com.mta.drpd.device-status-panel',
            },
          ],
        },
        {
          id: 'row-2',
          instruments: [
            {
              id: 'inst-vbus',
              instrumentIdentifier: 'com.mta.drpd.vbus',
            },
          ],
        },
        {
          id: 'row-3',
          instruments: [
            {
              id: 'inst-trigger',
              instrumentIdentifier: 'com.mta.drpd.trigger',
            },
          ],
        },
        {
          id: 'row-4',
          instruments: [
            {
              id: 'inst-sink',
              instrumentIdentifier: 'com.mta.drpd.sink-control',
            },
          ],
        },
      ],
    },
  ],
})

const buildBoundMessageLogRackDocument = (): RackDocument => ({
  ...buildBoundHydratedRackDocument(),
  racks: [
    {
      id: 'bench-rack-a',
      name: 'Bench Rack A',
      totalUnits: 9,
      rows: [
        {
          id: 'row-1',
          instruments: [
            {
              id: 'inst-log',
              instrumentIdentifier: 'com.mta.drpd.usbpd-log',
            },
          ],
        },
      ],
    },
  ],
})

/**
 * Stub the navigator.usb API.
 */
const mockUSB = (devices: USBDevice[]) => {
  let requestIndex = 0
  const requestDevice = vi.fn(async () => {
    const selected = devices[Math.min(requestIndex, Math.max(devices.length - 1, 0))]
    requestIndex += 1
    return selected
  })
  const getDevices = vi.fn(async () => devices)
  const listeners = new Map<string, Set<EventListener>>()
  const listenerLookup = new WeakMap<EventListenerOrEventListenerObject, EventListener>()
  const addEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
    const callback = typeof listener === 'function' ? listener : listener.handleEvent.bind(listener)
    listenerLookup.set(listener, callback)
    const current = listeners.get(type) ?? new Set<EventListener>()
    current.add(callback)
    listeners.set(type, current)
  })
  const removeEventListener = vi.fn(
    (type: string, listener: EventListenerOrEventListenerObject) => {
      const callback =
        listenerLookup.get(listener) ?? (typeof listener === 'function' ? listener : null)
      if (!callback) {
        return
      }
      listeners.get(type)?.delete(callback)
    },
  )
  vi.stubGlobal('navigator', {
    usb: {
      requestDevice,
      getDevices,
      addEventListener,
      removeEventListener,
    }
  })

  const dispatch = (type: string, event: Event) => {
    for (const listener of listeners.get(type) ?? []) {
      listener(event)
    }
  }

  return {
    requestDevice,
    getDevices,
    dispatchConnect(device: USBDevice) {
      act(() => {
        dispatch('connect', { device } as unknown as Event)
      })
    },
    dispatchDisconnect(device: USBDevice) {
      act(() => {
        dispatch('disconnect', { device } as unknown as Event)
      })
    },
  }
}

const expectHydratedDrpdPanels = async (): Promise<void> => {
  expect(await screen.findAllByText('Sink')).not.toHaveLength(0)
  expect(await screen.findAllByText('Attached')).not.toHaveLength(0)
  expect(await screen.findAllByText('On')).not.toHaveLength(0)
  expect(await screen.findAllByText('5.00')).not.toHaveLength(0)
  expect(await screen.findAllByText('Armed')).not.toHaveLength(0)
  expect(await screen.findAllByText('Connected')).not.toHaveLength(0)
}

const openApplicationSubmenu = async (name: string | RegExp): Promise<void> => {
  const topLevelName = typeof name === 'string'
    ? ({
        Devices: 'Device',
        'Firmware updates': 'Firmware',
      }[name] ?? name)
    : name
  await userEvent.click(await screen.findByRole('button', { name: topLevelName }))
}

const pairNewDeviceFromMenu = async (): Promise<void> => {
  await openApplicationSubmenu('Devices')
  await userEvent.click(await screen.findByRole('menuitem', { name: /pair new device/i }))
}

const openPairedDeviceSubmenu = async (name: string | RegExp): Promise<void> => {
  await openApplicationSubmenu('Devices')
  await userEvent.click(await screen.findByRole('menuitem', { name }))
}

const openCalibrationMenuItem = async (
  deviceName: string | RegExp,
  kind: 'Voltage...' | 'Current...',
): Promise<void> => {
  await openPairedDeviceSubmenu(deviceName)
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Calibrate' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: kind }))
}

const disconnectCurrentDeviceFromMenu = async (): Promise<void> => {
  await openApplicationSubmenu('Devices')
  await userEvent.click(await screen.findByRole('menuitem', { name: /current device/i }))
  await userEvent.click(await screen.findByRole('menuitem', { name: /^disconnect$/i }))
}

const unpairCurrentDeviceFromMenu = async (): Promise<void> => {
  await openApplicationSubmenu('Devices')
  await userEvent.click(await screen.findByRole('menuitem', { name: /current device/i }))
  await userEvent.click(await screen.findByRole('menuitem', { name: /^unpair$/i }))
}

const chooseThemeFromMenu = async (name: string | RegExp): Promise<void> => {
  await userEvent.click(await screen.findByRole('button', { name: 'Display' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Theme' }))
  await userEvent.click(await screen.findByRole('menuitemcheckbox', { name }))
}

const toggleTimestripFromMenu = async (): Promise<void> => {
  await userEvent.click(await screen.findByRole('button', { name: 'Display' }))
  await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Show Timestrip' }))
}

const openLayoutMenu = async (): Promise<void> => {
  await userEvent.click(await screen.findByRole('button', { name: 'Display' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Layout' }))
}

const chooseLayoutFromMenu = async (name: string | RegExp): Promise<void> => {
  await openLayoutMenu()
  await userEvent.click(await screen.findByRole('menuitemcheckbox', { name }))
}

const chooseFirmwareChannelFromMenu = async (name: string | RegExp): Promise<void> => {
  await openApplicationSubmenu('Firmware updates')
  await userEvent.click(await screen.findByRole('menuitem', { name: /update channel/i }))
  await userEvent.click(await screen.findByRole('menuitemcheckbox', { name }))
}

const dispatchBeforeInstallPrompt = (): BeforeInstallPromptEvent => {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as BeforeInstallPromptEvent
  Object.defineProperties(event, {
    platforms: { value: ['web'] },
    prompt: { value: vi.fn(async () => undefined) },
    userChoice: { value: Promise.resolve({ outcome: 'accepted', platform: 'web' }) },
  })

  act(() => {
    window.dispatchEvent(event)
  })
  return event
}

/**
 * Stub window.matchMedia to emulate system theme preference.
 */
const mockMatchMedia = (matchesDark: boolean) => {
  const addEventListener = vi.fn()
  const removeEventListener = vi.fn()
  const addListener = vi.fn()
  const removeListener = vi.fn()
  const query: MediaQueryList = {
    matches: matchesDark,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener,
    removeEventListener,
    addListener,
    removeListener,
    dispatchEvent: vi.fn(() => true),
  }
  vi.stubGlobal('matchMedia', vi.fn(() => query))
  return { addEventListener, removeEventListener, addListener, removeListener }
}

let originalVerifier: typeof DRPDDeviceDefinition.verifyConnectedDevice

const resetMockTransportState = (): void => {
  mockTransportState.shouldFailOpen = false
  mockTransportState.statusRegisterResponse = ['0']
  mockTransportState.analogResponse = [
    '1000',
    '5.00',
    '0.12',
    '0.33',
    '0.00',
    '0.33',
    '0.00',
    '1.20',
    '0.00',
    '0.60',
    '2500',
    '12',
    '34',
  ]
  mockTransportState.vbusVoltageResponse = ['5.00']
  mockTransportState.rawVbusCurrentResponse = ['0.50']
  mockTransportState.vbusCalibrationResponse = Array.from({ length: 61 }, () => '0')
  mockTransportState.vbusCurrentCalibrationResponse = Array.from(
    { length: 13 },
    (_, index) => (index / 2).toString(),
  )
  mockTransportState.roleResponse = ['SINK']
  mockTransportState.roleStatusResponse = ['ATTACHED']
  mockTransportState.vbusStatusResponse = ['ENABLED']
  mockTransportState.ovpThresholdResponse = ['21']
  mockTransportState.ocpThresholdResponse = ['3.5']
  mockTransportState.captureEnabledResponse = ['ON']
  mockTransportState.captureCycleTimeResponse = ['10']
  mockTransportState.triggerStatusResponse = ['ARMED']
  mockTransportState.triggerEventTypeResponse = ['MESSAGE_COMPLETE']
  mockTransportState.triggerEventThresholdResponse = ['2']
  mockTransportState.triggerAutoRepeatResponse = ['ON']
  mockTransportState.triggerEventCountResponse = ['7']
  mockTransportState.triggerSyncModeResponse = ['TOGGLE']
  mockTransportState.triggerSyncPulseWidthResponse = ['25']
  mockTransportState.sinkPdoCountResponse = ['1']
  mockTransportState.sinkPdoResponse = ['FIXED,5.00,3.00']
  mockTransportState.sinkStatusResponse = ['PE_SNK_READY']
  mockTransportState.sinkNegotiatedPdoResponse = ['FIXED,5.00,3.00']
  mockTransportState.sinkVoltageResponse = ['5']
  mockTransportState.sinkCurrentResponse = ['2']
  mockTransportState.sinkErrorResponse = ['0']
  mockTransportState.sinkEprEnabledResponse = ['OFF']
  mockTransportState.sinkPpsStatusQueryEnabledResponse = ['OFF']
  mockTransportState.timestampResponse = ['1000']
  mockTransportState.idnResponse = ['MTA Inc.,Dr. PD,ABC,1.0']
  mockTransportState.hardwareRevisionResponse = ['R2605-A']
  mockTransportState.captureCountResponse = ['0']
  mockTransportState.sentCommands = []
}

beforeEach(() => {
  originalVerifier = DRPDDeviceDefinition.verifyConnectedDevice
  DRPDDeviceDefinition.verifyConnectedDevice = async () => true
  resetMockTransportState()
  mockFirmwareUpdaterState.openCount = 0
  mockFirmwareUpdaterState.closeCount = 0
  mockFirmwareUpdaterState.updateCount = 0
  mockFirmwareUpdaterState.interfaceNumber = null
  mockFirmwareUpdaterState.shouldFailUpdate = false
  vi.stubGlobal('localStorage', createStorage())
  vi.stubGlobal('fetch', vi.fn(async () => buildFetchResponse([])))
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  DRPDDeviceDefinition.verifyConnectedDevice = originalVerifier
  resetMockTransportState()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('RackView', () => {
  it('renders rack metadata and rows', async () => {
    saveRackDocument(buildRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)

    expect(await screen.findByText('Bench Rack A')).toBeInTheDocument()

    const row = await screen.findByTestId('rack-row-row-2')
    expect(row).toHaveStyle({ height: '100px' })
    expect(screen.getByTestId('rack-instrument-inst-2')).toBeInTheDocument()
  })

  it('toggles theme mode from the header control', async () => {
    saveRackDocument(buildRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await chooseThemeFromMenu('Light')

    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(window.localStorage.getItem('drpd:theme')).toBe('light')
  })

  it('shows a waiting device status in the menu bar when no device is connected', async () => {
    saveRackDocument(buildRackDocument())
    mockUSB([])
    render(<RackView />)

    expect(await screen.findByText('Waiting for device...')).toBeInTheDocument()
  })

  it('shows the connected device name in the menu bar', async () => {
    saveRackDocument(buildHydratedRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await pairNewDeviceFromMenu()

    expect(await screen.findByText('Connected to Dr. PD #DRPD-TEST-001')).toBeInTheDocument()
  })

  it('restores Message Log table layout from the menu', async () => {
    saveRackDocument(buildRackDocument())
    mockUSB([createUSBDevice()])
    window.localStorage.setItem('drpd:message-log:columns', JSON.stringify({ sender: false }))
    window.localStorage.setItem('drpd:message-log:column-widths', JSON.stringify({ messageType: 320 }))
    render(<RackView />)

    await userEvent.click(await screen.findByRole('button', { name: 'Message Log' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Restore Table Layout' }))

    const columns = JSON.parse(window.localStorage.getItem('drpd:message-log:columns') ?? '{}')
    const widths = JSON.parse(window.localStorage.getItem('drpd:message-log:column-widths') ?? '{}')
    expect(Object.values(columns).every((visible) => visible === true)).toBe(true)
    expect(widths.messageType).toBe(200)
  })

  it('shows filter options for messages added after device connection', async () => {
    saveRackDocument(buildHydratedRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await userEvent.click(await screen.findByRole('button', { name: 'Device' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /pair new device/i }))
    await waitFor(() => {
      expect(
        (window as unknown as {
          __drpdLogs?: { driver: () => EventTarget }
        }).__drpdLogs?.driver(),
      ).toBeTruthy()
    })

    const driver = (window as unknown as {
      __drpdLogs: { driver: () => EventTarget }
    }).__drpdLogs.driver()
    act(() => {
      driver.dispatchEvent(
        new CustomEvent(DRPDDevice.LOG_ENTRY_ADDED_EVENT, {
          detail: { kind: 'message', row: buildLoggedMessage(0, 3) },
        }),
      )
    })

    await userEvent.click(await screen.findByRole('button', { name: 'Message Log' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /^Filter/ }))

    const dialog = await screen.findByRole('dialog', { name: 'Filter message log' })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText('Accept')).toBeInTheDocument()
    expect(within(dialog).getByText('Source')).toBeInTheDocument()
    expect(within(dialog).getByText('Valid')).toBeInTheDocument()
    expect(within(dialog).getAllByRole('button', { name: 'Include' }).length).toBeGreaterThan(0)
  })

  it('opens the message log context menu from the message log instrument', async () => {
    saveRackDocument(buildBoundMessageLogRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)

    expect(await screen.findByText('Connected to Dr. PD')).toBeInTheDocument()
    fireEvent.contextMenu(await screen.findByTestId('drpd-usbpd-log'))

    const menu = screen.getByRole('menu', { name: 'Message Log menu' })

    expect(within(menu).getByRole('menuitem', { name: /Disable Capture/ })).toBeEnabled()
    expect(within(menu).getByRole('menuitem', { name: /Clear Log/ })).toBeEnabled()
    expect(within(menu).getByRole('menuitem', { name: /Add marker/ })).toBeEnabled()
    expect(within(menu).getByRole('menuitem', { name: 'Import JSON...' })).toBeEnabled()
    expect(within(menu).getByRole('menuitem', { name: 'Export Selected' })).toBeDisabled()
    expect(within(menu).getByRole('menuitemcheckbox', {
      name: /Hide GoodCRC Messages/,
    })).toBeEnabled()
    expect(within(menu).getByRole('menuitem', { name: /Filter\.\.\./ })).toBeEnabled()
    expect(within(menu).getByRole('menuitem', { name: 'Configure...' })).toBeEnabled()
    expect(within(menu).getByRole('menuitem', { name: 'Restore Table Layout' })).toBeEnabled()

    await userEvent.click(within(menu).getByRole('menuitem', { name: /Filter\.\.\./ }))

    expect(await screen.findByRole('dialog', { name: 'Filter message log' })).toBeInTheDocument()
  })

  it('toggles capture from the message log context menu', async () => {
    saveRackDocument(buildBoundMessageLogRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)

    expect(await screen.findByText('Connected to Dr. PD')).toBeInTheDocument()
    fireEvent.contextMenu(await screen.findByTestId('drpd-usbpd-log'))

    const menu = screen.getByRole('menu', { name: 'Message Log menu' })
    await userEvent.click(within(menu).getByRole('menuitem', { name: /Disable Capture/ }))

    await waitFor(() => {
      expect(mockTransportState.sentCommands).toContain('BUS:CC:CAP:EN OFF')
    })
  })

  it('updates the time since reset while the Power/Charge Meter menu is open', async () => {
    saveRackDocument(buildBoundHydratedRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)

    expect(await screen.findByText('Connected to Dr. PD')).toBeInTheDocument()
    expect(await screen.findAllByText('5.00')).not.toHaveLength(0)
    await openApplicationSubmenu('Power/Charge Meter')
    expect(
      await screen.findByRole('menuitem', { name: /Time since reset\s+00:00:00/ }),
    ).toBeDisabled()

    mockTransportState.analogResponse = [
      ...mockTransportState.analogResponse.slice(0, 10),
      '3661000000',
      ...mockTransportState.analogResponse.slice(11),
    ]

    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', { name: /Time since reset\s+01:01:01/ }),
      ).toBeDisabled()
    })
  })

  it('imports Message Log JSON after destructive confirmation', async () => {
    saveRackDocument(buildHydratedRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await userEvent.click(await screen.findByRole('button', { name: 'Device' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /pair new device/i }))
    await waitFor(() => {
      expect(
        (window as unknown as {
          __drpdLogs?: { driver: () => DRPDDevice }
        }).__drpdLogs?.driver(),
      ).toBeTruthy()
    })

    const driver = (window as unknown as {
      __drpdLogs: { driver: () => DRPDDevice }
    }).__drpdLogs.driver()
    const importSpy = vi.spyOn(driver, 'importCapturedMessages')
    const file = new File(
      [JSON.stringify([serializeMessageLogRow(buildLoggedMessage(0))])],
      'message-log-export.json',
      { type: 'application/json' },
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Message Log' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Import JSON...' }))

    let dialog = await screen.findByRole('dialog', { name: 'Import message log' })
    const input = dialog.querySelector('input[type="file"]')
    expect(input).toBeInstanceOf(HTMLInputElement)
    await userEvent.upload(input as HTMLInputElement, file)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Import' }))

    const confirm = await screen.findByRole('dialog', { name: 'Replace log contents?' })
    expect(within(confirm).getByText(/erase all existing log data/i)).toBeInTheDocument()
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(importSpy).not.toHaveBeenCalled()

    dialog = await screen.findByRole('dialog', { name: 'Import message log' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Import' }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Replace log contents?' })).getByRole(
        'button',
        { name: 'Erase and import' },
      ),
    )

    await waitFor(() => {
      expect(importSpy).toHaveBeenCalledTimes(1)
    })
    expect(importSpy.mock.calls[0][1]).toEqual({ clearScope: 'all' })
    expect(screen.queryByRole('dialog', { name: 'Import message log' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Replace log contents?' })).not.toBeInTheDocument()
  })

  it('resolves system theme from matchMedia', async () => {
    saveRackDocument(buildRackDocument())
    mockUSB([createUSBDevice()])
    mockMatchMedia(false)
    render(<RackView />)

    await screen.findByText('Bench Rack A')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('restores persisted theme on reload', async () => {
    saveRackDocument(buildRackDocument())
    mockUSB([createUSBDevice()])
    mockMatchMedia(false)
    window.localStorage.setItem('drpd:theme', 'dark')

    const { unmount } = render(<RackView />)
    await screen.findByText('Bench Rack A')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')

    unmount()
    render(<RackView />)
    await screen.findByText('Bench Rack A')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('shows production as the default firmware update channel', async () => {
    saveRackDocument(buildHydratedRackDocument())
    const { requestDevice } = mockUSB([createUSBDevice()])
    render(<RackView />)

    await pairNewDeviceFromMenu()
    expect(requestDevice).toHaveBeenCalled()
    await openApplicationSubmenu('Firmware updates')
    await userEvent.click(await screen.findByRole('menuitem', { name: /update channel/i }))

    expect(screen.getByRole('menuitemcheckbox', { name: 'Production' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('menuitemcheckbox', { name: 'Beta' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })

  it('persists the selected firmware update channel from the menu', async () => {
    saveRackDocument(buildHydratedRackDocument())
    const { requestDevice } = mockUSB([createUSBDevice()])
    render(<RackView />)

    await pairNewDeviceFromMenu()
    expect(requestDevice).toHaveBeenCalled()
    await chooseFirmwareChannelFromMenu('Beta')

    expect(window.localStorage.getItem('drpd:firmware-update:channel')).toBe('beta')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('restores the persisted firmware update channel on reload', async () => {
    saveRackDocument(buildHydratedRackDocument())
    const { requestDevice } = mockUSB([createUSBDevice()])
    window.localStorage.setItem('drpd:firmware-update:channel', 'beta')

    const { unmount } = render(<RackView />)
    await pairNewDeviceFromMenu()
    expect(requestDevice).toHaveBeenCalled()
    await openApplicationSubmenu('Firmware updates')
    await userEvent.click(await screen.findByRole('menuitem', { name: /update channel/i }))
    expect(screen.getByRole('menuitemcheckbox', { name: 'Beta' })).toHaveAttribute(
      'aria-checked',
      'true',
    )

    unmount()
    render(<RackView />)
    await pairNewDeviceFromMenu()
    await openApplicationSubmenu('Firmware updates')
    await userEvent.click(await screen.findByRole('menuitem', { name: /update channel/i }))
    expect(screen.getByRole('menuitemcheckbox', { name: 'Beta' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('hides the header when configured on the rack', async () => {
    saveRackDocument(
      buildRackDocument({
        racks: [
          {
            id: 'bench-rack-a',
            name: 'Bench Rack A',
            hideHeader: true,
            totalUnits: 9,
            devices: [],
            rows: [
              {
                id: 'row-1',
                instruments: [
                  {
                    id: 'inst-1',
                    instrumentIdentifier: 'com.mta.drpd.device-status-panel'
                  }
                ]
              }
            ]
          }
        ]
      })
    )
    mockUSB([createUSBDevice()])
    render(<RackView />)

    expect(await screen.findByTestId('rack-row-row-1')).toBeInTheDocument()
    expect(screen.queryByText('Bench Rack A')).not.toBeInTheDocument()
  })

  it('renders the top header and rack against the shared CSS canvas width', async () => {
    saveRackDocument(buildRackDocument())
    mockUSB([createUSBDevice()])
    const { container } = render(<RackView />)

    const header = await screen.findByRole('banner')
    const rackCanvas = container.querySelector('[data-rack-canvas="true"]')

    expect(rackCanvas).not.toBeNull()
    expect(header.className).toContain('header')
    expect(screen.queryByRole('button', { name: 'Rack' })).not.toBeInTheDocument()
  })

  it('renders compact VBUS status groups in the top header', async () => {
    saveRackDocument(buildRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)

    const header = await screen.findByRole('banner')
    const headerLabels = Array.from(
      header.querySelectorAll('[class*="headerVbusProtectionLabel"]'),
    ).map((element) => element.textContent)

    expect(within(header).getByLabelText('VBUS metrics')).toBeInTheDocument()
    expect(within(header).getByText('OVP')).toBeInTheDocument()
    expect(within(header).getByText('OCP')).toBeInTheDocument()
    expect(within(header).getByText('MODE')).toBeInTheDocument()
    expect(within(header).getByText('STATUS')).toBeInTheDocument()
    expect(within(header).getByText('CAPTURE')).toBeInTheDocument()
    expect(within(header).getByText('PROFILE')).toBeInTheDocument()
    expect(within(header).getByText('SYNC STATE')).toBeInTheDocument()
    expect(within(header).getByText('EVENT COUNT')).toBeInTheDocument()
    expect(headerLabels).toEqual([
      'OVP',
      'OCP',
      'MODE',
      'PROFILE',
      'CAPTURE',
      'STATUS',
      'SYNC STATE',
      'EVENT COUNT',
    ])
  })

  it('opens the protection context menu from the top header and follows menu rules', async () => {
    saveRackDocument(buildHydratedRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)
    await pairNewDeviceFromMenu()
    expect(await screen.findByText('Connected to Dr. PD #DRPD-TEST-001')).toBeInTheDocument()

    const header = await screen.findByRole('banner')
    fireEvent.contextMenu(within(header).getByLabelText('VBUS protection'))

    const menu = screen.getByRole('menu', { name: 'Protection menu' })
    const setThresholds = within(menu).getByRole('menuitem', { name: 'Set thresholds...' })
    const reset = within(menu).getByRole('menuitem', { name: /Reset/ })

    await waitFor(() => expect(setThresholds).toBeEnabled())
    expect(reset).toBeDisabled()

    await userEvent.click(setThresholds)

    expect(await screen.findByRole('dialog', { name: 'VBUS settings' })).toBeInTheDocument()
  })

  it('enables header protection context reset during a protection fault', async () => {
    mockTransportState.vbusStatusResponse = ['OVP', '12000', 'NONE']
    saveRackDocument(buildHydratedRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)
    await pairNewDeviceFromMenu()
    expect(await screen.findByText('Connected to Dr. PD #DRPD-TEST-001')).toBeInTheDocument()

    const header = await screen.findByRole('banner')
    fireEvent.contextMenu(within(header).getByLabelText('VBUS protection'))

    const menu = screen.getByRole('menu', { name: 'Protection menu' })
    const reset = within(menu).getByRole('menuitem', { name: /Reset/ })

    await waitFor(() => expect(reset).toBeEnabled())
    await userEvent.click(reset)

    await waitFor(() => {
      expect(mockTransportState.sentCommands).toContain('BUS:VBUS:RESET')
    })
  })

  it('opens the trigger context menu from the top header and follows menu rules', async () => {
    saveRackDocument(buildHydratedRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)
    await pairNewDeviceFromMenu()
    expect(await screen.findByText('Connected to Dr. PD #DRPD-TEST-001')).toBeInTheDocument()

    const header = await screen.findByRole('banner')
    fireEvent.contextMenu(within(header).getByLabelText('Trigger status'))

    const menu = screen.getByRole('menu', { name: 'Trigger menu' })
    const configure = within(menu).getByRole('menuitem', { name: 'Configure...' })
    const reset = within(menu).getByRole('menuitem', { name: /Reset/ })

    await waitFor(() => expect(configure).toBeEnabled())
    expect(reset).toBeDisabled()

    await userEvent.click(configure)

    expect(await screen.findByRole('dialog', { name: 'Configure trigger' })).toBeInTheDocument()
  })

  it('enables header trigger context reset while trigger is active', async () => {
    mockTransportState.triggerStatusResponse = ['TRIGGERED']
    saveRackDocument(buildHydratedRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)
    await pairNewDeviceFromMenu()
    expect(await screen.findByText('Connected to Dr. PD #DRPD-TEST-001')).toBeInTheDocument()

    const header = await screen.findByRole('banner')
    fireEvent.contextMenu(within(header).getByLabelText('Trigger status'))

    const menu = screen.getByRole('menu', { name: 'Trigger menu' })
    const reset = within(menu).getByRole('menuitem', { name: /Reset/ })

    await waitFor(() => expect(reset).toBeEnabled())
    await userEvent.click(reset)

    await waitFor(() => {
      expect(mockTransportState.sentCommands).toContain('TRIG:RESET')
    })
  })

  it('opens the capture context menu from the top header and disables capture', async () => {
    saveRackDocument(buildHydratedRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)
    await pairNewDeviceFromMenu()
    expect(await screen.findByText('Connected to Dr. PD #DRPD-TEST-001')).toBeInTheDocument()

    const header = await screen.findByRole('banner')
    fireEvent.contextMenu(within(header).getByLabelText('Capture status'))

    const menu = screen.getByRole('menu', { name: 'Capture menu' })
    const disableCapture = within(menu).getByRole('menuitem', { name: /Disable Capture/ })

    expect(within(menu).getAllByRole('menuitem')).toHaveLength(1)
    expect(disableCapture).toBeEnabled()

    await userEvent.click(disableCapture)

    await waitFor(() => {
      expect(mockTransportState.sentCommands).toContain('BUS:CC:CAP:EN OFF')
    })
    await waitFor(() => {
      expect(screen.queryByRole('menu', { name: 'Capture menu' })).not.toBeInTheDocument()
    })
  })

  it('enables capture from the top header capture context menu', async () => {
    mockTransportState.captureEnabledResponse = ['OFF']
    saveRackDocument(buildHydratedRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)
    await pairNewDeviceFromMenu()
    expect(await screen.findByText('Connected to Dr. PD #DRPD-TEST-001')).toBeInTheDocument()

    const header = await screen.findByRole('banner')
    fireEvent.contextMenu(within(header).getByLabelText('Capture status'))

    const menu = screen.getByRole('menu', { name: 'Capture menu' })
    const enableCapture = within(menu).getByRole('menuitem', { name: /Enable Capture/ })

    expect(within(menu).getAllByRole('menuitem')).toHaveLength(1)
    expect(enableCapture).toBeEnabled()

    await userEvent.click(enableCapture)

    await waitFor(() => {
      expect(mockTransportState.sentCommands).toContain('BUS:CC:CAP:EN ON')
    })
  })

  it('opens the disabled capture context menu without an active driver', async () => {
    saveRackDocument(buildRackDocument())
    mockUSB([])
    render(<RackView />)

    const header = await screen.findByRole('banner')
    fireEvent.contextMenu(within(header).getByLabelText('Capture status'))

    const menu = screen.getByRole('menu', { name: 'Capture menu' })
    const enableCapture = within(menu).getByRole('menuitem', { name: /Enable Capture/ })

    expect(within(menu).getAllByRole('menuitem')).toHaveLength(1)
    expect(enableCapture).toBeDisabled()
  })

  it('opens the mode context menu from the top header', async () => {
    saveRackDocument(buildHydratedRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)
    await pairNewDeviceFromMenu()
    expect(await screen.findByText('Connected to Dr. PD #DRPD-TEST-001')).toBeInTheDocument()

    const header = await screen.findByRole('banner')
    fireEvent.contextMenu(within(header).getByLabelText('Mode status'))

    const menu = screen.getByRole('menu', { name: 'Mode menu' })

    expect(within(menu).getByRole('menuitem', { name: 'Set mode' })).toBeInTheDocument()
    expect(
      within(menu).getByRole('menuitem', {
        name: /Choose power contract/,
      }),
    ).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Sink behaviour' })).toBeInTheDocument()
    expect(
      within(menu).getByRole('menuitem', {
        name: /Cycle USB Connection/,
      }),
    ).toBeInTheDocument()

    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Set mode' }))

    expect(await screen.findByRole('menuitemcheckbox', { name: /Disabled/ })).toBeInTheDocument()
    expect(await screen.findByRole('menuitemcheckbox', { name: /Observer/ })).toBeInTheDocument()
    const sinkMode = await screen.findByRole('menuitemcheckbox', { name: /Sink/ })
    expect(sinkMode).toHaveAttribute('aria-checked', 'true')
  })

  it('opens the mode menu from the menu bar and follows sink-mode rules', async () => {
    saveRackDocument(buildHydratedRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)
    await pairNewDeviceFromMenu()
    expect(await screen.findByText('Connected to Dr. PD #DRPD-TEST-001')).toBeInTheDocument()

    await userEvent.click(await screen.findByRole('button', { name: 'Mode' }))

    const menu = screen.getByRole('menu', { name: 'Mode menu' })
    const setMode = within(menu).getByRole('menuitem', { name: 'Set mode' })
    const choosePowerContract = within(menu).getByRole('menuitem', {
      name: /Choose power contract/,
    })
    const sinkBehaviour = within(menu).getByRole('menuitem', { name: 'Sink behaviour' })
    const cycleUsbConnection = within(menu).getByRole('menuitem', {
      name: /Cycle USB Connection/,
    })

    expect(choosePowerContract).toBeEnabled()
    expect(sinkBehaviour).toBeEnabled()
    expect(cycleUsbConnection).toBeEnabled()

    await userEvent.click(setMode)

    expect(await screen.findByRole('menuitemcheckbox', { name: /Disabled/ })).toBeInTheDocument()
    expect(await screen.findByRole('menuitemcheckbox', { name: /Observer/ })).toBeInTheDocument()
    const sinkMode = await screen.findByRole('menuitemcheckbox', { name: /Sink/ })
    expect(sinkMode).toHaveAttribute('aria-checked', 'true')

    await userEvent.click(choosePowerContract)

    expect(await screen.findByRole('dialog', { name: /sink request tuning/i })).toBeInTheDocument()
  })

  it('disables sink-only menu-bar mode actions while mode is disabled', async () => {
    mockTransportState.roleResponse = ['DISABLED']
    saveRackDocument(buildHydratedRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)
    await pairNewDeviceFromMenu()
    expect(await screen.findByText('Connected to Dr. PD #DRPD-TEST-001')).toBeInTheDocument()

    await userEvent.click(await screen.findByRole('button', { name: 'Mode' }))

    const menu = screen.getByRole('menu', { name: 'Mode menu' })

    expect(within(menu).getByRole('menuitem', { name: /Choose power contract/ })).toBeDisabled()
    expect(within(menu).getByRole('menuitem', { name: /Cycle USB Connection/ })).toBeDisabled()
  })

  it('sets observer mode from the menu-bar mode menu', async () => {
    saveRackDocument(buildHydratedRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)
    await pairNewDeviceFromMenu()
    expect(await screen.findByText('Connected to Dr. PD #DRPD-TEST-001')).toBeInTheDocument()

    await userEvent.click(await screen.findByRole('button', { name: 'Mode' }))

    const menu = screen.getByRole('menu', { name: 'Mode menu' })
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Set mode' }))
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: /Observer/ }))

    await waitFor(() => {
      expect(mockTransportState.sentCommands).toContain('BUS:CC:ROLE OBSERVER')
    })
  })

  it('renders the base instrument header', () => {
    render(
      <InstrumentBase
        instrument={{
          id: 'inst-1',
          instrumentIdentifier: 'com.mta.drpd.device-status-panel'
        }}
        displayName="Device Status"
      />
    )

    expect(screen.getByText('Device Status')).toBeInTheDocument()
  })

  it('opens and switches instrument header popovers', async () => {
    const user = userEvent.setup()
    render(
      <InstrumentBase
        instrument={{
          id: 'inst-1',
          instrumentIdentifier: 'com.mta.drpd.device-status-panel'
        }}
        displayName="Device Status"
        headerControls={[
          {
            id: 'first',
            label: 'First',
            renderPopover: () => <div>First popup</div>,
          },
          {
            id: 'second',
            label: 'Second',
            renderPopover: () => <div>Second popup</div>,
          },
        ]}
      />
    )

    await user.click(screen.getByRole('button', { name: 'First' }))
    expect(screen.getByText('First popup')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveStyle({ zIndex: '10000' })
    expect(screen.queryByText('Second popup')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Second' }))
    expect(screen.queryByText('First popup')).not.toBeInTheDocument()
    expect(screen.getByText('Second popup')).toBeInTheDocument()
  })

  it('closes instrument header popover on outside click and escape', async () => {
    const user = userEvent.setup()
    render(
      <InstrumentBase
        instrument={{
          id: 'inst-1',
          instrumentIdentifier: 'com.mta.drpd.device-status-panel'
        }}
        displayName="Device Status"
        headerControls={[
          {
            id: 'only',
            label: 'Only',
            renderPopover: () => <div>Only popup</div>,
          },
        ]}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Only' }))
    expect(screen.getByText('Only popup')).toBeInTheDocument()

    fireEvent.pointerDown(document.body)
    expect(screen.queryByText('Only popup')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Only' }))
    expect(screen.getByText('Only popup')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByText('Only popup')).not.toBeInTheDocument()
  })

  it('renders a concrete instrument view', async () => {
    saveRackDocument(buildRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await waitFor(() => {
      expect(screen.getAllByText('Role').length).toBeGreaterThan(0)
    })
  })

  it('shows edit controls and allows removing instruments with cancel restore', async () => {
    saveRackDocument(buildRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)

    const editButton = await screen.findByRole('button', { name: 'Edit' })
    await userEvent.click(editButton)

    const removeButtons = await screen.findAllByRole('button', {
      name: /remove instrument/i
    })
    expect(removeButtons.length).toBeGreaterThan(0)

    await userEvent.click(removeButtons[0])
    expect(screen.queryByTestId('rack-instrument-inst-1')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByTestId('rack-instrument-inst-1')).toBeInTheDocument()
  })

  it('disables application menu while editing', async () => {
    saveRackDocument(buildRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('button', { name: 'Settings' })).toBeDisabled()
  })

  it('saves edits and persists layout changes', async () => {
    saveRackDocument(buildRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    await userEvent.click(
      (await screen.findAllByRole('button', { name: /remove instrument/i }))[0],
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    const stored = JSON.parse(
      window.localStorage.getItem('drpd:rack:document') ?? '{}',
    ) as RackDocument
    const instruments = stored.racks[0]?.rows.flatMap((row) => row.instruments) ?? []
    expect(instruments.some((instrument) => instrument.id === 'inst-1')).toBe(false)
  })

  it('supports drag and drop reordering in edit mode', async () => {
    saveRackDocument(buildRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))

    const instrument = await screen.findByTestId('rack-instrument-inst-1')
    const dropZone = await screen.findByTestId('rack-row-insert-2')
    const dataTransfer = {
      setData: vi.fn(),
      effectAllowed: 'move'
    }

    fireEvent.dragStart(instrument, { dataTransfer })
    fireEvent.dragOver(dropZone, { clientX: 10, clientY: 10 })
    fireEvent.drop(dropZone, { clientX: 10, clientY: 10 })
    fireEvent.dragEnd(instrument)

    const rows = screen.getAllByTestId(/rack-row-row-/)
    const lastRow = rows[rows.length - 1]
    expect(
      lastRow.querySelector('[data-testid="rack-instrument-inst-1"]'),
    ).toBeTruthy()
  })

  it('keeps default flex weights for Message Log and VBUS instruments', async () => {
    saveRackDocument(
      buildRackDocument({
        racks: [
          {
            id: 'bench-rack-a',
            name: 'Bench Rack A',
            totalUnits: 9,
            devices: [],
            rows: [
              {
                id: 'row-1',
                instruments: [
                  {
                    id: 'inst-fixed',
                    instrumentIdentifier: 'com.mta.drpd.usbpd-log'
                  },
                  {
                    id: 'inst-flex-1',
                    instrumentIdentifier: 'com.mta.drpd.vbus'
                  },
                  {
                    id: 'inst-flex-2',
                    instrumentIdentifier: 'com.mta.drpd.vbus'
                  }
                ]
              }
            ]
          }
        ]
      })
    )
    mockUSB([createUSBDevice()])
    render(<RackView />)

    expect(await screen.findByTestId('rack-instrument-inst-fixed')).toHaveAttribute(
      'data-flex',
      '2.4',
    )
    expect(await screen.findByTestId('rack-instrument-inst-flex-1')).toHaveAttribute(
      'data-flex',
      '10',
    )
    expect(await screen.findByTestId('rack-instrument-inst-flex-2')).toHaveAttribute(
      'data-flex',
      '10',
    )
  })

  it('keeps default flex weights for CC Lines, Device Status, VBUS, Accumulator, and Sync Trigger', async () => {
    saveRackDocument(
      buildRackDocument({
        racks: [
          {
            id: 'bench-rack-a',
            name: 'Bench Rack A',
            totalUnits: 9,
            devices: [],
            rows: [
              {
                id: 'row-1',
                instruments: [
                  {
                    id: 'inst-status',
                    instrumentIdentifier: 'com.mta.drpd.device-status-panel'
                  },
                  {
                    id: 'inst-cc',
                    instrumentIdentifier: 'com.mta.drpd.cc-lines'
                  },
                  {
                    id: 'inst-vbus',
                    instrumentIdentifier: 'com.mta.drpd.vbus'
                  },
                  {
                    id: 'inst-charge-energy',
                    instrumentIdentifier: 'com.mta.drpd.charge-energy'
                  },
                  {
                    id: 'inst-trigger',
                    instrumentIdentifier: 'com.mta.drpd.trigger'
                  }
                ]
              }
            ]
          }
        ]
      })
    )
    mockUSB([createUSBDevice()])
    render(<RackView />)

    expect(await screen.findByTestId('rack-instrument-inst-status')).toHaveAttribute(
      'data-flex',
      '10',
    )
    expect(await screen.findByTestId('rack-instrument-inst-cc')).toHaveAttribute(
      'data-flex',
      '7',
    )
    expect(await screen.findByTestId('rack-instrument-inst-vbus')).toHaveAttribute(
      'data-flex',
      '10',
    )
    expect(await screen.findByTestId('rack-instrument-inst-charge-energy')).toHaveAttribute(
      'data-flex',
      '7',
    )
    expect(await screen.findByTestId('rack-instrument-inst-trigger')).toHaveAttribute(
      'data-flex',
      '18',
    )
  })

  it('falls back to a new row when dropping into an over-capacity row', async () => {
    saveRackDocument(
      buildRackDocument({
        racks: [
          {
            id: 'bench-rack-a',
            name: 'Bench Rack A',
            totalUnits: 9,
            devices: [],
            rows: [
              {
                id: 'row-1',
                instruments: [
                  {
                    id: 'inst-a',
                    instrumentIdentifier: 'com.mta.drpd.usbpd-log'
                  }
                ]
              },
              {
                id: 'row-2',
                instruments: [
                  {
                    id: 'inst-b',
                    instrumentIdentifier: 'com.mta.drpd.usbpd-log'
                  },
                  {
                    id: 'inst-c',
                    instrumentIdentifier: 'com.mta.drpd.usbpd-log'
                  }
                ]
              }
            ]
          }
        ]
      })
    )
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    const instrument = await screen.findByTestId('rack-instrument-inst-a')
    const targetRow = await screen.findByTestId('rack-row-row-2')
    const dataTransfer = {
      setData: vi.fn(),
      effectAllowed: 'move'
    }

    fireEvent.dragStart(instrument, { dataTransfer })
    fireEvent.dragOver(targetRow, { clientX: 10, clientY: 10 })
    fireEvent.drop(targetRow, { clientX: 10, clientY: 10 })
    fireEvent.dragEnd(instrument)

    const rows = screen.getAllByTestId(/rack-row-row-/)
    expect(rows).toHaveLength(2)
    expect(screen.getByTestId('rack-instrument-inst-a')).toBeInTheDocument()
    expect(
      screen.getByTestId('rack-row-row-2').querySelector('[data-testid="rack-instrument-inst-a"]'),
    ).toBeFalsy()
  })

  it('allows dropping next to legacy VBUS identifiers in edit mode', async () => {
    saveRackDocument(
      buildRackDocument({
        racks: [
          {
            id: 'bench-rack-a',
            name: 'Bench Rack A',
            totalUnits: 9,
            devices: [],
            rows: [
              {
                id: 'row-1',
                instruments: [
                  {
                    id: 'inst-vbus-legacy',
                    instrumentIdentifier: 'com.mta.drpd.device-status'
                  }
                ]
              },
              {
                id: 'row-2',
                instruments: [
                  {
                    id: 'inst-move',
                    instrumentIdentifier: 'com.mta.drpd.device-status-panel'
                  }
                ]
              }
            ]
          }
        ]
      })
    )
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    const instrument = await screen.findByTestId('rack-instrument-inst-move')
    const targetRow = await screen.findByTestId('rack-row-row-1')
    const dataTransfer = {
      setData: vi.fn(),
      effectAllowed: 'move'
    }

    fireEvent.dragStart(instrument, { dataTransfer })
    fireEvent.dragOver(targetRow, { clientX: 10, clientY: 10 })
    fireEvent.drop(targetRow, { clientX: 10, clientY: 10 })
    fireEvent.dragEnd(instrument)

    const rows = screen.getAllByTestId(/rack-row-row-/)
    expect(rows).toHaveLength(1)
    expect(screen.getByTestId('rack-row-row-1')).toContainElement(
      screen.getByTestId('rack-instrument-inst-vbus-legacy'),
    )
    expect(screen.getByTestId('rack-row-row-1')).toContainElement(
      screen.getByTestId('rack-instrument-inst-move'),
    )
  })

  it('shows the full-screen overlay when an instrument requests it', async () => {
    saveRackDocument(
      buildRackDocument({
        racks: [
          {
            id: 'bench-rack-a',
            name: 'Bench Rack A',
            totalUnits: 9,
            devices: [
              {
                id: 'device-1',
                identifier: 'com.mta.drpd',
                displayName: 'Dr. PD',
                vendorId: 0x2e8a,
                productId: 0x000a,
                serialNumber: 'DRPD-TEST-001',
                productName: 'Dr. PD'
              }
            ],
            rows: [
              {
                id: 'row-1',
                instruments: [
                  {
                    id: 'inst-1',
                    instrumentIdentifier: 'com.mta.drpd.device-status-panel',
                    fullScreen: true
                  }
                ]
              }
            ]
          }
        ]
      })
    )
    mockUSB([createUSBDevice()])

    render(<RackView />)

    expect(await screen.findByTestId('rack-fullscreen')).toBeInTheDocument()
    expect(screen.queryByTestId('rack-rows')).not.toBeInTheDocument()
  })

  it('connects and persists a device added by the user', async () => {
    saveRackDocument(buildHydratedRackDocument())
    const { requestDevice } = mockUSB([createUSBDevice()])
    render(<RackView />)

    await pairNewDeviceFromMenu()

    expect(requestDevice).toHaveBeenCalled()
    await expectHydratedDrpdPanels()
    const stored = JSON.parse(
      window.localStorage.getItem('drpd:rack:document') ?? '{}',
    ) as RackDocument
    expect(stored.pairedDevices?.[0]?.serialNumber).toBe('DRPD-TEST-001')
    expect(stored.pairedDevices?.[0]?.displayName).toBe('Dr. PD #DRPD-TEST-001')
    await openApplicationSubmenu('Devices')
    expect(await screen.findByRole('menuitem', { name: 'Dr. PD #DRPD-TEST-001' }))
      .toBeInTheDocument()
  })

  it('renames a paired device from the device submenu', async () => {
    saveRackDocument(buildHydratedRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await pairNewDeviceFromMenu()
    await openPairedDeviceSubmenu('Dr. PD #DRPD-TEST-001')
    await userEvent.click(await screen.findByRole('menuitem', { name: /change name/i }))

    const dialog = await screen.findByRole('dialog', { name: /change device name/i })
    const nameInput = within(dialog).getByLabelText('Name')
    expect(nameInput).toHaveValue('Dr. PD #DRPD-TEST-001')

    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Marco')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /change device name/i })).not.toBeInTheDocument(),
    )
    await openApplicationSubmenu('Devices')
    expect(await screen.findByRole('menuitem', { name: 'Marco' })).toBeInTheDocument()

    const stored = JSON.parse(
      window.localStorage.getItem('drpd:rack:document') ?? '{}',
    ) as RackDocument
    expect(stored.pairedDevices?.[0]?.displayName).toBe('Marco')
  })

  it('rejects blank paired device names', async () => {
    saveRackDocument(buildHydratedRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await pairNewDeviceFromMenu()
    await openPairedDeviceSubmenu('Dr. PD #DRPD-TEST-001')
    await userEvent.click(await screen.findByRole('menuitem', { name: /change name/i }))

    const dialog = await screen.findByRole('dialog', { name: /change device name/i })
    const nameInput = within(dialog).getByLabelText('Name')
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, '   ')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await within(dialog).findByText('Name is required.')).toBeInTheDocument()
    const stored = JSON.parse(
      window.localStorage.getItem('drpd:rack:document') ?? '{}',
    ) as RackDocument
    expect(stored.pairedDevices?.[0]?.displayName).toBe('Dr. PD #DRPD-TEST-001')
  })

  it('opens calibration menu items under connected paired devices', async () => {
    saveRackDocument(buildHydratedRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await pairNewDeviceFromMenu()
    await openPairedDeviceSubmenu('Dr. PD #DRPD-TEST-001')
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Calibrate' }))

    expect(await screen.findByRole('menuitem', { name: 'Voltage...' })).toBeInTheDocument()
    expect(await screen.findByRole('menuitem', { name: 'Current...' })).toBeInTheDocument()
  })

  it('cancels the calibration safety warning without sending calibration commands', async () => {
    saveRackDocument(buildHydratedRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await pairNewDeviceFromMenu()
    await openCalibrationMenuItem('Dr. PD #DRPD-TEST-001', 'Voltage...')
    const warning = await screen.findByRole('dialog', { name: /calibration warning/i })
    await userEvent.click(within(warning).getByRole('button', { name: 'No' }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /calibration warning/i })).not.toBeInTheDocument(),
    )
    expect(mockTransportState.sentCommands).not.toContain('BUS:VBUS:CAL 5')
  })

  it('opens the voltage calibration dialog after safety confirmation', async () => {
    saveRackDocument(buildHydratedRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await pairNewDeviceFromMenu()
    await openCalibrationMenuItem('Dr. PD #DRPD-TEST-001', 'Voltage...')
    const warning = await screen.findByRole('dialog', { name: /calibration warning/i })
    await userEvent.click(within(warning).getByRole('button', { name: 'Yes' }))

    const dialog = await screen.findByRole('dialog', { name: /calibrate voltage/i })
    expect(within(dialog).getByText('5 V')).toBeInTheDocument()
    expect(within(dialog).getAllByText('+0.000 V')).not.toHaveLength(0)
    expect(mockTransportState.sentCommands).toContain('BUS:CC:ROLE OBSERVER')
  })

  it('persists calibration warning suppression in browser storage', async () => {
    saveRackDocument(buildHydratedRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await pairNewDeviceFromMenu()
    await openCalibrationMenuItem('Dr. PD #DRPD-TEST-001', 'Voltage...')
    const warning = await screen.findByRole('dialog', { name: /calibration warning/i })
    await userEvent.click(within(warning).getByLabelText(/do not ask again/i))
    await userEvent.click(within(warning).getByRole('button', { name: 'Yes' }))
    await waitFor(() =>
      expect(window.localStorage.getItem('drpd:calibration-warning-suppressed')).toBe('true'),
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Close' }))
    await waitFor(() =>
      expect(mockTransportState.sentCommands).toContain('BUS:CC:ROLE SINK'),
    )

    await openCalibrationMenuItem('Dr. PD #DRPD-TEST-001', 'Current...')

    expect(screen.queryByRole('dialog', { name: /calibration warning/i })).not.toBeInTheDocument()
    expect(await screen.findByRole('dialog', { name: /calibrate current/i })).toBeInTheDocument()
  })

  it('requires extra confirmation before out-of-tolerance current calibration', async () => {
    saveRackDocument(buildHydratedRackDocument())
    window.localStorage.setItem('drpd:calibration-warning-suppressed', 'true')
    mockTransportState.rawVbusCurrentResponse = ['2.00']
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await pairNewDeviceFromMenu()
    await openCalibrationMenuItem('Dr. PD #DRPD-TEST-001', 'Current...')
    const dialog = await screen.findByRole('dialog', { name: /calibrate current/i })
    const calibrateButtons = within(dialog).getAllByRole('button', { name: 'Calibrate' })
    await userEvent.click(calibrateButtons[1])

    const confirmation = await screen.findByRole('dialog', { name: /confirm calibration point/i })
    expect(within(confirmation).getByText(/Measured current is 2.000 A/i)).toBeInTheDocument()
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Continue' }))

    await waitFor(() =>
      expect(mockTransportState.sentCommands).toContain('BUS:VBUS:CAL:CURR:TAB 500 0.5'),
    )
    await waitFor(() =>
      expect(mockTransportState.sentCommands).toContain('BUS:VBUS:CAL:CURR 500'),
    )
  })

  it('resets the voltage coefficient before recording a calibration point', async () => {
    saveRackDocument(buildHydratedRackDocument())
    window.localStorage.setItem('drpd:calibration-warning-suppressed', 'true')
    mockTransportState.vbusVoltageResponse = ['5.00']
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await pairNewDeviceFromMenu()
    await openCalibrationMenuItem('Dr. PD #DRPD-TEST-001', 'Voltage...')
    const dialog = await screen.findByRole('dialog', { name: /calibrate voltage/i })
    const calibrateButtons = within(dialog).getAllByRole('button', { name: 'Calibrate' })
    await userEvent.click(calibrateButtons[5])

    await waitFor(() =>
      expect(mockTransportState.sentCommands).toContain('BUS:VBUS:CAL:TAB 5 0'),
    )
    await waitFor(() =>
      expect(mockTransportState.sentCommands).toContain('BUS:VBUS:CAL 5'),
    )
    expect(mockTransportState.sentCommands.indexOf('BUS:VBUS:CAL:TAB 5 0')).toBeLessThan(
      mockTransportState.sentCommands.indexOf('BUS:VBUS:CAL 5'),
    )
  })

  it('resets the current coefficient before recording a calibration point', async () => {
    saveRackDocument(buildHydratedRackDocument())
    window.localStorage.setItem('drpd:calibration-warning-suppressed', 'true')
    mockTransportState.rawVbusCurrentResponse = ['0.50']
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await pairNewDeviceFromMenu()
    await openCalibrationMenuItem('Dr. PD #DRPD-TEST-001', 'Current...')
    const dialog = await screen.findByRole('dialog', { name: /calibrate current/i })
    const calibrateButtons = within(dialog).getAllByRole('button', { name: 'Calibrate' })
    await userEvent.click(calibrateButtons[1])

    await waitFor(() =>
      expect(mockTransportState.sentCommands).toContain('BUS:VBUS:CAL:CURR:TAB 500 0.5'),
    )
    await waitFor(() =>
      expect(mockTransportState.sentCommands).toContain('BUS:VBUS:CAL:CURR 500'),
    )
    expect(
      mockTransportState.sentCommands.indexOf('BUS:VBUS:CAL:CURR:TAB 500 0.5'),
    ).toBeLessThan(
      mockTransportState.sentCommands.indexOf('BUS:VBUS:CAL:CURR 500'),
    )
  })

  it('does not switch to Observer when opening current calibration', async () => {
    saveRackDocument(buildHydratedRackDocument())
    window.localStorage.setItem('drpd:calibration-warning-suppressed', 'true')
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await pairNewDeviceFromMenu()
    mockTransportState.sentCommands = []
    await openCalibrationMenuItem('Dr. PD #DRPD-TEST-001', 'Current...')

    expect(await screen.findByRole('dialog', { name: /calibrate current/i })).toBeInTheDocument()
    expect(mockTransportState.sentCommands).not.toContain('BUS:CC:ROLE OBSERVER')
  })

  it('requires Sink mode before opening current calibration', async () => {
    saveRackDocument(buildHydratedRackDocument())
    window.localStorage.setItem('drpd:calibration-warning-suppressed', 'true')
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await pairNewDeviceFromMenu()
    mockTransportState.roleResponse = ['OBSERVER']
    await openCalibrationMenuItem('Dr. PD #DRPD-TEST-001', 'Current...')

    const startError = await screen.findByRole('dialog', { name: /cannot start calibration/i })
    expect(within(startError).getByText(/already operating as a USB-C Sink/i)).toBeInTheDocument()
    expect(within(startError).getByText(/negotiate a VBUS contract of at least 5 V/i)).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: /calibrate current/i })).not.toBeInTheDocument()
  })

  it('requires at least a 5 V negotiated sink voltage before opening current calibration', async () => {
    saveRackDocument(buildHydratedRackDocument())
    window.localStorage.setItem('drpd:calibration-warning-suppressed', 'true')
    mockTransportState.sinkVoltageResponse = ['4.5']
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await pairNewDeviceFromMenu()
    await openCalibrationMenuItem('Dr. PD #DRPD-TEST-001', 'Current...')

    const startError = await screen.findByRole('dialog', { name: /cannot start calibration/i })
    expect(within(startError).getByText(/negotiated at least 5 V as a USB-C Sink/i)).toBeInTheDocument()
    expect(within(startError).getByText(/confirm VBUS is present/i)).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: /calibrate current/i })).not.toBeInTheDocument()
  })

  it('checks for firmware updates after connected device firmware version is known', async () => {
    saveRackDocument(buildHydratedRackDocument())
    mockTransportState.idnResponse = ['MTA Inc.,Dr. PD,ABC,1.0.0']
    const fetchMock = vi.fn(async () =>
      buildFetchResponse([
        buildFirmwareRelease('1.0.1'),
        buildFirmwareRelease('1.1.0-beta.1'),
      ]),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { requestDevice } = mockUSB([createUSBDevice()])
    render(<RackView />)

    await pairNewDeviceFromMenu()

    expect(requestDevice).toHaveBeenCalled()
    const dialog = await screen.findByRole('dialog', { name: /firmware update available/i })
    expect(dialog).toHaveTextContent('Installed')
    expect(dialog).toHaveTextContent('1.0.0')
    expect(dialog).toHaveTextContent('Available')
    expect(dialog).toHaveTextContent('1.0.1')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/T76-org/drpd/releases',
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'application/vnd.github+json' }),
      }),
    )
  })

  it('does not show a firmware update prompt for a suppressed target version', async () => {
    saveRackDocument(buildHydratedRackDocument())
    mockTransportState.idnResponse = ['MTA Inc.,Dr. PD,ABC,1.0.0']
    window.localStorage.setItem('drpd:firmware-update:suppressed-versions', JSON.stringify(['1.0.1']))
    const fetchMock = vi.fn(async () => buildFetchResponse([buildFirmwareRelease('1.0.1')]))
    vi.stubGlobal('fetch', fetchMock)
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await pairNewDeviceFromMenu()

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.queryByRole('dialog', { name: /firmware update available/i })).not.toBeInTheDocument()
  })

  it('persists prompt suppression when declining with the checkbox selected', async () => {
    saveRackDocument(buildHydratedRackDocument())
    mockTransportState.idnResponse = ['MTA Inc.,Dr. PD,ABC,1.0.0']
    vi.stubGlobal('fetch', vi.fn(async () => buildFetchResponse([buildFirmwareRelease('1.0.1')])))
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await pairNewDeviceFromMenu()

    const dialog = await screen.findByRole('dialog', { name: /firmware update available/i })
    await userEvent.click(screen.getByRole('checkbox', { name: /do not ask again for this version/i }))
    await userEvent.click(screen.getByRole('button', { name: /not now/i }))

    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    expect(JSON.parse(window.localStorage.getItem('drpd:firmware-update:suppressed-versions') ?? '[]')).toEqual([
      '1.0.1',
    ])
  })

  it('uploads firmware after accepting the update prompt', async () => {
    saveRackDocument(buildHydratedRackDocument())
    mockTransportState.idnResponse = ['MTA Inc.,Dr. PD,ABC,1.0.0']
    const image = buildMinimalFirmwareUf2()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input)
        if (url.includes('api.github.com')) {
          return buildFetchResponse([buildFirmwareRelease('1.0.1')])
        }
        return buildFetchResponse({}, image)
      }),
    )
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await pairNewDeviceFromMenu()

    await screen.findByRole('dialog', { name: /firmware update available/i })
    await userEvent.click(screen.getByRole('button', { name: /upload firmware/i }))

    expect(await screen.findByText(/do not disconnect the device/i)).toBeInTheDocument()
    expect(await screen.findByText(/firmware upload complete/i)).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith(
      'https://t76.org/drpd/releases/1.0.1/drpd-firmware-combined.uf2',
    )
    expect(mockFirmwareUpdaterState.interfaceNumber).toBe(0)
    expect(mockFirmwareUpdaterState.updateCount).toBe(1)
  })

  it('shows a recoverable failure state when firmware upload fails', async () => {
    saveRackDocument(buildHydratedRackDocument())
    mockTransportState.idnResponse = ['MTA Inc.,Dr. PD,ABC,1.0.0']
    mockFirmwareUpdaterState.shouldFailUpdate = true
    const image = buildMinimalFirmwareUf2()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input)
        if (url.includes('api.github.com')) {
          return buildFetchResponse([buildFirmwareRelease('1.0.1')])
        }
        return buildFetchResponse({}, image)
      }),
    )
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await pairNewDeviceFromMenu()

    await screen.findByRole('dialog', { name: /firmware update available/i })
    await userEvent.click(screen.getByRole('button', { name: /upload firmware/i }))

    expect(await screen.findByText(/firmware update failed/i)).toBeInTheDocument()
    expect(screen.getByText(/mock update failed/i)).toBeInTheDocument()
    expect(mockFirmwareUpdaterState.updateCount).toBe(1)

    mockFirmwareUpdaterState.shouldFailUpdate = false
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))

    expect(await screen.findByText(/firmware upload complete/i)).toBeInTheDocument()
    expect(mockFirmwareUpdaterState.updateCount).toBe(2)
  })

  it('disconnects a device without removing it', async () => {
    saveRackDocument(buildHydratedRackDocument())
    const { requestDevice } = mockUSB([createUSBDevice()])
    render(<RackView />)

    await pairNewDeviceFromMenu()
    expect(requestDevice).toHaveBeenCalled()
    await disconnectCurrentDeviceFromMenu()

    await openApplicationSubmenu('Devices')
    expect(await screen.findByRole('menuitem', { name: /current device: none/i })).toBeDisabled()
    const stored = JSON.parse(
      window.localStorage.getItem('drpd:rack:document') ?? '{}',
    ) as RackDocument
    expect(stored.pairedDevices).toHaveLength(1)
  })

  it('hydrates bound DRPD panels for a persisted device', async () => {
    saveRackDocument(buildBoundHydratedRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await expectHydratedDrpdPanels()
  })

  it('opens shortcut help from header button and global shortcut', async () => {
    saveRackDocument(buildBoundHydratedRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await expectHydratedDrpdPanels()

    await openApplicationSubmenu('Help')
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Keyboard shortcuts' }))
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument()
    expect(screen.getByText('Toggle USB connection')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Close shortcut help' }))
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).not.toBeInTheDocument()

    fireEvent.keyDown(document, { key: '?' })
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument()
  })

  it('does not expose the removed layout shortcut in the Help menu', async () => {
    const user = userEvent.setup()
    saveRackDocument(buildRackDocument())
    mockUSB([])
    render(<RackView />)

    const page = await waitFor(() => {
      const element = document.querySelector('[data-layout-mode]')
      expect(element).not.toBeNull()
      return element as HTMLElement
    })

    expect(page).toHaveAttribute('data-layout-mode', 'full')

    await user.click(await screen.findByRole('button', { name: 'Help' }))
    expect(screen.queryByRole('menuitem', { name: /Switch Layout/ })).not.toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'K' })
    expect(page).toHaveAttribute('data-layout-mode', 'full')
  })

  it('prompts PWA installation from the Help menu when available', async () => {
    saveRackDocument(buildRackDocument())
    mockUSB([])
    render(<RackView />)

    const installPrompt = dispatchBeforeInstallPrompt()

    await userEvent.click(await screen.findByRole('button', { name: 'Help' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Install Dr.PD...' }))

    expect(installPrompt.prompt).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.queryByRole('menuitem', { name: 'Install Dr.PD...' })).not.toBeInTheDocument()
    })
  })

  it('persists layout mode from the Display menu', async () => {
    saveRackDocument(buildRackDocument())
    mockUSB([])
    const { unmount } = render(<RackView />)

    const page = await waitFor(() => {
      const element = document.querySelector('[data-layout-mode]')
      expect(element).not.toBeNull()
      return element as HTMLElement
    })

    expect(page).toHaveAttribute('data-layout-mode', 'full')

    await chooseLayoutFromMenu('Fixed')
    expect(page).toHaveAttribute('data-layout-mode', 'fixed')
    expect(window.localStorage.getItem('drpd:layout')).toBe('fixed')

    await chooseLayoutFromMenu('Responsive')
    expect(page).toHaveAttribute('data-layout-mode', 'full')
    expect(window.localStorage.getItem('drpd:layout')).toBe('responsive')

    await openLayoutMenu()
    expect(screen.getByRole('menuitemcheckbox', { name: 'Responsive' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('menuitemcheckbox', { name: 'Fixed' })).toHaveAttribute(
      'aria-checked',
      'false',
    )

    unmount()
    render(<RackView />)
    const restoredPage = await waitFor(() => {
      const element = document.querySelector('[data-layout-mode]')
      expect(element).not.toBeNull()
      return element as HTMLElement
    })
    expect(restoredPage).toHaveAttribute('data-layout-mode', 'full')
  })

  it('restores an explicit fixed layout preference', async () => {
    saveRackDocument(buildRackDocument())
    window.localStorage.setItem('drpd:layout', 'fixed')
    mockUSB([])
    render(<RackView />)

    const page = await waitFor(() => {
      const element = document.querySelector('[data-layout-mode]')
      expect(element).not.toBeNull()
      return element as HTMLElement
    })

    expect(page).toHaveAttribute('data-layout-mode', 'fixed')
  })

  it('runs global Sink, Observer, and Capture shortcuts', async () => {
    saveRackDocument(buildBoundHydratedRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await expectHydratedDrpdPanels()

    fireEvent.keyDown(document, { key: 'S' })
    fireEvent.keyDown(document, { key: 'O' })
    fireEvent.keyDown(document, { key: 'C' })

    await waitFor(() => {
      expect(mockTransportState.sentCommands).toEqual(
        expect.arrayContaining([
          'BUS:CC:ROLE SINK',
          'BUS:CC:ROLE OBSERVER',
          'BUS:CC:CAP:EN OFF',
        ]),
      )
    })
  })

  it('clamps EPR AVS current from the global Mode menu sink request', async () => {
    const user = userEvent.setup()
    mockTransportState.sinkPdoCountResponse = ['1']
    mockTransportState.sinkPdoResponse = ['EPR_AVS,15.00,48.00,240.00']
    saveRackDocument(buildBoundHydratedRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await user.click(await screen.findByRole('button', { name: 'Mode' }))
    await user.click(await screen.findByRole('menuitem', { name: /choose power contract/i }))

    const dialog = await screen.findByRole('dialog', { name: /sink request tuning/i })
    await user.click(await within(dialog).findByRole('option', { name: /epr avs/i }))
    const voltageInput = within(dialog).getByLabelText(/^voltage$/i)
    const currentInput = within(dialog).getByLabelText(/^current$/i)
    expect(currentInput).toHaveValue('5.00')
    await user.clear(voltageInput)
    await user.type(voltageInput, '16')
    expect(within(dialog).getByText('0.00-5.00 A')).toBeInTheDocument()
    await user.clear(currentInput)
    await user.type(currentInput, '16')
    await user.click(within(dialog).getByRole('button', { name: /^set pdo$/i }))

    await waitFor(() => {
      expect(mockTransportState.sentCommands).toContain('SINK:PDO 0 16000 5000')
    })
  })

  it('refreshes and toggles Get_PPS_Status sink behaviour from the Mode menu', async () => {
    const user = userEvent.setup()
    mockTransportState.idnResponse = ['MTA Inc.,Dr. PD,ABC,0.9.13']
    saveRackDocument(buildBoundHydratedRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)

    expect(await screen.findAllByText('Sink')).not.toHaveLength(0)
    mockTransportState.sinkPpsStatusQueryEnabledResponse = ['ON']

    await user.click(await screen.findByRole('button', { name: 'Mode' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Sink behaviour' }))
    const checkbox = await screen.findByRole('menuitemcheckbox', {
      name: 'Send Get_PPS_Status messages',
    })

    await waitFor(() => {
      expect(checkbox).toHaveAttribute('aria-checked', 'true')
    })

    mockTransportState.sinkPpsStatusQueryEnabledResponse = ['OFF']
    await user.click(checkbox)

    await waitFor(() => {
      expect(mockTransportState.sentCommands).toContain('SINK:PPS:STATUS:EN OFF')
    })
  })

  it('disables Sink behaviour settings before firmware 0.9.13', async () => {
    const user = userEvent.setup()
    mockTransportState.idnResponse = ['MTA Inc.,Dr. PD,ABC,0.9.12']
    saveRackDocument(buildBoundHydratedRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)

    expect(await screen.findAllByText('Sink')).not.toHaveLength(0)

    await user.click(await screen.findByRole('button', { name: 'Mode' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Sink behaviour' }))

    expect(await screen.findByRole('menuitemcheckbox', { name: 'Support EPR mode' })).toBeDisabled()
    expect(await screen.findByRole('menuitemcheckbox', {
      name: 'Send Get_PPS_Status messages',
    })).toBeDisabled()
  })

  it('pulses Disabled then restores previous role for USB toggle shortcut', async () => {
    saveRackDocument(buildBoundHydratedRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)
    expect(await screen.findAllByText('Sink')).not.toHaveLength(0)

    await userEvent.click(await screen.findByRole('button', { name: 'Mode' }))
    expect(await screen.findByRole('menuitem', { name: /Cycle USB Connection/ })).not.toBeDisabled()

    vi.useFakeTimers()
    try {
      await act(async () => {
        fireEvent.keyDown(document, { key: 'T' })
        await Promise.resolve()
      })
      expect(mockTransportState.sentCommands).toContain('BUS:CC:ROLE DISABLED')
      await act(async () => {
        vi.advanceTimersByTime(1000)
        await Promise.resolve()
      })
      expect(mockTransportState.sentCommands).toContain('BUS:CC:ROLE SINK')
    } finally {
      vi.useRealTimers()
    }
  })

  it('pulses Disabled then restores Observer for USB toggle shortcut', async () => {
    mockTransportState.roleResponse = ['OBSERVER']
    saveRackDocument(buildBoundHydratedRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)

    expect(await screen.findAllByText('Observer')).not.toHaveLength(0)
    await userEvent.click(await screen.findByRole('button', { name: 'Mode' }))
    expect(await screen.findByRole('menuitem', { name: /Cycle USB Connection/ })).not.toBeDisabled()

    vi.useFakeTimers()
    try {
      await act(async () => {
        fireEvent.keyDown(document, { key: 'T' })
        await Promise.resolve()
      })
      expect(mockTransportState.sentCommands).toContain('BUS:CC:ROLE DISABLED')
      await act(async () => {
        vi.advanceTimersByTime(1000)
        await Promise.resolve()
      })
      expect(mockTransportState.sentCommands).toContain('BUS:CC:ROLE OBSERVER')
    } finally {
      vi.useRealTimers()
    }
  })

  it('disables Cycle USB Connection in Disabled mode while keeping Disabled selectable', async () => {
    mockTransportState.roleResponse = ['DISABLED']
    saveRackDocument(buildBoundHydratedRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)

    expect(await screen.findAllByText('Disabled')).not.toHaveLength(0)
    await userEvent.click(await screen.findByRole('button', { name: 'Mode' }))
    expect(await screen.findByRole('menuitem', { name: /Cycle USB Connection/ })).toBeDisabled()
    await userEvent.click(await screen.findByRole('menuitem', { name: /Set mode/ }))
    const disabledModeItem = await screen.findByRole('menuitemcheckbox', { name: /Disabled/ })
    expect(disabledModeItem).not.toBeDisabled()
    expect(disabledModeItem).toHaveAttribute('aria-checked', 'true')

    fireEvent.keyDown(document, { key: 'T' })
    await Promise.resolve()
    expect(mockTransportState.sentCommands).not.toContain('BUS:CC:ROLE DISABLED')
  })


  it('marks a connected device disconnected when WebUSB reports an unplug', async () => {
    saveRackDocument(buildRackDocument())
    const usbDevice = createUSBDevice()
    const { requestDevice, dispatchDisconnect } = mockUSB([usbDevice])
    render(<RackView />)

    await pairNewDeviceFromMenu()
    expect(requestDevice).toHaveBeenCalled()
    expect(await screen.findAllByText('Sink')).not.toHaveLength(0)
    expect(await screen.findAllByText('Attached')).not.toHaveLength(0)

    dispatchDisconnect(usbDevice)

    await openApplicationSubmenu('Devices')
    expect(await screen.findByRole('menuitem', { name: /current device: none/i })).toBeDisabled()
  })

  it('auto-connects a previously paired device when WebUSB reports it connected', async () => {
    saveRackDocument(buildBoundHydratedRackDocument())
    const usbDevice = createUSBDevice()
    const { dispatchConnect } = mockUSB([])
    render(<RackView />)

    await openApplicationSubmenu('Devices')
    expect(await screen.findByRole('menuitem', { name: /current device: none/i })).toBeDisabled()
    fireEvent.keyDown(document, { key: 'Escape' })

    dispatchConnect(usbDevice)

    await expectHydratedDrpdPanels()
  })

  it('preserves a paired device nickname when auto-connect refreshes metadata', async () => {
    const document = buildBoundHydratedRackDocument()
    document.pairedDevices = document.pairedDevices?.map((device) => ({
      ...device,
      displayName: 'Marco',
    }))
    mockTransportState.idnResponse = ['MTA Inc.,Dr. PD,ABC,1.0.1']
    saveRackDocument(document)
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem('drpd:rack:document') ?? '{}',
      ) as RackDocument
      expect(stored.pairedDevices?.[0]?.firmwareVersion).toBe('1.0.1')
    })
    await openApplicationSubmenu('Devices')
    expect(await screen.findByRole('menuitem', { name: 'Marco' })).toBeInTheDocument()

    const stored = JSON.parse(
      window.localStorage.getItem('drpd:rack:document') ?? '{}',
    ) as RackDocument
    expect(stored.pairedDevices?.[0]?.displayName).toBe('Marco')
    expect(stored.pairedDevices?.[0]?.firmwareVersion).toBe('1.0.1')
  })

  it('shows hardware version above firmware version in the paired device submenu', async () => {
    mockTransportState.idnResponse = ['MTA Inc.,Dr. PD,ABC,1.0.1']
    mockTransportState.hardwareRevisionResponse = ['R2605-A']
    saveRackDocument(buildBoundHydratedRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem('drpd:rack:document') ?? '{}',
      ) as RackDocument
      expect(stored.pairedDevices?.[0]?.hardwareRevision).toBe('R2605-A')
    })

    await openApplicationSubmenu('Devices')
    const deviceMenu = await screen.findByRole('menuitem', { name: /Dr\. PD/ })
    await userEvent.hover(deviceMenu)

    const hardwareItem = await screen.findByRole('menuitem', {
      name: 'Hardware version: R2605-A',
    })
    const firmwareItem = await screen.findByRole('menuitem', {
      name: 'Firmware version: 1.0.1',
    })
    expect(hardwareItem).toBeDisabled()
    expect(firmwareItem).toBeDisabled()
    expect(hardwareItem.compareDocumentPosition(firmwareItem) & Node.DOCUMENT_POSITION_FOLLOWING)
      .not.toBe(0)
  })

  it('auto-connects the most recently connected paired device at startup', async () => {
    mockTransportState.idnResponse = ['MTA Inc.,Dr. PD,,1.0']
    saveRackDocument({
      pairedDevices: [
        {
          id: 'com.mta.drpd:DRPD-TEST-001',
          identifier: 'com.mta.drpd',
          displayName: 'Dr. PD',
          vendorId: 0x2e8a,
          productId: 0x000a,
          serialNumber: 'DRPD-TEST-001',
          productName: 'Dr. PD',
          lastConnectedAtMs: 100,
        },
        {
          id: 'com.mta.drpd:DRPD-TEST-002',
          identifier: 'com.mta.drpd',
          displayName: 'Dr. PD',
          vendorId: 0x2e8a,
          productId: 0x000a,
          serialNumber: 'DRPD-TEST-002',
          productName: 'Dr. PD',
          lastConnectedAtMs: 200,
        },
      ],
      racks: buildHydratedRackDocument().racks,
    })
    mockUSB([createUSBDevice('DRPD-TEST-001'), createUSBDevice('DRPD-TEST-002')])
    render(<RackView />)

    await openApplicationSubmenu('Devices')
    expect(await screen.findByRole('menuitem', { name: /current device: DRPD-TEST-002/i }))
      .toBeInTheDocument()
  })

  it('does not auto-connect a plugged paired device when another device is already connected', async () => {
    mockTransportState.idnResponse = ['MTA Inc.,Dr. PD,,1.0']
    const firstDevice = createUSBDevice('DRPD-TEST-001')
    const secondDevice = createUSBDevice('DRPD-TEST-002')
    saveRackDocument({
      pairedDevices: [
        {
          id: 'com.mta.drpd:DRPD-TEST-001',
          identifier: 'com.mta.drpd',
          displayName: 'Dr. PD',
          vendorId: 0x2e8a,
          productId: 0x000a,
          serialNumber: 'DRPD-TEST-001',
          productName: 'Dr. PD',
          lastConnectedAtMs: 100,
        },
        {
          id: 'com.mta.drpd:DRPD-TEST-002',
          identifier: 'com.mta.drpd',
          displayName: 'Dr. PD',
          vendorId: 0x2e8a,
          productId: 0x000a,
          serialNumber: 'DRPD-TEST-002',
          productName: 'Dr. PD',
          lastConnectedAtMs: 50,
        },
      ],
      racks: buildHydratedRackDocument().racks,
    })
    const { dispatchConnect } = mockUSB([firstDevice])
    render(<RackView />)

    await openApplicationSubmenu('Devices')
    expect(await screen.findByRole('menuitem', { name: /current device: DRPD-TEST-001/i }))
      .toBeInTheDocument()

    dispatchConnect(secondDevice)

    expect(screen.queryByRole('menuitem', { name: /current device: DRPD-TEST-002/i }))
      .not.toBeInTheDocument()
  })

  it('pairs an additional device without connecting it when another device is already active', async () => {
    mockTransportState.idnResponse = ['MTA Inc.,Dr. PD,,1.0']
    const firstDevice = createUSBDevice('DRPD-TEST-001')
    const secondDevice = createUSBDevice('DRPD-TEST-002')
    mockUSB([firstDevice, secondDevice])
    saveRackDocument(buildHydratedRackDocument())
    render(<RackView />)

    await pairNewDeviceFromMenu()

    await expectHydratedDrpdPanels()

    await pairNewDeviceFromMenu()

    const stored = JSON.parse(
      window.localStorage.getItem('drpd:rack:document') ?? '{}',
    ) as RackDocument
    expect(stored.pairedDevices?.map((device) => device.serialNumber)).toEqual([
      'DRPD-TEST-001',
      'DRPD-TEST-002',
    ])
    await openApplicationSubmenu('Devices')
    expect(await screen.findByRole('menuitem', { name: /current device: DRPD-TEST-001/i }))
      .toBeInTheDocument()
  })

  it('unpairs a device when unpair is clicked', async () => {
    saveRackDocument(buildRackDocument())
    const { requestDevice } = mockUSB([createUSBDevice()])
    render(<RackView />)

    await pairNewDeviceFromMenu()
    expect(requestDevice).toHaveBeenCalled()
    await unpairCurrentDeviceFromMenu()

    await waitFor(() => {
      expect(screen.queryByText(DRPD_DEVICE_LABEL)).not.toBeInTheDocument()
    })
  })

  it('ignores WebUSB picker cancellations', async () => {
    saveRackDocument(buildRackDocument())
    const cancelError = Object.assign(new Error('No device selected'), {
      name: 'NotFoundError'
    })
    const requestDevice = vi.fn(async () => {
      throw cancelError
    })
    vi.stubGlobal('navigator', {
      usb: {
        requestDevice,
        getDevices: vi.fn(async () => [])
      }
    })

    render(<RackView />)
    await pairNewDeviceFromMenu()

    expect(requestDevice).toHaveBeenCalled()
    expect(screen.queryByText(/device error/i)).not.toBeInTheDocument()
  })

  it('does not expose a current device when startup connection fails', async () => {
    mockTransportState.shouldFailOpen = true
    saveRackDocument(
      buildRackDocument({
        racks: [
          {
            id: 'bench-rack-a',
            name: 'Bench Rack A',
            totalUnits: 9,
            devices: [
              {
                id: 'device-1',
                identifier: 'com.mta.drpd',
                displayName: 'Dr. PD',
                vendorId: 0x2e8a,
                productId: 0x000a,
                serialNumber: 'DRPD-TEST-001',
                productName: 'Dr. PD'
              }
            ],
            rows: [
              {
                id: 'row-1',
                instruments: [
                  {
                    id: 'inst-1',
                    instrumentIdentifier: 'com.mta.drpd.device-status-panel'
                  }
                ]
              }
            ]
          }
        ]
      })
    )
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await openApplicationSubmenu('Devices')
    expect(await screen.findByRole('menuitem', { name: /current device: none/i })).toBeDisabled()
    mockTransportState.shouldFailOpen = false
  })

  it('lists VBUS, Accumulator, CC Lines, Device Status, Sync Trigger, Timestrip, and MESSAGE DETAIL instruments for compatible devices', async () => {
    saveRackDocument(
      buildRackDocument({
        racks: [
          {
            id: 'bench-rack-a',
            name: 'Bench Rack A',
            totalUnits: 9,
            devices: [
              {
                id: 'device-1',
                identifier: 'com.mta.drpd',
                displayName: 'Dr. PD',
                vendorId: 0x2e8a,
                productId: 0x000a,
                serialNumber: 'DRPD-TEST-001',
                productName: 'Dr. PD'
              }
            ],
            rows: []
          }
        ]
      })
    )
    mockUSB([createUSBDevice()])
    render(<RackView />)

    const addButton = await screen.findByRole('button', {
      name: /add instrument/i
    })
    await userEvent.click(addButton)
    expect(
      await screen.findByRole('button', { name: /vbus/i }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: /accumulator/i }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: /cc lines/i }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: /device status/i }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: /sink control/i }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: /sync trigger/i }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: /timestrip/i }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: /message detail/i }),
    ).toBeInTheDocument()
  })

  it('renders Timestrip with its default flex weight and CSS minimum size', async () => {
    saveRackDocument(
      buildRackDocument({
        racks: [
          {
            id: 'bench-rack-a',
            name: 'Bench Rack A',
            totalUnits: 9,
            devices: [],
            rows: [
              {
                id: 'row-1',
                instruments: [
                  {
                    id: 'inst-vbus',
                    instrumentIdentifier: 'com.mta.drpd.vbus'
                  },
                  {
                    id: 'inst-timestrip',
                    instrumentIdentifier: 'com.mta.drpd.timestrip'
                  }
                ]
              }
            ]
          }
        ]
      })
    )
    mockUSB([createUSBDevice()])
    render(<RackView />)

    expect(await screen.findByTestId('rack-instrument-inst-timestrip')).toHaveAttribute('data-flex', '100')
    expect(await screen.findByTestId('rack-instrument-inst-timestrip')).toHaveStyle({
      minHeight: '120px'
    })
  })

  it('toggles and persists standalone Timestrip visibility from the Display menu', async () => {
    mockUSB([createUSBDevice()])

    const { unmount } = render(<RackView />)
    expect(await screen.findByTestId('rack-instrument-inst-default-timestrip')).toBeInTheDocument()

    await toggleTimestripFromMenu()
    expect(screen.queryByTestId('rack-instrument-inst-default-timestrip')).not.toBeInTheDocument()
    expect(window.localStorage.getItem('drpd:display:show-timestrip')).toBe('false')

    unmount()
    render(<RackView />)
    await screen.findByTestId('rack-instrument-inst-default-log')
    expect(screen.queryByTestId('rack-instrument-inst-default-timestrip')).not.toBeInTheDocument()

    await toggleTimestripFromMenu()
    expect(await screen.findByTestId('rack-instrument-inst-default-timestrip')).toBeInTheDocument()
    expect(window.localStorage.getItem('drpd:display:show-timestrip')).toBe('true')
  })

  it('allocates MESSAGE DETAIL as horizontally and vertically flexible', async () => {
    saveRackDocument(
      buildRackDocument({
        racks: [
          {
            id: 'bench-rack-a',
            name: 'Bench Rack A',
            totalUnits: 9,
            devices: [],
            rows: [
              {
                id: 'row-1',
                instruments: [
                  {
                    id: 'inst-message-detail',
                    instrumentIdentifier: 'com.mta.drpd.message-detail'
                  }
                ]
              }
            ]
          }
        ]
      })
    )
    mockUSB([createUSBDevice()])
    render(<RackView />)

    expect(await screen.findByTestId('rack-instrument-inst-message-detail')).toHaveAttribute('data-flex', '1')
    expect(await screen.findByTestId('rack-instrument-inst-message-detail')).toHaveStyle({
      height: '100%'
    })
  })

  it('adds an instrument for compatible devices', async () => {
    saveRackDocument(
      buildRackDocument({
        racks: [
          {
            id: 'bench-rack-a',
            name: 'Bench Rack A',
            totalUnits: 9,
            devices: [
              {
                id: 'device-1',
                identifier: 'com.mta.drpd',
                displayName: 'Dr. PD',
                vendorId: 0x2e8a,
                productId: 0x000a,
                serialNumber: 'DRPD-TEST-001',
                productName: 'Dr. PD'
              }
            ],
            rows: []
          }
        ]
      })
    )
    mockUSB([createUSBDevice()])
    render(<RackView />)

    const addButton = await screen.findByRole('button', {
      name: /add instrument/i
    })
    await userEvent.click(addButton)
    const option = await screen.findByRole('button', {
      name: /vbus/i
    })
    await userEvent.click(option)

    expect(await screen.findAllByText('VBUS')).not.toHaveLength(0)
  })
})
