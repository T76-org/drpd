import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DRPDDeviceDefinition } from '../../../lib/device'
import { saveRackDocument } from '../../../lib/rack/loadRack'
import type { RackDocument } from '../../../lib/rack/types'
import { InstrumentBase } from '../InstrumentBase'
import { RackView } from '../RackView'

const mockTransportState = vi.hoisted(() => ({
  ///< Force the mock transport to fail on open.
  shouldFailOpen: false,
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
  roleResponse: ['DISABLED'],
  idnResponse: ['MTA Inc.,Dr. PD,ABC,1.0'],
  captureCountResponse: ['0']
}))

vi.mock('../../../lib/transport/usbtmc', () => {
  /**
   * Mock USBTMC transport for RackView tests.
   */
  class MockUSBTMCTransport {
    ///< Track open/close state for verification.
    public opened = false

    /**
     * Create the mock transport.
     *
     * @param device - USB device instance.
     */
    public constructor(device: USBDevice) {
      void device
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
        return mockTransportState.idnResponse
      }
      if (command === 'MEAS:ALL?') {
        return mockTransportState.analogResponse
      }
      if (command === 'BUS:CC:ROLE?') {
        return mockTransportState.roleResponse
      }
      if (command === 'BUS:CC:CAP:COUNT?') {
        return mockTransportState.captureCountResponse
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
    public async sendCommand(): Promise<void> {
      return undefined
    }
  }

  return { default: MockUSBTMCTransport }
})

/**
 * Build a sample rack document for tests.
 */
const buildRackDocument = (overrides?: Partial<RackDocument>): RackDocument => {
  const base: RackDocument = {
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
    racks: overrides?.racks ?? base.racks
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
const createUSBDevice = (): USBDevice =>
  ({
    vendorId: 0x2e8a,
    productId: 0x000a,
    serialNumber: 'DRPD-TEST-001',
    productName: 'Dr. PD'
  }) as USBDevice

const DRPD_DEVICE_LABEL = 'Dr. PD 1.0 #ABC'

/**
 * Stub the navigator.usb API.
 */
const mockUSB = (devices: USBDevice[]) => {
  const requestDevice = vi.fn(async () => devices[0])
  const getDevices = vi.fn(async () => devices)
  vi.stubGlobal('navigator', {
    usb: {
      requestDevice,
      getDevices
    }
  })

  return { requestDevice, getDevices }
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

beforeEach(() => {
  originalVerifier = DRPDDeviceDefinition.verifyConnectedDevice
  DRPDDeviceDefinition.verifyConnectedDevice = async () => true
  vi.stubGlobal('localStorage', createStorage())
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  DRPDDeviceDefinition.verifyConnectedDevice = originalVerifier
  mockTransportState.shouldFailOpen = false
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

    const button = await screen.findByRole('button', { name: /theme/i })
    expect(button).toHaveTextContent('System')

    await userEvent.click(button)
    expect(button).toHaveTextContent('Light')
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
    const button = await screen.findByRole('button', { name: /theme/i })
    expect(button).toHaveTextContent('Dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')

    unmount()
    render(<RackView />)
    const buttonAfterReload = await screen.findByRole('button', { name: /theme/i })
    expect(buttonAfterReload).toHaveTextContent('Dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
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

  it('renders the top header at the same native width as the rack canvas', async () => {
    saveRackDocument(buildRackDocument())
    mockUSB([createUSBDevice()])
    const { container } = render(<RackView />)

    const header = await screen.findByRole('banner')
    const rackCanvas = container.querySelector('[data-rack-width]')

    expect(rackCanvas).not.toBeNull()
    expect(header).toHaveStyle({
      width: `${rackCanvas?.getAttribute('data-rack-width')}px`
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

  it('disables devices menu while editing', async () => {
    saveRackDocument(buildRackDocument())
    mockUSB([createUSBDevice()])
    render(<RackView />)

    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('button', { name: 'Devices' })).toBeDisabled()
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

  it('keeps fixed-width allocations for Message Log and VBUS instruments', async () => {
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
      'data-width-units',
      '30',
    )
    expect(await screen.findByTestId('rack-instrument-inst-flex-1')).toHaveAttribute(
      'data-width-units',
      '10',
    )
    expect(await screen.findByTestId('rack-instrument-inst-flex-2')).toHaveAttribute(
      'data-width-units',
      '10',
    )
  })

  it('keeps CC Lines, Device Status, and VBUS fixed-width allocations', async () => {
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
      'data-width-units',
      '10',
    )
    expect(await screen.findByTestId('rack-instrument-inst-cc')).toHaveAttribute(
      'data-width-units',
      '7',
    )
    expect(await screen.findByTestId('rack-instrument-inst-vbus')).toHaveAttribute(
      'data-width-units',
      '10',
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
    saveRackDocument(buildRackDocument())
    const { requestDevice } = mockUSB([createUSBDevice()])
    render(<RackView />)

    const menuButton = await screen.findByRole('button', {
      name: /devices/i
    })
    await userEvent.click(menuButton)
    const connectButton = await screen.findByRole('button', {
      name: /pair device/i
    })
    await userEvent.click(connectButton)

    expect(requestDevice).toHaveBeenCalled()
    expect(await screen.findByText(DRPD_DEVICE_LABEL)).toBeInTheDocument()
    expect(await screen.findAllByText('connected')).not.toHaveLength(0)
  })

  it('disconnects a device without removing it', async () => {
    saveRackDocument(buildRackDocument())
    const { requestDevice } = mockUSB([createUSBDevice()])
    render(<RackView />)

    const menuButton = await screen.findByRole('button', {
      name: /devices/i
    })
    await userEvent.click(menuButton)
    const connectButton = await screen.findByRole('button', {
      name: /pair device/i
    })
    await userEvent.click(connectButton)

    expect(requestDevice).toHaveBeenCalled()
    const disconnectButton = await screen.findByRole('button', {
      name: /disconnect/i
    })
    await userEvent.click(disconnectButton)

    expect(await screen.findByText('disconnected')).toBeInTheDocument()
    expect(await screen.findByText(DRPD_DEVICE_LABEL)).toBeInTheDocument()

    const reconnectButton = await screen.findByRole('button', {
      name: /connect/i
    })
    await userEvent.click(reconnectButton)

    expect(await screen.findByText('connected')).toBeInTheDocument()
  })

  it('removes a device when remove is clicked', async () => {
    saveRackDocument(buildRackDocument())
    const { requestDevice } = mockUSB([createUSBDevice()])
    render(<RackView />)

    const menuButton = await screen.findByRole('button', {
      name: /devices/i
    })
    await userEvent.click(menuButton)
    const connectButton = await screen.findByRole('button', {
      name: /pair device/i
    })
    await userEvent.click(connectButton)

    expect(requestDevice).toHaveBeenCalled()
    const removeButton = await screen.findByRole('button', {
      name: /remove/i
    })
    await userEvent.click(removeButton)
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
    const menuButton = await screen.findByRole('button', {
      name: /devices/i
    })
    await userEvent.click(menuButton)
    const connectButton = await screen.findByRole('button', {
      name: /pair device/i
    })
    await userEvent.click(connectButton)

    expect(requestDevice).toHaveBeenCalled()
    expect(screen.queryByText(/device error/i)).not.toBeInTheDocument()
  })

  it('shows connect when a device is in error state', async () => {
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

    const menuButton = await screen.findByRole('button', {
      name: /devices/i
    })
    await userEvent.click(menuButton)
    expect(await screen.findByText('error')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /connect/i })).toBeInTheDocument()
    mockTransportState.shouldFailOpen = false
  })

  it('lists VBUS, CC Lines, Device Status, Sync Trigger, Timestrip, and MESSAGE DETAIL instruments for compatible devices', async () => {
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

  it('allocates Timestrip as horizontally flexible with a fixed single-unit height', async () => {
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

    expect(await screen.findByTestId('rack-instrument-inst-timestrip')).toHaveAttribute(
      'data-width-units',
      '50',
    )
    expect(await screen.findByTestId('rack-instrument-inst-timestrip')).toHaveStyle({
      height: '125px'
    })
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

    expect(await screen.findByTestId('rack-instrument-inst-message-detail')).toHaveAttribute(
      'data-width-units',
      '60',
    )
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
